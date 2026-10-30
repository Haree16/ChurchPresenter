//! Clear groups: a named choice of output layers that are cleared together with one click, for
//! example "Lyrics only" = clear the slide and media but leave the logo and props showing.
//!
//! The built-in Clear All and the separate logo / media buttons stay as they are; a group is an
//! extra, operator-defined combination.

use crate::db::DbManager;
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_CLEAR_GROUP_NAME_CHARS: usize = 60;
pub const MAX_CLEAR_GROUPS: usize = 50;

/// Layers a group may clear. `media` covers video and audio playback.
pub const CLEAR_LAYERS: [&str; 8] = [
    "slide",
    "media",
    "logo",
    "blackout",
    "alert",
    "props",
    "autoAdvance",
    "announcements",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClearGroup {
    #[serde(default)]
    pub id: String,
    pub name: String,
    /// Layers to clear, from `CLEAR_LAYERS`.
    #[serde(default)]
    pub layers: Vec<String>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

pub fn validate_clear_group(g: &ClearGroup) -> std::result::Result<(), String> {
    let name = g.name.trim();
    if name.is_empty() {
        return Err("Give the clear group a name.".to_string());
    }
    if name.chars().count() > MAX_CLEAR_GROUP_NAME_CHARS {
        return Err(format!("Clear group name is too long (maximum {} characters).", MAX_CLEAR_GROUP_NAME_CHARS));
    }
    if g.layers.is_empty() {
        return Err("Choose at least one layer to clear.".to_string());
    }
    let mut seen = std::collections::HashSet::new();
    for layer in &g.layers {
        if !CLEAR_LAYERS.contains(&layer.as_str()) {
            return Err(format!("'{}' is not a layer that can be cleared.", layer));
        }
        if !seen.insert(layer.as_str()) {
            return Err("A clear group lists the same layer twice.".to_string());
        }
    }
    Ok(())
}

fn row_to_group(row: &rusqlite::Row) -> Result<ClearGroup> {
    let layers_json: String = row.get(2)?;
    Ok(ClearGroup {
        id: row.get(0)?,
        name: row.get(1)?,
        layers: serde_json::from_str(&layers_json).unwrap_or_default(),
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

impl DbManager {
    pub fn list_clear_groups(&self) -> Result<Vec<ClearGroup>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, layers, sort_order, created_at, updated_at FROM clear_groups ORDER BY sort_order ASC, created_at ASC;",
        )?;
        let rows = stmt.query_map([], row_to_group)?;
        rows.collect()
    }

    pub fn get_clear_group(&self, id: &str) -> Result<Option<ClearGroup>> {
        Ok(self.list_clear_groups()?.into_iter().find(|g| g.id == id))
    }

    pub fn create_clear_group(&self, g: &ClearGroup) -> std::result::Result<ClearGroup, String> {
        validate_clear_group(g)?;
        let existing = self.list_clear_groups().map_err(|e| e.to_string())?;
        if existing.len() >= MAX_CLEAR_GROUPS {
            return Err(format!("You can keep at most {} clear groups.", MAX_CLEAR_GROUPS));
        }
        let now = Utc::now().to_rfc3339();
        let saved = ClearGroup {
            id: Uuid::new_v4().to_string(),
            name: g.name.trim().to_string(),
            layers: g.layers.clone(),
            sort_order: existing.len() as i32,
            created_at: now.clone(),
            updated_at: now,
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO clear_groups (id, name, layers, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6);",
            params![
                saved.id,
                saved.name,
                serde_json::to_string(&saved.layers).map_err(|e| e.to_string())?,
                saved.sort_order,
                saved.created_at,
                saved.updated_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(saved)
    }

    pub fn update_clear_group(&self, g: &ClearGroup) -> std::result::Result<ClearGroup, String> {
        validate_clear_group(g)?;
        let changed = {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE clear_groups SET name = ?2, layers = ?3, updated_at = ?4 WHERE id = ?1;",
                params![
                    g.id,
                    g.name.trim(),
                    serde_json::to_string(&g.layers).map_err(|e| e.to_string())?,
                    Utc::now().to_rfc3339()
                ],
            )
            .map_err(|e| e.to_string())?
        };
        if changed == 0 {
            return Err("That clear group no longer exists.".to_string());
        }
        self.get_clear_group(&g.id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "That clear group no longer exists.".to_string())
    }

    pub fn delete_clear_group(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM clear_groups WHERE id = ?1;", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::presentation::PresentationManager;

    fn group(name: &str, layers: &[&str]) -> ClearGroup {
        ClearGroup {
            id: String::new(),
            name: name.into(),
            layers: layers.iter().map(|l| l.to_string()).collect(),
            sort_order: 0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    fn make_prop(db: &DbManager, name: &str) -> crate::props::Prop {
        db.create_prop(&crate::props::Prop {
            id: String::new(), name: name.into(), kind: "text".into(), text: Some("hi".into()), image_path: None,
            position: "center".into(), size_pct: 5, text_color: "#ffffff".into(), background_color: None,
            sort_order: 0, created_at: String::new(), updated_at: String::new(),
        })
        .unwrap()
    }

    #[test]
    fn rules() {
        assert!(validate_clear_group(&group("Lyrics only", &["slide", "media"])).is_ok());
        assert!(validate_clear_group(&group("  ", &["slide"])).unwrap_err().contains("name"));
        assert!(validate_clear_group(&group(&"n".repeat(61), &["slide"])).unwrap_err().contains("too long"));
        assert!(validate_clear_group(&group("x", &[])).unwrap_err().contains("at least one"));
        assert!(validate_clear_group(&group("x", &["slide", "teleport"])).unwrap_err().contains("not a layer"));
        assert!(validate_clear_group(&group("x", &["slide", "slide"])).unwrap_err().contains("twice"));
        assert!(validate_clear_group(&group("x", &CLEAR_LAYERS)).is_ok());
    }

    #[test]
    fn create_list_update_delete_round_trip() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.list_clear_groups().unwrap().is_empty());
        let a = db.create_clear_group(&group("  First ", &["props", "alert"])).unwrap();
        let b = db.create_clear_group(&group("Second", &["slide"])).unwrap();
        assert_eq!(a.name, "First");
        assert_ne!(a.id, b.id);
        let list = db.list_clear_groups().unwrap();
        assert_eq!(list.iter().map(|g| g.name.as_str()).collect::<Vec<_>>(), vec!["First", "Second"]);
        assert_eq!(list[0].layers, vec!["props", "alert"]);

        let u = db.update_clear_group(&ClearGroup { name: "Renamed".into(), layers: vec!["logo".into()], ..a.clone() }).unwrap();
        assert_eq!((u.name.as_str(), u.layers.clone()), ("Renamed", vec!["logo".to_string()]));
        assert_eq!(u.created_at, a.created_at);

        db.delete_clear_group(&a.id).unwrap();
        assert_eq!(db.list_clear_groups().unwrap().len(), 1);
        db.delete_clear_group("ghost").unwrap();
    }

    #[test]
    fn invalid_groups_are_never_stored_and_missing_ones_cannot_be_updated() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.create_clear_group(&group("", &["slide"])).is_err());
        assert!(db.list_clear_groups().unwrap().is_empty());
        assert!(db.update_clear_group(&ClearGroup { id: "ghost".into(), ..group("x", &["slide"]) }).unwrap_err().contains("no longer exists"));
        let saved = db.create_clear_group(&group("Keep", &["slide"])).unwrap();
        assert!(db.update_clear_group(&ClearGroup { layers: vec![], ..saved.clone() }).is_err());
        assert_eq!(db.get_clear_group(&saved.id).unwrap().unwrap().layers, vec!["slide"]);
    }

    #[test]
    fn the_number_of_groups_is_capped_and_a_damaged_layer_list_loads_empty() {
        let db = DbManager::new_in_memory().unwrap();
        for i in 0..MAX_CLEAR_GROUPS {
            db.create_clear_group(&group(&format!("G{i}"), &["slide"])).unwrap();
        }
        assert!(db.create_clear_group(&group("one more", &["slide"])).unwrap_err().contains("at most"));

        let db2 = DbManager::new_in_memory().unwrap();
        let g = db2.create_clear_group(&group("X", &["slide"])).unwrap();
        db2.conn.lock().unwrap().execute("UPDATE clear_groups SET layers = 'garbage' WHERE id = ?1;", params![g.id]).unwrap();
        assert!(db2.get_clear_group(&g.id).unwrap().unwrap().layers.is_empty());
    }

    #[test]
    fn a_group_clears_only_its_own_layers() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        mgr.init_pointers(&db);
        mgr.next_slide_core(&db);
        let prop = make_prop(&db, "A");
        mgr.toggle_prop_core(&db, &prop.id).unwrap();
        mgr.toggle_logo_core();
        mgr.send_alert_core("Nursery", None).unwrap();
        assert!(mgr.get_state().is_live);

        let st = mgr.clear_group_core(&["props".to_string(), "alert".to_string()]);
        assert!(st.active_props.is_empty());
        assert!(st.alert.is_none());
        assert!(st.is_live && st.is_logo); // untouched

        let st = mgr.clear_group_core(&["slide".to_string(), "logo".to_string()]);
        assert!(!st.is_live && !st.is_logo);
    }

    #[test]
    fn clearing_every_layer_matches_clear_all() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        mgr.init_pointers(&db);
        mgr.next_slide_core(&db);
        mgr.toggle_logo_core();
        mgr.toggle_blackout_core();
        let all: Vec<String> = CLEAR_LAYERS.iter().map(|l| l.to_string()).collect();
        let st = mgr.clear_group_core(&all);
        assert!(!st.is_live && !st.is_logo && !st.is_blackout);
        assert!(st.media_playback.is_none() && st.alert.is_none() && st.active_props.is_empty() && st.auto_advance.is_none() && st.announcements.is_none());
    }

    #[test]
    fn groups_survive_backup_and_restore_and_old_backups_still_load() {
        let db = DbManager::new_in_memory().unwrap();
        let saved = db.create_clear_group(&group("Keep", &["media", "props"])).unwrap();
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.clear_groups.len(), 1);
        db.delete_clear_group(&saved.id).unwrap();
        db.import_backup(&backup, "overwrite").unwrap();
        assert_eq!(db.list_clear_groups().unwrap()[0].layers, vec!["media", "props"]);

        let mut value = serde_json::to_value(&backup).unwrap();
        value.as_object_mut().unwrap().remove("clearGroups");
        let old: crate::models::BackupData = serde_json::from_value(value).unwrap();
        assert!(old.clear_groups.is_empty());
    }
}
