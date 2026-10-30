use crate::db::DbManager;
use crate::models::{AudienceAlert, AutoAdvanceStatus, MediaPlaybackState, PresentationState, TimerState};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub const MIN_AUTO_ADVANCE_SECONDS: u32 = 1;
pub const MAX_AUTO_ADVANCE_SECONDS: u32 = 3600;

/// What one scheduler tick did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutoAdvanceTick {
    /// Auto-advance is not running.
    Idle,
    /// Nothing to do yet (not due, or paused because the output is blank or blacked out).
    Waiting,
    Advanced,
    /// Reached the last slide and went back to the first.
    Looped,
    /// Reached the last slide and stopped.
    Finished,
}

pub const MAX_ALERT_CHARS: usize = 200;
pub const DEFAULT_ALERT_SECONDS: u32 = 30;
const MAX_ALERT_SECONDS: u32 = 3600;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// Drops the alert from `state` once its expiry time has passed.
pub fn expire_alert(state: &mut PresentationState, now_ms: i64) {
    if let Some(alert) = &state.alert {
        if alert.expires_at_ms.map_or(false, |t| now_ms >= t) {
            state.alert = None;
        }
    }
}

/// How long auto-advance keeps `slide` up: its own time if it has one, else the run's interval.
fn slide_hold_ms(slide: Option<&crate::models::Slide>, interval_seconds: u32) -> i64 {
    let secs = slide
        .and_then(|s| s.layout.as_ref())
        .and_then(|l| l.advance_seconds)
        .unwrap_or(interval_seconds);
    i64::from(secs) * 1000
}

/// Runs one auto-advance run on a background thread until it is stopped, replaced or finished.
pub fn spawn_auto_advance_loop(app: AppHandle, db: DbManager, pres: PresentationManager, run_id: String) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(250));
        if pres.auto_advance_run_id().as_deref() != Some(run_id.as_str()) {
            break;
        }
        let (tick, state) = pres.auto_advance_tick_core(&db, now_ms());
        if matches!(tick, AutoAdvanceTick::Advanced | AutoAdvanceTick::Looped | AutoAdvanceTick::Finished) {
            app.emit("presentation:state-changed", &state).ok();
        }
        if tick == AutoAdvanceTick::Finished {
            break;
        }
    });
}

/// Runs auto-advance loop for announcements/foyer presentation on a background thread.
pub fn spawn_announcements_loop(app: AppHandle, db: DbManager, pres: PresentationManager, pres_id: String) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(250));
        let (due, is_active) = {
            let state = pres.state.lock().unwrap();
            let Some(ann) = &state.announcements else { break; };
            if ann.presentation_id.as_deref() != Some(&pres_id) || !ann.is_live {
                break;
            }
            let Some(sec) = ann.auto_advance_seconds else { break; };
            if sec == 0 { break; }
            let due = ann.next_advance_at_ms.map_or(false, |next| now_ms() >= next);
            (due, true)
        };

        if !is_active {
            break;
        }

        if due {
            if let Ok(st) = pres.next_announcements_slide_core(&db, now_ms()) {
                app.emit("presentation:state-changed", &st).ok();
            }
        }
    });
}

/// Starts auto-advance and the thread that drives it.
pub fn start_auto_advance_running(
    app: &AppHandle,
    db: &DbManager,
    pres: &PresentationManager,
    interval_seconds: u32,
    loop_at_end: bool,
) -> Result<PresentationState, String> {
    let state = pres.start_auto_advance(app, interval_seconds, loop_at_end)?;
    if let Some(run) = &state.auto_advance {
        spawn_auto_advance_loop(app.clone(), db.clone(), pres.clone(), run.id.clone());
    }
    Ok(state)
}

#[derive(Clone)]
pub struct PresentationManager {
    state: Arc<Mutex<PresentationState>>,
    /// The last dispatched action and when, for the repeat filter in `ActionDispatcher`.
    last_action: Arc<Mutex<(Option<String>, i64)>>,
    /// The service item and day last counted for CCLI, so moving between slides does not look it up again.
    last_counted: Arc<Mutex<Option<(String, String)>>>,
}

