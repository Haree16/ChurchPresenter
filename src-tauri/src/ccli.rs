//! CCLI reporting: which songs were used in which service, and a report of them for a date range.
//!
//! A song counts once per service per day, the first time one of its items goes live. The song's title,
//! CCLI number, author and copyright are copied into the log, so the history stays correct if a song
//! is renamed or deleted later.

use crate::db::DbManager;
use chrono::{Local, NaiveDate, Utc};
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const CCLI_LICENCE_KEY: &str = "ccli_licence_number";
pub const MIN_LICENCE_DIGITS: usize = 4;
pub const MAX_LICENCE_DIGITS: usize = 10;
/// Longest range a report may cover (about five years); keeps a mistyped date from reading everything.
pub const MAX_REPORT_DAYS: i64 = 366 * 5;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongUsage {
    pub id: String,
    pub song_id: String,
    pub service_id: String,
    pub song_title: String,
    pub ccli_number: Option<String>,
    pub author: Option<String>,
    pub copyright: Option<String>,
    pub service_title: String,
    /// Local date, `YYYY-MM-DD`.
    pub used_on: String,
    pub used_at: String,
}

/// One song in a report: how often it was used in the range.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CcliReportRow {
    pub song_id: String,
    pub song_title: String,
    pub ccli_number: Option<String>,
    pub author: Option<String>,
    pub copyright: Option<String>,
    pub times_used: i64,
    /// The dates it was used, oldest first.
    pub dates: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CcliReport {
    pub from: String,
    pub to: String,
    pub licence_number: Option<String>,
    /// Most used first, then by title.
    pub rows: Vec<CcliReportRow>,
    /// Songs in the range that have no CCLI number, so they cannot be reported to CCLI.
    pub songs_without_number: i64,
}

/// A valid licence number is digits only, 4 to 10 of them. An empty string means "none".
pub fn validate_licence_number(raw: &str) -> std::result::Result<Option<String>, String> {
    let n: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    if n.is_empty() {
        return Ok(None);
    }
    if !n.chars().all(|c| c.is_ascii_digit()) {
        return Err("A CCLI licence number contains digits only.".to_string());
    }
    if !(MIN_LICENCE_DIGITS..=MAX_LICENCE_DIGITS).contains(&n.len()) {
        return Err(format!("A CCLI licence number has {} to {} digits.", MIN_LICENCE_DIGITS, MAX_LICENCE_DIGITS));
    }
    Ok(Some(n))
}

fn parse_date(s: &str) -> std::result::Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").map_err(|_| format!("'{}' is not a date (use YYYY-MM-DD).", s))
}

/// Checks a report range and returns the dates.
pub fn validate_range(from: &str, to: &str) -> std::result::Result<(NaiveDate, NaiveDate), String> {
    let (f, t) = (parse_date(from)?, parse_date(to)?);
    if f > t {
        return Err("The start date is after the end date.".to_string());
    }
    if (t - f).num_days() > MAX_REPORT_DAYS {
        return Err("Choose a range of five years or less.".to_string());
    }
    Ok((f, t))
}

fn row_to_usage(r: &rusqlite::Row) -> Result<SongUsage> {
    Ok(SongUsage {
        id: r.get(0)?,
        song_id: r.get(1)?,
        service_id: r.get(2)?,
        song_title: r.get(3)?,
        ccli_number: r.get(4)?,
        author: r.get(5)?,
        copyright: r.get(6)?,
        service_title: r.get(7)?,
        used_on: r.get(8)?,
        used_at: r.get(9)?,
    })
}

const USAGE_COLUMNS: &str = "id, song_id, service_id, song_title, ccli_number, author, copyright, service_title, used_on, used_at";

impl DbManager {
    pub fn get_ccli_licence_number(&self) -> Result<Option<String>> {
        Ok(self.get_setting(CCLI_LICENCE_KEY)?.filter(|v| !v.is_empty()))
    }

    pub fn set_ccli_licence_number(&self, raw: &str) -> std::result::Result<Option<String>, String> {
        let valid = validate_licence_number(raw)?;
        self.set_setting(CCLI_LICENCE_KEY, valid.as_deref().unwrap_or("")).map_err(|e| e.to_string())?;
        Ok(valid)
    }

    /// Records that the song in `item_id` was used, as of now. Does nothing for items that are not songs.
    /// Returns true when a new row was added (false: not a song, or already counted for this service today).
    pub fn log_song_usage_for_item(&self, service_id: &str, item_id: &str) -> Result<bool> {
        let now = Local::now();
        self.log_song_usage_at(service_id, item_id, &now.format("%Y-%m-%d").to_string(), &Utc::now().to_rfc3339())
    }

