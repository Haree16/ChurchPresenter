//! Per-slide (and per-theme) text layout: safe margin and text outline.
//!
//! Stored as a small JSON value in a `layout` column so later layout features (elements,
//! templates) can extend it without another migration per field.

use serde::{Deserialize, Serialize};

pub const MAX_MARGIN_PCT: f64 = 25.0;
pub const MAX_OUTLINE_WIDTH: f64 = 20.0;
pub const MAX_ELEMENTS: usize = 20;
pub const MAX_ELEMENT_TEXT_CHARS: usize = 500;
pub const MAX_ELEMENT_FONT_PCT: f64 = 30.0;

/// An extra box placed on a slide: a text box, an image or a plain shape. Positions and sizes are
/// percentages of the slide, so a slide looks the same on any screen. Later elements draw on top.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideElement {
    pub id: String,
    /// "text", "image" or "shape"
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// Text elements.
    #[serde(default)]
    pub text: Option<String>,
    /// Text size as a percentage of the slide height (1-30).
    #[serde(default)]
    pub font_size_pct: Option<f64>,
    /// `#rrggbb`
    #[serde(default)]
    pub color: Option<String>,
    /// "left", "center" or "right"
    #[serde(default)]
    pub align: Option<String>,
    /// "normal" or "bold"
    #[serde(default)]
    pub weight: Option<String>,
    /// Image elements: a media-library path such as `media/logo.png`.
    #[serde(default)]
    pub image_path: Option<String>,
    /// Shape elements: "rect" or "ellipse".
    #[serde(default)]
    pub shape: Option<String>,
    /// Shape (and text backing) colour, `#rrggbb`.
    #[serde(default)]
    pub fill: Option<String>,
    /// 0 (invisible) to 1 (solid).
    #[serde(default)]
    pub opacity: Option<f64>,
}

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
    /// Extra text boxes, images and shapes, drawn in order (the last one on top).
    #[serde(default)]
    pub elements: Vec<SlideElement>,
}

fn is_hex_color(s: &str) -> bool {
    s.len() == 7 && s.starts_with('#') && s[1..].chars().all(|c| c.is_ascii_hexdigit())
}

