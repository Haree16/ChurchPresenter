//! Service templates: a saved copy of a service's order of items (and the slides of fixed items such as a
//! welcome or offering slide) that a new service can start from each week.
//!
//! When a service is made from a template, songs and scripture can be kept as they were or left as empty
//! slots (a divider such as "Worship song") for the operator to fill in.

use crate::db::DbManager;
use crate::models::{PlaylistItem, Service, Slide};
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_TEMPLATE_NAME_CHARS: usize = 60;
pub const MAX_TEMPLATES: usize = 50;
pub const MAX_TEMPLATE_ITEMS: usize = 100;
pub const MAX_SLIDES_PER_ITEM: usize = 300;
pub const MAX_SERVICE_TITLE_CHARS: usize = 100;
const ITEM_TYPES: [&str; 8] = ["song", "bible", "sermon", "announcement", "text", "image", "divider", "timer"];

/// One item of a template. Slides keep their look but not their ids.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateItem {
    pub item_type: String,
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub theme_id: Option<String>,
    #[serde(default)]
    pub duration_seconds: Option<i32>,
    /// For songs: the library song the item came from.
    #[serde(default)]
    pub source_id: Option<String>,
    #[serde(default)]
    pub slides: Vec<Slide>,
}

/// What the template list shows.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceTemplateSummary {
    pub id: String,
    pub name: String,
    pub item_count: i32,
    /// Songs and scripture: the items that can be left as empty slots.
    pub slot_count: i32,
    pub created_at: String,
}

pub fn is_slot(item_type: &str) -> bool {
    item_type == "song" || item_type == "bible"
}

fn slot_title(item_type: &str) -> &'static str {
    if item_type == "bible" { "Scripture reading" } else { "Worship song" }
}

pub fn validate_template_name(name: &str) -> std::result::Result<String, String> {
    let n = name.trim();
    if n.is_empty() {
        return Err("Give the template a name.".to_string());
    }
    if n.chars().count() > MAX_TEMPLATE_NAME_CHARS {
        return Err(format!("Template name is too long (maximum {} characters).", MAX_TEMPLATE_NAME_CHARS));
    }
    Ok(n.to_string())
}

pub fn validate_items(items: &[TemplateItem]) -> std::result::Result<(), String> {
    if items.is_empty() {
        return Err("The service has no items to save.".to_string());
    }
    if items.len() > MAX_TEMPLATE_ITEMS {
        return Err(format!("A template can have at most {} items.", MAX_TEMPLATE_ITEMS));
    }
    for (i, it) in items.iter().enumerate() {
        if !ITEM_TYPES.contains(&it.item_type.as_str()) {
            return Err(format!("Item {}: unknown type '{}'.", i + 1, it.item_type));
        }
        if it.slides.len() > MAX_SLIDES_PER_ITEM {
            return Err(format!("Item {} has too many slides (maximum {}).", i + 1, MAX_SLIDES_PER_ITEM));
        }
    }
    Ok(())
}

impl DbManager {
    fn template_items(&self, id: &str) -> std::result::Result<(String, Vec<TemplateItem>), String> {
        let conn = self.conn.lock().unwrap();
        let (name, json): (String, String) = conn
            .query_row("SELECT name, items FROM service_templates WHERE id = ?1;", params![id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|_| "That template no longer exists.".to_string())?;
        let items: Vec<TemplateItem> = serde_json::from_str(&json).map_err(|_| "That template is damaged and cannot be used.".to_string())?;
        Ok((name, items))
    }

    pub fn list_service_templates(&self) -> Result<Vec<ServiceTemplateSummary>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, items, created_at FROM service_templates ORDER BY sort_order ASC, created_at ASC;")?;
        let rows = stmt.query_map([], |r| {
            let json: String = r.get(2)?;
            // a damaged template is still listed (so it can be deleted), with no items
            let items: Vec<TemplateItem> = serde_json::from_str(&json).unwrap_or_default();
            Ok(ServiceTemplateSummary {
                id: r.get(0)?,
                name: r.get(1)?,
                item_count: items.len() as i32,
                slot_count: items.iter().filter(|i| is_slot(&i.item_type)).count() as i32,
                created_at: r.get(3)?,
            })
        })?;
        rows.collect()
    }