impl PresentationManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(PresentationState::default())),
            last_action: Arc::new(Mutex::new((None, 0))),
            last_counted: Arc::new(Mutex::new(None)),
        }
    }

    /// Counts a song for CCLI the first time its service item goes live (once per service per day).
    fn note_item_live(&self, db: &DbManager, state: &PresentationState) {
        if !state.is_live {
            return;
        }
        let (Some(service_id), Some(item_id)) = (&state.current_service_id, &state.current_item_id) else { return };
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        {
            let mut last = self.last_counted.lock().unwrap();
            if last.as_ref().map_or(false, |(i, d)| i == item_id && *d == today) {
                return;
            }
            *last = Some((item_id.clone(), today));
        }
        // a failure to log must never get in the way of the service
        let _ = db.log_song_usage_for_item(service_id, item_id);
    }

    /// True when `action` is the same as the previous one and came less than 80 ms after it.
    /// Records the action either way.
    pub fn is_action_bounce(&self, action: &str, now_ms: i64) -> bool {
        let mut last = self.last_action.lock().unwrap();
        let bounce = last.0.as_deref() == Some(action) && now_ms - last.1 < 80;
        *last = (Some(action.to_string()), now_ms);
        bounce
    }

    pub fn get_state(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        expire_alert(&mut state, now_ms());
        state.clone()
    }

    /// Shows `message` over the audience output. `duration_secs`: `None` uses the default (30s),
    /// `Some(0)` keeps it up until cleared, anything else is clamped to 1 second..1 hour.
    pub fn send_alert_at(
        &self,
        message: &str,
        duration_secs: Option<u32>,
        now_ms: i64,
    ) -> Result<PresentationState, String> {
        let message = message.trim();
        if message.is_empty() {
            return Err("Alert message cannot be empty.".to_string());
        }
        if message.chars().count() > MAX_ALERT_CHARS {
            return Err(format!("Alert message is too long (maximum {} characters).", MAX_ALERT_CHARS));
        }
        let expires_at_ms = match duration_secs.unwrap_or(DEFAULT_ALERT_SECONDS) {
            0 => None,
            s => Some(now_ms + i64::from(s.min(MAX_ALERT_SECONDS)) * 1000),
        };
        let mut state = self.state.lock().unwrap();
        state.alert = Some(AudienceAlert {
            id: uuid::Uuid::new_v4().to_string(),
            message: message.to_string(),
            expires_at_ms,
        });
        Ok(state.clone())
    }

    pub fn send_alert_core(&self, message: &str, duration_secs: Option<u32>) -> Result<PresentationState, String> {
        self.send_alert_at(message, duration_secs, now_ms())
    }

    pub fn send_alert(
        &self,
        app: &AppHandle,
        message: &str,
        duration_secs: Option<u32>,
    ) -> Result<PresentationState, String> {
        let state = self.send_alert_core(message, duration_secs)?;
        app.emit("presentation:state-changed", &state).ok();
        Ok(state)
    }

    /// Turns a saved prop on or off over the output.
    pub fn toggle_prop_core(&self, db: &DbManager, prop_id: &str) -> Result<PresentationState, String> {
        let mut state = self.state.lock().unwrap();
        if let Some(pos) = state.active_props.iter().position(|p| p.id == prop_id) {
            state.active_props.remove(pos);
        } else {
            let prop = db
                .get_prop(prop_id)
                .map_err(|e| e.to_string())?
                .ok_or_else(|| "That prop no longer exists.".to_string())?;
            state.active_props.push(prop);
        }
        Ok(state.clone())
    }

    pub fn toggle_prop(&self, app: &AppHandle, db: &DbManager, prop_id: &str) -> Result<PresentationState, String> {
        let state = self.toggle_prop_core(db, prop_id)?;
        app.emit("presentation:state-changed", &state).ok();
        Ok(state)
    }

    /// Re-reads the active props from the database after one was edited or deleted.
    pub fn sync_active_props_core(&self, db: &DbManager) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        let saved = db.list_props().unwrap_or_default();
        state.active_props = state
            .active_props
            .iter()
            .filter_map(|active| saved.iter().find(|p| p.id == active.id).cloned())
            .collect();
        state.clone()
    }

    pub fn sync_active_props(&self, app: &AppHandle, db: &DbManager) -> PresentationState {
        let state = self.sync_active_props_core(db);
        app.emit("presentation:state-changed", &state).ok();
        state
    }

    pub fn clear_props_core(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.active_props.clear();
        state.clone()
    }

    pub fn clear_props(&self, app: &AppHandle) -> PresentationState {
        let cloned = self.clear_props_core();
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    /// Starts advancing the live slide every `interval_seconds`. Something must be live already,
    /// so starting it can never put a slide on screen by surprise.
    pub fn start_auto_advance_core(
        &self,
        interval_seconds: u32,
        loop_at_end: bool,
        now_ms: i64,
    ) -> Result<PresentationState, String> {
        if !(MIN_AUTO_ADVANCE_SECONDS..=MAX_AUTO_ADVANCE_SECONDS).contains(&interval_seconds) {
            return Err(format!(
                "Interval must be between {} and {} seconds.",
                MIN_AUTO_ADVANCE_SECONDS, MAX_AUTO_ADVANCE_SECONDS
            ));
        }
        let mut state = self.state.lock().unwrap();
        if !state.is_live || state.current_slide_id.is_none() {
            return Err("Take a slide live first; auto-advance continues from the live slide.".to_string());
        }
        let hold = slide_hold_ms(state.current_slide.as_ref(), interval_seconds);
        let slide_id = state.current_slide_id.clone();
        state.auto_advance = Some(AutoAdvanceStatus {
            id: uuid::Uuid::new_v4().to_string(),
            interval_seconds,
            loop_at_end,
            next_at_ms: now_ms + hold,
            slide_id,
        });
        Ok(state.clone())
    }

    pub fn stop_auto_advance_core(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.auto_advance = None;
        state.clone()
    }

    pub fn start_auto_advance(
        &self,
        app: &AppHandle,
        interval_seconds: u32,
        loop_at_end: bool,
    ) -> Result<PresentationState, String> {
        let state = self.start_auto_advance_core(interval_seconds, loop_at_end, now_ms())?;
        app.emit("presentation:state-changed", &state).ok();
        Ok(state)
    }

    pub fn stop_auto_advance(&self, app: &AppHandle) -> PresentationState {
        let state = self.stop_auto_advance_core();
        app.emit("presentation:state-changed", &state).ok();
        state
    }

    /// The id of the current auto-advance run, so a scheduler thread knows when it was replaced.
    pub fn auto_advance_run_id(&self) -> Option<String> {
        self.state.lock().unwrap().auto_advance.as_ref().map(|a| a.id.clone())
    }

    /// Goes to the first slide of what is live (the current service item, or the presentation).
    fn go_to_first_slide_core(&self, db: &DbManager) {
        let mut state = self.state.lock().unwrap();
        let first = match (&state.current_service_id, &state.current_item_id, &state.current_presentation_id) {
            (Some(_), Some(item_id), _) => db.get_service_item_slides(item_id).unwrap_or_default().first().map(|s| s.id.clone()),
            (_, _, Some(pres_id)) => db.get_slides(pres_id).unwrap_or_default().first().map(|s| s.id.clone()),
            _ => None,
        };
        if let Some(id) = first {
            state.current_slide_id = Some(id);
            state.is_live = true;
            state.is_logo = false;
            self.update_pointers_internal(&mut state, db);
        }
    }

    /// One scheduler tick: advance when due. Pauses (pushing the next advance back) while the
    /// output is blank or blacked out, and stops by itself after the last slide unless looping.
    pub fn auto_advance_tick_core(&self, db: &DbManager, now_ms: i64) -> (AutoAdvanceTick, PresentationState) {
        let run = {
            let mut state = self.state.lock().unwrap();
            let Some(run) = state.auto_advance.clone() else {
                return (AutoAdvanceTick::Idle, state.clone());
            };
            let hold = slide_hold_ms(state.current_slide.as_ref(), run.interval_seconds);
            let current = state.current_slide_id.clone();
            // The operator moved to another slide: its own time starts now.
            if run.slide_id != current {
                if let Some(a) = state.auto_advance.as_mut() {
                    a.slide_id = current;
                    a.next_at_ms = now_ms + hold;
                }
                return (AutoAdvanceTick::Waiting, state.clone());
            }
            if now_ms < run.next_at_ms {
                return (AutoAdvanceTick::Waiting, state.clone());
            }
            if !state.is_live || state.is_blackout {
                if let Some(a) = state.auto_advance.as_mut() {
                    a.next_at_ms = now_ms + hold;
                }
                return (AutoAdvanceTick::Waiting, state.clone());
            }
            run
        };

        let before = self.state.lock().unwrap().current_slide_id.clone();
        self.next_slide_core(db);
        let after = self.state.lock().unwrap().current_slide_id.clone();

        let mut outcome = AutoAdvanceTick::Advanced;
        if before == after {
            // there was nothing further to advance to
            if run.loop_at_end {
                self.go_to_first_slide_core(db);
                outcome = AutoAdvanceTick::Looped;
            } else {
                outcome = AutoAdvanceTick::Finished;
            }
        }

        let mut state = self.state.lock().unwrap();
        // the next countdown is for the slide we are on now, using that slide's own time if it has one
        let hold = slide_hold_ms(state.current_slide.as_ref(), run.interval_seconds);
        let current = state.current_slide_id.clone();
        // only touch the run if it is still the same one (it may have been stopped or replaced)
        match state.auto_advance.as_mut() {
            Some(a) if a.id == run.id => {
                if outcome == AutoAdvanceTick::Finished {
                    state.auto_advance = None;
                } else {
                    a.next_at_ms = now_ms + hold;
                    a.slide_id = current;
                }
            }
            _ => {}
        }
        (outcome, state.clone())
    }

    /// Sets global layers as well as per-screen layers (used by Per-Screen Looks).
    pub fn set_look_layers_core(
        &self,
        logo: bool,
        blackout: bool,
        props: Vec<crate::props::Prop>,
        screen_layers: std::collections::HashMap<String, crate::models::ScreenLayers>,
    ) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.is_logo = logo;
        state.is_blackout = blackout;
        state.active_props = props;
        state.screen_layers = screen_layers;
        state.clone()
    }

    /// Applies layers specifically to a single target screen output, preserving other screens.
    pub fn set_screen_layer_core(
        &self,
        target_output_id: &str,
        logo: bool,
        blackout: bool,
        props: Vec<crate::props::Prop>,
        theme_id: Option<String>,
    ) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.screen_layers.insert(
            target_output_id.to_string(),
            crate::models::ScreenLayers {
                is_logo: logo,
                is_blackout: blackout,
                active_props: props.clone(),
                theme_id,
            },
        );

        if target_output_id == "output-audience" {
            state.is_logo = logo;
            state.is_blackout = blackout;
            state.active_props = props;
        }

        state.clone()
    }

    pub fn set_running_macro_core(&self, running: Option<crate::models::RunningMacro>) {
        self.state.lock().unwrap().running_macro = running;
    }

    pub fn clear_alert_core(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.alert = None;
        state.clone()
    }

    pub fn clear_alert(&self, app: &AppHandle) -> PresentationState {
        let cloned = self.clear_alert_core();
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn init_pointers(&self, db: &DbManager) {
        let mut state = self.state.lock().unwrap();
        let presentations = db.list_presentations().unwrap_or_default();
        if let Some(first_pres) = presentations.first() {
            state.current_presentation_id = Some(first_pres.id.clone());
            let slides = db.get_slides(&first_pres.id).unwrap_or_default();
            state.total_slides = slides.len();
            if let Some(first_slide) = slides.first() {
                state.current_slide_id = Some(first_slide.id.clone());
                state.current_slide_index = 0;
                state.current_slide = Some(first_slide.clone());
                state.next_slide = slides.get(1).cloned();
            }
        }
    }

    fn update_pointers_internal(&self, state: &mut PresentationState, db: &DbManager) {
        if let Some(ref service_id) = state.current_service_id {
            if let Some(ref item_id) = state.current_item_id {
                let slides = db.get_service_item_slides(item_id).unwrap_or_default();
                state.total_slides = slides.len();

                let mut idx = 0;
                if let Some(ref s_id) = state.current_slide_id {
                    if let Some(found_idx) = slides.iter().position(|s| &s.id == s_id) {
                        idx = found_idx;
                    }
                }

                if !slides.is_empty() {
                    state.current_slide_index = idx;
                    state.current_slide = slides.get(idx).cloned();
                    if state.current_slide_id.is_none() {
                        state.current_slide_id = Some(slides[idx].id.clone());
                    }

                    // Next slide: either in this item or first slide of next item in service
                    if idx + 1 < slides.len() {
                        state.next_slide = slides.get(idx + 1).cloned();
                    } else {
                        let items = db.get_service_items(service_id).unwrap_or_default();
                        let mut next_slide_found = None;
                        if let Some(item_pos) = items.iter().position(|it| &it.id == item_id) {
                            for next_it in &items[item_pos + 1..] {
                                let next_slides = db
                                    .get_service_item_slides(&next_it.id)
                                    .unwrap_or_default();
                                if let Some(first_s) = next_slides.first() {
                                    next_slide_found = Some(first_s.clone());
                                    break;
                                }
                            }
                        }
                        state.next_slide = next_slide_found;
                    }
                } else {
                    state.current_slide_index = 0;
                    state.current_slide = None;
                    state.next_slide = None;
                    state.current_slide_id = None;
                }
                return;
            }
        }

        // Standalone presentation mode (Phase 1 & 2 fallback)
        if let Some(ref pres_id) = state.current_presentation_id {
            let slides = db.get_slides(pres_id).unwrap_or_default();
            state.total_slides = slides.len();

            let mut idx = 0;
            if let Some(ref s_id) = state.current_slide_id {
                if let Some(found_idx) = slides.iter().position(|s| &s.id == s_id) {
                    idx = found_idx;
                }
            }

            if !slides.is_empty() {
                state.current_slide_index = idx;
                state.current_slide = slides.get(idx).cloned();
                state.next_slide = slides.get(idx + 1).cloned();
                if state.current_slide_id.is_none() {
                    state.current_slide_id = Some(slides[idx].id.clone());
                }
            } else {
                state.current_slide_index = 0;
                state.current_slide = None;
                state.next_slide = None;
                state.current_slide_id = None;
            }
        } else {
            state.total_slides = 0;
            state.current_slide_index = 0;
            state.current_slide = None;
            state.next_slide = None;
            state.current_slide_id = None;
        }
    }

    pub fn set_live_slide_core(
        &self,
        db: &DbManager,
        presentation_id: &str,
        slide_id: &str,
    ) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.current_service_id = None;
        state.current_item_id = None;
        state.current_presentation_id = Some(presentation_id.to_string());
        state.current_slide_id = Some(slide_id.to_string());
        state.is_live = true;
        state.is_logo = false;
        self.update_pointers_internal(&mut state, db);
        state.clone()
    }

    pub fn set_live_slide(
        &self,
        app: &AppHandle,
        db: &DbManager,
        presentation_id: &str,
        slide_id: &str,
    ) -> PresentationState {
        let cloned = self.set_live_slide_core(db, presentation_id, slide_id);
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn set_live_service_item_slide_core(
        &self,
        db: &DbManager,
        service_id: &str,
        item_id: &str,
        slide_id: &str,
    ) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.current_service_id = Some(service_id.to_string());
        state.current_item_id = Some(item_id.to_string());
        state.current_presentation_id = None;
        state.current_slide_id = Some(slide_id.to_string());
        state.is_live = true;
        state.is_logo = false;
        self.update_pointers_internal(&mut state, db);
        self.note_item_live(db, &state);
        state.clone()
    }

    pub fn set_live_service_item_slide(
        &self,
        app: &AppHandle,
        db: &DbManager,
        service_id: &str,
        item_id: &str,
        slide_id: &str,
    ) -> PresentationState {
        let cloned = self.set_live_service_item_slide_core(db, service_id, item_id, slide_id);
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn set_selected_service_item(
        &self,
        app: &AppHandle,
        service_id: Option<String>,
        item_id: Option<String>,
    ) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.selected_service_id = service_id;
        state.selected_item_id = item_id;
        let cloned = state.clone();
        drop(state);

        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn clear_live_core(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.is_live = false;
        state.clone()
    }

    pub fn clear_live(&self, app: &AppHandle) -> PresentationState {
        let cloned = self.clear_live_core();
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn toggle_blackout_core(&self) -> bool {
        let mut state = self.state.lock().unwrap();
        state.is_blackout = !state.is_blackout;
        state.is_blackout
    }

    /// Stops background/foreground media on the output without touching the slide.
    pub fn clear_media_core(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.media_playback = None;
        state.clone()
    }

    pub fn clear_media(&self, app: &AppHandle) -> PresentationState {
        let cloned = self.clear_media_core();
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    /// Clears the output completely: no slide, no media, no logo, no blackout toggle left on.
    /// The audience screen ends up plain black. Also clears the announcements layer.
    pub fn clear_all_core(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.is_live = false;
        state.is_logo = false;
        state.is_blackout = false;
        state.media_playback = None;
        state.alert = None;
        state.active_props.clear();
        state.auto_advance = None;
        state.announcements = None;
        state.clone()
    }

    /// Clears exactly the listed layers (see `clear_groups::CLEAR_LAYERS`) and leaves the rest as it is.
    pub fn clear_group_core(&self, layers: &[String]) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        for layer in layers {
            match layer.as_str() {
                "slide" => state.is_live = false,
                "media" => state.media_playback = None,
                "logo" => state.is_logo = false,
                "blackout" => state.is_blackout = false,
                "alert" => state.alert = None,
                "props" => state.active_props.clear(),
                "autoAdvance" => state.auto_advance = None,
                "announcements" => state.announcements = None,
                _ => {}
            }
        }
        state.clone()
    }

    pub fn clear_all(&self, app: &AppHandle) -> PresentationState {
        let cloned = self.clear_all_core();
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn clear_announcements_core(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.announcements = None;
        state.clone()
    }

    pub fn clear_announcements(&self, app: &AppHandle) -> PresentationState {
        let cloned = self.clear_announcements_core();
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    /// Starts an announcements presentation (or foyer loop) running on target outputs.
    pub fn set_announcements_presentation_core(
        &self,
        db: &DbManager,
        presentation_id: &str,
        target_output_ids: Vec<String>,
        auto_advance_seconds: Option<u32>,
        is_looping: bool,
        now_ms: i64,
    ) -> Result<PresentationState, String> {
        let slides = db
            .get_slides(presentation_id)
            .map_err(|e| e.to_string())?;

        if slides.is_empty() {
            return Err("That presentation has no slides.".to_string());
        }

        let first_slide = slides[0].clone();
        let next_slide = slides.get(1).cloned();
        let hold_ms = auto_advance_seconds.map(|s| i64::from(s.max(1)) * 1000);

        let mut state = self.state.lock().unwrap();
        state.announcements = Some(crate::models::AnnouncementsState {
            presentation_id: Some(presentation_id.to_string()),
            service_id: None,
            item_id: None,
            slide_id: Some(first_slide.id.clone()),
            slide_index: 0,
            total_slides: slides.len(),
            current_slide: Some(first_slide),
            next_slide,
            is_live: true,
            is_looping,
            auto_advance_seconds,
            next_advance_at_ms: hold_ms.map(|h| now_ms + h),
            target_output_ids,
        });

        Ok(state.clone())
    }

    pub fn set_announcements_presentation(
        &self,
        app: &AppHandle,
        db: &DbManager,
        presentation_id: &str,
        target_output_ids: Vec<String>,
        auto_advance_seconds: Option<u32>,
        is_looping: bool,
    ) -> Result<PresentationState, String> {
        let state = self.set_announcements_presentation_core(
            db,
            presentation_id,
            target_output_ids,
            auto_advance_seconds,
            is_looping,
            now_ms(),
        )?;
        app.emit("presentation:state-changed", &state).ok();

        if let Some(ann) = &state.announcements {
            if let Some(sec) = ann.auto_advance_seconds {
                if sec > 0 {
                    spawn_announcements_loop(
                        app.clone(),
                        db.clone(),
                        self.clone(),
                        presentation_id.to_string(),
                    );
                }
            }
        }

        Ok(state)
    }

    pub fn set_announcements_slide_core(
        &self,
        db: &DbManager,
        slide_id: &str,
        now_ms: i64,
    ) -> Result<PresentationState, String> {
        let mut state = self.state.lock().unwrap();
        let Some(ann) = state.announcements.as_mut() else {
            return Err("No announcements presentation is currently active.".to_string());
        };

        let Some(pres_id) = &ann.presentation_id else {
            return Err("No announcements presentation id.".to_string());
        };

        let slides = db.get_slides(pres_id).map_err(|e| e.to_string())?;
        let Some(idx) = slides.iter().position(|s| s.id == slide_id) else {
            return Err("Slide not found in announcements presentation.".to_string());
        };

        ann.slide_id = Some(slide_id.to_string());
        ann.slide_index = idx;
        ann.current_slide = Some(slides[idx].clone());
        ann.next_slide = if idx + 1 < slides.len() {
            slides.get(idx + 1).cloned()
        } else if ann.is_looping {
            slides.first().cloned()
        } else {
            None
        };
        ann.is_live = true;
        if let Some(sec) = ann.auto_advance_seconds {
            ann.next_advance_at_ms = Some(now_ms + i64::from(sec.max(1)) * 1000);
        }

        Ok(state.clone())
    }

    pub fn set_announcements_slide(
        &self,
        app: &AppHandle,
        db: &DbManager,
        slide_id: &str,
    ) -> Result<PresentationState, String> {
        let state = self.set_announcements_slide_core(db, slide_id, now_ms())?;
        app.emit("presentation:state-changed", &state).ok();
        Ok(state)
    }

    pub fn next_announcements_slide_core(
        &self,
        db: &DbManager,
        now_ms: i64,
    ) -> Result<PresentationState, String> {
        let mut state = self.state.lock().unwrap();
        let Some(ann) = state.announcements.as_mut() else {
            return Err("No announcements presentation is currently active.".to_string());
        };

        let Some(pres_id) = &ann.presentation_id else {
            return Err("No announcements presentation id.".to_string());
        };

        let slides = db.get_slides(pres_id).map_err(|e| e.to_string())?;
        if slides.is_empty() {
            return Ok(state.clone());
        }

        let next_idx = ann.slide_index + 1;
        if next_idx < slides.len() {
            ann.slide_index = next_idx;
            ann.slide_id = Some(slides[next_idx].id.clone());
            ann.current_slide = Some(slides[next_idx].clone());
            ann.next_slide = if next_idx + 1 < slides.len() {
                slides.get(next_idx + 1).cloned()
            } else if ann.is_looping {
                slides.first().cloned()
            } else {
                None
            };
        } else if ann.is_looping {
            ann.slide_index = 0;
            ann.slide_id = Some(slides[0].id.clone());
            ann.current_slide = Some(slides[0].clone());
            ann.next_slide = slides.get(1).cloned();
        }

        if let Some(sec) = ann.auto_advance_seconds {
            ann.next_advance_at_ms = Some(now_ms + i64::from(sec.max(1)) * 1000);
        }

        Ok(state.clone())
    }

    pub fn next_announcements_slide(
        &self,
        app: &AppHandle,
        db: &DbManager,
    ) -> Result<PresentationState, String> {
        let state = self.next_announcements_slide_core(db, now_ms())?;
        app.emit("presentation:state-changed", &state).ok();
        Ok(state)
    }

    pub fn previous_announcements_slide_core(
        &self,
        db: &DbManager,
        now_ms: i64,
    ) -> Result<PresentationState, String> {
        let mut state = self.state.lock().unwrap();
        let Some(ann) = state.announcements.as_mut() else {
            return Err("No announcements presentation is currently active.".to_string());
        };

        let Some(pres_id) = &ann.presentation_id else {
            return Err("No announcements presentation id.".to_string());
        };

        let slides = db.get_slides(pres_id).map_err(|e| e.to_string())?;
        if slides.is_empty() {
            return Ok(state.clone());
        }

        if ann.slide_index > 0 {
            let prev_idx = ann.slide_index - 1;
            ann.slide_index = prev_idx;
            ann.slide_id = Some(slides[prev_idx].id.clone());
            ann.current_slide = Some(slides[prev_idx].clone());
            ann.next_slide = slides.get(prev_idx + 1).cloned();
        } else if ann.is_looping {
            let last_idx = slides.len() - 1;
            ann.slide_index = last_idx;
            ann.slide_id = Some(slides[last_idx].id.clone());
            ann.current_slide = Some(slides[last_idx].clone());
            ann.next_slide = slides.first().cloned();
        }

        if let Some(sec) = ann.auto_advance_seconds {
            ann.next_advance_at_ms = Some(now_ms + i64::from(sec.max(1)) * 1000);
        }

        Ok(state.clone())
    }

    pub fn previous_announcements_slide(
        &self,
        app: &AppHandle,
        db: &DbManager,
    ) -> Result<PresentationState, String> {
        let state = self.previous_announcements_slide_core(db, now_ms())?;
        app.emit("presentation:state-changed", &state).ok();
        Ok(state)
    }

    pub fn toggle_logo_core(&self) -> bool {
        let mut state = self.state.lock().unwrap();
        state.is_logo = !state.is_logo;
        state.is_logo
    }

    pub fn toggle_logo(&self, app: &AppHandle) -> bool {
        let is_logo = self.toggle_logo_core();
        let cloned = self.get_state();
        app.emit("presentation:state-changed", &cloned).ok();
        is_logo
    }

    pub fn toggle_blackout(&self, app: &AppHandle) -> bool {
        let is_blackout = self.toggle_blackout_core();
        let cloned = self.get_state();
        app.emit("presentation:state-changed", &cloned).ok();
        is_blackout
    }

    pub fn next_slide_core(&self, db: &DbManager) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        if let Some(ref service_id) = state.current_service_id.clone() {
            if let Some(ref item_id) = state.current_item_id.clone() {
                let slides = db.get_service_item_slides(item_id).unwrap_or_default();
                if let Some(curr_idx) = slides
                    .iter()
                    .position(|s| Some(&s.id) == state.current_slide_id.as_ref())
                {
                    if curr_idx + 1 < slides.len() {
                        state.current_slide_id = Some(slides[curr_idx + 1].id.clone());
                        state.is_live = true;
                        state.is_logo = false;
                        self.update_pointers_internal(&mut state, db);
                    } else {
                        // Boundary transition: first slide of next item in playlist
                        let items = db.get_service_items(service_id).unwrap_or_default();
                        if let Some(item_pos) = items.iter().position(|it| &it.id == item_id) {
                            for next_it in &items[item_pos + 1..] {
                                let next_slides = db
                                    .get_service_item_slides(&next_it.id)
                                    .unwrap_or_default();
                                if let Some(first_s) = next_slides.first() {
                                    state.current_item_id = Some(next_it.id.clone());
                                    state.current_slide_id = Some(first_s.id.clone());
                                    state.is_live = true;
                                    state.is_logo = false;
                                    self.update_pointers_internal(&mut state, db);
                                    self.note_item_live(db, &state);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        } else if let Some(ref pres_id) = state.current_presentation_id {
            let slides = db.get_slides(pres_id).unwrap_or_default();
            if let Some(curr_idx) = slides
                .iter()
                .position(|s| Some(&s.id) == state.current_slide_id.as_ref())
            {
                if curr_idx + 1 < slides.len() {
                    state.current_slide_id = Some(slides[curr_idx + 1].id.clone());
                    state.is_live = true;
                    state.is_logo = false;
                    self.update_pointers_internal(&mut state, db);
                }
            }
        }
        state.clone()
    }

    pub fn next_slide(&self, app: &AppHandle, db: &DbManager) -> PresentationState {
        let cloned = self.next_slide_core(db);
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn previous_slide_core(&self, db: &DbManager) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        if let Some(ref service_id) = state.current_service_id.clone() {
            if let Some(ref item_id) = state.current_item_id.clone() {
                let slides = db.get_service_item_slides(item_id).unwrap_or_default();
                if let Some(curr_idx) = slides
                    .iter()
                    .position(|s| Some(&s.id) == state.current_slide_id.as_ref())
                {
                    if curr_idx > 0 {
                        state.current_slide_id = Some(slides[curr_idx - 1].id.clone());
                        state.is_live = true;
                        state.is_logo = false;
                        self.update_pointers_internal(&mut state, db);
                    } else {
                        // Boundary transition: last slide of previous item in playlist
                        let items = db.get_service_items(service_id).unwrap_or_default();
                        if let Some(item_pos) = items.iter().position(|it| &it.id == item_id) {
                            if item_pos > 0 {
                                for prev_it in items[..item_pos].iter().rev() {
                                    let prev_slides = db
                                        .get_service_item_slides(&prev_it.id)
                                        .unwrap_or_default();
                                    if let Some(last_s) = prev_slides.last() {
                                        state.current_item_id = Some(prev_it.id.clone());
                                        state.current_slide_id = Some(last_s.id.clone());
                                        state.is_live = true;
                                        state.is_logo = false;
                                        self.update_pointers_internal(&mut state, db);
                                        self.note_item_live(db, &state);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } else if let Some(ref pres_id) = state.current_presentation_id {
            let slides = db.get_slides(pres_id).unwrap_or_default();
            if let Some(curr_idx) = slides
                .iter()
                .position(|s| Some(&s.id) == state.current_slide_id.as_ref())
            {
                if curr_idx > 0 {
                    state.current_slide_id = Some(slides[curr_idx - 1].id.clone());
                    state.is_live = true;
                    state.is_logo = false;
                    self.update_pointers_internal(&mut state, db);
                }
            }
        }
        state.clone()
    }

    pub fn previous_slide(&self, app: &AppHandle, db: &DbManager) -> PresentationState {
        let cloned = self.previous_slide_core(db);
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn refresh_state(&self, app: &AppHandle, db: &DbManager) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        self.update_pointers_internal(&mut state, db);
        let cloned = state.clone();
        drop(state);

        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn set_media_playback(
        &self,
        app: &AppHandle,
        media_playback: Option<MediaPlaybackState>,
    ) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.media_playback = media_playback;
        let cloned = state.clone();
        drop(state);

        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn set_timer_state_core(
        &self,
        timer_state: Option<TimerState>,
    ) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.timer_state = timer_state;
        state.clone()
    }

    pub fn set_timer_state(
        &self,
        app: &AppHandle,
        timer_state: Option<TimerState>,
    ) -> PresentationState {
        let cloned = self.set_timer_state_core(timer_state);
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }

    pub fn set_stage_message_core(&self, message: Option<String>) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.stage_message = message;
        state.clone()
    }

    pub fn set_stage_message(&self, app: &AppHandle, message: Option<String>) -> PresentationState {
        let cloned = self.set_stage_message_core(message);
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn playing_media() -> MediaPlaybackState {
        MediaPlaybackState {
            media_id: Some("m1".into()),
            media_url: Some("file:///clip.mp4".into()),
            media_type: Some("video".into()),
            is_playing: true,
            ..MediaPlaybackState::default()
        }
    }

    #[test]
    fn test_clear_media_stops_media_but_keeps_slide_logo_and_blackout() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        pres_mgr.init_pointers(&db);
        pres_mgr.next_slide_core(&db);
        pres_mgr.toggle_logo_core();
        pres_mgr.toggle_blackout_core();
        {
            let mut st = pres_mgr.state.lock().unwrap();
            st.media_playback = Some(playing_media());
        }

        let after = pres_mgr.clear_media_core();
        assert!(after.media_playback.is_none());
        assert!(after.is_live);
        assert!(after.is_logo);
        assert!(after.is_blackout);
        assert!(after.current_slide_id.is_some());
    }

    #[test]
    fn test_clear_all_blanks_everything_but_keeps_the_selected_slide() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        pres_mgr.init_pointers(&db);
        pres_mgr.next_slide_core(&db);
        let slide_before = pres_mgr.get_state().current_slide_id.clone();
        pres_mgr.toggle_logo_core();
        pres_mgr.toggle_blackout_core();
        pres_mgr.state.lock().unwrap().media_playback = Some(playing_media());

        let after = pres_mgr.clear_all_core();
        assert!(!after.is_live && !after.is_logo && !after.is_blackout);
        assert!(after.media_playback.is_none());
        // operator can resume from the same place
        assert_eq!(after.current_slide_id, slide_before);

        // idempotent
        let again = pres_mgr.clear_all_core();
        assert!(!again.is_live && !again.is_logo && !again.is_blackout);
    }

    #[test]
    fn test_logo_is_independent_of_blackout_and_clears_on_go_live() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        pres_mgr.init_pointers(&db);

        assert!(pres_mgr.toggle_logo_core());
        assert!(pres_mgr.get_state().is_logo);
        assert!(!pres_mgr.get_state().is_blackout);

        // Blackout does not disturb the logo flag
        pres_mgr.toggle_blackout_core();
        assert!(pres_mgr.get_state().is_logo);
        pres_mgr.toggle_blackout_core();

        // Taking a slide live clears the logo
        let state = pres_mgr.next_slide_core(&db);
        assert!(state.is_live);
        assert!(!state.is_logo);

        // Logo toggles off again
        assert!(pres_mgr.toggle_logo_core());
        assert!(!pres_mgr.toggle_logo_core());
    }

    #[test]
    fn test_presentation_navigation_core() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();
        pres_mgr.init_pointers(&db);

        // Verify initial state
        let state = pres_mgr.get_state();
        assert_eq!(state.is_blackout, false);
        assert!(state.current_presentation_id.is_some());

        // Toggle blackout
        let is_black = pres_mgr.toggle_blackout_core();
        assert_eq!(is_black, true);
        assert_eq!(pres_mgr.get_state().is_blackout, true);
        pres_mgr.toggle_blackout_core();
        assert_eq!(pres_mgr.get_state().is_blackout, false);

        // Advance slide
        let state_after_next = pres_mgr.next_slide_core(&db);
        assert!(state_after_next.is_live);

        // Previous slide
        let state_after_prev = pres_mgr.previous_slide_core(&db);
        assert!(state_after_prev.is_live);

        // Clear live
        let cleared = pres_mgr.clear_live_core();
        assert_eq!(cleared.is_live, false);
    }

    #[test]
    fn test_timer_state_core() {
        let pres_mgr = PresentationManager::new();
        let timer = TimerState {
            id: None,
            name: "Sermon Countdown".to_string(),
            timer_type: "countdown".to_string(),
            duration_seconds: 300,
            warning_threshold_seconds: 60,
            is_running: true,
            is_expired: false,
            start_time_epoch_ms: Some(1000),
            accumulated_seconds: 0.0,
        };
        let res = pres_mgr.set_timer_state_core(Some(timer));
        assert!(res.timer_state.is_some());
        assert!(res.timer_state.unwrap().is_running);
    }

    #[test]
    fn test_alert_trims_validates_and_sets_expiry() {
        let mgr = PresentationManager::new();
        let st = mgr.send_alert_at("  Nursery: family 12  ", Some(10), 1_000).unwrap();
        let alert = st.alert.unwrap();
        assert_eq!(alert.message, "Nursery: family 12");
        assert_eq!(alert.expires_at_ms, Some(11_000));
        assert!(!alert.id.is_empty());

        assert!(mgr.send_alert_at("", Some(10), 0).is_err());
        assert!(mgr.send_alert_at("   \n ", Some(10), 0).is_err());
        let too_long = "x".repeat(MAX_ALERT_CHARS + 1);
        assert!(mgr.send_alert_at(&too_long, None, 0).unwrap_err().contains("too long"));
        assert!(mgr.send_alert_at(&"x".repeat(MAX_ALERT_CHARS), None, 0).is_ok());
        // a rejected alert leaves the current one alone
        mgr.send_alert_at("keep me", Some(0), 0).unwrap();
        assert!(mgr.send_alert_at("", None, 0).is_err());
        assert_eq!(mgr.get_state().alert.unwrap().message, "keep me");
    }

    #[test]
    fn test_alert_duration_default_zero_and_clamp() {
        let mgr = PresentationManager::new();
        let default = mgr.send_alert_at("a", None, 0).unwrap().alert.unwrap();
        assert_eq!(default.expires_at_ms, Some(i64::from(DEFAULT_ALERT_SECONDS) * 1000));
        let forever = mgr.send_alert_at("a", Some(0), 0).unwrap().alert.unwrap();
        assert_eq!(forever.expires_at_ms, None);
        let huge = mgr.send_alert_at("a", Some(u32::MAX), 0).unwrap().alert.unwrap();
        assert_eq!(huge.expires_at_ms, Some(3_600_000));
    }

    #[test]
    fn test_alert_expires_exactly_at_its_deadline_but_not_before() {
        let mut state = PresentationState::default();
        state.alert = Some(AudienceAlert { id: "1".into(), message: "m".into(), expires_at_ms: Some(5_000) });
        expire_alert(&mut state, 4_999);
        assert!(state.alert.is_some());
        expire_alert(&mut state, 5_000);
        assert!(state.alert.is_none());

        // an alert with no expiry stays until cleared
        state.alert = Some(AudienceAlert { id: "2".into(), message: "m".into(), expires_at_ms: None });
        expire_alert(&mut state, i64::MAX);
        assert!(state.alert.is_some());
    }

    #[test]
    fn test_expired_alert_is_gone_when_state_is_read() {
        let mgr = PresentationManager::new();
        mgr.send_alert_at("old", Some(1), now_ms() - 10_000).unwrap(); // expired 9s ago
        assert!(mgr.get_state().alert.is_none());
        mgr.send_alert_core("fresh", Some(60)).unwrap();
        assert_eq!(mgr.get_state().alert.unwrap().message, "fresh");
    }

    #[test]
    fn test_new_alert_replaces_old_and_gets_a_new_id() {
        let mgr = PresentationManager::new();
        let first = mgr.send_alert_at("one", Some(30), 0).unwrap().alert.unwrap();
        let second = mgr.send_alert_at("two", Some(30), 0).unwrap().alert.unwrap();
        assert_eq!(second.message, "two");
        assert_ne!(first.id, second.id);
    }

    #[test]
    fn test_clear_alert_and_clear_all_remove_it_but_blackout_and_logo_do_not() {
        let mgr = PresentationManager::new();
        mgr.send_alert_at("x", Some(0), 0).unwrap();
        mgr.toggle_blackout_core();
        mgr.toggle_logo_core();
        assert!(mgr.get_state().alert.is_some()); // layers are independent

        assert!(mgr.clear_alert_core().alert.is_none());
        assert!(mgr.clear_alert_core().alert.is_none()); // idempotent

        mgr.send_alert_at("y", Some(0), 0).unwrap();
        assert!(mgr.clear_all_core().alert.is_none());
    }

    fn live_manager(db: &DbManager) -> PresentationManager {
        let mgr = PresentationManager::new();
        mgr.init_pointers(db);
        mgr.next_slide_core(db); // goes live on a slide of the seeded presentation
        assert!(mgr.get_state().is_live);
        mgr
    }

    /// Goes live on the first slide of the seeded presentation (which has three slides).
    fn live_on_first_slide(db: &DbManager) -> PresentationManager {
        let mgr = PresentationManager::new();
        mgr.init_pointers(db);
        let pres_id = mgr.get_state().current_presentation_id.unwrap();
        let first = db.get_slides(&pres_id).unwrap().remove(0);
        mgr.set_live_slide_core(db, &pres_id, &first.id);
        assert_eq!(mgr.get_state().current_slide_index, 0);
        mgr
    }

    /// Sets how long auto-advance keeps the slides of the seeded presentation from `first` on
    /// (`None` = use the run's interval).
    fn set_slide_times(db: &DbManager, first: usize, times: &[Option<u32>]) {
        let probe = PresentationManager::new();
        probe.init_pointers(db);
        let pres_id = probe.get_state().current_presentation_id.unwrap();
        for (slide, t) in db.get_slides(&pres_id).unwrap().into_iter().skip(first).zip(times) {
            let layout = crate::layout::SlideLayout { advance_seconds: *t, ..Default::default() };
            db.update_slide(&crate::models::Slide { layout: Some(layout), ..slide }).unwrap();
        }
    }

    #[test]
    fn test_each_slide_can_have_its_own_time_and_the_run_interval_fills_the_gaps() {
        let db = DbManager::new_in_memory().unwrap();
        set_slide_times(&db, 0, &[Some(30), Some(5), None]);
        let mgr = live_on_first_slide(&db);
        assert_eq!(mgr.get_state().total_slides, 3);

        // the first slide stays 30 s, not the run's 10 s
        let run = mgr.start_auto_advance_core(10, false, 0).unwrap().auto_advance.unwrap();
        assert_eq!(run.next_at_ms, 30_000);
        assert_eq!(mgr.auto_advance_tick_core(&db, 29_999).0, AutoAdvanceTick::Waiting);
        assert_eq!(mgr.auto_advance_tick_core(&db, 30_000).0, AutoAdvanceTick::Advanced);
        // the second slide stays 5 s
        assert_eq!(mgr.get_state().auto_advance.unwrap().next_at_ms, 35_000);
        assert_eq!(mgr.auto_advance_tick_core(&db, 35_000).0, AutoAdvanceTick::Advanced);
        // the third has no time of its own, so the run's 10 s applies
        assert_eq!(mgr.get_state().auto_advance.unwrap().next_at_ms, 45_000);
    }

    #[test]
    fn test_moving_to_another_slide_by_hand_restarts_the_countdown_with_that_slides_time() {
        let db = DbManager::new_in_memory().unwrap();
        set_slide_times(&db, 0, &[None, Some(20), None]);
        let mgr = live_on_first_slide(&db);
        mgr.start_auto_advance_core(10, false, 0).unwrap();

        mgr.next_slide_core(&db); // the operator steps to the 20 s slide at t = 4 s
        let (tick, st) = mgr.auto_advance_tick_core(&db, 4_000);
        assert_eq!(tick, AutoAdvanceTick::Waiting);
        assert_eq!(st.auto_advance.unwrap().next_at_ms, 24_000);
        // the old 10 s countdown no longer fires
        assert_eq!(mgr.auto_advance_tick_core(&db, 10_000).0, AutoAdvanceTick::Waiting);
        assert_eq!(mgr.auto_advance_tick_core(&db, 23_999).0, AutoAdvanceTick::Waiting);
        assert_eq!(mgr.auto_advance_tick_core(&db, 24_000).0, AutoAdvanceTick::Advanced);
    }

    #[test]
    fn test_a_slide_time_is_kept_while_paused_and_when_looping() {
        let db = DbManager::new_in_memory().unwrap();
        let total = {
            set_slide_times(&db, 0, &[Some(7); 50]); // every slide stays 7 s
            let probe = live_manager(&db);
            probe.get_state().total_slides
        };
        let mgr = live_manager(&db);
        mgr.start_auto_advance_core(60, true, 0).unwrap();

        mgr.toggle_blackout_core();
        let (_, st) = mgr.auto_advance_tick_core(&db, 7_000);
        assert_eq!(st.auto_advance.unwrap().next_at_ms, 14_000); // pushed back by the slide's 7 s, not 60 s
        mgr.toggle_blackout_core();

        // after the last slide it loops back to the 7 s slide and uses its time again
        let mut now = 14_000;
        let mut looped_at = None;
        for _ in 0..(total + 2) {
            let due = mgr.get_state().auto_advance.unwrap().next_at_ms;
            now = now.max(due);
            if mgr.auto_advance_tick_core(&db, now).0 == AutoAdvanceTick::Looped {
                looped_at = Some(now);
                break;
            }
        }
        let looped_at = looped_at.expect("the run should loop");
        assert_eq!(mgr.get_state().current_slide_index, 0);
        assert_eq!(mgr.get_state().auto_advance.unwrap().next_at_ms, looped_at + 7_000);
    }

    #[test]
    fn test_auto_advance_start_validates_interval_and_needs_a_live_slide() {
        let db = DbManager::new_in_memory().unwrap();
        let idle = PresentationManager::new();
        idle.init_pointers(&db);
        assert!(idle.start_auto_advance_core(5, false, 0).unwrap_err().contains("live"));
        assert!(idle.get_state().auto_advance.is_none());

        let mgr = live_manager(&db);
        for bad in [0, MAX_AUTO_ADVANCE_SECONDS + 1, u32::MAX] {
            assert!(mgr.start_auto_advance_core(bad, false, 0).unwrap_err().contains("between"), "{bad}");
        }
        let st = mgr.start_auto_advance_core(5, true, 1_000).unwrap();
        let run = st.auto_advance.unwrap();
        assert_eq!((run.interval_seconds, run.loop_at_end, run.next_at_ms), (5, true, 6_000));
        assert!(mgr.start_auto_advance_core(MIN_AUTO_ADVANCE_SECONDS, false, 0).is_ok());
        assert!(mgr.start_auto_advance_core(MAX_AUTO_ADVANCE_SECONDS, false, 0).is_ok());
    }

    #[test]
    fn test_starting_again_replaces_the_run_and_stop_clears_it() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = live_manager(&db);
        let first = mgr.start_auto_advance_core(5, false, 0).unwrap().auto_advance.unwrap();
        let second = mgr.start_auto_advance_core(9, true, 0).unwrap().auto_advance.unwrap();
        assert_ne!(first.id, second.id);
        assert_eq!(mgr.auto_advance_run_id(), Some(second.id));
        assert!(mgr.stop_auto_advance_core().auto_advance.is_none());
        assert!(mgr.stop_auto_advance_core().auto_advance.is_none()); // idempotent
        assert_eq!(mgr.auto_advance_run_id(), None);
    }

    #[test]
    fn test_tick_waits_until_due_then_advances_one_slide() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = live_manager(&db);
        mgr.start_auto_advance_core(10, false, 0).unwrap();
        let first = mgr.get_state().current_slide_id.clone();

        assert_eq!(mgr.auto_advance_tick_core(&db, 9_999).0, AutoAdvanceTick::Waiting);
        assert_eq!(mgr.get_state().current_slide_id, first);

        let (tick, st) = mgr.auto_advance_tick_core(&db, 10_000);
        assert_eq!(tick, AutoAdvanceTick::Advanced);
        assert_ne!(st.current_slide_id, first);
        assert_eq!(st.auto_advance.unwrap().next_at_ms, 20_000); // next one a full interval later

        // not due again yet
        assert_eq!(mgr.auto_advance_tick_core(&db, 15_000).0, AutoAdvanceTick::Waiting);
    }

    #[test]
    fn test_tick_without_a_run_is_idle() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = live_manager(&db);
        assert_eq!(mgr.auto_advance_tick_core(&db, i64::MAX).0, AutoAdvanceTick::Idle);
    }

    #[test]
    fn test_it_stops_after_the_last_slide_unless_looping() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = live_manager(&db);
        let total = mgr.get_state().total_slides;
        assert!(total >= 2);

        mgr.start_auto_advance_core(1, false, 0).unwrap();
        let mut now = 1_000;
        let mut advances = 0;
        loop {
            let (tick, _) = mgr.auto_advance_tick_core(&db, now);
            match tick {
                AutoAdvanceTick::Advanced => advances += 1,
                AutoAdvanceTick::Finished => break,
                other => panic!("unexpected {other:?}"),
            }
            now += 1_000;
            assert!(advances <= total, "never-ending run");
        }
        assert!(mgr.get_state().auto_advance.is_none());
        assert_eq!(mgr.get_state().current_slide_index, total - 1); // stayed on the last slide
        assert!(mgr.get_state().is_live);
    }

    #[test]
    fn test_looping_goes_back_to_the_first_slide() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = live_manager(&db);
        let total = mgr.get_state().total_slides;
        mgr.start_auto_advance_core(1, true, 0).unwrap();

        let mut now = 0;
        let mut saw_loop = false;
        for _ in 0..(total + 2) {
            now += 1_000;
            if mgr.auto_advance_tick_core(&db, now).0 == AutoAdvanceTick::Looped {
                saw_loop = true;
                assert_eq!(mgr.get_state().current_slide_index, 0);
                assert!(mgr.get_state().is_live);
            }
        }
        assert!(saw_loop);
        assert!(mgr.get_state().auto_advance.is_some(), "a looping run keeps going");
    }

    #[test]
    fn test_it_pauses_while_blacked_out_or_cleared_and_resumes_afterwards() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = live_manager(&db);
        let start = mgr.get_state().current_slide_id.clone();
        mgr.start_auto_advance_core(10, false, 0).unwrap();

        mgr.toggle_blackout_core();
        let (tick, st) = mgr.auto_advance_tick_core(&db, 10_000);
        assert_eq!(tick, AutoAdvanceTick::Waiting);
        assert_eq!(st.current_slide_id, start); // did not advance behind the blackout
        assert_eq!(st.auto_advance.unwrap().next_at_ms, 20_000); // pushed back a full interval

        mgr.toggle_blackout_core();
        assert_eq!(mgr.auto_advance_tick_core(&db, 20_000).0, AutoAdvanceTick::Advanced);

        mgr.clear_live_core();
        let (tick, _) = mgr.auto_advance_tick_core(&db, 30_000);
        assert_eq!(tick, AutoAdvanceTick::Waiting);
    }

    #[test]
    fn test_clear_all_stops_auto_advance() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = live_manager(&db);
        mgr.start_auto_advance_core(5, true, 0).unwrap();
        assert!(mgr.clear_all_core().auto_advance.is_none());
        assert_eq!(mgr.auto_advance_tick_core(&db, i64::MAX).0, AutoAdvanceTick::Idle);
    }

    #[test]
    fn test_a_stale_tick_cannot_revive_or_change_a_replaced_run() {
        let db = DbManager::new_in_memory().unwrap();
        let mgr = live_manager(&db);
        let old = mgr.start_auto_advance_core(1, false, 0).unwrap().auto_advance.unwrap();
        let newer = mgr.start_auto_advance_core(60, false, 0).unwrap().auto_advance.unwrap();
        assert_ne!(old.id, newer.id);
        // the scheduler for the old run notices it was replaced and exits
        assert_ne!(mgr.auto_advance_run_id().as_deref(), Some(old.id.as_str()));
        // the new run keeps its own schedule
        assert_eq!(mgr.get_state().auto_advance.unwrap().next_at_ms, 60_000);
    }

    #[test]
    fn test_action_bounce_filter_only_drops_quick_repeats_of_the_same_action() {
        let mgr = PresentationManager::new();
        assert!(!mgr.is_action_bounce("next_slide", 1_000)); // first ever
        assert!(mgr.is_action_bounce("next_slide", 1_050)); // same action, 50 ms later
        assert!(!mgr.is_action_bounce("next_slide", 1_200)); // 150 ms after the last one
        assert!(!mgr.is_action_bounce("prev_slide", 1_210)); // a different action is never a bounce
        assert!(!mgr.is_action_bounce("next_slide", 1_220));
        // each manager keeps its own history
        let other = PresentationManager::new();
        assert!(!other.is_action_bounce("next_slide", 1_221));
    }

    fn make_test_slide(pres_id: &str, title: &str) -> crate::models::Slide {
        crate::models::Slide {
            id: String::new(),
            presentation_id: pres_id.into(),
            sort_order: 0,
            title: title.into(),
            body: format!("{title} body"),
            background_color: "#000000".into(),
            foreground_color: "#ffffff".into(),
            font_size: "medium".into(),
            text_alignment: "center".into(),
            theme_override: None,
            background_image: None,
            overlay_color: None,
            line_spacing: None,
            text_shadow: None,
            vertical_alignment: None,
            font_family: None,
            font_weight: None,
            group_label: None,
            group_color: None,
            layout: None,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn test_announcements_layer_runs_independently_and_loops() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_main = db.create_presentation("Sunday Service", "Main", None).unwrap();
        let s_m1 = db.create_slide(&make_test_slide(&pres_main.id, "M1")).unwrap();
        let s_m2 = db.create_slide(&make_test_slide(&pres_main.id, "M2")).unwrap();

        let pres_foyer = db.create_presentation("Foyer Announcements", "Lobby", None).unwrap();
        let s_f1 = db.create_slide(&make_test_slide(&pres_foyer.id, "F1")).unwrap();
        let s_f2 = db.create_slide(&make_test_slide(&pres_foyer.id, "F2")).unwrap();

        let mgr = PresentationManager::new();
        // Start main presentation
        mgr.set_live_slide_core(&db, &pres_main.id, &s_m1.id);
        assert_eq!(mgr.get_state().current_slide_id.as_deref(), Some(s_m1.id.as_str()));
        assert!(mgr.get_state().announcements.is_none());

        // Start announcements layer on foyer output
        let st = mgr.set_announcements_presentation_core(
            &db,
            &pres_foyer.id,
            vec!["output-foyer".to_string()],
            Some(10),
            true,
            1_000,
        ).unwrap();

        let ann = st.announcements.as_ref().unwrap();
        assert_eq!(ann.presentation_id.as_deref(), Some(pres_foyer.id.as_str()));
        assert_eq!(ann.slide_id.as_deref(), Some(s_f1.id.as_str()));
        assert_eq!(ann.target_output_ids, vec!["output-foyer".to_string()]);
        assert_eq!(ann.next_slide.as_ref().unwrap().id, s_f2.id);

        // Advance main presentation -> announcements remain untouched
        mgr.next_slide_core(&db);
        assert_eq!(mgr.get_state().current_slide_id.as_deref(), Some(s_m2.id.as_str()));
        assert_eq!(mgr.get_state().announcements.as_ref().unwrap().slide_id.as_deref(), Some(s_f1.id.as_str()));

        // Advance announcements layer -> main slide remains untouched
        let st2 = mgr.next_announcements_slide_core(&db, 2_000).unwrap();
        assert_eq!(st2.announcements.as_ref().unwrap().slide_id.as_deref(), Some(s_f2.id.as_str()));
        assert_eq!(st2.current_slide_id.as_deref(), Some(s_m2.id.as_str()));

        // Advance announcements layer again -> loops back to F1
        let st3 = mgr.next_announcements_slide_core(&db, 3_000).unwrap();
        assert_eq!(st3.announcements.as_ref().unwrap().slide_id.as_deref(), Some(s_f1.id.as_str()));
        assert_eq!(st3.announcements.as_ref().unwrap().slide_index, 0);

        // Previous announcements layer -> wraps to last slide F2
        let st4 = mgr.previous_announcements_slide_core(&db, 4_000).unwrap();
        assert_eq!(st4.announcements.as_ref().unwrap().slide_id.as_deref(), Some(s_f2.id.as_str()));
        assert_eq!(st4.announcements.as_ref().unwrap().slide_index, 1);
    }

    #[test]
    fn test_announcements_clears_independently_and_with_clear_all() {
        let db = DbManager::new_in_memory().unwrap();
        let pres = db.create_presentation("Lobby", "Announcements", None).unwrap();
        let s1 = db.create_slide(&make_test_slide(&pres.id, "1")).unwrap();

        let mgr = PresentationManager::new();
        mgr.set_live_slide_core(&db, &pres.id, &s1.id);
        mgr.set_announcements_presentation_core(&db, &pres.id, vec!["foyer".to_string()], None, true, 0).unwrap();

        assert!(mgr.get_state().is_live);
        assert!(mgr.get_state().announcements.is_some());

        // Independent clear leaves main presentation live
        let cleared_ann = mgr.clear_announcements_core();
        assert!(cleared_ann.announcements.is_none());
        assert!(cleared_ann.is_live);

        // Clear all clears both
        mgr.set_announcements_presentation_core(&db, &pres.id, vec!["foyer".to_string()], None, true, 0).unwrap();
        let cleared_all = mgr.clear_all_core();
        assert!(!cleared_all.is_live);
        assert!(cleared_all.announcements.is_none());
    }
}
