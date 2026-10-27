use crate::db::DbManager;
use crate::models::{MediaPlaybackState, PresentationState, TimerState};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

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
        let state = self.state.lock().unwrap();
        state.clone()
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
}
