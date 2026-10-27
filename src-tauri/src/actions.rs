use crate::db::DbManager;
use crate::models::PresentationState;
use crate::presentation::PresentationManager;
use chrono::Utc;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// Debounce tracker for rapid duplicate messages (e.g. physical MIDI bouncy switches or network bursts)
static LAST_ACTION_TIMESTAMP_MS: AtomicI64 = AtomicI64::new(0);
static LAST_ACTION_NAME: Mutex<Option<String>> = Mutex::new(None);

pub struct ActionDispatcher;

impl ActionDispatcher {
    pub fn dispatch_core(
        db: &DbManager,
        pres_mgr: &PresentationManager,
        action_name: &str,
    ) -> Result<PresentationState, String> {
        let now_ms = Utc::now().timestamp_millis();
        let last_time = LAST_ACTION_TIMESTAMP_MS.load(Ordering::SeqCst);

        // Debounce: prevent same action executed within 80ms
        {
            let mut last_name_lock = LAST_ACTION_NAME.lock().unwrap();
            if let Some(ref prev) = *last_name_lock {
                if prev == action_name && (now_ms - last_time) < 80 {
                    return Ok(pres_mgr.get_state());
                }
            }
            *last_name_lock = Some(action_name.to_string());
        }
        LAST_ACTION_TIMESTAMP_MS.store(now_ms, Ordering::SeqCst);

        let result_state = match action_name {
            "next_slide" => pres_mgr.next_slide_core(db),
            "prev_slide" => pres_mgr.previous_slide_core(db),
            "next_item" => Self::navigate_service_item_core(db, pres_mgr, true)?,
            "prev_item" => Self::navigate_service_item_core(db, pres_mgr, false)?,
            "clear_screen" | "clear_live" => pres_mgr.clear_live_core(),
            "toggle_blackout" => {
                pres_mgr.toggle_blackout_core();
                pres_mgr.get_state()
            }
            "clear_media" => pres_mgr.clear_media_core(),
            "clear_alert" => pres_mgr.clear_alert_core(),
            "clear_all" => pres_mgr.clear_all_core(),
            "toggle_logo" => {
                pres_mgr.toggle_logo_core();
                pres_mgr.get_state()
            }
            "clear_blackout" => {
                if pres_mgr.get_state().is_blackout {
                    pres_mgr.toggle_blackout_core();
                }
                pres_mgr.get_state()
            }
            "toggle_live" => {
                let state = pres_mgr.get_state();
                if state.is_live {
                    pres_mgr.clear_live_core()
                } else if state.current_slide_id.is_some() {
                    if let Some(ref service_id) = state.current_service_id {
                        if let Some(ref item_id) = state.current_item_id {
                            if let Some(ref slide_id) = state.current_slide_id {
                                pres_mgr.set_live_service_item_slide_core(db, service_id, item_id, slide_id)
                            } else {
                                state
                            }
                        } else {
                            state
                        }
                    } else if let Some(ref pres_id) = state.current_presentation_id {
                        if let Some(ref slide_id) = state.current_slide_id {
                            pres_mgr.set_live_slide_core(db, pres_id, slide_id)
                        } else {
                            state
                        }
                    } else {
                        state
                    }
                } else {
                    state
                }
            }
            "start_timer" => {
                let mut state = pres_mgr.get_state();
                let mut t_state = state.timer_state.unwrap_or_default();
                t_state.is_running = true;
                t_state.start_time_epoch_ms = Some(Utc::now().timestamp_millis());
                t_state.is_expired = false;
                state = pres_mgr.set_timer_state_core(Some(t_state));
                state
            }
            "stop_timer" => {
                let mut state = pres_mgr.get_state();
                if let Some(mut t_state) = state.timer_state {
                    t_state.is_running = false;
                    state = pres_mgr.set_timer_state_core(Some(t_state));
                }
                state
            }
            "reset_timer" => {
                let mut state = pres_mgr.get_state();
                if let Some(mut t_state) = state.timer_state {
                    t_state.is_running = false;
                    t_state.accumulated_seconds = 0.0;
                    t_state.start_time_epoch_ms = None;
                    t_state.is_expired = false;
                    state = pres_mgr.set_timer_state_core(Some(t_state));
                }
                state
            }
            "clear_overlay" => {
                let current_overlay = db.get_overlay_config().unwrap_or_default();
                let new_cleared = !current_overlay.is_cleared;
                let _ = db.set_overlay_cleared(new_cleared);
                pres_mgr.get_state()
            }
            unknown => return Err(format!("Unsupported action '{}'", unknown)),
        };

        Ok(result_state)
    }