impl SlideLayout {
    /// True when no field would change how a slide looks.
    pub fn is_empty(&self) -> bool {
        self.margin_pct.is_none()
            && self.outline_width.is_none()
            && self.outline_color.is_none()
            && self.elements.is_empty()
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
    if layout.elements.len() > MAX_ELEMENTS {
        return Err(format!("A slide can have at most {} extra elements.", MAX_ELEMENTS));
    }
    let mut ids = std::collections::HashSet::new();
    for (i, el) in layout.elements.iter().enumerate() {
        validate_element(el).map_err(|e| format!("Element {}: {}", i + 1, e))?;
        if !ids.insert(el.id.as_str()) {
            return Err(format!("Element {}: duplicate id.", i + 1));
        }
    }
    Ok(())
}

fn in_range(v: f64, lo: f64, hi: f64) -> bool {
    v.is_finite() && v >= lo && v <= hi
}

/// Media-library paths only: relative, under `media/`, no `..`, no URL schemes.
pub fn is_safe_media_path(p: &str) -> bool {
    let p = p.trim();
    p.len() <= 300
        && p.starts_with("media/")
        && !p.contains("..")
        && !p.contains('\\')
        && !p.contains(':')
        && !p.chars().any(|c| c.is_control())
}

pub fn validate_element(el: &SlideElement) -> Result<(), String> {
    if el.id.trim().is_empty() || el.id.len() > 64 {
        return Err("it needs an id.".to_string());
    }
    // geometry: inside the slide, with a visible size
    if !in_range(el.x, 0.0, 100.0) || !in_range(el.y, 0.0, 100.0) {
        return Err("position must be between 0 and 100.".to_string());
    }
    if !in_range(el.w, 1.0, 100.0) || !in_range(el.h, 1.0, 100.0) {
        return Err("size must be between 1 and 100.".to_string());
    }
    if el.x + el.w > 100.0 + 1e-6 || el.y + el.h > 100.0 + 1e-6 {
        return Err("it must stay inside the slide.".to_string());
    }
    if let Some(o) = el.opacity {
        if !in_range(o, 0.0, 1.0) {
            return Err("opacity must be between 0 and 1.".to_string());
        }
    }
    for (label, c) in [("colour", &el.color), ("fill", &el.fill)] {
        if let Some(c) = c {
            if !is_hex_color(c) {
                return Err(format!("{} must look like #ffffff.", label));
            }
        }
    }
    match el.kind.as_str() {
        "text" => {
            let text = el.text.as_deref().unwrap_or("");
            if text.trim().is_empty() {
                return Err("a text box needs some text.".to_string());
            }
            if text.chars().count() > MAX_ELEMENT_TEXT_CHARS {
                return Err(format!("text is too long (maximum {} characters).", MAX_ELEMENT_TEXT_CHARS));
            }
            if let Some(f) = el.font_size_pct {
                if !in_range(f, 1.0, MAX_ELEMENT_FONT_PCT) {
                    return Err(format!("text size must be between 1 and {}.", MAX_ELEMENT_FONT_PCT));
                }
            }
            if let Some(a) = &el.align {
                if !["left", "center", "right"].contains(&a.as_str()) {
                    return Err(format!("unknown alignment '{}'.", a));
                }
            }
            if let Some(w) = &el.weight {
                if !["normal", "bold"].contains(&w.as_str()) {
                    return Err(format!("unknown weight '{}'.", w));
                }
            }
        }
        "image" => {
            let path = el.image_path.as_deref().unwrap_or("");
            if path.trim().is_empty() {
                return Err("an image needs an image.".to_string());
            }
            if !is_safe_media_path(path) {
                return Err("the image must come from the media library.".to_string());
            }
        }
        "shape" => {
            match el.shape.as_deref() {
                Some("rect") | Some("ellipse") => {}
                Some(other) => return Err(format!("unknown shape '{}'.", other)),
                None => return Err("a shape needs a shape type.".to_string()),
            }
            if el.fill.is_none() {
                return Err("a shape needs a fill colour.".to_string());
            }
        }
        other => return Err(format!("unknown type '{}'.", other)),
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
        SlideLayout { margin_pct: margin, outline_width: width, outline_color: color.map(String::from), ..Default::default() }
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

    fn text_el(id: &str) -> SlideElement {
        SlideElement {
            id: id.into(), kind: "text".into(), x: 10.0, y: 10.0, w: 40.0, h: 20.0,
            text: Some("Welcome".into()), font_size_pct: Some(8.0), color: Some("#ffffff".into()),
            align: Some("center".into()), weight: Some("bold".into()),
            image_path: None, shape: None, fill: None, opacity: None,
        }
    }
    fn image_el(id: &str, path: &str) -> SlideElement {
        SlideElement { kind: "image".into(), text: None, font_size_pct: None, color: None, align: None, weight: None, image_path: Some(path.into()), ..text_el(id) }
    }
    fn shape_el(id: &str, shape: &str) -> SlideElement {
        SlideElement { kind: "shape".into(), text: None, font_size_pct: None, color: None, align: None, weight: None, shape: Some(shape.into()), fill: Some("#3b82f6".into()), ..text_el(id) }
    }
    fn with(els: Vec<SlideElement>) -> SlideLayout {
        SlideLayout { elements: els, ..Default::default() }
    }

    #[test]
    fn valid_elements_of_every_kind_pass() {
        let l = with(vec![text_el("a"), image_el("b", "media/logo.png"), shape_el("c", "rect"), shape_el("d", "ellipse")]);
        assert!(validate_layout(&l).is_ok());
        assert!(!l.is_empty());
        // edges: full-slide box, opacity bounds
        let full = SlideElement { x: 0.0, y: 0.0, w: 100.0, h: 100.0, opacity: Some(0.0), ..text_el("e") };
        assert!(validate_layout(&with(vec![full])).is_ok());
    }

    #[test]
    fn geometry_must_stay_inside_the_slide() {
        let bad = |f: &dyn Fn(&mut SlideElement)| {
            let mut e = text_el("a");
            f(&mut e);
            validate_layout(&with(vec![e])).unwrap_err()
        };
        assert!(bad(&|e| e.x = -1.0).contains("position"));
        assert!(bad(&|e| e.y = 100.5).contains("position"));
        assert!(bad(&|e| e.w = 0.5).contains("size"));
        assert!(bad(&|e| e.h = 101.0).contains("size"));
        assert!(bad(&|e| { e.x = 70.0; e.w = 40.0; }).contains("inside the slide"));
        assert!(bad(&|e| { e.y = 95.0; e.h = 10.0; }).contains("inside the slide"));
        for v in [f64::NAN, f64::INFINITY] {
            assert!(bad(&|e| e.x = v).contains("position"));
            assert!(bad(&|e| e.w = v).contains("size"));
        }
        assert!(bad(&|e| e.opacity = Some(1.1)).contains("opacity"));
        assert!(bad(&|e| e.opacity = Some(f64::NAN)).contains("opacity"));
        // errors say which element
        assert!(bad(&|e| e.x = -1.0).starts_with("Element 1:"));
    }

    #[test]
    fn text_elements_need_text_and_sane_options() {
        let bad = |f: &dyn Fn(&mut SlideElement)| {
            let mut e = text_el("a");
            f(&mut e);
            validate_layout(&with(vec![e])).unwrap_err()
        };
        assert!(bad(&|e| e.text = None).contains("needs some text"));
        assert!(bad(&|e| e.text = Some("  \n".into())).contains("needs some text"));
        assert!(bad(&|e| e.text = Some("x".repeat(MAX_ELEMENT_TEXT_CHARS + 1))).contains("too long"));
        assert!(validate_layout(&with(vec![SlideElement { text: Some("x".repeat(MAX_ELEMENT_TEXT_CHARS)), ..text_el("a") }])).is_ok());
        assert!(bad(&|e| e.font_size_pct = Some(0.5)).contains("text size"));
        assert!(bad(&|e| e.font_size_pct = Some(31.0)).contains("text size"));
        assert!(bad(&|e| e.align = Some("justify".into())).contains("alignment"));
        assert!(bad(&|e| e.weight = Some("900".into())).contains("weight"));
        assert!(bad(&|e| e.color = Some("red".into())).contains("colour"));
        assert!(bad(&|e| e.fill = Some("#fff".into())).contains("fill"));
    }

    #[test]
    fn images_must_come_from_the_media_library() {
        for ok in ["media/logo.png", "media/themes/a.png", "media/sub dir/x.jpg"] {
            assert!(validate_layout(&with(vec![image_el("a", ok)])).is_ok(), "{ok}");
        }
        for bad in [
            "", "  ", "logo.png", "/etc/passwd", "../media/x.png", "media/../../etc/passwd", "media/a/../b.png",
            "http://evil/x.png", "https://evil/x.png", "data:image/png;base64,AAAA", "javascript:alert(1)",
            "file:///etc/passwd", "C:\\x.png", "media\\x.png", "media/x\n.png", &format!("media/{}", "a".repeat(300)),
        ] {
            assert!(validate_layout(&with(vec![image_el("a", bad)])).is_err(), "{bad:?} must be rejected");
        }
    }

    #[test]
    fn shapes_need_a_known_type_and_a_fill() {
        assert!(validate_layout(&with(vec![SlideElement { shape: Some("star".into()), ..shape_el("a", "rect") }])).unwrap_err().contains("unknown shape"));
        assert!(validate_layout(&with(vec![SlideElement { shape: None, ..shape_el("a", "rect") }])).unwrap_err().contains("shape type"));
        assert!(validate_layout(&with(vec![SlideElement { fill: None, ..shape_el("a", "rect") }])).unwrap_err().contains("fill colour"));
    }

    #[test]
    fn unknown_kinds_blank_or_duplicate_ids_and_too_many_elements_are_rejected() {
        assert!(validate_layout(&with(vec![SlideElement { kind: "video".into(), ..text_el("a") }])).unwrap_err().contains("unknown type"));
        assert!(validate_layout(&with(vec![text_el(" ")])).unwrap_err().contains("id"));
        assert!(validate_layout(&with(vec![text_el(&"x".repeat(65))])).unwrap_err().contains("id"));
        assert!(validate_layout(&with(vec![text_el("a"), text_el("a")])).unwrap_err().contains("duplicate id"));
        let many: Vec<SlideElement> = (0..=MAX_ELEMENTS).map(|i| text_el(&format!("e{i}"))).collect();
        assert!(validate_layout(&with(many)).unwrap_err().contains("at most"));
        let max: Vec<SlideElement> = (0..MAX_ELEMENTS).map(|i| text_el(&format!("e{i}"))).collect();
        assert!(validate_layout(&with(max)).is_ok());
    }

    #[test]
    fn elements_round_trip_in_order_and_old_layouts_without_them_still_load() {
        let l = SlideLayout { margin_pct: Some(4.0), elements: vec![shape_el("a", "rect"), text_el("b")], ..Default::default() };
        let json = layout_to_json(&Some(l.clone())).unwrap();
        assert!(json.contains("\"elements\"") && json.contains("fontSizePct"));
        let back = layout_from_json(Some(json)).unwrap();
        assert_eq!(back, l);
        assert_eq!(back.elements[1].id, "b"); // order (= stacking) preserved

        assert_eq!(layout_from_json(Some("{\"marginPct\": 4}".into())).unwrap().elements.len(), 0);
        // elements alone make a layout non-empty and storable
        assert!(layout_to_json(&Some(with(vec![text_el("a")]))).is_some());
    }

    #[test]
    fn a_stored_layout_with_a_hostile_element_is_dropped_on_read() {
        let mut l = with(vec![image_el("a", "media/ok.png")]);
        l.elements[0].image_path = Some("http://evil/x.png".into());
        let raw = serde_json::to_string(&l).unwrap();
        assert_eq!(layout_from_json(Some(raw)), None);
    }
}
