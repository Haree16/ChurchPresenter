//! Key bindings: a keyboard shortcut chosen by the operator that runs an action, toggles a prop,
//! runs a macro or applies a look from the operator window.
//!
//! The built-in keys (arrows, Space, B, L, M, C, digits, Esc) are fixed and cannot be rebound, so a
//! custom binding can never take over the keys an operator relies on mid-service.

use crate::db::DbManager;
use crate::macros::MACRO_ACTIONS;
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_KEY_BINDINGS: usize = 100;

pub const TARGET_ACTION: &str = "action";
pub const TARGET_PROP: &str = "prop";
pub const TARGET_MACRO: &str = "macro";
pub const TARGET_LOOK: &str = "look";
pub const TARGET_CLEAR_GROUP: &str = "clearGroup";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyBinding {
    #[serde(default)]
    pub id: String,
    /// Canonical form, for example `Ctrl+Shift+F5` (see `normalize_combo`).
    pub combo: String,
    /// `action`, `prop`, `macro` or `look`.
    pub target_type: String,
    /// The action name, or the id of the prop / macro / look.
    pub target_id: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

/// Navigation keys the operator window handles whatever modifier is held (Ctrl+Right still steps).
const NAVIGATION_KEYS: [&str; 12] = [
    "Space", "Enter", "Escape", "Backspace", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown",
    "PageUp", "PageDown", "F12",
];

/// Letter shortcuts built into the operator window; they fire with no modifier or with Shift only.
const BUILT_IN_LETTERS: [&str; 4] = ["B", "L", "M", "C"];

/// Combos the window or OS already uses.
const SYSTEM_COMBOS: [&str; 6] = ["F11", "Ctrl+W", "Ctrl+Q", "Ctrl+R", "Ctrl+Shift+R", "Alt+F4"];

/// Ctrl+<letter> combos used for editing text; binding them would break copy and paste.
const EDITING_LETTERS: [char; 6] = ['A', 'C', 'V', 'X', 'Y', 'Z'];

fn is_allowed_key(key: &str) -> bool {
    let mut chars = key.chars();
    match (chars.next(), chars.next()) {
        (Some(c), None) => c.is_ascii_uppercase() || c.is_ascii_digit() || "-=[];',./".contains(c),
        _ => {
            if let Some(n) = key.strip_prefix('F').and_then(|n| n.parse::<u8>().ok()) {
                return (1..=12).contains(&n);
            }
            matches!(key, "Home" | "End" | "Insert" | "Delete" | "PageUp" | "PageDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Space" | "Enter" | "Escape" | "Backspace" | "Tab")
        }
    }
}

/// Puts a combo in canonical form: modifiers in the order Ctrl, Alt, Shift, Meta, then the key
/// (letters upper case). Refuses unknown keys and combos with no key.
pub fn normalize_combo(raw: &str) -> std::result::Result<String, String> {
    let (mut ctrl, mut alt, mut shift, mut meta) = (false, false, false, false);
    let mut key: Option<String> = None;
    for part in raw.split('+').map(str::trim) {
        match part.to_ascii_lowercase().as_str() {
            "" => {
                // "Ctrl++" style combos are not accepted: the plus key is not bindable.
                return Err("That key combination is not valid.".to_string());
            }
            "ctrl" | "control" => ctrl = true,
            "alt" | "option" => alt = true,
            "shift" => shift = true,
            "meta" | "cmd" | "command" | "super" | "win" => meta = true,
            other => {
                if key.is_some() {
                    return Err("Use one key plus any of Ctrl, Alt, Shift and Meta.".to_string());
                }
                let named = match other {
                    "space" | " " => "Space".to_string(),
                    "esc" | "escape" => "Escape".to_string(),
                    "left" | "arrowleft" => "ArrowLeft".to_string(),
                    "right" | "arrowright" => "ArrowRight".to_string(),
                    "up" | "arrowup" => "ArrowUp".to_string(),
                    "down" | "arrowdown" => "ArrowDown".to_string(),
                    "pageup" => "PageUp".to_string(),
                    "pagedown" => "PageDown".to_string(),
                    "enter" | "return" => "Enter".to_string(),
                    "backspace" => "Backspace".to_string(),
                    "tab" => "Tab".to_string(),
                    "home" => "Home".to_string(),
                    "end" => "End".to_string(),
                    "insert" => "Insert".to_string(),
                    "delete" | "del" => "Delete".to_string(),
                    o if o.chars().count() == 1 => o.to_ascii_uppercase(),
                    o if o.starts_with('f') => o.to_ascii_uppercase(),
                    _ => part.to_string(),
                };
                key = Some(named);
            }
        }
    }
    let key = key.ok_or_else(|| "Press a key as well as the modifier.".to_string())?;
    if !is_allowed_key(&key) {
        return Err(format!("The key \"{}\" cannot be used for a shortcut.", key));
    }
    let mut out = String::new();
    for (on, name) in [(ctrl, "Ctrl"), (alt, "Alt"), (shift, "Shift"), (meta, "Meta")] {
        if on {
            out.push_str(name);
            out.push('+');
        }
    }
    out.push_str(&key);
    Ok(out)
}

/// Why `combo` (already normalised) cannot be bound, if it cannot.
pub fn reserved_reason(combo: &str) -> Option<String> {
    let (mods, key) = match combo.rfind('+') {
        Some(i) => (&combo[..i], &combo[i + 1..]),
        None => ("", combo),
    };
    if NAVIGATION_KEYS.contains(&key) {
        return Some(format!("{} is used to move through slides and cannot be changed.", key));
    }
    if BUILT_IN_LETTERS.contains(&key) && (mods.is_empty() || mods == "Shift") {
        return Some(format!("{} is already used by the app and cannot be changed.", combo));
    }
    if SYSTEM_COMBOS.contains(&combo) {
        return Some(format!("{} is already used by the app and cannot be changed.", combo));
    }
    // A bare digit jumps to a slide number.
    if mods.is_empty() && key.chars().all(|c| c.is_ascii_digit()) {
        return Some("Number keys are used to jump to a slide.".to_string());
    }
    if mods == "Ctrl" && key.len() == 1 && EDITING_LETTERS.contains(&key.chars().next().unwrap()) {
        return Some(format!("{} is used for editing text.", combo));
    }
    None
}

pub fn validate_binding(b: &KeyBinding) -> std::result::Result<String, String> {
    let combo = normalize_combo(&b.combo)?;
    if let Some(reason) = reserved_reason(&combo) {
        return Err(reason);
    }
    if b.target_id.trim().is_empty() {
        return Err("Choose what the shortcut should do.".to_string());
    }
    match b.target_type.as_str() {
        TARGET_ACTION => {
            if !MACRO_ACTIONS.contains(&b.target_id.as_str()) {
                return Err("That action cannot be bound to a key.".to_string());
            }
        }
        TARGET_PROP | TARGET_MACRO | TARGET_LOOK | TARGET_CLEAR_GROUP => {}
        _ => return Err("Choose an action, prop, macro, look or clear group.".to_string()),
    }
    Ok(combo)
}

fn row_to_binding(row: &rusqlite::Row) -> Result<KeyBinding> {
    Ok(KeyBinding {
        id: row.get(0)?,
        combo: row.get(1)?,
        target_type: row.get(2)?,
        target_id: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

impl DbManager {
    pub fn list_key_bindings(&self) -> Result<Vec<KeyBinding>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, combo, target_type, target_id, created_at, updated_at FROM key_bindings ORDER BY created_at ASC, id ASC;",
        )?;
        let rows = stmt.query_map([], row_to_binding)?;
        rows.collect()
    }

    /// True when the prop / macro / look the binding points at is saved.
    fn binding_target_exists(&self, b: &KeyBinding) -> std::result::Result<bool, String> {
        Ok(match b.target_type.as_str() {
            TARGET_PROP => self.get_prop(&b.target_id).map_err(|e| e.to_string())?.is_some(),
            TARGET_MACRO => self.get_macro(&b.target_id).map_err(|e| e.to_string())?.is_some(),
            TARGET_LOOK => self.get_look(&b.target_id).map_err(|e| e.to_string())?.is_some(),
            TARGET_CLEAR_GROUP => self.get_clear_group(&b.target_id).map_err(|e| e.to_string())?.is_some(),
            _ => true,
        })
    }

    /// Checks the binding and that no other binding already uses the combo. Returns the canonical combo.
    fn check_binding(&self, b: &KeyBinding) -> std::result::Result<String, String> {
        let combo = validate_binding(b)?;
        if !self.binding_target_exists(b)? {
            return Err("That prop, macro or look no longer exists.".to_string());
        }
        let clash = self
            .list_key_bindings()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|other| other.combo == combo && other.id != b.id);
        if clash.is_some() {
            return Err(format!("{} is already assigned to another shortcut.", combo));
        }
        Ok(combo)
    }

    pub fn create_key_binding(&self, b: &KeyBinding) -> std::result::Result<KeyBinding, String> {
        let combo = self.check_binding(&KeyBinding { id: String::new(), ..b.clone() })?;
        if self.list_key_bindings().map_err(|e| e.to_string())?.len() >= MAX_KEY_BINDINGS {
            return Err(format!("You can keep at most {} shortcuts.", MAX_KEY_BINDINGS));
        }
        let now = Utc::now().to_rfc3339();
        let saved = KeyBinding {
            id: Uuid::new_v4().to_string(),
            combo,
            target_type: b.target_type.clone(),
            target_id: b.target_id.trim().to_string(),
            created_at: now.clone(),
            updated_at: now,
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO key_bindings (id, combo, target_type, target_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6);",
            params![saved.id, saved.combo, saved.target_type, saved.target_id, saved.created_at, saved.updated_at],
        )
        .map_err(|e| e.to_string())?;
        Ok(saved)
    }

    pub fn update_key_binding(&self, b: &KeyBinding) -> std::result::Result<KeyBinding, String> {
        let combo = self.check_binding(b)?;
        let changed = {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE key_bindings SET combo = ?2, target_type = ?3, target_id = ?4, updated_at = ?5 WHERE id = ?1;",
                params![b.id, combo, b.target_type, b.target_id.trim(), Utc::now().to_rfc3339()],
            )
            .map_err(|e| e.to_string())?
        };
        if changed == 0 {
            return Err("That shortcut no longer exists.".to_string());
        }
        self.list_key_bindings()
            .map_err(|e| e.to_string())?
            .into_iter()
            .find(|x| x.id == b.id)
            .ok_or_else(|| "That shortcut no longer exists.".to_string())
    }

    pub fn delete_key_binding(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM key_bindings WHERE id = ?1;", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bind(combo: &str, target_type: &str, target_id: &str) -> KeyBinding {
        KeyBinding { id: String::new(), combo: combo.into(), target_type: target_type.into(), target_id: target_id.into(), created_at: String::new(), updated_at: String::new() }
    }

    fn make_look(db: &DbManager) -> crate::looks::Look {
        db.create_look(&crate::looks::Look {
            id: String::new(), name: "L".into(), logo: false, blackout: false, prop_ids: vec![],
            sort_order: 0, created_at: String::new(), updated_at: String::new(),
        })
        .unwrap()
    }

    #[test]
    fn combos_are_put_in_one_canonical_form() {
        assert_eq!(normalize_combo("ctrl+shift+f5").unwrap(), "Ctrl+Shift+F5");
        assert_eq!(normalize_combo("Shift + Ctrl + a").unwrap(), "Ctrl+Shift+A");
        assert_eq!(normalize_combo("cmd+k").unwrap(), "Meta+K");
        assert_eq!(normalize_combo("alt+Space").unwrap(), "Alt+Space");
        assert_eq!(normalize_combo("f9").unwrap(), "F9");
        assert_eq!(normalize_combo("Alt+Down").unwrap(), "Alt+ArrowDown");
    }

    #[test]
    fn nonsense_combos_are_refused() {
        for bad in ["", "Ctrl", "Ctrl+Shift", "A+B", "F13", "Ctrl++", "Ctrl+Ω", "Ctrl+Foo"] {
            assert!(normalize_combo(bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn built_in_and_system_keys_cannot_be_bound() {
        for taken in [
            "Space", "ArrowRight", "PageDown", "Escape", "B", "L", "M", "C", "Shift+B", "F12", "F11", "Ctrl+W", "Ctrl+C",
            "Ctrl+V", "5", "Ctrl+ArrowRight", "Alt+Space",
        ] {
            assert!(reserved_reason(taken).is_some(), "{taken} should be reserved");
        }
        for free in ["F5", "Ctrl+B", "Alt+1", "Ctrl+Shift+B", "K", "Ctrl+Shift+F5", "Home", "Ctrl+Shift+C"] {
            assert!(reserved_reason(free).is_none(), "{free} should be free");
        }
    }

    #[test]
    fn only_dispatchable_actions_can_be_bound() {
        assert!(validate_binding(&bind("F5", "action", "next_slide")).is_ok());
        assert!(validate_binding(&bind("F5", "action", "delete_everything")).unwrap_err().contains("cannot be bound"));
        assert!(validate_binding(&bind("F5", "action", " ")).unwrap_err().contains("Choose what"));
        assert!(validate_binding(&bind("F5", "teleport", "x")).unwrap_err().contains("Choose an action"));
        assert!(validate_binding(&bind("F5", "clearGroup", "g1")).is_ok());
        assert!(validate_binding(&bind("B", "action", "next_slide")).unwrap_err().contains("already used"));
    }

    #[test]
    fn create_list_update_delete_round_trip_with_canonical_combos() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.list_key_bindings().unwrap().is_empty());
        let a = db.create_key_binding(&bind("shift+f5", "action", "toggle_logo")).unwrap();
        assert_eq!(a.combo, "Shift+F5");
        let look = make_look(&db);
        let b = db.create_key_binding(&bind("F6", "look", &look.id)).unwrap();
        assert_ne!(a.id, b.id);
        assert_eq!(db.list_key_bindings().unwrap().len(), 2);

        let moved = db.update_key_binding(&KeyBinding { combo: "F7".into(), ..a.clone() }).unwrap();
        assert_eq!(moved.combo, "F7");
        assert_eq!(moved.created_at, a.created_at);
        // keeping the same combo on the same row is not a clash
        assert!(db.update_key_binding(&moved).is_ok());

        db.delete_key_binding(&a.id).unwrap();
        assert_eq!(db.list_key_bindings().unwrap().len(), 1);
        db.delete_key_binding("ghost").unwrap();
    }

    #[test]
    fn a_combo_can_only_be_used_once_even_when_written_differently() {
        let db = DbManager::new_in_memory().unwrap();
        db.create_key_binding(&bind("Ctrl+Shift+K", "action", "toggle_logo")).unwrap();
        assert!(db.create_key_binding(&bind("shift+ctrl+k", "action", "clear_all")).unwrap_err().contains("already assigned"));
        let other = db.create_key_binding(&bind("F2", "action", "clear_all")).unwrap();
        assert!(db.update_key_binding(&KeyBinding { combo: "ctrl+shift+k".into(), ..other }).unwrap_err().contains("already assigned"));
        assert_eq!(db.list_key_bindings().unwrap().len(), 2);
    }

    #[test]
    fn missing_targets_and_missing_rows_are_refused() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.create_key_binding(&bind("F2", "macro", "ghost")).unwrap_err().contains("no longer exists"));
        assert!(db.create_key_binding(&bind("F2", "prop", "ghost")).unwrap_err().contains("no longer exists"));
        assert!(db.create_key_binding(&bind("F2", "look", "ghost")).unwrap_err().contains("no longer exists"));
        assert!(db.create_key_binding(&bind("F2", "clearGroup", "ghost")).unwrap_err().contains("no longer exists"));
        let group = db
            .create_clear_group(&crate::clear_groups::ClearGroup {
                id: String::new(), name: "G".into(), layers: vec!["slide".into()],
                sort_order: 0, created_at: String::new(), updated_at: String::new(),
            })
            .unwrap();
        assert!(db.create_key_binding(&bind("F2", "clearGroup", &group.id)).is_ok());
        db.delete_key_binding(&db.list_key_bindings().unwrap()[0].id).unwrap();
        assert!(db.update_key_binding(&KeyBinding { id: "ghost".into(), ..bind("F2", "action", "clear_all") }).unwrap_err().contains("no longer exists"));
        assert!(db.list_key_bindings().unwrap().is_empty());
    }

    #[test]
    fn the_number_of_shortcuts_is_capped() {
        let db = DbManager::new_in_memory().unwrap();
        let keys: Vec<String> = ('D'..='Z')
            .filter(|c| !"LMC".contains(*c))
            .flat_map(|c| ["Alt", "Alt+Shift", "Ctrl+Alt", "Ctrl+Alt+Shift", "Meta"].map(|m| format!("{m}+{c}")))
            .take(MAX_KEY_BINDINGS)
            .collect();
        assert_eq!(keys.len(), MAX_KEY_BINDINGS);
        for k in &keys {
            db.create_key_binding(&bind(k, "action", "clear_all")).unwrap();
        }
        assert!(db.create_key_binding(&bind("F2", "action", "clear_all")).unwrap_err().contains("at most"));
    }

    #[test]
    fn shortcuts_survive_backup_and_restore_and_old_backups_still_load() {
        let db = DbManager::new_in_memory().unwrap();
        let saved = db.create_key_binding(&bind("F4", "action", "toggle_logo")).unwrap();
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.key_bindings.len(), 1);
        db.delete_key_binding(&saved.id).unwrap();
        db.import_backup(&backup, "overwrite").unwrap();
        let back = &db.list_key_bindings().unwrap()[0];
        assert_eq!((back.combo.as_str(), back.target_id.as_str()), ("F4", "toggle_logo"));

        let mut value = serde_json::to_value(&backup).unwrap();
        value.as_object_mut().unwrap().remove("keyBindings");
        let old: crate::models::BackupData = serde_json::from_value(value).unwrap();
        assert!(old.key_bindings.is_empty());
    }
}