    pub fn dispatch(
        app: &AppHandle,
        db: &DbManager,
        pres_mgr: &PresentationManager,
        action_name: &str,
    ) -> Result<PresentationState, String> {
        let result_state = Self::dispatch_core(db, pres_mgr, action_name)?;

        // Broadcast updated presentation state across all windows
        app.emit("presentation:state-changed", &result_state).ok();

        // Emit action event for UI monitor / diagnostics
        app.emit(
            "action:dispatched",
            serde_json::json!({
                "action": action_name,
                "timestamp": Utc::now().to_rfc3339()
            }),
        )
        .ok();

        Ok(result_state)
    }

    fn navigate_service_item_core(
        db: &DbManager,
        pres_mgr: &PresentationManager,
        is_next: bool,
    ) -> Result<PresentationState, String> {
        let state = pres_mgr.get_state();
        let service_id = state
            .current_service_id
            .as_ref()
            .or(state.selected_service_id.as_ref())
            .ok_or_else(|| "No active or selected service".to_string())?;

        let items = db
            .get_service_items(service_id)
            .map_err(|e| e.to_string())?;
        if items.is_empty() {
            return Ok(state);
        }

        let curr_item_id = state
            .current_item_id
            .as_ref()
            .or(state.selected_item_id.as_ref());
        let curr_idx = curr_item_id
            .and_then(|id| items.iter().position(|it| &it.id == id))
            .unwrap_or(0);

        let target_idx = if is_next {
            if curr_idx + 1 < items.len() {
                curr_idx + 1
            } else {
                curr_idx
            }
        } else {
            if curr_idx > 0 {
                curr_idx - 1
            } else {
                0
            }
        };

        let target_item = &items[target_idx];
        let slides = db
            .get_service_item_slides(&target_item.id)
            .unwrap_or_default();

        if let Some(first_slide) = slides.first() {
            Ok(pres_mgr.set_live_service_item_slide_core(
                db,
                service_id,
                &target_item.id,
                &first_slide.id,
            ))
        } else {
            Ok(state)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_action_dispatch_core() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        pres_mgr.init_pointers(&db);

        // Test blackout toggle
        let res = ActionDispatcher::dispatch_core(&db, &pres_mgr, "toggle_blackout").unwrap();
        assert_eq!(res.is_blackout, true);
        std::thread::sleep(std::time::Duration::from_millis(100));
        let res2 = ActionDispatcher::dispatch_core(&db, &pres_mgr, "toggle_blackout").unwrap();
        assert_eq!(res2.is_blackout, false);

        // Test next slide
        let res3 = ActionDispatcher::dispatch_core(&db, &pres_mgr, "next_slide").unwrap();
        assert!(res3.is_live);

        // Test timers
        let t_res = ActionDispatcher::dispatch_core(&db, &pres_mgr, "start_timer").unwrap();
        assert!(t_res.timer_state.is_some());
        assert!(t_res.timer_state.unwrap().is_running);

        let t_stop = ActionDispatcher::dispatch_core(&db, &pres_mgr, "stop_timer").unwrap();
        assert!(!t_stop.timer_state.unwrap().is_running);

        // Test invalid action
        let err = ActionDispatcher::dispatch_core(&db, &pres_mgr, "non_existent_action");
        assert!(err.is_err());
    }

    #[test]
    fn test_clear_media_and_clear_all_actions() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        pres_mgr.init_pointers(&db);
        pres_mgr.next_slide_core(&db);
        pres_mgr.toggle_logo_core();

        let res = ActionDispatcher::dispatch_core(&db, &pres_mgr, "clear_media").unwrap();
        assert!(res.media_playback.is_none());
        assert!(res.is_live && res.is_logo);

        std::thread::sleep(std::time::Duration::from_millis(100));
        let res = ActionDispatcher::dispatch_core(&db, &pres_mgr, "clear_all").unwrap();
        assert!(!res.is_live && !res.is_logo && !res.is_blackout);
    }

    #[test]
    fn test_logo_action_toggles() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        let on = ActionDispatcher::dispatch_core(&db, &pres_mgr, "toggle_logo").unwrap();
        assert!(on.is_logo);
        std::thread::sleep(std::time::Duration::from_millis(100));
        let off = ActionDispatcher::dispatch_core(&db, &pres_mgr, "toggle_logo").unwrap();
        assert!(!off.is_logo);
    }

    #[test]
    fn test_clear_alert_action() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        pres_mgr.send_alert_core("hello", Some(0)).unwrap();
        let res = ActionDispatcher::dispatch_core(&db, &pres_mgr, "clear_alert").unwrap();
        assert!(res.alert.is_none());
    }
}
