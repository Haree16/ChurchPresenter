use crate::db::DbManager;
use crate::models::{PresentationState, Slide};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverlayRenderPayload {
    pub is_live: bool,
    pub is_blackout: bool,
    pub is_cleared: bool,
    pub slide: Option<Slide>,
    pub item_title: Option<String>,
    pub service_title: Option<String>,
    pub layout_mode: String,
    pub font_family: String,
    pub font_size_px: u32,
    pub text_color: String,
    pub text_shadow: String,
    pub text_alignment: String,
    pub safe_margin_horizontal_pct: f64,
    pub safe_margin_vertical_pct: f64,
    pub show_speaker_label: bool,
    pub show_reference: bool,
}

pub struct OverlayService;

impl OverlayService {
    pub fn get_render_payload(
        db: &DbManager,
        pres_state: &PresentationState,
    ) -> Result<OverlayRenderPayload, String> {
        let config = db.get_overlay_config().unwrap_or_default();

        let mut item_title = None;
        let mut service_title = None;

        if let Some(ref s_id) = pres_state.current_service_id {
            if let Ok(Some(s)) = db.get_service(s_id) {
                service_title = Some(s.title);
            }
        }
        if let Some(ref it_id) = pres_state.current_item_id {
            if let Ok(Some(it)) = db.get_service_item(it_id) {
                item_title = Some(it.title);
            }
        } else if let Some(ref p_id) = pres_state.current_presentation_id {
            if let Ok(Some(p)) = db.get_presentation(p_id) {
                item_title = Some(p.title);
            }
        }

        Ok(OverlayRenderPayload {
            is_live: pres_state.is_live,
            is_blackout: pres_state.is_blackout,
            is_cleared: config.is_cleared,
            slide: if pres_state.is_live && !pres_state.is_blackout && !config.is_cleared {
                pres_state.current_slide.clone()
            } else {
                None
            },
            item_title,
            service_title,
            layout_mode: config.layout_mode,
            font_family: config.font_family,
            font_size_px: config.font_size_px,
            text_color: config.text_color,
            text_shadow: config.text_shadow,
            text_alignment: config.text_alignment,
            safe_margin_horizontal_pct: config.safe_margin_horizontal_pct,
            safe_margin_vertical_pct: config.safe_margin_vertical_pct,
            show_speaker_label: config.show_speaker_label,
            show_reference: config.show_reference,
        })
    }
}
