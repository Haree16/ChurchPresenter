//! Stage display layouts: which panels the stage monitor shows and where.
//!
//! A layout is a list of panels positioned in percent of the stage screen. An empty list means
//! "use the classic layout", so stage screens look exactly as before until a layout is designed.

use serde::{Deserialize, Serialize};

pub const MAX_PANELS: usize = 8;
pub const MAX_PANEL_FONT_PCT: f64 = 30.0;

/// The things a stage panel can show. Each may appear once per layout.
pub const PANEL_KINDS: [&str; 8] = ["current", "next", "clock", "timer", "message", "status", "notes", "multiviewer"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagePanel {
    pub id: String,
    /// One of `PANEL_KINDS`.
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// Text size as a percentage of the stage height (1-30); `None` uses the panel's default.
    #[serde(default)]
    pub font_size_pct: Option<f64>,
}

fn in_range(v: f64, lo: f64, hi: f64) -> bool {
    v.is_finite() && v >= lo && v <= hi
}

pub fn validate_panels(panels: &[StagePanel]) -> Result<(), String> {
    if panels.len() > MAX_PANELS {
        return Err(format!("A stage layout can have at most {} panels.", MAX_PANELS));
    }
    let mut kinds = std::collections::HashSet::new();
    let mut ids = std::collections::HashSet::new();
    for (i, p) in panels.iter().enumerate() {
        let ctx = |e: &str| format!("Panel {}: {}", i + 1, e);
        if p.id.trim().is_empty() || p.id.len() > 64 {
            return Err(ctx("it needs an id."));
        }
        if !ids.insert(p.id.as_str()) {
            return Err(ctx("duplicate id."));
        }
        if !PANEL_KINDS.contains(&p.kind.as_str()) {
            return Err(ctx(&format!("unknown panel '{}'.", p.kind)));
        }
        if !kinds.insert(p.kind.as_str()) {
            return Err(ctx(&format!("the {} panel is already in the layout.", p.kind)));
        }
        if !in_range(p.x, 0.0, 100.0) || !in_range(p.y, 0.0, 100.0) {
            return Err(ctx("position must be between 0 and 100."));
        }
        if !in_range(p.w, 2.0, 100.0) || !in_range(p.h, 2.0, 100.0) {
            return Err(ctx("size must be between 2 and 100."));
        }
        if p.x + p.w > 100.0 + 1e-6 || p.y + p.h > 100.0 + 1e-6 {
            return Err(ctx("it must stay inside the screen."));
        }
        if let Some(f) = p.font_size_pct {
            if !in_range(f, 1.0, MAX_PANEL_FONT_PCT) {
                return Err(ctx(&format!("text size must be between 1 and {}.", MAX_PANEL_FONT_PCT)));
            }
        }
    }
    Ok(())
}

/// JSON for the database column; `None` for an empty layout (the classic one).
pub fn panels_to_json(panels: &[StagePanel]) -> Option<String> {
    if panels.is_empty() {
        None
    } else {
        serde_json::to_string(panels).ok()
    }
}

/// Reads the column back. A damaged or invalid value means "classic layout", never a broken screen.
pub fn panels_from_json(raw: Option<String>) -> Vec<StagePanel> {
    let Some(raw) = raw else { return Vec::new() };
    match serde_json::from_str::<Vec<StagePanel>>(&raw) {
        Ok(panels) if validate_panels(&panels).is_ok() => panels,
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn panel(id: &str, kind: &str) -> StagePanel {
        StagePanel { id: id.into(), kind: kind.into(), x: 0.0, y: 0.0, w: 50.0, h: 50.0, font_size_pct: None }
    }

    #[test]
    fn every_kind_is_accepted_once() {
        let all: Vec<StagePanel> = PANEL_KINDS.iter().map(|k| panel(k, k)).collect();
        assert_eq!(all.len(), MAX_PANELS);
        assert!(validate_panels(&all).is_ok());
        assert!(validate_panels(&[]).is_ok());
    }

    #[test]
    fn rejects_unknown_duplicate_and_too_many_panels() {
        assert!(validate_panels(&[panel("a", "video")]).unwrap_err().contains("unknown panel"));
        assert!(validate_panels(&[panel("a", "current"), panel("b", "current")]).unwrap_err().contains("already in the layout"));
        assert!(validate_panels(&[panel("a", "current"), panel("a", "next")]).unwrap_err().contains("duplicate id"));
        assert!(validate_panels(&[panel(" ", "current")]).unwrap_err().contains("id"));
        assert!(validate_panels(&[panel(&"x".repeat(65), "current")]).unwrap_err().contains("id"));
        let mut many: Vec<StagePanel> = PANEL_KINDS.iter().map(|k| panel(k, k)).collect();
        many.push(panel("extra", "current"));
        assert!(validate_panels(&many).unwrap_err().contains("at most"));
    }

    #[test]
    fn geometry_must_stay_on_screen() {
        let bad = |f: &dyn Fn(&mut StagePanel)| {
            let mut p = panel("a", "current");
            f(&mut p);
            validate_panels(&[p]).unwrap_err()
        };
        assert!(bad(&|p| p.x = -1.0).contains("position"));
        assert!(bad(&|p| p.y = 100.5).contains("position"));
        assert!(bad(&|p| p.w = 1.0).contains("size"));
        assert!(bad(&|p| p.h = 101.0).contains("size"));
        assert!(bad(&|p| { p.x = 60.0; p.w = 50.0; }).contains("inside the screen"));
        assert!(bad(&|p| { p.y = 60.0; p.h = 50.0; }).contains("inside the screen"));
        for v in [f64::NAN, f64::INFINITY] {
            assert!(bad(&|p| p.x = v).contains("position"));
            assert!(bad(&|p| p.w = v).contains("size"));
        }
        assert!(bad(&|p| p.font_size_pct = Some(0.5)).contains("text size"));
        assert!(bad(&|p| p.font_size_pct = Some(31.0)).contains("text size"));
        assert!(bad(&|p| p.font_size_pct = Some(f64::NAN)).contains("text size"));
        assert!(bad(&|p| p.kind = "nope".into()).starts_with("Panel 1:"));
        // full screen and the font limits themselves are fine
        let full = StagePanel { x: 0.0, y: 0.0, w: 100.0, h: 100.0, font_size_pct: Some(30.0), ..panel("a", "current") };
        assert!(validate_panels(&[full]).is_ok());
    }

    #[test]
    fn json_round_trips_in_camel_case_and_empty_is_not_stored() {
        assert_eq!(panels_to_json(&[]), None);
        let panels = vec![StagePanel { font_size_pct: Some(8.0), ..panel("a", "current") }, panel("b", "clock")];
        let json = panels_to_json(&panels).unwrap();
        assert!(json.contains("fontSizePct"));
        assert_eq!(panels_from_json(Some(json)), panels); // order kept
        assert_eq!(panels_from_json(None), Vec::new());
    }

    #[test]
    fn damaged_or_invalid_stored_layouts_fall_back_to_the_classic_layout() {
        for raw in ["", "garbage", "{}", "[1,2]", "[{\"id\":\"a\",\"kind\":\"video\",\"x\":0,\"y\":0,\"w\":10,\"h\":10}]"] {
            assert_eq!(panels_from_json(Some(raw.to_string())), Vec::new(), "{raw:?}");
        }
        // valid JSON but invalid geometry
        let bad = serde_json::to_string(&vec![StagePanel { x: 99.0, ..panel("a", "current") }]).unwrap();
        assert_eq!(panels_from_json(Some(bad)), Vec::new());
    }
}
