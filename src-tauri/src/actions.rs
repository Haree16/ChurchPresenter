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
    pub fn dispatch(
        app: &AppHandle,
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
            "next_slide" => pres_mgr.next_slide(app, db),
            "prev_slide" => pres_mgr.previous_slide(app, db),
            "next_item" => Self::navigate_service_item(app, db, pres_mgr, true)?,
            "prev_item" => Self::navigate_service_item(app, db, pres_mgr, false)?,
            "toggle_blackout" => {
                pres_mgr.toggle_blackout(app);
                pres_mgr.get_state()
            }
            "toggle_live" => {
                let state = pres_mgr.get_state();
                if state.is_live {
                    pres_mgr.clear_live(app)
                } else if state.current_slide_id.is_some() {
                    // Re-activate live
                    if let Some(ref service_id) = state.current_service_id {
                        if let Some(ref item_id) = state.current_item_id {
                            if let Some(ref slide_id) = state.current_slide_id {
                                pres_mgr.set_live_service_item_slide(app, db, service_id, item_id, slide_id)
                            } else {
                                state
                            }
                        } else {
                            state
                        }
                    } else if let Some(ref pres_id) = state.current_presentation_id {
                        if let Some(ref slide_id) = state.current_slide_id {
                            pres_mgr.set_live_slide(app, db, pres_id, slide_id)
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
                state = pres_mgr.set_timer_state(app, Some(t_state));
                state
            }
            "stop_timer" => {
                let mut state = pres_mgr.get_state();
                if let Some(mut t_state) = state.timer_state {
                    t_state.is_running = false;
                    state = pres_mgr.set_timer_state(app, Some(t_state));
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
                    state = pres_mgr.set_timer_state(app, Some(t_state));
                }
                state
            }
            "clear_overlay" => {
                let current_overlay = db.get_overlay_config().unwrap_or_default();
                let new_cleared = !current_overlay.is_cleared;
                db.set_overlay_cleared(new_cleared).ok();
                app.emit("overlay:cleared", new_cleared).ok();
                pres_mgr.get_state()
            }
            unknown => return Err(format!("Unsupported action '{}'", unknown)),
        };

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

    fn navigate_service_item(
        app: &AppHandle,
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
            Ok(pres_mgr.set_live_service_item_slide(
                app,
                db,
                service_id,
                &target_item.id,
                &first_slide.id,
            ))
        } else {
            Ok(pres_mgr.set_selected_service_item(
                app,
                Some(service_id.clone()),
                Some(target_item.id.clone()),
            ))
        }
    }
}