    pub fn log_song_usage_at(&self, service_id: &str, item_id: &str, used_on: &str, used_at: &str) -> Result<bool> {
        let Some(item) = self.get_service_item(item_id)? else { return Ok(false) };
        if item.item_type != "song" || item.service_id != service_id {
            return Ok(false);
        }
        let Some(song_id) = item.source_id.clone() else { return Ok(false) };
        let Some(song) = self.get_song(&song_id)? else { return Ok(false) };
        let service_title = self.get_service(service_id)?.map(|s| s.title).unwrap_or_default();

        let conn = self.conn.lock().unwrap();
        let added = conn.execute(
            "INSERT OR IGNORE INTO song_usage (id, song_id, service_id, song_title, ccli_number, author, copyright, service_title, used_on, used_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10);",
            params![
                Uuid::new_v4().to_string(),
                song.id,
                service_id,
                song.title,
                song.ccli_number.as_deref().map(str::trim).filter(|s| !s.is_empty()),
                song.author,
                song.copyright,
                service_title,
                used_on,
                used_at
            ],
        )?;
        Ok(added > 0)
    }

    /// Every logged use in the range, newest first.
    pub fn list_song_usage(&self, from: &str, to: &str) -> std::result::Result<Vec<SongUsage>, String> {
        validate_range(from, to)?;
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare(&format!(
                "SELECT {USAGE_COLUMNS} FROM song_usage WHERE used_on >= ?1 AND used_on <= ?2 ORDER BY used_on DESC, used_at DESC;"
            ))
            .map_err(|e| e.to_string())?;
        let rows = stmt.query_map(params![from.trim(), to.trim()], row_to_usage).map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>>>().map_err(|e| e.to_string())
    }

