//! Macros: a saved list of steps that run one after another with a single click, for example
//! "Start service" = clear everything, show the logo, start the countdown timer.
//!
//! Steps can run an action, show an alert, show / hide / toggle a prop, wait, or start
//! auto-advance. Macros cannot run other macros, so they can never loop forever.

use crate::actions::ActionDispatcher;
use crate::db::DbManager;
use crate::models::RunningMacro;
use crate::presentation::{
    PresentationManager, MAX_AUTO_ADVANCE_SECONDS, MIN_AUTO_ADVANCE_SECONDS,
};
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub const MAX_MACRO_NAME_CHARS: usize = 60;
pub const MAX_MACRO_STEPS: usize = 30;
pub const MAX_WAIT_SECONDS: u32 = 600;
pub const MAX_TOTAL_WAIT_SECONDS: u32 = 1800;
pub const MAX_MACROS: usize = 100;

/// Control paths (OSC, MIDI, the phone remote) run a macro with the action `run_macro:<id>`.
pub const RUN_MACRO_PREFIX: &str = "run_macro:";

/// The macro id in a `run_macro:<id>` action, if `action` is one.
pub fn macro_id_from_action(action: &str) -> Option<&str> {
    action.strip_prefix(RUN_MACRO_PREFIX).filter(|id| !id.trim().is_empty() && id.len() <= 64 && !id.contains('/'))
}

/// Starts a saved macro in the background, as the operator panel does. Only one macro runs at a time.
pub fn run_macro_by_id(app: &AppHandle, db: &DbManager, pres: &PresentationManager, id: &str) -> std::result::Result<(), String> {
    use tauri::Manager;
    let m = db
        .get_macro(id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "That macro no longer exists.".to_string())?;
    let runner = app.try_state::<MacroRunner>().ok_or_else(|| "Macros are not available.".to_string())?;
    runner.run(app.clone(), db.clone(), pres.clone(), m)
}

