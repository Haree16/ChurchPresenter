use crate::db::DbManager;
use crate::models::{AudienceAlert, MediaPlaybackState, PresentationState, TimerState};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

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

#[derive(Clone)]
pub struct PresentationManager {
    state: Arc<Mutex<PresentationState>>,
}

impl PresentationManager {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(PresentationState::default())),
        }
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
    /// The audience screen ends up plain black.
    pub fn clear_all_core(&self) -> PresentationState {
        let mut state = self.state.lock().unwrap();
        state.is_live = false;
        state.is_logo = false;
        state.is_blackout = false;
        state.media_playback = None;
        state.alert = None;
        state.clone()
    }

    pub fn clear_all(&self, app: &AppHandle) -> PresentationState {
        let cloned = self.clear_all_core();
        app.emit("presentation:state-changed", &cloned).ok();
        cloned
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
}
