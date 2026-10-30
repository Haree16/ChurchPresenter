//! Props: saved overlays (a text lower-third, a logo bug, ...) that the operator toggles on and
//! off over the audience output.

use crate::db::DbManager;
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const PROP_POSITIONS: [&str; 8] = [
    "lower-third",
    "top-bar",
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "bottom-bar",
    "center",
];
pub const PROP_SCROLL_MODES: [&str; 4] = ["none", "left", "right", "up"];
pub const MAX_PROP_TEXT_CHARS: usize = 500;
pub const MAX_PROP_NAME_CHARS: usize = 60;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Prop {
    #[serde(default)]
    pub id: String,
    pub name: String,
    /// "text" or "image"
    pub kind: String,
    #[serde(default)]
    pub text: Option<String>,
    /// App-data-relative or absolute path of the image (image props).
    #[serde(default)]
    pub image_path: Option<String>,
    /// One of `PROP_POSITIONS`.
    pub position: String,
    /// Text: font size as % of screen height (1-20 is sensible). Image: width as % of screen width.
    pub size_pct: i32,
    /// `#rrggbb`
    pub text_color: String,
    /// `#rrggbb`, or `None` for no backing box.
    #[serde(default)]
    pub background_color: Option<String>,
    /// "none", "left", "right", or "up" for scrolling text/ticker marquee.
    #[serde(default)]
    pub scroll_mode: Option<String>,
    /// Speed of scrolling (1 to 10), default 3.
    #[serde(default)]
    pub scroll_speed: Option<i32>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

fn is_hex_color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Checks a prop before it is stored. Colours must be plain hex because they end up in CSS.
pub fn validate_prop(p: &Prop) -> std::result::Result<(), String> {
    let name = p.name.trim();
    if name.is_empty() {
        return Err("Give the prop a name.".to_string());
    }
    if name.chars().count() > MAX_PROP_NAME_CHARS {
        return Err(format!("Prop name is too long (maximum {} characters).", MAX_PROP_NAME_CHARS));
    }
    match p.kind.as_str() {
        "text" => {
            let text = p.text.as_deref().unwrap_or("").trim();
            if text.is_empty() {
                return Err("A text prop needs some text.".to_string());
            }
            if text.chars().count() > MAX_PROP_TEXT_CHARS {
                return Err(format!("Prop text is too long (maximum {} characters).", MAX_PROP_TEXT_CHARS));
            }
        }
        "image" => {
            if p.image_path.as_deref().unwrap_or("").trim().is_empty() {
                return Err("An image prop needs an image.".to_string());
            }
        }
        other => return Err(format!("Unknown prop type '{}'. Use 'text' or 'image'.", other)),
    }
    if !PROP_POSITIONS.contains(&p.position.as_str()) {
        return Err(format!("Unknown position '{}'.", p.position));
    }
    if !(1..=100).contains(&p.size_pct) {
        return Err("Size must be between 1 and 100.".to_string());
    }
    if !is_hex_color(&p.text_color) {
        return Err("Text colour must look like #ffffff.".to_string());
    }
    if let Some(bg) = &p.background_color {
        if !is_hex_color(bg) {
            return Err("Background colour must look like #000000.".to_string());
        }
    }
    if let Some(mode) = p.scroll_mode.as_deref() {
        if !PROP_SCROLL_MODES.contains(&mode) {
            return Err(format!("Unknown scroll mode '{}'.", mode));
        }
        if mode != "none" && p.kind != "text" {
            return Err("Only text props can scroll.".to_string());
        }
    }
    if let Some(speed) = p.scroll_speed {
        if !(1..=10).contains(&speed) {
            return Err("Scroll speed must be between 1 and 10.".to_string());
        }
    }
    Ok(())
}

impl DbManager {
    pub fn list_props(&self) -> Result<Vec<Prop>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, kind, text, image_path, position, size_pct, text_color, background_color, sort_order, created_at, updated_at, scroll_mode, scroll_speed
             FROM props ORDER BY sort_order ASC, created_at ASC;",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Prop {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                text: row.get(3)?,
                image_path: row.get(4)?,
                position: row.get(5)?,
                size_pct: row.get(6)?,
                text_color: row.get(7)?,
                background_color: row.get(8)?,
                sort_order: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                scroll_mode: row.get(12)?,
                scroll_speed: row.get(13)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_prop(&self, id: &str) -> Result<Option<Prop>> {
        Ok(self.list_props()?.into_iter().find(|p| p.id == id))
    }

    pub fn create_prop(&self, prop: &Prop) -> std::result::Result<Prop, String> {
        validate_prop(prop)?;
        let now = Utc::now().to_rfc3339();
        let order = self.list_props().map_err(|e| e.to_string())?.len() as i32;
        let saved = Prop {
            id: Uuid::new_v4().to_string(),
            name: prop.name.trim().to_string(),
            text: prop.text.as_ref().map(|t| t.trim().to_string()),
            sort_order: order,
            created_at: now.clone(),
            updated_at: now,
            ..prop.clone()
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO props (id, name, kind, text, image_path, position, size_pct, text_color, background_color, sort_order, created_at, updated_at, scroll_mode, scroll_speed)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14);",
            params![
                saved.id, saved.name, saved.kind, saved.text, saved.image_path, saved.position,
                saved.size_pct, saved.text_color, saved.background_color, saved.sort_order,
                saved.created_at, saved.updated_at, saved.scroll_mode, saved.scroll_speed
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(saved)
    }

    pub fn update_prop(&self, prop: &Prop) -> std::result::Result<Prop, String> {
        validate_prop(prop)?;
        let now = Utc::now().to_rfc3339();
        let conn = self.conn.lock().unwrap();
        let changed = conn
            .execute(
                "UPDATE props SET name = ?2, kind = ?3, text = ?4, image_path = ?5, position = ?6, size_pct = ?7,
                        text_color = ?8, background_color = ?9, updated_at = ?10, scroll_mode = ?11, scroll_speed = ?12 WHERE id = ?1;",
                params![
                    prop.id, prop.name.trim(), prop.kind, prop.text.as_ref().map(|t| t.trim().to_string()),
                    prop.image_path, prop.position, prop.size_pct, prop.text_color, prop.background_color, now,
                    prop.scroll_mode, prop.scroll_speed
                ],
            )
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("That prop no longer exists.".to_string());
        }
        drop(conn);
        self.get_prop(&prop.id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "That prop no longer exists.".to_string())
    }

    pub fn delete_prop(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM props WHERE id = ?1;", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn text_prop() -> Prop {
        Prop {
            id: String::new(),
            name: "Welcome".into(),
            kind: "text".into(),
            text: Some("Welcome to church".into()),
            image_path: None,
            position: "lower-third".into(),
            size_pct: 6,
            text_color: "#ffffff".into(),
            background_color: Some("#000000".into()),
            scroll_mode: None,
            scroll_speed: None,
            sort_order: 0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn valid_text_and_image_props_pass() {
        assert!(validate_prop(&text_prop()).is_ok());
        let image = Prop { kind: "image".into(), text: None, image_path: Some("media/logo.png".into()), position: "top-right".into(), ..text_prop() };
        assert!(validate_prop(&image).is_ok());
    }

    #[test]
    fn rejects_bad_names_kinds_and_content() {
        let bad = |p: Prop| validate_prop(&p).unwrap_err();
        assert!(bad(Prop { name: "  ".into(), ..text_prop() }).contains("name"));
        assert!(bad(Prop { name: "n".repeat(61), ..text_prop() }).contains("too long"));
        assert!(bad(Prop { kind: "video".into(), ..text_prop() }).contains("Unknown prop type"));
        assert!(bad(Prop { text: Some("   ".into()), ..text_prop() }).contains("needs some text"));
        assert!(bad(Prop { text: None, ..text_prop() }).contains("needs some text"));
        assert!(bad(Prop { text: Some("x".repeat(501)), ..text_prop() }).contains("too long"));
        assert!(bad(Prop { kind: "image".into(), image_path: Some(" ".into()), ..text_prop() }).contains("needs an image"));
        assert!(bad(Prop { kind: "image".into(), image_path: None, ..text_prop() }).contains("needs an image"));
    }

    #[test]
    fn rejects_bad_position_size_and_colours() {
        let bad = |p: Prop| validate_prop(&p).unwrap_err();
        assert!(bad(Prop { position: "middle-ish".into(), ..text_prop() }).contains("position"));
        for size in [0, -5, 101] {
            assert!(bad(Prop { size_pct: size, ..text_prop() }).contains("Size"));
        }
        assert!(validate_prop(&Prop { size_pct: 1, ..text_prop() }).is_ok());
        assert!(validate_prop(&Prop { size_pct: 100, ..text_prop() }).is_ok());
        // colours end up in CSS, so only plain hex is accepted
        for c in ["red", "#fff", "#ggg000", "#ffffff;background:url(x)", "rgb(0,0,0)", ""] {
            assert!(bad(Prop { text_color: c.into(), ..text_prop() }).contains("Text colour"), "{c:?}");
            assert!(bad(Prop { background_color: Some(c.into()), ..text_prop() }).contains("Background colour"), "{c:?}");
        }
        assert!(validate_prop(&Prop { background_color: None, ..text_prop() }).is_ok());
    }

    #[test]
    fn every_listed_position_is_accepted() {
        for pos in PROP_POSITIONS {
            assert!(validate_prop(&Prop { position: pos.into(), ..text_prop() }).is_ok(), "{pos}");
        }
    }

    #[test]
    fn scroll_mode_and_speed_validation() {
        let bad = |p: Prop| validate_prop(&p).unwrap_err();
        for mode in PROP_SCROLL_MODES {
            assert!(validate_prop(&Prop { scroll_mode: Some(mode.into()), ..text_prop() }).is_ok(), "{mode}");
        }
        assert!(bad(Prop { scroll_mode: Some("diagonal".into()), ..text_prop() }).contains("Unknown scroll mode"));

        // Only text props can scroll
        let image = Prop {
            kind: "image".into(),
            text: None,
            image_path: Some("media/logo.png".into()),
            scroll_mode: Some("left".into()),
            ..text_prop()
        };
        assert!(bad(image).contains("Only text props can scroll"));

        // Speed must be 1..=10
        assert!(validate_prop(&Prop { scroll_speed: Some(1), ..text_prop() }).is_ok());
        assert!(validate_prop(&Prop { scroll_speed: Some(10), ..text_prop() }).is_ok());
        assert!(bad(Prop { scroll_speed: Some(0), ..text_prop() }).contains("Scroll speed"));
        assert!(bad(Prop { scroll_speed: Some(11), ..text_prop() }).contains("Scroll speed"));
    }

    #[test]
    fn create_list_update_delete_round_trip() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.list_props().unwrap().is_empty());

        let a = db.create_prop(&Prop {
            name: "  First  ".into(),
            scroll_mode: Some("left".into()),
            scroll_speed: Some(5),
            ..text_prop()
        }).unwrap();
        let b = db.create_prop(&Prop { name: "Second".into(), ..text_prop() }).unwrap();
        assert_eq!(a.name, "First");
        assert_eq!(a.scroll_mode.as_deref(), Some("left"));
        assert_eq!(a.scroll_speed, Some(5));
        assert_ne!(a.id, b.id);
        let list = db.list_props().unwrap();
        assert_eq!(list.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), vec!["First", "Second"]);
        assert_eq!(list[0].scroll_mode.as_deref(), Some("left"));
        assert_eq!(list[0].scroll_speed, Some(5));

        let updated = db.update_prop(&Prop {
            text: Some("New words".into()),
            position: "top-bar".into(),
            scroll_mode: Some("up".into()),
            scroll_speed: Some(8),
            ..a.clone()
        }).unwrap();
        assert_eq!(updated.text.as_deref(), Some("New words"));
        assert_eq!(updated.position, "top-bar");
        assert_eq!(updated.scroll_mode.as_deref(), Some("up"));
        assert_eq!(updated.scroll_speed, Some(8));
        assert_eq!(updated.created_at, a.created_at);

        db.delete_prop(&a.id).unwrap();
        assert_eq!(db.list_props().unwrap().len(), 1);
        db.delete_prop("does-not-exist").unwrap(); // idempotent
    }

    #[test]
    fn invalid_props_are_never_stored_and_missing_ones_cannot_be_updated() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.create_prop(&Prop { text_color: "red".into(), ..text_prop() }).is_err());
        assert!(db.list_props().unwrap().is_empty());

        let ghost = Prop { id: "nope".into(), ..text_prop() };
        assert!(db.update_prop(&ghost).unwrap_err().contains("no longer exists"));

        let saved = db.create_prop(&text_prop()).unwrap();
        assert!(db.update_prop(&Prop { size_pct: 0, ..saved.clone() }).is_err());
        assert_eq!(db.get_prop(&saved.id).unwrap().unwrap().size_pct, 6); // unchanged
    }

    #[test]
    fn toggling_shows_and_hides_a_prop_without_touching_other_layers() {
        use crate::presentation::PresentationManager;
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        let a = db.create_prop(&text_prop()).unwrap();
        let b = db.create_prop(&Prop { name: "Logo bug".into(), kind: "image".into(), text: None, image_path: Some("media/l.png".into()), position: "top-right".into(), ..text_prop() }).unwrap();

        mgr.toggle_logo_core();
        let on = mgr.toggle_prop_core(&db, &a.id).unwrap();
        assert_eq!(on.active_props.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), vec![a.id.as_str()]);
        let both = mgr.toggle_prop_core(&db, &b.id).unwrap();
        assert_eq!(both.active_props.len(), 2);
        assert!(both.is_logo); // props are their own layer

        let off = mgr.toggle_prop_core(&db, &a.id).unwrap();
        assert_eq!(off.active_props.len(), 1);
        assert_eq!(off.active_props[0].id, b.id);
    }

    #[test]
    fn toggling_a_missing_prop_is_an_error_and_changes_nothing() {
        use crate::presentation::PresentationManager;
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        assert!(mgr.toggle_prop_core(&db, "ghost").unwrap_err().contains("no longer exists"));
        assert!(mgr.get_state().active_props.is_empty());
    }

    #[test]
    fn editing_or_deleting_an_active_prop_updates_the_screen() {
        use crate::presentation::PresentationManager;
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        let a = db.create_prop(&text_prop()).unwrap();
        let b = db.create_prop(&Prop { name: "Other".into(), ..text_prop() }).unwrap();
        mgr.toggle_prop_core(&db, &a.id).unwrap();
        mgr.toggle_prop_core(&db, &b.id).unwrap();

        db.update_prop(&Prop { text: Some("Edited live".into()), ..a.clone() }).unwrap();
        let st = mgr.sync_active_props_core(&db);
        assert_eq!(st.active_props.iter().find(|p| p.id == a.id).unwrap().text.as_deref(), Some("Edited live"));

        db.delete_prop(&a.id).unwrap();
        let st = mgr.sync_active_props_core(&db);
        assert_eq!(st.active_props.len(), 1);
        assert_eq!(st.active_props[0].id, b.id);
    }

    #[test]
    fn clear_props_and_clear_all_remove_active_props() {
        use crate::presentation::PresentationManager;
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        let a = db.create_prop(&text_prop()).unwrap();

        mgr.toggle_prop_core(&db, &a.id).unwrap();
        assert!(mgr.clear_props_core().active_props.is_empty());
        assert!(mgr.clear_props_core().active_props.is_empty()); // idempotent

        mgr.toggle_prop_core(&db, &a.id).unwrap();
        assert!(mgr.clear_all_core().active_props.is_empty());
        // the saved prop itself is untouched
        assert_eq!(db.list_props().unwrap().len(), 1);
    }

    #[test]
    fn props_survive_backup_and_restore() {
        let db = DbManager::new_in_memory().unwrap();
        let a = db.create_prop(&text_prop()).unwrap();
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.props.len(), 1);

        db.delete_prop(&a.id).unwrap();
        assert!(db.list_props().unwrap().is_empty());
        db.import_backup(&backup, "overwrite").unwrap();
        let restored = db.list_props().unwrap();
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].name, "Welcome");

        // backups made before props existed still restore
        let mut value = serde_json::to_value(&backup).unwrap();
        value.as_object_mut().unwrap().remove("props");
        let old: crate::models::BackupData = serde_json::from_value(value).unwrap();
        assert!(old.props.is_empty());
    }
}