    pub fn list_all_song_usage(&self) -> Result<Vec<SongUsage>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!("SELECT {USAGE_COLUMNS} FROM song_usage ORDER BY used_on ASC, used_at ASC;"))?;
        let rows = stmt.query_map([], row_to_usage)?;
        rows.collect()
    }

    /// Removes one logged use, for example a song that was shown by mistake.
    pub fn delete_song_usage(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM song_usage WHERE id = ?1;", params![id])?;
        Ok(())
    }

    /// The songs used in the range with how often, most used first.
    pub fn ccli_report(&self, from: &str, to: &str) -> std::result::Result<CcliReport, String> {
        let usage = self.list_song_usage(from, to)?; // newest first
        let mut rows: Vec<CcliReportRow> = Vec::new();
        for u in &usage {
            match rows.iter_mut().find(|r| r.song_id == u.song_id) {
                Some(r) => {
                    r.times_used += 1;
                    r.dates.push(u.used_on.clone());
                }
                // the first row seen is the newest, so the title and number are the most recent ones
                None => rows.push(CcliReportRow {
                    song_id: u.song_id.clone(),
                    song_title: u.song_title.clone(),
                    ccli_number: u.ccli_number.clone(),
                    author: u.author.clone(),
                    copyright: u.copyright.clone(),
                    times_used: 1,
                    dates: vec![u.used_on.clone()],
                }),
            }
        }
        for r in &mut rows {
            r.dates.sort();
        }
        rows.sort_by(|a, b| b.times_used.cmp(&a.times_used).then_with(|| a.song_title.to_lowercase().cmp(&b.song_title.to_lowercase())));
        let songs_without_number = rows.iter().filter(|r| r.ccli_number.is_none()).count() as i64;
        Ok(CcliReport {
            from: from.trim().to_string(),
            to: to.trim().to_string(),
            licence_number: self.get_ccli_licence_number().map_err(|e| e.to_string())?,
            rows,
            songs_without_number,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{PlaylistItem, Service, Song};

    fn song(db: &DbManager, title: &str, ccli: Option<&str>) -> Song {
        let now = "2026-01-01T00:00:00Z".to_string();
        db.create_song(&Song {
            id: String::new(),
            title: title.into(),
            alternate_title: None,
            language: "English".into(),
            author: Some("A. Writer".into()),
            composer: None,
            copyright: Some("(c) Someone".into()),
            ccli_number: ccli.map(String::from),
            song_key: None,
            tempo: None,
            tags: vec![],
            category: "Worship".into(),
            default_theme_id: None,
            sections_count: 0,
            created_at: now.clone(),
            updated_at: now,
        })
        .unwrap()
    }

    fn service(db: &DbManager, title: &str) -> Service {
        let now = "2026-01-01T00:00:00Z".to_string();
        db.create_service(&Service {
            id: String::new(), title: title.into(), description: None, service_date: None,
            category: "Sunday Worship".into(), notes: None, created_at: now.clone(), updated_at: now, item_count: 0,
        })
        .unwrap()
    }

    fn item(db: &DbManager, service_id: &str, kind: &str, source: Option<&str>) -> PlaylistItem {
        db.add_service_item(
            &PlaylistItem {
                id: String::new(), service_id: service_id.into(), sort_order: -1, item_type: kind.into(), title: "t".into(),
                notes: None, source_id: source.map(String::from), theme_id: None, duration_seconds: None,
                created_at: String::new(), updated_at: String::new(), slide_count: 0,
            },
            None,
        )
        .unwrap()
    }

    fn log(db: &DbManager, svc: &str, it: &str, day: &str) -> bool {
        db.log_song_usage_at(svc, it, day, "2026-01-01T10:00:00Z").unwrap()
    }

    #[test]
    fn licence_numbers_are_digits_only_and_empty_clears() {
        assert_eq!(validate_licence_number("1234567").unwrap(), Some("1234567".into()));
        assert_eq!(validate_licence_number(" 123 456 ").unwrap(), Some("123456".into()));
        assert_eq!(validate_licence_number("   ").unwrap(), None);
        for bad in ["12-34", "abcd", "123", "12345678901", "１２３４５"] {
            assert!(validate_licence_number(bad).is_err(), "{bad:?}");
        }
        let db = DbManager::new_in_memory().unwrap();
        assert_eq!(db.get_ccli_licence_number().unwrap(), None);
        assert_eq!(db.set_ccli_licence_number("998877").unwrap(), Some("998877".into()));
        assert_eq!(db.get_ccli_licence_number().unwrap(), Some("998877".into()));
        assert!(db.set_ccli_licence_number("bad!").is_err());
        assert_eq!(db.get_ccli_licence_number().unwrap(), Some("998877".into())); // unchanged by a refused value
        db.set_ccli_licence_number("").unwrap();
        assert_eq!(db.get_ccli_licence_number().unwrap(), None);
    }

    #[test]
    fn report_ranges_are_checked() {
        assert!(validate_range("2026-01-01", "2026-12-31").is_ok());
        assert!(validate_range("2026-01-01", "2026-01-01").is_ok());
        assert!(validate_range("2026-02-01", "2026-01-01").unwrap_err().contains("after"));
        assert!(validate_range("2026-13-01", "2026-12-31").unwrap_err().contains("not a date"));
        assert!(validate_range("yesterday", "2026-12-31").is_err());
        assert!(validate_range("2000-01-01", "2026-12-31").unwrap_err().contains("five years"));
    }

    #[test]
    fn only_song_items_are_logged_and_only_once_per_service_per_day() {
        let db = DbManager::new_in_memory().unwrap();
        let s = song(&db, "Amazing Grace", Some("22025"));
        let svc = service(&db, "Sunday");
        let song_item = item(&db, &svc.id, "song", Some(&s.id));
        let again = item(&db, &svc.id, "song", Some(&s.id)); // the same song twice in one service
        let sermon = item(&db, &svc.id, "sermon", None);

        assert!(log(&db, &svc.id, &song_item.id, "2026-03-01"));
        assert!(!log(&db, &svc.id, &song_item.id, "2026-03-01")); // going live again changes nothing
        assert!(!log(&db, &svc.id, &again.id, "2026-03-01")); // the same song again in this service
        assert!(!log(&db, &svc.id, &sermon.id, "2026-03-01")); // not a song
        assert!(!log(&db, &svc.id, "missing-item", "2026-03-01"));
        assert!(!log(&db, "other-service", &song_item.id, "2026-03-01")); // item is not in that service
        assert_eq!(db.list_all_song_usage().unwrap().len(), 1);

        // the next week is a new use
        assert!(log(&db, &svc.id, &song_item.id, "2026-03-08"));
        assert_eq!(db.list_all_song_usage().unwrap().len(), 2);
        // and another service the same day counts again
        let evening = service(&db, "Evening");
        let evening_item = item(&db, &evening.id, "song", Some(&s.id));
        assert!(log(&db, &evening.id, &evening_item.id, "2026-03-08"));
        assert_eq!(db.list_all_song_usage().unwrap().len(), 3);
    }

    #[test]
    fn a_song_item_whose_song_was_deleted_is_not_logged() {
        let db = DbManager::new_in_memory().unwrap();
        let s = song(&db, "Gone", None);
        let svc = service(&db, "Sunday");
        let it = item(&db, &svc.id, "song", Some(&s.id));
        db.delete_song(&s.id).unwrap();
        assert!(!log(&db, &svc.id, &it.id, "2026-03-01"));
        let manual = item(&db, &svc.id, "song", None); // a song item with no link
        assert!(!log(&db, &svc.id, &manual.id, "2026-03-01"));
    }

    #[test]
    fn the_log_keeps_what_the_song_was_called_at_the_time() {
        let db = DbManager::new_in_memory().unwrap();
        let s = song(&db, "Old Title", Some("111111"));
        let svc = service(&db, "Sunday");
        let it = item(&db, &svc.id, "song", Some(&s.id));
        log(&db, &svc.id, &it.id, "2026-03-01");
        db.update_song(&Song { title: "New Title".into(), ccli_number: Some("222222".into()), ..s.clone() }).unwrap();
        db.delete_song(&s.id).unwrap();
        let u = &db.list_all_song_usage().unwrap()[0];
        assert_eq!((u.song_title.as_str(), u.ccli_number.as_deref(), u.service_title.as_str()), ("Old Title", Some("111111"), "Sunday"));
        assert_eq!(u.author.as_deref(), Some("A. Writer"));
    }

    #[test]
    fn the_report_counts_songs_in_the_range_most_used_first() {
        let db = DbManager::new_in_memory().unwrap();
        let grace = song(&db, "Amazing Grace", Some("22025"));
        let how_great = song(&db, "How Great", Some("33033"));
        let local = song(&db, "Our Own Song", None);
        let svc = service(&db, "Sunday");
        let (g, h, l) = (item(&db, &svc.id, "song", Some(&grace.id)), item(&db, &svc.id, "song", Some(&how_great.id)), item(&db, &svc.id, "song", Some(&local.id)));
        for day in ["2026-03-01", "2026-03-08", "2026-03-15"] {
            log(&db, &svc.id, &g.id, day);
        }
        log(&db, &svc.id, &h.id, "2026-03-08");
        log(&db, &svc.id, &l.id, "2026-03-08");
        log(&db, &svc.id, &h.id, "2026-04-05"); // outside the range below
        db.set_ccli_licence_number("998877").unwrap();

        let r = db.ccli_report("2026-03-01", "2026-03-31").unwrap();
        assert_eq!(r.licence_number.as_deref(), Some("998877"));
        assert_eq!(r.rows.iter().map(|x| (x.song_title.as_str(), x.times_used)).collect::<Vec<_>>(), vec![("Amazing Grace", 3), ("How Great", 1), ("Our Own Song", 1)]);
        assert_eq!(r.rows[0].dates, vec!["2026-03-01", "2026-03-08", "2026-03-15"]);
        assert_eq!(r.songs_without_number, 1);
        // the range includes both end dates
        assert_eq!(db.ccli_report("2026-03-08", "2026-03-08").unwrap().rows.len(), 3);
        assert_eq!(db.ccli_report("2026-04-01", "2026-04-30").unwrap().rows.len(), 1);
        assert!(db.ccli_report("2026-05-01", "2026-05-31").unwrap().rows.is_empty());
        assert!(db.ccli_report("2026-05-31", "2026-05-01").is_err());
    }

    fn slide(title: &str) -> crate::models::Slide {
        crate::models::Slide {
            id: String::new(), presentation_id: String::new(), sort_order: -1, title: title.into(), body: "text".into(),
            background_color: "#000000".into(), foreground_color: "#ffffff".into(), font_size: "large".into(),
            text_alignment: "center".into(), theme_override: None, background_image: None, overlay_color: None,
            line_spacing: None, text_shadow: None, vertical_alignment: None, font_family: None, font_weight: None,
            group_label: None, group_color: None, layout: None, created_at: String::new(), updated_at: String::new(),
        }
    }

    /// A service with two song items of two slides each, then a sermon item.
    fn service_with_two_songs(db: &DbManager) -> (String, [String; 2], [String; 3]) {
        let svc = service(db, "Sunday");
        let mut songs = Vec::new();
        let mut items = Vec::new();
        for title in ["First Song", "Second Song"] {
            let s = song(db, title, Some("12345"));
            let it = db
                .add_service_item(
                    &PlaylistItem {
                        id: String::new(), service_id: svc.id.clone(), sort_order: -1, item_type: "song".into(), title: title.into(),
                        notes: None, source_id: Some(s.id.clone()), theme_id: None, duration_seconds: None,
                        created_at: String::new(), updated_at: String::new(), slide_count: 0,
                    },
                    Some(vec![slide("a"), slide("b")]),
                )
                .unwrap();
            songs.push(s.id);
            items.push(it.id);
        }
        let sermon = db
            .add_service_item(
                &PlaylistItem {
                    id: String::new(), service_id: svc.id.clone(), sort_order: -1, item_type: "sermon".into(), title: "Sermon".into(),
                    notes: None, source_id: None, theme_id: None, duration_seconds: None,
                    created_at: String::new(), updated_at: String::new(), slide_count: 0,
                },
                Some(vec![slide("s")]),
            )
            .unwrap();
        items.push(sermon.id);
        (svc.id, [songs[0].clone(), songs[1].clone()], [items[0].clone(), items[1].clone(), items[2].clone()])
    }

    fn used_titles(db: &DbManager) -> Vec<String> {
        db.list_all_song_usage().unwrap().into_iter().map(|u| u.song_title).collect()
    }

    #[test]
    fn a_song_is_counted_when_its_item_goes_live_and_not_for_every_slide() {
        use crate::presentation::PresentationManager;
        let db = DbManager::new_in_memory().unwrap();
        let (svc, _songs, items) = service_with_two_songs(&db);
        let mgr = PresentationManager::new();
        let first_slides = db.get_service_item_slides(&items[0]).unwrap();
        assert!(used_titles(&db).is_empty());

        mgr.set_live_service_item_slide_core(&db, &svc, &items[0], &first_slides[0].id);
        assert_eq!(used_titles(&db), vec!["First Song"]);

        // stepping through its slides, and going live again on one of them, adds nothing
        mgr.next_slide_core(&db);
        mgr.set_live_service_item_slide_core(&db, &svc, &items[0], &first_slides[0].id);
        mgr.set_live_service_item_slide_core(&db, &svc, &items[0], &first_slides[1].id);
        assert_eq!(used_titles(&db), vec!["First Song"]);

        // running on past the last slide moves to the second song and counts it
        mgr.next_slide_core(&db); // second slide of the first song is live; this crosses to the next item
        assert_eq!(mgr.get_state().current_item_id.as_deref(), Some(items[1].as_str()));
        assert_eq!(used_titles(&db), vec!["First Song", "Second Song"]);

        // on into the sermon: not a song, nothing new
        mgr.next_slide_core(&db);
        mgr.next_slide_core(&db);
        assert_eq!(mgr.get_state().current_item_id.as_deref(), Some(items[2].as_str()));
        assert_eq!(used_titles(&db).len(), 2);

        // and back by hand: the songs were already counted today
        mgr.previous_slide_core(&db);
        mgr.previous_slide_core(&db);
        assert_eq!(used_titles(&db).len(), 2);
    }

    #[test]
    fn nothing_is_counted_for_a_presentation_or_while_the_output_is_not_live() {
        use crate::presentation::PresentationManager;
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        mgr.init_pointers(&db);
        mgr.next_slide_core(&db); // the seeded presentation goes live
        assert!(db.list_all_song_usage().unwrap().is_empty());
    }

    #[test]
    fn a_wrongly_logged_use_can_be_removed() {
        let db = DbManager::new_in_memory().unwrap();
        let s = song(&db, "Mistake", Some("44044"));
        let svc = service(&db, "Sunday");
        let it = item(&db, &svc.id, "song", Some(&s.id));
        log(&db, &svc.id, &it.id, "2026-03-01");
        let id = db.list_song_usage("2026-03-01", "2026-03-01").unwrap()[0].id.clone();
        db.delete_song_usage(&id).unwrap();
        db.delete_song_usage("ghost").unwrap();
        assert!(db.ccli_report("2026-03-01", "2026-03-01").unwrap().rows.is_empty());
        // after removing it the same song can be logged again that day
        assert!(log(&db, &svc.id, &it.id, "2026-03-01"));
    }

    #[test]
    fn usage_survives_backup_and_restore_and_old_backups_still_load() {
        let db = DbManager::new_in_memory().unwrap();
        let s = song(&db, "Keep", Some("55055"));
        let svc = service(&db, "Sunday");
        let it = item(&db, &svc.id, "song", Some(&s.id));
        log(&db, &svc.id, &it.id, "2026-03-01");
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.song_usage.len(), 1);
        let id = db.list_all_song_usage().unwrap()[0].id.clone();
        db.delete_song_usage(&id).unwrap();
        db.import_backup(&backup, "overwrite").unwrap();
        assert_eq!(db.list_all_song_usage().unwrap().len(), 1);
        assert_eq!(db.ccli_report("2026-03-01", "2026-03-01").unwrap().rows[0].song_title, "Keep");

        let mut value = serde_json::to_value(&backup).unwrap();
        value.as_object_mut().unwrap().remove("songUsage");
        let old: crate::models::BackupData = serde_json::from_value(value).unwrap();
        assert!(old.song_usage.is_empty());
    }
}