    /// Saves the order of a service's items, and the slides of each, as a template.
    pub fn save_service_as_template(&self, service_id: &str, name: &str) -> std::result::Result<ServiceTemplateSummary, String> {
        let name = validate_template_name(name)?;
        if self.get_service(service_id).map_err(|e| e.to_string())?.is_none() {
            return Err("That service no longer exists.".to_string());
        }
        if self.list_service_templates().map_err(|e| e.to_string())?.len() >= MAX_TEMPLATES {
            return Err(format!("You can keep at most {} templates.", MAX_TEMPLATES));
        }
        let mut items = Vec::new();
        for item in self.get_service_items(service_id).map_err(|e| e.to_string())? {
            let slides = self
                .get_service_item_slides(&item.id)
                .map_err(|e| e.to_string())?
                .into_iter()
                .map(|s| Slide { id: String::new(), presentation_id: String::new(), ..s })
                .collect();
            items.push(TemplateItem {
                item_type: item.item_type,
                title: item.title,
                notes: item.notes,
                theme_id: item.theme_id,
                duration_seconds: item.duration_seconds,
                source_id: item.source_id,
                slides,
            });
        }
        validate_items(&items)?;
        let now = Utc::now().to_rfc3339();
        let id = format!("tpl-{}", Uuid::new_v4().simple());
        let count = self.list_service_templates().map_err(|e| e.to_string())?.len() as i32;
        {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "INSERT INTO service_templates (id, name, items, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5);",
                params![id, name, serde_json::to_string(&items).map_err(|e| e.to_string())?, count, now],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(ServiceTemplateSummary {
            id,
            name,
            item_count: items.len() as i32,
            slot_count: items.iter().filter(|i| is_slot(&i.item_type)).count() as i32,
            created_at: now,
        })
    }

    pub fn delete_service_template(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM service_templates WHERE id = ?1;", params![id])?;
        Ok(())
    }

    /// Makes a new service with the template's items. With `keep_songs` off, songs and scripture become empty
    /// slots (dividers) to fill in; with it on, they are copied as they were.
    pub fn create_service_from_template(
        &self,
        template_id: &str,
        title: &str,
        service_date: Option<String>,
        keep_songs: bool,
    ) -> std::result::Result<Service, String> {
        let title = title.trim();
        if title.is_empty() {
            return Err("Give the service a title.".to_string());
        }
        if title.chars().count() > MAX_SERVICE_TITLE_CHARS {
            return Err(format!("Service title is too long (maximum {} characters).", MAX_SERVICE_TITLE_CHARS));
        }
        let (_, items) = self.template_items(template_id)?;
        validate_items(&items)?;

        let now = Utc::now().to_rfc3339();
        let service = self
            .create_service(&Service {
                id: String::new(),
                title: title.to_string(),
                description: None,
                service_date: service_date.filter(|d| !d.trim().is_empty()),
                category: "Sunday Worship".to_string(),
                notes: None,
                created_at: now.clone(),
                updated_at: now,
                item_count: 0,
            })
            .map_err(|e| e.to_string())?;

        let built: std::result::Result<(), String> = (|| {
            for it in &items {
                let slot = is_slot(&it.item_type) && !keep_songs;
                let item = PlaylistItem {
                    id: String::new(),
                    service_id: service.id.clone(),
                    sort_order: -1,
                    item_type: if slot { "divider".to_string() } else { it.item_type.clone() },
                    title: if slot { slot_title(&it.item_type).to_string() } else { it.title.clone() },
                    notes: if slot { Some("Add the item here".to_string()) } else { it.notes.clone() },
                    source_id: if slot { None } else { it.source_id.clone() },
                    theme_id: it.theme_id.clone(),
                    duration_seconds: it.duration_seconds,
                    created_at: String::new(),
                    updated_at: String::new(),
                    slide_count: 0,
                };
                let slides = if slot || it.slides.is_empty() { None } else { Some(it.slides.clone()) };
                self.add_service_item(&item, slides).map_err(|e| e.to_string())?;
            }
            Ok(())
        })();
        if let Err(e) = built {
            // never leave a half-built service behind
            let _ = self.delete_service(&service.id);
            return Err(e);
        }
        Ok(self.get_service(&service.id).map_err(|e| e.to_string())?.unwrap_or(service))
    }

    pub fn export_service_templates(&self) -> Result<Vec<StoredTemplate>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, items, sort_order, created_at, updated_at FROM service_templates ORDER BY sort_order ASC;")?;
        let rows = stmt.query_map([], |r| {
            let json: String = r.get(2)?;
            Ok(StoredTemplate {
                id: r.get(0)?,
                name: r.get(1)?,
                items: serde_json::from_str(&json).unwrap_or_default(),
                sort_order: r.get(3)?,
                created_at: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        rows.collect()
    }
}

/// A template as kept in a backup file.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredTemplate {
    pub id: String,
    pub name: String,
    pub items: Vec<TemplateItem>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Song;

    fn slide(title: &str, body: &str) -> Slide {
        Slide {
            id: String::new(), presentation_id: String::new(), sort_order: -1, title: title.into(), body: body.into(),
            background_color: "#102030".into(), foreground_color: "#ffffff".into(), font_size: "large".into(),
            text_alignment: "center".into(), theme_override: None, background_image: None, overlay_color: None,
            line_spacing: None, text_shadow: None, vertical_alignment: None, font_family: None, font_weight: None,
            group_label: None, group_color: None, layout: None, created_at: String::new(), updated_at: String::new(),
        }
    }

    fn add(db: &DbManager, service_id: &str, kind: &str, title: &str, source: Option<&str>, slides: Vec<Slide>) -> PlaylistItem {
        db.add_service_item(
            &PlaylistItem {
                id: String::new(), service_id: service_id.into(), sort_order: -1, item_type: kind.into(), title: title.into(),
                notes: Some("note".into()), source_id: source.map(String::from), theme_id: Some("theme-builtin-dark".into()),
                duration_seconds: Some(300), created_at: String::new(), updated_at: String::new(), slide_count: 0,
            },
            if slides.is_empty() { None } else { Some(slides) },
        )
        .unwrap()
    }

    /// Welcome, a song, a sermon, scripture and a closing divider.
    fn sample_service(db: &DbManager) -> (Service, String) {
        let now = "2026-01-01T00:00:00Z".to_string();
        let song = db
            .create_song(&Song {
                id: String::new(), title: "Template Song".into(), alternate_title: None, language: "English".into(), author: None,
                composer: None, copyright: None, ccli_number: Some("12345".into()), song_key: None, tempo: None, tags: vec![],
                category: "Worship".into(), default_theme_id: None, sections_count: 0, created_at: now.clone(), updated_at: now.clone(),
            })
            .unwrap();
        let svc = db
            .create_service(&Service {
                id: String::new(), title: "Last Sunday".into(), description: None, service_date: Some("2026-03-01".into()),
                category: "Sunday Worship".into(), notes: None, created_at: now.clone(), updated_at: now, item_count: 0,
            })
            .unwrap();
        add(db, &svc.id, "announcement", "Welcome", None, vec![slide("Welcome", "Good morning")]);
        add(db, &svc.id, "song", "Template Song", Some(&song.id), vec![slide("v1", "line one"), slide("v2", "line two")]);
        add(db, &svc.id, "sermon", "Sermon", None, vec![slide("Title", "The sermon")]);
        add(db, &svc.id, "bible", "John 3", None, vec![slide("John 3:16", "For God so loved")]);
        add(db, &svc.id, "divider", "Closing", None, vec![]);
        (svc, song.id)
    }

    fn kinds(db: &DbManager, service_id: &str) -> Vec<(String, String)> {
        db.get_service_items(service_id).unwrap().into_iter().map(|i| (i.item_type, i.title)).collect()
    }

    #[test]
    fn names_and_items_are_checked() {
        assert_eq!(validate_template_name("  Sunday  ").unwrap(), "Sunday");
        assert!(validate_template_name("   ").unwrap_err().contains("name"));
        assert!(validate_template_name(&"n".repeat(61)).unwrap_err().contains("too long"));
        let item = |t: &str| TemplateItem { item_type: t.into(), title: "x".into(), notes: None, theme_id: None, duration_seconds: None, source_id: None, slides: vec![] };
        assert!(validate_items(&[item("song")]).is_ok());
        assert!(validate_items(&[]).unwrap_err().contains("no items"));
        assert!(validate_items(&[item("teleport")]).unwrap_err().contains("unknown type"));
        assert!(validate_items(&vec![item("song"); MAX_TEMPLATE_ITEMS + 1]).unwrap_err().contains("at most"));
        let heavy = TemplateItem { slides: vec![slide("a", "b"); MAX_SLIDES_PER_ITEM + 1], ..item("text") };
        assert!(validate_items(&[heavy]).unwrap_err().contains("too many slides"));
    }

    #[test]
    fn a_service_is_saved_as_a_template_and_listed() {
        let db = DbManager::new_in_memory().unwrap();
        let (svc, _) = sample_service(&db);
        assert!(db.list_service_templates().unwrap().is_empty());
        let t = db.save_service_as_template(&svc.id, "  Sunday Morning ").unwrap();
        assert_eq!((t.name.as_str(), t.item_count, t.slot_count), ("Sunday Morning", 5, 2)); // the song and the scripture
        let list = db.list_service_templates().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, t.id);
    }

    #[test]
    fn saving_is_refused_for_a_bad_name_an_empty_or_missing_service_and_too_many_templates() {
        let db = DbManager::new_in_memory().unwrap();
        let (svc, _) = sample_service(&db);
        assert!(db.save_service_as_template(&svc.id, "").is_err());
        assert!(db.save_service_as_template("ghost", "x").unwrap_err().contains("no longer exists"));
        let empty = db
            .create_service(&Service {
                id: String::new(), title: "Empty".into(), description: None, service_date: None, category: "Sunday Worship".into(),
                notes: None, created_at: String::new(), updated_at: String::new(), item_count: 0,
            })
            .unwrap();
        assert!(db.save_service_as_template(&empty.id, "x").unwrap_err().contains("no items"));
        assert!(db.list_service_templates().unwrap().is_empty());
        for i in 0..MAX_TEMPLATES {
            db.save_service_as_template(&svc.id, &format!("T{i}")).unwrap();
        }
        assert!(db.save_service_as_template(&svc.id, "one more").unwrap_err().contains("at most"));
    }

    #[test]
    fn a_new_service_leaves_songs_and_scripture_as_empty_slots_by_default() {
        let db = DbManager::new_in_memory().unwrap();
        let (svc, _) = sample_service(&db);
        let t = db.save_service_as_template(&svc.id, "Sunday").unwrap();
        let made = db.create_service_from_template(&t.id, "  Next Sunday ", Some("2026-03-08".into()), false).unwrap();
        assert_eq!((made.title.as_str(), made.service_date.as_deref()), ("Next Sunday", Some("2026-03-08")));
        assert_ne!(made.id, svc.id);
        assert_eq!(
            kinds(&db, &made.id),
            vec![
                ("announcement".to_string(), "Welcome".to_string()),
                ("divider".to_string(), "Worship song".to_string()),
                ("sermon".to_string(), "Sermon".to_string()),
                ("divider".to_string(), "Scripture reading".to_string()),
                ("divider".to_string(), "Closing".to_string()),
            ]
        );
        // fixed items keep their slides; the slots have none and no link to a song
        let items = db.get_service_items(&made.id).unwrap();
        assert_eq!(db.get_service_item_slides(&items[0].id).unwrap()[0].body, "Good morning");
        assert_eq!(db.get_service_item_slides(&items[2].id).unwrap()[0].body, "The sermon");
        assert!(db.get_service_item_slides(&items[1].id).unwrap().is_empty());
        assert_eq!(items[1].source_id, None);
        assert_eq!(items[0].duration_seconds, Some(300));
    }

    #[test]
    fn songs_and_scripture_can_be_kept_with_their_slides_and_song_link() {
        let db = DbManager::new_in_memory().unwrap();
        let (svc, song_id) = sample_service(&db);
        let t = db.save_service_as_template(&svc.id, "Sunday").unwrap();
        let made = db.create_service_from_template(&t.id, "Copy", None, true).unwrap();
        assert_eq!(kinds(&db, &made.id).iter().map(|(k, _)| k.as_str()).collect::<Vec<_>>(), vec!["announcement", "song", "sermon", "bible", "divider"]);
        let items = db.get_service_items(&made.id).unwrap();
        assert_eq!(items[1].source_id.as_deref(), Some(song_id.as_str())); // so it is still counted for CCLI
        assert_eq!(db.get_service_item_slides(&items[1].id).unwrap().len(), 2);
        assert_eq!(db.get_service_item_slides(&items[3].id).unwrap()[0].title, "John 3:16");
    }

    #[test]
    fn services_made_from_a_template_do_not_share_anything_with_it_or_each_other() {
        let db = DbManager::new_in_memory().unwrap();
        let (svc, _) = sample_service(&db);
        let t = db.save_service_as_template(&svc.id, "Sunday").unwrap();
        let a = db.create_service_from_template(&t.id, "A", None, true).unwrap();
        let b = db.create_service_from_template(&t.id, "B", None, true).unwrap();
        let (ia, ib) = (db.get_service_items(&a.id).unwrap(), db.get_service_items(&b.id).unwrap());
        let (sa, sb) = (db.get_service_item_slides(&ia[0].id).unwrap(), db.get_service_item_slides(&ib[0].id).unwrap());
        assert_ne!(sa[0].id, sb[0].id);
        // changing the original service, or one copy, does not change the template or the other copy
        db.delete_service(&svc.id).unwrap();
        db.delete_service(&a.id).unwrap();
        let c = db.create_service_from_template(&t.id, "C", None, true).unwrap();
        assert_eq!(db.get_service_items(&c.id).unwrap().len(), 5);
        assert_eq!(db.get_service_item_slides(&db.get_service_items(&b.id).unwrap()[0].id).unwrap()[0].body, "Good morning");
    }

    #[test]
    fn a_bad_title_a_missing_or_damaged_template_make_no_service() {
        let db = DbManager::new_in_memory().unwrap();
        let (svc, _) = sample_service(&db);
        let t = db.save_service_as_template(&svc.id, "Sunday").unwrap();
        let before = db.list_services().unwrap().len();
        assert!(db.create_service_from_template(&t.id, "   ", None, false).unwrap_err().contains("title"));
        assert!(db.create_service_from_template(&t.id, &"t".repeat(101), None, false).unwrap_err().contains("too long"));
        assert!(db.create_service_from_template("ghost", "x", None, false).unwrap_err().contains("no longer exists"));
        db.conn.lock().unwrap().execute("UPDATE service_templates SET items = 'garbage' WHERE id = ?1;", params![t.id]).unwrap();
        assert!(db.create_service_from_template(&t.id, "x", None, false).unwrap_err().contains("damaged"));
        assert_eq!(db.list_services().unwrap().len(), before); // nothing was left behind
        // a damaged template is still listed so it can be deleted
        assert_eq!(db.list_service_templates().unwrap()[0].item_count, 0);
        db.delete_service_template(&t.id).unwrap();
        db.delete_service_template("ghost").unwrap();
        assert!(db.list_service_templates().unwrap().is_empty());
    }

    #[test]
    fn templates_survive_backup_and_restore_and_old_backups_still_load() {
        let db = DbManager::new_in_memory().unwrap();
        let (svc, _) = sample_service(&db);
        let t = db.save_service_as_template(&svc.id, "Keep").unwrap();
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.service_templates.len(), 1);
        db.delete_service_template(&t.id).unwrap();
        db.import_backup(&backup, "overwrite").unwrap();
        let list = db.list_service_templates().unwrap();
        assert_eq!((list[0].name.as_str(), list[0].item_count), ("Keep", 5));
        assert_eq!(db.create_service_from_template(&list[0].id, "Restored", None, true).unwrap().title, "Restored");

        let mut value = serde_json::to_value(&backup).unwrap();
        value.as_object_mut().unwrap().remove("serviceTemplates");
        let old: crate::models::BackupData = serde_json::from_value(value).unwrap();
        assert!(old.service_templates.is_empty());
    }
}