/// Actions a macro step may run. Anything not listed here is refused.
pub const MACRO_ACTIONS: [&str; 17] = [
    "next_slide",
    "prev_slide",
    "next_item",
    "prev_item",
    "toggle_blackout",
    "toggle_logo",
    "toggle_live",
    "clear_screen",
    "clear_media",
    "clear_all",
    "clear_alert",
    "clear_props",
    "start_timer",
    "stop_timer",
    "reset_timer",
    "stop_auto_advance",
    "clear_overlay",
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum MacroStep {
    Action { action: String },
    /// Show a banner on the audience screen (`seconds`: omitted = 30, 0 = until cleared).
    Alert { message: String, #[serde(default)] seconds: Option<u32> },
    /// `mode` is "show", "hide" or "toggle".
    Prop { prop_id: String, mode: String },
    Wait { seconds: u32 },
    AutoAdvance { interval_seconds: u32, #[serde(default)] loop_at_end: bool },
    /// Apply a saved look (logo, blackout and props).
    Look { look_id: String },
    /// Clear the layers of a saved clear group.
    ClearGroup { group_id: String },
    /// Send a DMX Art-Net lighting cue.
    Dmx {
        #[serde(default)]
        universe: Option<u16>,
        channel: u16,
        value: u8,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Macro {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub steps: Vec<MacroStep>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

pub fn validate_step(step: &MacroStep) -> std::result::Result<(), String> {
    match step {
        MacroStep::Action { action } => {
            if MACRO_ACTIONS.contains(&action.as_str()) {
                Ok(())
            } else {
                Err(format!("'{}' cannot be used in a macro.", action))
            }
        }
        MacroStep::Alert { message, seconds } => {
            let m = message.trim();
            if m.is_empty() {
                return Err("an alert needs a message.".to_string());
            }
            if m.chars().count() > crate::presentation::MAX_ALERT_CHARS {
                return Err(format!("the alert is too long (maximum {} characters).", crate::presentation::MAX_ALERT_CHARS));
            }
            if seconds.map_or(false, |s| s > 3600) {
                return Err("an alert can last at most 3600 seconds.".to_string());
            }
            Ok(())
        }
        MacroStep::Prop { prop_id, mode } => {
            if prop_id.trim().is_empty() {
                return Err("choose a prop.".to_string());
            }
            if !["show", "hide", "toggle"].contains(&mode.as_str()) {
                return Err(format!("unknown prop mode '{}'.", mode));
            }
            Ok(())
        }
        MacroStep::Look { look_id } => {
            if look_id.trim().is_empty() {
                Err("choose a look.".to_string())
            } else {
                Ok(())
            }
        }
        MacroStep::ClearGroup { group_id } => {
            if group_id.trim().is_empty() {
                Err("choose a clear group.".to_string())
            } else {
                Ok(())
            }
        }
        MacroStep::Wait { seconds } => {
            if (1..=MAX_WAIT_SECONDS).contains(seconds) {
                Ok(())
            } else {
                Err(format!("a wait must be between 1 and {} seconds.", MAX_WAIT_SECONDS))
            }
        }
        MacroStep::AutoAdvance { interval_seconds, .. } => {
            if (MIN_AUTO_ADVANCE_SECONDS..=MAX_AUTO_ADVANCE_SECONDS).contains(interval_seconds) {
                Ok(())
            } else {
                Err(format!(
                    "the auto-advance interval must be between {} and {} seconds.",
                    MIN_AUTO_ADVANCE_SECONDS, MAX_AUTO_ADVANCE_SECONDS
                ))
            }
        }
        MacroStep::Dmx { channel, .. } => {
            if (1..=512).contains(channel) {
                Ok(())
            } else {
                Err("DMX channel must be between 1 and 512.".to_string())
            }
        }
    }
}

pub fn validate_macro(m: &Macro) -> std::result::Result<(), String> {
    let name = m.name.trim();
    if name.is_empty() {
        return Err("Give the macro a name.".to_string());
    }
    if name.chars().count() > MAX_MACRO_NAME_CHARS {
        return Err(format!("Macro name is too long (maximum {} characters).", MAX_MACRO_NAME_CHARS));
    }
    if m.steps.is_empty() {
        return Err("A macro needs at least one step.".to_string());
    }
    if m.steps.len() > MAX_MACRO_STEPS {
        return Err(format!("A macro can have at most {} steps.", MAX_MACRO_STEPS));
    }
    let mut total_wait = 0u32;
    for (i, step) in m.steps.iter().enumerate() {
        validate_step(step).map_err(|e| format!("Step {}: {}", i + 1, e))?;
        if let MacroStep::Wait { seconds } = step {
            total_wait += seconds;
        }
    }
    if total_wait > MAX_TOTAL_WAIT_SECONDS {
        return Err(format!("The waits add up to more than {} minutes.", MAX_TOTAL_WAIT_SECONDS / 60));
    }
    Ok(())
}

// ------------------------------------------------------------------ storage

fn row_to_macro(row: &rusqlite::Row) -> Result<Macro> {
    let steps_json: String = row.get(2)?;
    Ok(Macro {
        id: row.get(0)?,
        name: row.get(1)?,
        // a damaged value yields an empty macro that cannot run, never a crash
        steps: serde_json::from_str(&steps_json).unwrap_or_default(),
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

impl DbManager {
    pub fn list_macros(&self) -> Result<Vec<Macro>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, steps, sort_order, created_at, updated_at FROM macros ORDER BY sort_order ASC, created_at ASC;",
        )?;
        let rows = stmt.query_map([], row_to_macro)?;
        rows.collect()
    }

    pub fn get_macro(&self, id: &str) -> Result<Option<Macro>> {
        Ok(self.list_macros()?.into_iter().find(|m| m.id == id))
    }

    pub fn create_macro(&self, m: &Macro) -> std::result::Result<Macro, String> {
        validate_macro(m)?;
        let existing = self.list_macros().map_err(|e| e.to_string())?;
        if existing.len() >= MAX_MACROS {
            return Err(format!("You can keep at most {} macros.", MAX_MACROS));
        }
        let now = Utc::now().to_rfc3339();
        let saved = Macro {
            id: Uuid::new_v4().to_string(),
            name: m.name.trim().to_string(),
            sort_order: existing.len() as i32,
            created_at: now.clone(),
            updated_at: now,
            ..m.clone()
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO macros (id, name, steps, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6);",
            params![
                saved.id,
                saved.name,
                serde_json::to_string(&saved.steps).map_err(|e| e.to_string())?,
                saved.sort_order,
                saved.created_at,
                saved.updated_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(saved)
    }

    pub fn update_macro(&self, m: &Macro) -> std::result::Result<Macro, String> {
        validate_macro(m)?;
        let changed = {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE macros SET name = ?2, steps = ?3, updated_at = ?4 WHERE id = ?1;",
                params![
                    m.id,
                    m.name.trim(),
                    serde_json::to_string(&m.steps).map_err(|e| e.to_string())?,
                    Utc::now().to_rfc3339()
                ],
            )
            .map_err(|e| e.to_string())?
        };
        if changed == 0 {
            return Err("That macro no longer exists.".to_string());
        }
        self.get_macro(&m.id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "That macro no longer exists.".to_string())
    }

    pub fn delete_macro(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM macros WHERE id = ?1;", params![id])?;
        Ok(())
    }
}

// ------------------------------------------------------------------ running

/// What a step needs from the runner beyond changing the presentation state.
#[derive(Debug, Clone, PartialEq)]
pub enum StepOutcome {
    Done,
    /// Pause for this many seconds before the next step.
    Wait(u32),
    /// Auto-advance was started; the runner must start its scheduler thread for this run id.
    AutoAdvanceStarted(String),
}

/// Applies one step. `Wait` is reported back rather than slept, so the runner (and the tests)
/// control time.
pub fn apply_step_core(
    db: &DbManager,
    pres: &PresentationManager,
    step: &MacroStep,
    now_ms: i64,
) -> std::result::Result<StepOutcome, String> {
    validate_step(step)?;
    match step {
        MacroStep::Action { action } => {
            ActionDispatcher::dispatch_core(db, pres, action)?;
            Ok(StepOutcome::Done)
        }
        MacroStep::Alert { message, seconds } => {
            pres.send_alert_core(message, *seconds)?;
            Ok(StepOutcome::Done)
        }
        MacroStep::Prop { prop_id, mode } => {
            let on = pres.get_state().active_props.iter().any(|p| &p.id == prop_id);
            let want = match mode.as_str() {
                "show" => true,
                "hide" => false,
                _ => !on,
            };
            if want != on {
                pres.toggle_prop_core(db, prop_id)?;
            }
            Ok(StepOutcome::Done)
        }
        MacroStep::Look { look_id } => {
            let look = db
                .get_look(look_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "That look no longer exists.".to_string())?;
            pres.apply_look_core(db, &look);
            Ok(StepOutcome::Done)
        }
        MacroStep::ClearGroup { group_id } => {
            let group = db
                .get_clear_group(group_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "That clear group no longer exists.".to_string())?;
            pres.clear_group_core(&group.layers);
            Ok(StepOutcome::Done)
        }
        MacroStep::Wait { seconds } => Ok(StepOutcome::Wait(*seconds)),
        MacroStep::AutoAdvance { interval_seconds, loop_at_end } => {
            let state = pres.start_auto_advance_core(*interval_seconds, *loop_at_end, now_ms)?;
            Ok(StepOutcome::AutoAdvanceStarted(state.auto_advance.map(|a| a.id).unwrap_or_default()))
        }
        MacroStep::Dmx { universe, channel, value } => {
            if let Ok(cfg) = db.get_dmx_config() {
                if cfg.is_enabled {
                    let u = universe.unwrap_or(cfg.universe);
                    let mut ch = [0u8; crate::dmx::DMX_CHANNELS];
                    if *channel >= 1 && *channel <= crate::dmx::DMX_CHANNELS as u16 {
                        ch[(*channel - 1) as usize] = *value;
                        let _ = crate::dmx::send_artnet_dmx(&cfg.target_ip, cfg.target_port, u, 1, &ch);
                    }
                }
            }
            Ok(StepOutcome::Done)
        }
    }
}

/// Keeps track of which macro (if any) is running, so it can be stopped.
#[derive(Clone)]
pub struct MacroRunner {
    current: Arc<Mutex<Option<String>>>,
}

impl MacroRunner {
    pub fn new() -> Self {
        Self { current: Arc::new(Mutex::new(None)) }
    }

    #[cfg(test)]
    pub fn is_running(&self) -> bool {
        self.current.lock().unwrap().is_some()
    }

    /// Marks a run as started; fails if another macro is already running.
    pub fn begin(&self) -> std::result::Result<String, String> {
        let mut cur = self.current.lock().unwrap();
        if cur.is_some() {
            return Err("A macro is already running. Stop it first.".to_string());
        }
        let id = Uuid::new_v4().to_string();
        *cur = Some(id.clone());
        Ok(id)
    }

    fn still_current(&self, run_id: &str) -> bool {
        self.current.lock().unwrap().as_deref() == Some(run_id)
    }

    fn finish(&self, run_id: &str) {
        let mut cur = self.current.lock().unwrap();
        if cur.as_deref() == Some(run_id) {
            *cur = None;
        }
    }

    /// Asks the running macro to stop before its next step.
    pub fn cancel(&self) {
        *self.current.lock().unwrap() = None;
    }

    /// Runs `m` on a background thread. Returns an error if another macro is running.
    pub fn run(
        &self,
        app: AppHandle,
        db: DbManager,
        pres: PresentationManager,
        m: Macro,
    ) -> std::result::Result<(), String> {
        validate_macro(&m)?;
        let run_id = self.begin()?;
        let runner = self.clone();
        std::thread::spawn(move || {
            let total = m.steps.len();
            'steps: for (i, step) in m.steps.iter().enumerate() {
                if !runner.still_current(&run_id) {
                    break;
                }
                pres.set_running_macro_core(Some(RunningMacro { id: m.id.clone(), name: m.name.clone(), step: i + 1, total }));
                app.emit("presentation:state-changed", &pres.get_state()).ok();

                match apply_step_core(&db, &pres, step, Utc::now().timestamp_millis()) {
                    Ok(StepOutcome::Done) => {}
                    Ok(StepOutcome::AutoAdvanceStarted(id)) => {
                        crate::presentation::spawn_auto_advance_loop(app.clone(), db.clone(), pres.clone(), id);
                    }
                    Ok(StepOutcome::Wait(seconds)) => {
                        // sleep in small slices so Stop takes effect quickly
                        for _ in 0..(seconds * 10) {
                            if !runner.still_current(&run_id) {
                                break 'steps;
                            }
                            std::thread::sleep(Duration::from_millis(100));
                        }
                    }
                    Err(e) => {
                        app.emit("macro:error", serde_json::json!({ "macro": m.name, "step": i + 1, "error": e })).ok();
                        break;
                    }
                }
                app.emit("presentation:state-changed", &pres.get_state()).ok();
                // actions that repeat within 80ms are treated as a bounce and dropped
                std::thread::sleep(Duration::from_millis(120));
            }
            pres.set_running_macro_core(None);
            app.emit("presentation:state-changed", &pres.get_state()).ok();
            runner.finish(&run_id);
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn action(a: &str) -> MacroStep {
        MacroStep::Action { action: a.into() }
    }

    fn m(steps: Vec<MacroStep>) -> Macro {
        Macro { id: String::new(), name: "Start service".into(), steps, sort_order: 0, created_at: String::new(), updated_at: String::new() }
    }

    #[test]
    fn steps_serialise_in_camel_case_with_a_type_tag() {
        let json = serde_json::to_value(vec![
            action("clear_all"),
            MacroStep::Alert { message: "Hi".into(), seconds: Some(5) },
            MacroStep::Prop { prop_id: "p1".into(), mode: "show".into() },
            MacroStep::Wait { seconds: 3 },
            MacroStep::AutoAdvance { interval_seconds: 8, loop_at_end: true },
        ])
        .unwrap();
        assert_eq!(json[0], serde_json::json!({"type": "action", "action": "clear_all"}));
        assert_eq!(json[2], serde_json::json!({"type": "prop", "propId": "p1", "mode": "show"}));
        assert_eq!(json[4], serde_json::json!({"type": "autoAdvance", "intervalSeconds": 8, "loopAtEnd": true}));
        let back: Vec<MacroStep> = serde_json::from_value(json).unwrap();
        assert_eq!(back.len(), 5);
        // optional fields may be left out
        let s: MacroStep = serde_json::from_str(r#"{"type":"alert","message":"x"}"#).unwrap();
        assert_eq!(s, MacroStep::Alert { message: "x".into(), seconds: None });
        let a: MacroStep = serde_json::from_str(r#"{"type":"autoAdvance","intervalSeconds":4}"#).unwrap();
        assert_eq!(a, MacroStep::AutoAdvance { interval_seconds: 4, loop_at_end: false });
    }

    #[test]
    fn unknown_step_types_do_not_parse() {
        assert!(serde_json::from_str::<MacroStep>(r#"{"type":"shell","command":"rm -rf /"}"#).is_err());
        assert!(serde_json::from_str::<MacroStep>(r#"{"type":"macro","id":"x"}"#).is_err());
    }

    #[test]
    fn only_listed_actions_may_run() {
        for a in MACRO_ACTIONS {
            assert!(validate_step(&action(a)).is_ok(), "{a}");
        }
        for bad in ["", "quit", "delete_song", "NEXT_SLIDE", "run_macro", "next_slide "] {
            assert!(validate_step(&action(bad)).unwrap_err().contains("cannot be used"), "{bad:?}");
        }
    }

    #[test]
    fn every_listed_action_is_really_dispatchable() {
        // guards against listing a name the dispatcher does not know
        let db = DbManager::new_in_memory().unwrap();
        for a in MACRO_ACTIONS {
            let pres = PresentationManager::new();
            pres.init_pointers(&db);
            std::thread::sleep(Duration::from_millis(90)); // clear of the dispatcher's bounce window
            // a state error (e.g. "No active or selected service") is fine; an unknown name is not
            if let Err(e) = ActionDispatcher::dispatch_core(&db, &pres, a) {
                assert!(!e.starts_with("Unsupported action"), "{a} is not dispatchable: {e}");
            }
        }
    }

    #[test]
    fn step_rules() {
        assert!(validate_step(&MacroStep::Alert { message: "  ".into(), seconds: None }).unwrap_err().contains("message"));
        assert!(validate_step(&MacroStep::Alert { message: "x".repeat(201), seconds: None }).unwrap_err().contains("too long"));
        assert!(validate_step(&MacroStep::Alert { message: "x".into(), seconds: Some(3601) }).is_err());
        assert!(validate_step(&MacroStep::Alert { message: "x".into(), seconds: Some(0) }).is_ok());
        assert!(validate_step(&MacroStep::Prop { prop_id: " ".into(), mode: "show".into() }).unwrap_err().contains("choose a prop"));
        assert!(validate_step(&MacroStep::Prop { prop_id: "p".into(), mode: "flip".into() }).unwrap_err().contains("mode"));
        for secs in [0, MAX_WAIT_SECONDS + 1] {
            assert!(validate_step(&MacroStep::Wait { seconds: secs }).is_err());
        }
        assert!(validate_step(&MacroStep::Wait { seconds: MAX_WAIT_SECONDS }).is_ok());
        for secs in [0, MAX_AUTO_ADVANCE_SECONDS + 1] {
            assert!(validate_step(&MacroStep::AutoAdvance { interval_seconds: secs, loop_at_end: false }).is_err());
        }
    }

    #[test]
    fn macro_rules_name_step_count_and_total_wait() {
        assert!(validate_macro(&m(vec![action("clear_all")])).is_ok());
        assert!(validate_macro(&Macro { name: " ".into(), ..m(vec![action("clear_all")]) }).unwrap_err().contains("name"));
        assert!(validate_macro(&Macro { name: "n".repeat(61), ..m(vec![action("clear_all")]) }).unwrap_err().contains("too long"));
        assert!(validate_macro(&m(vec![])).unwrap_err().contains("at least one step"));
        let many: Vec<MacroStep> = (0..=MAX_MACRO_STEPS).map(|_| action("next_slide")).collect();
        assert!(validate_macro(&m(many)).unwrap_err().contains("at most"));
        // errors say which step
        assert!(validate_macro(&m(vec![action("clear_all"), action("nope")])).unwrap_err().starts_with("Step 2:"));
        // many long waits add up
        let waits: Vec<MacroStep> = (0..4).map(|_| MacroStep::Wait { seconds: MAX_WAIT_SECONDS }).collect();
        assert!(validate_macro(&m(waits)).unwrap_err().contains("add up"));
        let ok_waits: Vec<MacroStep> = (0..3).map(|_| MacroStep::Wait { seconds: MAX_WAIT_SECONDS }).collect();
        assert!(validate_macro(&m(ok_waits)).is_ok());
    }

    #[test]
    fn create_list_update_delete_round_trip_in_order() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.list_macros().unwrap().is_empty());
        let a = db.create_macro(&Macro { name: "  First ".into(), ..m(vec![action("clear_all"), MacroStep::Wait { seconds: 2 }, action("toggle_logo")]) }).unwrap();
        let b = db.create_macro(&Macro { name: "Second".into(), ..m(vec![MacroStep::Alert { message: "Hello".into(), seconds: None }]) }).unwrap();
        assert_eq!(a.name, "First");
        assert_ne!(a.id, b.id);

        let list = db.list_macros().unwrap();
        assert_eq!(list.iter().map(|x| x.name.as_str()).collect::<Vec<_>>(), vec!["First", "Second"]);
        assert_eq!(list[0].steps, vec![action("clear_all"), MacroStep::Wait { seconds: 2 }, action("toggle_logo")]); // step order kept

        let updated = db.update_macro(&Macro { name: "Renamed".into(), steps: vec![action("next_slide")], ..a.clone() }).unwrap();
        assert_eq!(updated.name, "Renamed");
        assert_eq!(updated.steps, vec![action("next_slide")]);
        assert_eq!(updated.created_at, a.created_at);

        db.delete_macro(&a.id).unwrap();
        assert_eq!(db.list_macros().unwrap().len(), 1);
        db.delete_macro("ghost").unwrap();
    }

    #[test]
    fn invalid_macros_are_never_stored_and_missing_ones_cannot_be_updated() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.create_macro(&m(vec![action("shutdown")])).is_err());
        assert!(db.list_macros().unwrap().is_empty());
        assert!(db.update_macro(&Macro { id: "ghost".into(), ..m(vec![action("clear_all")]) }).unwrap_err().contains("no longer exists"));
        let saved = db.create_macro(&m(vec![action("clear_all")])).unwrap();
        assert!(db.update_macro(&Macro { steps: vec![], ..saved.clone() }).is_err());
        assert_eq!(db.get_macro(&saved.id).unwrap().unwrap().steps.len(), 1);
    }

    #[test]
    fn the_number_of_macros_is_capped_and_a_damaged_value_loads_as_empty() {
        let db = DbManager::new_in_memory().unwrap();
        for i in 0..MAX_MACROS {
            db.create_macro(&Macro { name: format!("M{i}"), ..m(vec![action("clear_all")]) }).unwrap();
        }
        assert!(db.create_macro(&m(vec![action("clear_all")])).unwrap_err().contains("at most"));

        let db2 = DbManager::new_in_memory().unwrap();
        let saved = db2.create_macro(&m(vec![action("clear_all")])).unwrap();
        db2.conn.lock().unwrap().execute("UPDATE macros SET steps = 'garbage' WHERE id = ?1;", params![saved.id]).unwrap();
        let back = db2.get_macro(&saved.id).unwrap().unwrap();
        assert_eq!(back.name, "Start service");
        assert!(back.steps.is_empty()); // loads, but cannot run: validate_macro rejects it
        assert!(validate_macro(&back).is_err());
    }

    #[test]
    fn macros_survive_backup_and_restore_and_old_backups_still_load() {
        let db = DbManager::new_in_memory().unwrap();
        let saved = db.create_macro(&m(vec![action("clear_all"), MacroStep::Wait { seconds: 1 }, action("toggle_logo")])).unwrap();
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.macros.len(), 1);
        db.delete_macro(&saved.id).unwrap();
        db.import_backup(&backup, "overwrite").unwrap();
        assert_eq!(db.list_macros().unwrap()[0].steps, saved.steps);

        let mut value = serde_json::to_value(&backup).unwrap();
        value.as_object_mut().unwrap().remove("macros");
        let old: crate::models::BackupData = serde_json::from_value(value).unwrap();
        assert!(old.macros.is_empty());
    }

    // ---- step execution

    fn setup() -> (DbManager, PresentationManager) {
        let db = DbManager::new_in_memory().unwrap();
        let pres = PresentationManager::new();
        pres.init_pointers(&db);
        (db, pres)
    }

    fn pause() {
        std::thread::sleep(Duration::from_millis(90)); // the dispatcher drops a repeat within 80ms
    }

    #[test]
    fn action_steps_change_the_output() {
        let (db, pres) = setup();
        pause();
        assert_eq!(apply_step_core(&db, &pres, &action("toggle_logo"), 0).unwrap(), StepOutcome::Done);
        assert!(pres.get_state().is_logo);
        pause();
        apply_step_core(&db, &pres, &action("clear_all"), 0).unwrap();
        assert!(!pres.get_state().is_logo);
        assert!(apply_step_core(&db, &pres, &action("shutdown"), 0).is_err());
    }

    #[test]
    fn alert_steps_show_a_banner_and_reject_empty_ones() {
        let (db, pres) = setup();
        apply_step_core(&db, &pres, &MacroStep::Alert { message: "Service starting".into(), seconds: Some(0) }, 0).unwrap();
        assert_eq!(pres.get_state().alert.unwrap().message, "Service starting");
        assert!(apply_step_core(&db, &pres, &MacroStep::Alert { message: "".into(), seconds: None }, 0).is_err());
    }

    #[test]
    fn prop_steps_show_hide_and_toggle_without_flip_flopping() {
        let (db, pres) = setup();
        let prop = db
            .create_prop(&crate::props::Prop {
                id: String::new(), name: "P".into(), kind: "text".into(), text: Some("hi".into()), image_path: None,
                position: "center".into(), size_pct: 5, text_color: "#ffffff".into(), background_color: None,
                sort_order: 0, created_at: String::new(), updated_at: String::new(),
                ..Default::default()
            })
            .unwrap();
        let step = |mode: &str| MacroStep::Prop { prop_id: prop.id.clone(), mode: mode.into() };
        let on = |p: &PresentationManager| p.get_state().active_props.len() == 1;

        apply_step_core(&db, &pres, &step("show"), 0).unwrap();
        assert!(on(&pres));
        apply_step_core(&db, &pres, &step("show"), 0).unwrap(); // already showing: stays showing
        assert!(on(&pres));
        apply_step_core(&db, &pres, &step("toggle"), 0).unwrap();
        assert!(!on(&pres));
        apply_step_core(&db, &pres, &step("hide"), 0).unwrap(); // already hidden: stays hidden
        assert!(!on(&pres));
        apply_step_core(&db, &pres, &step("toggle"), 0).unwrap();
        assert!(on(&pres));

        let ghost = MacroStep::Prop { prop_id: "ghost".into(), mode: "show".into() };
        assert!(apply_step_core(&db, &pres, &ghost, 0).unwrap_err().contains("no longer exists"));
    }

    #[test]
    fn wait_steps_report_instead_of_sleeping() {
        let (db, pres) = setup();
        let t = std::time::Instant::now();
        assert_eq!(apply_step_core(&db, &pres, &MacroStep::Wait { seconds: 300 }, 0).unwrap(), StepOutcome::Wait(300));
        assert!(t.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn auto_advance_steps_start_a_run_that_needs_something_live() {
        let (db, pres) = setup();
        let step = MacroStep::AutoAdvance { interval_seconds: 5, loop_at_end: true };
        assert!(apply_step_core(&db, &pres, &step, 0).unwrap_err().contains("live"));

        pres.next_slide_core(&db);
        match apply_step_core(&db, &pres, &step, 1_000).unwrap() {
            StepOutcome::AutoAdvanceStarted(id) => {
                assert_eq!(pres.auto_advance_run_id(), Some(id));
                assert_eq!(pres.get_state().auto_advance.unwrap().next_at_ms, 6_000);
            }
            other => panic!("unexpected {other:?}"),
        }
    }

    #[test]
    fn a_start_service_style_macro_runs_step_by_step() {
        let (db, pres) = setup();
        pres.next_slide_core(&db);
        let steps = vec![
            action("clear_all"),
            MacroStep::Alert { message: "Welcome".into(), seconds: Some(0) },
            MacroStep::Wait { seconds: 5 },
            action("toggle_logo"),
        ];
        let mut waited = 0;
        for s in &steps {
            pause();
            if let StepOutcome::Wait(n) = apply_step_core(&db, &pres, s, 0).unwrap() {
                waited += n;
            }
        }
        let st = pres.get_state();
        assert_eq!(waited, 5);
        assert!(!st.is_live && st.is_logo);
        assert_eq!(st.alert.unwrap().message, "Welcome");
    }

    // ---- runner bookkeeping

    #[test]
    fn only_one_macro_runs_at_a_time_and_cancel_frees_the_runner() {
        let runner = MacroRunner::new();
        assert!(!runner.is_running());
        let first = runner.begin().unwrap();
        assert!(runner.is_running());
        assert!(runner.begin().unwrap_err().contains("already running"));
        assert!(runner.still_current(&first));

        runner.cancel();
        assert!(!runner.is_running());
        assert!(!runner.still_current(&first)); // the old run sees it was stopped
        let second = runner.begin().unwrap();
        assert_ne!(first, second);
        // finishing a stale run must not clear the newer one
        runner.finish(&first);
        assert!(runner.still_current(&second));
        runner.finish(&second);
        assert!(!runner.is_running());
    }

    #[test]
    fn look_steps_apply_a_saved_look_and_fail_when_it_is_gone() {
        let (db, pres) = setup();
        let saved = db.create_look(&crate::looks::Look {
            id: String::new(), name: "Pre".into(), logo: true, blackout: false, prop_ids: vec![],
            screen_configs: vec![],
            sort_order: 0, created_at: String::new(), updated_at: String::new(),
        }).unwrap();
        let step = MacroStep::Look { look_id: saved.id.clone() };
        assert!(validate_step(&step).is_ok());
        assert_eq!(apply_step_core(&db, &pres, &step, 0).unwrap(), StepOutcome::Done);
        assert!(pres.get_state().is_logo);

        db.delete_look(&saved.id).unwrap();
        assert!(apply_step_core(&db, &pres, &step, 0).unwrap_err().contains("no longer exists"));
        assert!(validate_step(&MacroStep::Look { look_id: " ".into() }).unwrap_err().contains("choose a look"));
        let json = serde_json::to_value(&step).unwrap();
        assert_eq!(json, serde_json::json!({"type": "look", "lookId": saved.id}));
    }

    #[test]
    fn run_macro_actions_carry_a_plain_macro_id() {
        assert_eq!(macro_id_from_action("run_macro:abc-123"), Some("abc-123"));
        for bad in ["run_macro:", "run_macro: ", "run_macro:a/b", "next_slide", "RUN_MACRO:abc", "run_macro", "  run_macro:abc"] {
            assert_eq!(macro_id_from_action(bad), None, "{bad:?}");
        }
        assert_eq!(macro_id_from_action(&format!("run_macro:{}", "x".repeat(65))), None);
        // a macro step can never start another macro: the step runner only knows the listed actions
        assert!(!MACRO_ACTIONS.iter().any(|a| a.starts_with(RUN_MACRO_PREFIX)));
        let (db, pres) = setup();
        assert!(ActionDispatcher::dispatch_core(&db, &pres, "run_macro:abc").unwrap_err().contains("Unsupported"));
    }

    #[test]
    fn clear_group_steps_clear_only_the_chosen_layers_and_fail_when_the_group_is_gone() {
        let (db, pres) = setup();
        pres.toggle_logo_core();
        pres.toggle_blackout_core();
        let saved = db.create_clear_group(&crate::clear_groups::ClearGroup {
            id: String::new(), name: "Black".into(), layers: vec!["blackout".into()],
            sort_order: 0, created_at: String::new(), updated_at: String::new(),
        }).unwrap();
        let step = MacroStep::ClearGroup { group_id: saved.id.clone() };
        assert!(validate_step(&step).is_ok());
        assert_eq!(apply_step_core(&db, &pres, &step, 0).unwrap(), StepOutcome::Done);
        let st = pres.get_state();
        assert!(!st.is_blackout && st.is_logo);

        db.delete_clear_group(&saved.id).unwrap();
        assert!(apply_step_core(&db, &pres, &step, 0).unwrap_err().contains("no longer exists"));
        assert!(validate_step(&MacroStep::ClearGroup { group_id: " ".into() }).unwrap_err().contains("choose a clear group"));
        assert_eq!(serde_json::to_value(&step).unwrap(), serde_json::json!({"type": "clearGroup", "groupId": saved.id}));
    }
}
