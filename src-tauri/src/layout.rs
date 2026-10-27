//! Per-slide (and per-theme) text layout: safe margin and text outline.
//!
//! Stored as a small JSON value in a `layout` column so later layout features (elements,
//! templates) can extend it without another migration per field.

use serde::{Deserialize, Serialize};

pub const MAX_MARGIN_PCT: f64 = 25.0;
pub const MAX_OUTLINE_WIDTH: f64 = 20.0;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideLayout {
    /// Keep text this far inside every edge, as a percentage of the screen (0-25).
    #[serde(default)]
    pub margin_pct: Option<f64>,
    /// Text outline thickness in points at 1080p (0-20); `None`/0 means no outline.
    #[serde(default)]
    pub outline_width: Option<f64>,
    /// `#rrggbb`; used when `outline_width` is above 0.
    #[serde(default)]
    pub outline_color: Option<String>,
}

fn is_hex_color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

impl SlideLayout {
    /// True when no field would change how a slide looks.
    pub fn is_empty(&self) -> bool {
        self.margin_pct.is_none() && self.outline_width.is_none() && self.outline_color.is_none()
    }
}

/// Checks a layout before it is stored. Colours must be plain hex because they end up in CSS.
pub fn validate_layout(layout: &SlideLayout) -> Result<(), String> {
    if let Some(m) = layout.margin_pct {
        if !m.is_finite() || !(0.0..=MAX_MARGIN_PCT).contains(&m) {
            return Err(format!("Safe margin must be between 0 and {}%.", MAX_MARGIN_PCT));
        }
    }
    if let Some(w) = layout.outline_width {
        if !w.is_finite() || !(0.0..=MAX_OUTLINE_WIDTH).contains(&w) {
            return Err(format!("Outline width must be between 0 and {}.", MAX_OUTLINE_WIDTH));
        }
    }
    if let Some(c) = &layout.outline_color {
        if !is_hex_color(c) {
            return Err("Outline colour must look like #000000.".to_string());
        }
    }
    Ok(())
}

/// JSON for the database column; `None` when there is nothing to store.
pub fn layout_to_json(layout: &Option<SlideLayout>) -> Option<String> {
    layout
        .as_ref()
        .filter(|l| !l.is_empty())
        .and_then(|l| serde_json::to_string(l).ok())
}

/// Reads the column back. Damaged or invalid values are dropped rather than breaking a slide.
pub fn layout_from_json(raw: Option<String>) -> Option<SlideLayout> {
    let layout: SlideLayout = serde_json::from_str(raw?.as_str()).ok()?;
    if layout.is_empty() || validate_layout(&layout).is_err() {
        return None;
    }
    Some(layout)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn layout(margin: Option<f64>, width: Option<f64>, color: Option<&str>) -> SlideLayout {
        SlideLayout { margin_pct: margin, outline_width: width, outline_color: color.map(String::from) }
    }

    #[test]
    fn accepts_values_inside_the_limits_including_the_edges() {
        for l in [
            layout(None, None, None),
            layout(Some(0.0), Some(0.0), Some("#000000")),
            layout(Some(MAX_MARGIN_PCT), Some(MAX_OUTLINE_WIDTH), Some("#FFaa00")),
            layout(Some(5.5), None, None),
        ] {
            assert!(validate_layout(&l).is_ok(), "{l:?}");
        }
    }

    #[test]
    fn rejects_out_of_range_and_non_finite_numbers() {
        for m in [-0.1, 25.1, 100.0, f64::NAN, f64::INFINITY] {
            assert!(validate_layout(&layout(Some(m), None, None)).unwrap_err().contains("margin"), "{m}");
        }
        for w in [-1.0, 20.5, f64::NAN, f64::NEG_INFINITY] {
            assert!(validate_layout(&layout(None, Some(w), None)).unwrap_err().contains("Outline width"), "{w}");
        }
    }

    #[test]
    fn colours_must_be_plain_hex() {
        for c in ["red", "#fff", "#12345g", "#000000;x", "rgb(0,0,0)", "", "url(x)"] {
            assert!(validate_layout(&layout(None, Some(2.0), Some(c))).unwrap_err().contains("Outline colour"), "{c:?}");
        }
    }

    #[test]
    fn empty_layouts_are_not_stored() {
        assert_eq!(layout_to_json(&None), None);
        assert_eq!(layout_to_json(&Some(SlideLayout::default())), None);
        assert!(layout_to_json(&Some(layout(Some(4.0), None, None))).is_some());
    }

    #[test]
    fn json_round_trips_in_camel_case() {
        let l = layout(Some(4.0), Some(3.0), Some("#112233"));
        let json = layout_to_json(&Some(l.clone())).unwrap();
        assert!(json.contains("marginPct") && json.contains("outlineWidth") && json.contains("outlineColor"));
        assert_eq!(layout_from_json(Some(json)), Some(l));
    }

    #[test]
    fn damaged_or_invalid_stored_values_are_ignored() {
        for raw in ["", "not json", "[]", "{\"marginPct\": 99}", "{\"outlineColor\": \"red\"}", "{}", "null"] {
            assert_eq!(layout_from_json(Some(raw.to_string())), None, "{raw:?}");
        }
        assert_eq!(layout_from_json(None), None);
    }

    #[test]
    fn unknown_fields_in_newer_files_are_tolerated() {
        let l = layout_from_json(Some("{\"marginPct\": 3, \"elements\": [], \"future\": true}".into()));
        assert_eq!(l, Some(layout(Some(3.0), None, None)));
    }
}
