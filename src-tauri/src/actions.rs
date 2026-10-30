use crate::db::DbManager;
use crate::models::PresentationState;
use crate::presentation::PresentationManager;
use chrono::Utc;
use tauri::{AppHandle, Emitter, Manager};

pub struct ActionDispatcher;

impl ActionDispatcher {
    pub fn dispatch_core(
        db: &DbManager,
        pres_mgr: &PresentationManager,
        action_name: &str,
    ) -> Result<PresentationState, String> {
        // Debounce: drop the same action repeated within 80ms (bouncy MIDI switches, network bursts)
        if pres_mgr.is_action_bounce(action_name, Utc::now().timestamp_millis()) {
            return Ok(pres_mgr.get_state());
        }

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
            "clear_props" => pres_mgr.clear_props_core(),
            "stop_auto_advance" => pres_mgr.stop_auto_advance_core(),
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
            "start_recording" | "stop_recording" | "toggle_recording"
            | "obs_start_stream" | "obs_stop_stream" | "obs_start_record" | "obs_stop_record"
            | "toggle_live_camera" | "switch_next_camera"
            | "toggle_alpha_key" | "open_alpha_key_outputs" | "close_alpha_key_outputs"
            | "toggle_ndi_output" | "start_ndi_output" | "stop_ndi_output"
            | "toggle_edge_blend" | "toggle_edge_blend_test_pattern"
            | "toggle_audio_mute" | "volume_up" | "volume_down" => {
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
        // `run_macro:<id>` starts a macro on its own thread; it needs the app handle, so it is not part of dispatch_core.
        if let Some(id) = crate::macros::macro_id_from_action(action_name) {
            crate::macros::run_macro_by_id(app, db, pres_mgr, id)?;
            app.emit(
                "action:dispatched",
                serde_json::json!({ "action": action_name, "timestamp": Utc::now().to_rfc3339() }),
            )
            .ok();
            return Ok(pres_mgr.get_state());
        }

        if action_name == "start_recording" || action_name == "stop_recording" || action_name == "toggle_recording" {
            if let Some(recorder) = app.try_state::<std::sync::Arc<crate::recorder::RecorderService>>() {
                let status = recorder.get_status(db);
                if action_name == "start_recording" {
                    if !status.is_recording {
                        let sid = format!("rec-{}", Utc::now().timestamp_millis());
                        if let Ok(st) = recorder.start_recording(db, sid, None) {
                            app.emit("recording:status-changed", &st).ok();
                        }
                    }
                } else if action_name == "stop_recording" {
                    if status.is_recording {
                        if let Ok(file) = recorder.stop_recording(None) {
                            let new_st = recorder.get_status(db);
                            app.emit("recording:status-changed", &new_st).ok();
                            app.emit("recording:completed", &file).ok();
                        }
                    }
                } else if action_name == "toggle_recording" {
                    if status.is_recording {
                        if let Ok(file) = recorder.stop_recording(None) {
                            let new_st = recorder.get_status(db);
                            app.emit("recording:status-changed", &new_st).ok();
                            app.emit("recording:completed", &file).ok();
                        }
                    } else {
                        let sid = format!("rec-{}", Utc::now().timestamp_millis());
                        if let Ok(st) = recorder.start_recording(db, sid, None) {
                            app.emit("recording:status-changed", &st).ok();
                        }
                    }
                }
            }
            app.emit(
                "action:dispatched",
                serde_json::json!({ "action": action_name, "timestamp": Utc::now().to_rfc3339() }),
            )
            .ok();
            return Ok(pres_mgr.get_state());
        }

        if action_name.starts_with("obs_") {
            if let Some(obs) = app.try_state::<std::sync::Arc<crate::obs::ObsService>>() {
                match action_name {
                    "obs_start_stream" => {
                        if let Ok(st) = obs.start_stream() {
                            app.emit("obs:status-changed", &st).ok();
                        }
                    }
                    "obs_stop_stream" => {
                        if let Ok(st) = obs.stop_stream() {
                            app.emit("obs:status-changed", &st).ok();
                        }
                    }
                    "obs_start_record" => {
                        if let Ok(st) = obs.start_record() {
                            app.emit("obs:status-changed", &st).ok();
                        }
                    }
                    "obs_stop_record" => {
                        if let Ok(st) = obs.stop_record() {
                            app.emit("obs:status-changed", &st).ok();
                        }
                    }
                    _ => {}
                }
            }
            app.emit(
                "action:dispatched",
                serde_json::json!({ "action": action_name, "timestamp": Utc::now().to_rfc3339() }),
            )
            .ok();
            return Ok(pres_mgr.get_state());
        }

        if action_name == "toggle_live_camera" {
            if let Ok(mut cfg) = db.get_live_video_config() {
                cfg.is_active = !cfg.is_active;
                let _ = db.update_live_video_config(&cfg);
                app.emit("live-video:config-updated", &cfg).ok();
            }
            app.emit(
                "action:dispatched",
                serde_json::json!({ "action": action_name, "timestamp": Utc::now().to_rfc3339() }),
            )
            .ok();
            return Ok(pres_mgr.get_state());
        }

        if action_name == "toggle_alpha_key" {
            if let Ok(mut cfg) = db.get_alpha_key_config() {
                cfg.is_active = !cfg.is_active;
                let _ = db.update_alpha_key_config(&cfg);
                app.emit("alpha-key:config-updated", &cfg).ok();
            }
            app.emit(
                "action:dispatched",
                serde_json::json!({ "action": action_name, "timestamp": Utc::now().to_rfc3339() }),
            )
            .ok();
            return Ok(pres_mgr.get_state());
        }

        if action_name == "toggle_ndi_output" || action_name == "start_ndi_output" || action_name == "stop_ndi_output" {
            if let Some(ndi) = app.try_state::<std::sync::Arc<crate::ndi::NdiService>>() {
                let st = match action_name {
                    "start_ndi_output" => ndi.start_broadcasting(db, None),
                    "stop_ndi_output" => ndi.stop_broadcasting(db),
                    _ => ndi.toggle_broadcasting(db),
                };
                if let Ok(status) = st {
                    app.emit("ndi:status-changed", &status).ok();
                }
            } else if let Ok(mut cfg) = db.get_ndi_config() {
                match action_name {
                    "start_ndi_output" => cfg.is_active = true,
                    "stop_ndi_output" => cfg.is_active = false,
                    _ => cfg.is_active = !cfg.is_active,
                }
                let _ = db.update_ndi_config(&cfg);
                app.emit("ndi:config-updated", &cfg).ok();
            }
            app.emit(
                "action:dispatched",
                serde_json::json!({ "action": action_name, "timestamp": Utc::now().to_rfc3339() }),
            )
            .ok();
            return Ok(pres_mgr.get_state());
        }

        if action_name == "toggle_edge_blend" || action_name == "toggle_edge_blend_test_pattern" {
            let target_id = "output-audience";
            let res = match action_name {
                "toggle_edge_blend_test_pattern" => db.toggle_edge_blend_test_pattern(target_id),
                _ => db.toggle_edge_blend(target_id),
            };
            if let Ok(updated_output) = res {
                app.emit("output:edge-blend-updated", &updated_output).ok();
            }
            app.emit(
                "action:dispatched",
                serde_json::json!({ "action": action_name, "timestamp": Utc::now().to_rfc3339() }),
            )
            .ok();
            return Ok(pres_mgr.get_state());
        }

        if action_name == "toggle_audio_mute" || action_name == "volume_up" || action_name == "volume_down" {
            let res = match action_name {
                "toggle_audio_mute" => db.toggle_audio_mute(),
                "volume_up" => {
                    let cur = db.get_audio_config().map(|c| c.master_volume).unwrap_or(1.0);
                    db.set_master_volume((cur + 0.05).min(1.0))
                }
                "volume_down" => {
                    let cur = db.get_audio_config().map(|c| c.master_volume).unwrap_or(1.0);
                    db.set_master_volume((cur - 0.05).max(0.0))
                }
                _ => db.get_audio_config(),
            };
            if let Ok(cfg) = res {
                app.emit("audio:config-updated", &cfg).ok();
            }
            app.emit(
                "action:dispatched",
                serde_json::json!({ "action": action_name, "timestamp": Utc::now().to_rfc3339() }),
            )
            .ok();
            return Ok(pres_mgr.get_state());
        }

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

    #[test]
    fn test_clear_props_action() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        let prop = db
            .create_prop(&crate::props::Prop {
                id: String::new(), name: "P".into(), kind: "text".into(), text: Some("hi".into()), image_path: None,
                position: "center".into(), size_pct: 5, text_color: "#ffffff".into(), background_color: None,
                sort_order: 0, created_at: String::new(), updated_at: String::new(),
                ..Default::default()
            })
            .unwrap();
        pres_mgr.toggle_prop_core(&db, &prop.id).unwrap();
        let res = ActionDispatcher::dispatch_core(&db, &pres_mgr, "clear_props").unwrap();
        assert!(res.active_props.is_empty());
    }

    #[test]
    fn test_stop_auto_advance_action() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        pres_mgr.init_pointers(&db);
        pres_mgr.next_slide_core(&db);
        pres_mgr.start_auto_advance_core(5, false, 0).unwrap();
        let res = ActionDispatcher::dispatch_core(&db, &pres_mgr, "stop_auto_advance").unwrap();
        assert!(res.auto_advance.is_none());
    }
}
