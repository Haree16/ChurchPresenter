//! Looks: a saved arrangement of the output layers (logo, blackout and which props are showing)
//! that can be applied in one click, for example "Pre-service" = logo on plus the welcome prop.
//!
//! A look never touches which slide is live; it only sets the layers over it.

use crate::db::DbManager;
use crate::models::PresentationState;
use crate::presentation::PresentationManager;
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_LOOK_NAME_CHARS: usize = 60;
pub const MAX_LOOK_PROPS: usize = 20;
pub const MAX_LOOKS: usize = 100;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Look {
    #[serde(default)]
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub logo: bool,
    #[serde(default)]
    pub blackout: bool,
    /// Props to show, in drawing order. Props that no longer exist are skipped when applying.
    #[serde(default)]
    pub prop_ids: Vec<String>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

pub fn validate_look(look: &Look) -> std::result::Result<(), String> {
    let name = look.name.trim();
    if name.is_empty() {
        return Err("Give the look a name.".to_string());
    }
    if name.chars().count() > MAX_LOOK_NAME_CHARS {
        return Err(format!("Look name is too long (maximum {} characters).", MAX_LOOK_NAME_CHARS));
    }
    if look.prop_ids.len() > MAX_LOOK_PROPS {
        return Err(format!("A look can show at most {} props.", MAX_LOOK_PROPS));
    }
    let mut seen = std::collections::HashSet::new();
    for id in &look.prop_ids {
        if id.trim().is_empty() {
            return Err("A look contains a blank prop.".to_string());
        }
        if !seen.insert(id.as_str()) {
            return Err("A look lists the same prop twice.".to_string());
        }
    }
    Ok(())
}

impl PresentationManager {
    /// Sets the logo, blackout and visible props to match `look`. The live slide is untouched.
    pub fn apply_look_core(&self, db: &DbManager, look: &Look) -> PresentationState {
        let props: Vec<crate::props::Prop> = {
            let saved = db.list_props().unwrap_or_default();
            look.prop_ids.iter().filter_map(|id| saved.iter().find(|p| &p.id == id).cloned()).collect()
        };
        self.set_layers_core(look.logo, look.blackout, props)
    }

    /// The layers as they are right now, as an unsaved look.
    pub fn capture_look_core(&self, name: &str) -> Look {
        let st = self.get_state();
        Look {
            id: String::new(),
            name: name.to_string(),
            logo: st.is_logo,
            blackout: st.is_blackout,
            prop_ids: st.active_props.iter().map(|p| p.id.clone()).collect(),
            sort_order: 0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }
}

fn row_to_look(row: &rusqlite::Row) -> Result<Look> {
    let ids_json: String = row.get(4)?;
    Ok(Look {
        id: row.get(0)?,
        name: row.get(1)?,
        logo: row.get::<_, i32>(2)? != 0,
        blackout: row.get::<_, i32>(3)? != 0,
        prop_ids: serde_json::from_str(&ids_json).unwrap_or_default(),
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

impl DbManager {
    pub fn list_looks(&self) -> Result<Vec<Look>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, logo, blackout, prop_ids, sort_order, created_at, updated_at FROM looks ORDER BY sort_order ASC, created_at ASC;",
        )?;
        let rows = stmt.query_map([], row_to_look)?;
        rows.collect()
    }

    pub fn get_look(&self, id: &str) -> Result<Option<Look>> {
        Ok(self.list_looks()?.into_iter().find(|l| l.id == id))
    }

    pub fn create_look(&self, look: &Look) -> std::result::Result<Look, String> {
        validate_look(look)?;
        let existing = self.list_looks().map_err(|e| e.to_string())?;
        if existing.len() >= MAX_LOOKS {
            return Err(format!("You can keep at most {} looks.", MAX_LOOKS));
        }
        let now = Utc::now().to_rfc3339();
        let saved = Look {
            id: Uuid::new_v4().to_string(),
            name: look.name.trim().to_string(),
            sort_order: existing.len() as i32,
            created_at: now.clone(),
            updated_at: now,
            ..look.clone()
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO looks (id, name, logo, blackout, prop_ids, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);",
            params![
                saved.id,
                saved.name,
                saved.logo as i32,
                saved.blackout as i32,
                serde_json::to_string(&saved.prop_ids).map_err(|e| e.to_string())?,
                saved.sort_order,
                saved.created_at,
                saved.updated_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(saved)
    }

    pub fn update_look(&self, look: &Look) -> std::result::Result<Look, String> {
        validate_look(look)?;
        let changed = {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE looks SET name = ?2, logo = ?3, blackout = ?4, prop_ids = ?5, updated_at = ?6 WHERE id = ?1;",
                params![
                    look.id,
                    look.name.trim(),
                    look.logo as i32,
                    look.blackout as i32,
                    serde_json::to_string(&look.prop_ids).map_err(|e| e.to_string())?,
                    Utc::now().to_rfc3339()
                ],
            )
            .map_err(|e| e.to_string())?
        };
        if changed == 0 {
            return Err("That look no longer exists.".to_string());
        }
        self.get_look(&look.id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "That look no longer exists.".to_string())
    }

    pub fn delete_look(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM looks WHERE id = ?1;", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn look(name: &str) -> Look {
        Look { id: String::new(), name: name.into(), logo: false, blackout: false, prop_ids: vec![], sort_order: 0, created_at: String::new(), updated_at: String::new() }
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
        assert!(validate_look(&look("Pre-service")).is_ok());
        assert!(validate_look(&look("  ")).unwrap_err().contains("name"));
        assert!(validate_look(&look(&"n".repeat(61))).unwrap_err().contains("too long"));
        assert!(validate_look(&Look { prop_ids: vec![" ".into()], ..look("x") }).unwrap_err().contains("blank"));
        assert!(validate_look(&Look { prop_ids: vec!["a".into(), "a".into()], ..look("x") }).unwrap_err().contains("twice"));
        let many: Vec<String> = (0..=MAX_LOOK_PROPS).map(|i| format!("p{i}")).collect();
        assert!(validate_look(&Look { prop_ids: many.clone(), ..look("x") }).unwrap_err().contains("at most"));
        assert!(validate_look(&Look { prop_ids: many[..MAX_LOOK_PROPS].to_vec(), ..look("x") }).is_ok());
    }

    #[test]
    fn create_list_update_delete_round_trip_keeping_prop_order() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.list_looks().unwrap().is_empty());
        let a = db.create_look(&Look { name: "  First ".into(), logo: true, prop_ids: vec!["p2".into(), "p1".into()], ..look("") }).unwrap();
        let b = db.create_look(&Look { blackout: true, ..look("Second") }).unwrap();
        assert_eq!(a.name, "First");
        assert_ne!(a.id, b.id);
        let list = db.list_looks().unwrap();
        assert_eq!(list.iter().map(|l| l.name.as_str()).collect::<Vec<_>>(), vec!["First", "Second"]);
        assert!(list[0].logo && !list[0].blackout && list[1].blackout);
        assert_eq!(list[0].prop_ids, vec!["p2", "p1"]); // order = drawing order

        let u = db.update_look(&Look { name: "Renamed".into(), logo: false, prop_ids: vec![], ..a.clone() }).unwrap();
        assert_eq!((u.name.as_str(), u.logo, u.prop_ids.len()), ("Renamed", false, 0));
        assert_eq!(u.created_at, a.created_at);

        db.delete_look(&a.id).unwrap();
        assert_eq!(db.list_looks().unwrap().len(), 1);
        db.delete_look("ghost").unwrap();
    }

    #[test]
    fn invalid_looks_are_never_stored_and_missing_ones_cannot_be_updated() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.create_look(&look("")).is_err());
        assert!(db.list_looks().unwrap().is_empty());
        assert!(db.update_look(&Look { id: "ghost".into(), ..look("x") }).unwrap_err().contains("no longer exists"));
        let saved = db.create_look(&look("Keep")).unwrap();
        assert!(db.update_look(&Look { name: String::new(), ..saved.clone() }).is_err());
        assert_eq!(db.get_look(&saved.id).unwrap().unwrap().name, "Keep");
    }

    #[test]
    fn the_number_of_looks_is_capped_and_a_damaged_prop_list_loads_empty() {
        let db = DbManager::new_in_memory().unwrap();
        for i in 0..MAX_LOOKS {
            db.create_look(&look(&format!("L{i}"))).unwrap();
        }
        assert!(db.create_look(&look("one more")).unwrap_err().contains("at most"));

        let db2 = DbManager::new_in_memory().unwrap();
        let l = db2.create_look(&Look { prop_ids: vec!["a".into()], ..look("X") }).unwrap();
        db2.conn.lock().unwrap().execute("UPDATE looks SET prop_ids = 'garbage' WHERE id = ?1;", params![l.id]).unwrap();
        assert!(db2.get_look(&l.id).unwrap().unwrap().prop_ids.is_empty());
    }

    #[test]
    fn applying_sets_exactly_the_layers_and_leaves_the_live_slide_alone() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        mgr.init_pointers(&db);
        mgr.next_slide_core(&db);
        let slide = mgr.get_state().current_slide_id.clone();
        let a = make_prop(&db, "A");
        let b = make_prop(&db, "B");
        mgr.toggle_prop_core(&db, &a.id).unwrap(); // A is on before the look is applied

        let st = mgr.apply_look_core(&db, &Look { logo: true, blackout: false, prop_ids: vec![b.id.clone()], ..look("L") });
        assert!(st.is_logo && !st.is_blackout);
        assert_eq!(st.active_props.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), vec![b.id.as_str()]); // A was turned off
        assert_eq!(st.current_slide_id, slide);
        assert!(st.is_live);

        // applying a look with nothing set turns everything off again
        let st = mgr.apply_look_core(&db, &look("Empty"));
        assert!(!st.is_logo && !st.is_blackout && st.active_props.is_empty());
        assert!(st.is_live);
    }

    #[test]
    fn missing_props_are_skipped_and_the_order_is_kept() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        let a = make_prop(&db, "A");
        let b = make_prop(&db, "B");
        let st = mgr.apply_look_core(&db, &Look { prop_ids: vec![b.id.clone(), "deleted".into(), a.id.clone()], ..look("L") });
        assert_eq!(st.active_props.iter().map(|p| p.name.as_str()).collect::<Vec<_>>(), vec!["B", "A"]);
    }

    #[test]
    fn applying_a_look_with_blackout_hides_nothing_in_the_state_but_sets_the_flag() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        let st = mgr.apply_look_core(&db, &Look { blackout: true, logo: true, ..look("Both") });
        assert!(st.is_blackout && st.is_logo); // the screen shows blackout (it wins), the logo returns when it is lifted
    }

    #[test]
    fn capturing_then_applying_reproduces_the_screen() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = PresentationManager::new();
        let a = make_prop(&db, "A");
        mgr.toggle_logo_core();
        mgr.toggle_prop_core(&db, &a.id).unwrap();
        let captured = mgr.capture_look_core("Snapshot");
        assert_eq!((captured.logo, captured.blackout), (true, false));
        assert_eq!(captured.prop_ids, vec![a.id.clone()]);

        mgr.clear_all_core();
        assert!(!mgr.get_state().is_logo);
        let st = mgr.apply_look_core(&db, &captured);
        assert!(st.is_logo);
        assert_eq!(st.active_props.len(), 1);
        // a captured look can be saved
        assert!(db.create_look(&captured).is_ok());
    }

    #[test]
    fn looks_survive_backup_and_restore_and_old_backups_still_load() {
        let db = DbManager::new_in_memory().unwrap();
        let saved = db.create_look(&Look { logo: true, prop_ids: vec!["x".into()], ..look("Keep") }).unwrap();
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.looks.len(), 1);
        db.delete_look(&saved.id).unwrap();
        db.import_backup(&backup, "overwrite").unwrap();
        let back = &db.list_looks().unwrap()[0];
        assert!(back.logo);
        assert_eq!(back.prop_ids, vec!["x"]);

        let mut value = serde_json::to_value(&backup).unwrap();
        value.as_object_mut().unwrap().remove("looks");
        let old: crate::models::BackupData = serde_json::from_value(value).unwrap();
        assert!(old.looks.is_empty());
    }
}
