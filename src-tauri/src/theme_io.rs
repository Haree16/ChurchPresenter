//! Portable themes: export to / import from a single `.cptheme` file.
//!
//! The file carries every setting of a theme plus its background image (embedded), so a theme
//! looks the same on another machine. Fonts cannot be embedded; import reports which fonts a
//! theme asks for so the app can warn when one is missing.
//!
//! Files come from other people, so import validates every value before anything is stored:
//! colours, fonts and shadows end up in CSS, and images are checked by content, not file name.

use crate::db::DbManager;
use crate::layout::{validate_layout, SlideLayout};
use crate::models::Theme;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const BUNDLE_FORMAT: &str = "church-presenter-theme";
pub const BUNDLE_VERSION: u32 = 1;
pub const MAX_BUNDLE_THEMES: usize = 50;
pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_BUNDLE_FILE_BYTES: u64 = 150 * 1024 * 1024;
const MAX_NAME_CHARS: usize = 60;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeBundle {
    pub format: String,
    pub version: u32,
    #[serde(default)]
    pub exported_at: String,
    #[serde(default)]
    pub app: String,
    pub themes: Vec<BundleTheme>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleImage {
    /// "png", "jpg", "webp" or "gif"
    pub extension: String,
    pub data_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BundleTheme {
    pub name: String,
    pub background_color: String,
    pub background_mode: String,
    pub font_family: String,
    pub font_size: String,
    pub font_weight: String,
    pub text_color: String,
    pub text_alignment: String,
    pub vertical_alignment: String,
    pub line_spacing: f64,
    pub text_margin: i32,
    #[serde(default)]
    pub text_shadow: Option<String>,
    #[serde(default)]
    pub overlay_color: Option<String>,
    #[serde(default)]
    pub layout: Option<SlideLayout>,
    #[serde(default)]
    pub background_image: Option<BundleImage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeExportResult {
    pub count: usize,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeImportResult {
    pub imported: Vec<Theme>,
    pub warnings: Vec<String>,
    /// Font families the imported themes use (generic ones excluded), so the UI can check they exist.
    pub fonts: Vec<String>,
}

// ------------------------------------------------------------------ validation

fn is_hex_digits(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_hexdigit())
}

/// `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb(r,g,b)` or `rgba(r,g,b,a)`. Nothing else, so a
/// colour can never smuggle other CSS into a style attribute.
pub fn is_safe_css_color(value: &str) -> bool {
    let s = value.trim();
    if let Some(hex) = s.strip_prefix('#') {
        return matches!(hex.len(), 3 | 4 | 6 | 8) && is_hex_digits(hex);
    }
    let (inner, with_alpha) = if let Some(rest) = s.strip_prefix("rgba(") {
        (rest, true)
    } else if let Some(rest) = s.strip_prefix("rgb(") {
        (rest, false)
    } else {
        return false;
    };
    let Some(inner) = inner.strip_suffix(')') else { return false };
    let parts: Vec<&str> = inner.split(',').map(|p| p.trim()).collect();
    if parts.len() != if with_alpha { 4 } else { 3 } {
        return false;
    }
    let channels_ok = parts[..3].iter().all(|p| p.parse::<u16>().map_or(false, |n| n <= 255));
    let alpha_ok = !with_alpha
        || parts[3].parse::<f64>().map_or(false, |a| (0.0..=1.0).contains(&a) && !parts[3].contains(['e', 'E']));
    channels_ok && alpha_ok
}

fn is_safe_font_family(s: &str) -> bool {
    !s.trim().is_empty()
        && s.chars().count() <= 200
        // Non-ASCII printable characters are fine (Tamil vowel signs are not "alphanumeric", but
        // CSS syntax only uses ASCII punctuation, so they cannot carry anything harmful).
        && s.chars().all(|c| {
            c.is_alphanumeric()
                || (!c.is_ascii() && !c.is_control() && !c.is_whitespace())
                || matches!(c, ' ' | ',' | '\'' | '"' | '-' | '_' | '.')
        })
}

fn is_safe_text_shadow(s: &str) -> bool {
    let t = s.trim();
    if t.chars().count() > 200 || t.to_lowercase().contains("url") {
        return false;
    }
    let mut depth = 0i32;
    for c in t.chars() {
        match c {
            '(' => depth += 1,
            ')' => depth -= 1,
            c if c.is_ascii_alphanumeric() || matches!(c, ' ' | '#' | '%' | '.' | ',' | '-' | '+') => {}
            _ => return false,
        }
        if depth < 0 {
            return false;
        }
    }
    depth == 0
}

fn one_of(value: &str, allowed: &[&str], what: &str) -> Result<(), String> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        Err(format!("Unknown {} '{}'.", what, value))
    }
}

pub fn validate_bundle_theme(t: &BundleTheme) -> Result<(), String> {
    let name = t.name.trim();
    if name.is_empty() {
        return Err("A theme in the file has no name.".to_string());
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(format!("Theme name '{}…' is too long.", name.chars().take(20).collect::<String>()));
    }
    let ctx = |e: String| format!("Theme '{}': {}", name, e);

    for (label, color) in [("background colour", &t.background_color), ("text colour", &t.text_color)] {
        if !is_safe_css_color(color) {
            return Err(ctx(format!("invalid {}.", label)));
        }
    }
    if let Some(c) = &t.overlay_color {
        if !is_safe_css_color(c) {
            return Err(ctx("invalid overlay colour.".to_string()));
        }
    }
    if !is_safe_font_family(&t.font_family) {
        return Err(ctx("invalid font name.".to_string()));
    }
    if let Some(s) = &t.text_shadow {
        if !is_safe_text_shadow(s) {
            return Err(ctx("invalid text shadow.".to_string()));
        }
    }
    one_of(&t.font_size, &["small", "medium", "large", "xlarge"], "font size").map_err(ctx)?;
    one_of(&t.font_weight, &["normal", "bold"], "font weight").map_err(ctx)?;
    one_of(&t.text_alignment, &["left", "center", "right"], "text alignment").map_err(ctx)?;
    one_of(&t.vertical_alignment, &["top", "center", "bottom"], "vertical alignment").map_err(ctx)?;
    one_of(&t.background_mode, &["cover", "contain", "stretch"], "background mode").map_err(ctx)?;
    if !t.line_spacing.is_finite() || !(0.8..=3.0).contains(&t.line_spacing) {
        return Err(ctx("line spacing must be between 0.8 and 3.".to_string()));
    }
    if !(0..=200).contains(&t.text_margin) {
        return Err(ctx("text margin is out of range.".to_string()));
    }
    if let Some(l) = &t.layout {
        validate_layout(l).map_err(ctx)?;
    }
    Ok(())
}

// ------------------------------------------------------------------ images

/// File extension for the image types a theme may embed, decided from the bytes themselves.
pub fn sniff_image_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("gif")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

fn decode_image(img: &BundleImage, theme_name: &str) -> Result<(Vec<u8>, &'static str), String> {
    // base64 is ~4/3 the size of the bytes; refuse before decoding something huge
    if img.data_base64.len() > MAX_IMAGE_BYTES / 3 * 4 + 16 {
        return Err(format!("Theme '{}': background image is larger than {} MB.", theme_name, MAX_IMAGE_BYTES / 1_048_576));
    }
    let bytes = STANDARD
        .decode(img.data_base64.trim())
        .map_err(|_| format!("Theme '{}': background image data is damaged.", theme_name))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(format!("Theme '{}': background image is larger than {} MB.", theme_name, MAX_IMAGE_BYTES / 1_048_576));
    }
    let ext = sniff_image_extension(&bytes)
        .ok_or_else(|| format!("Theme '{}': background is not a PNG, JPG, GIF or WEBP image.", theme_name))?;
    Ok((bytes, ext))
}

/// The theme's background image file, if it exists inside the app data folder.
fn theme_image_path(theme: &Theme, app_data_dir: &Path) -> Option<PathBuf> {
    let rel = theme.background_image_path.as_deref()?.trim();
    if rel.is_empty() {
        return None;
    }
    let candidate = if Path::new(rel).is_absolute() { PathBuf::from(rel) } else { app_data_dir.join(rel) };
    let canonical = fs::canonicalize(candidate).ok()?;
    let root = fs::canonicalize(app_data_dir).ok()?;
    // never embed files from outside the app's own data folder
    canonical.starts_with(root).then_some(canonical)
}

// ------------------------------------------------------------------ export

pub fn build_bundle(
    db: &DbManager,
    theme_ids: &[String],
    app_data_dir: &Path,
) -> Result<(ThemeBundle, Vec<String>), String> {
    if theme_ids.is_empty() {
        return Err("Choose at least one theme to export.".to_string());
    }
    let mut warnings = Vec::new();
    let mut themes = Vec::new();

    for id in theme_ids {
        let theme = db
            .get_theme(id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "A selected theme no longer exists.".to_string())?;

        let background_image = match theme_image_path(&theme, app_data_dir) {
            Some(path) => {
                let bytes = fs::read(&path).map_err(|e| format!("Could not read the background of '{}': {}", theme.name, e))?;
                match sniff_image_extension(&bytes) {
                    Some(ext) if bytes.len() <= MAX_IMAGE_BYTES => {
                        Some(BundleImage { extension: ext.to_string(), data_base64: STANDARD.encode(&bytes) })
                    }
                    Some(_) => {
                        warnings.push(format!("'{}': background image is over {} MB and was left out.", theme.name, MAX_IMAGE_BYTES / 1_048_576));
                        None
                    }
                    None => {
                        warnings.push(format!("'{}': background is not a PNG, JPG, GIF or WEBP image and was left out.", theme.name));
                        None
                    }
                }
            }
            None => {
                if theme.background_image_path.as_deref().map_or(false, |p| !p.trim().is_empty()) {
                    warnings.push(format!("'{}': its background image file was not found and was left out.", theme.name));
                }
                None
            }
        };

        themes.push(BundleTheme {
            name: theme.name.clone(),
            background_color: theme.background_color.clone(),
            background_mode: theme.background_mode.clone(),
            font_family: theme.font_family.clone(),
            font_size: theme.font_size.clone(),
            font_weight: theme.font_weight.clone(),
            text_color: theme.text_color.clone(),
            text_alignment: theme.text_alignment.clone(),
            vertical_alignment: theme.vertical_alignment.clone(),
            line_spacing: theme.line_spacing,
            text_margin: theme.text_margin,
            text_shadow: theme.text_shadow.clone(),
            overlay_color: theme.overlay_color.clone(),
            layout: theme.layout.clone(),
            background_image,
        });
    }

    Ok((
        ThemeBundle {
            format: BUNDLE_FORMAT.to_string(),
            version: BUNDLE_VERSION,
            exported_at: chrono::Utc::now().to_rfc3339(),
            app: "ChurchPresenter".to_string(),
            themes,
        },
        warnings,
    ))
}

pub fn export_themes_to_file(
    db: &DbManager,
    theme_ids: &[String],
    app_data_dir: &Path,
    dest: &Path,
) -> Result<ThemeExportResult, String> {
    let (bundle, warnings) = build_bundle(db, theme_ids, app_data_dir)?;
    let json = serde_json::to_string_pretty(&bundle).map_err(|e| e.to_string())?;
    fs::write(dest, json).map_err(|e| format!("Could not write {}: {}", dest.display(), e))?;
    Ok(ThemeExportResult { count: bundle.themes.len(), warnings })
}

// ------------------------------------------------------------------ import

pub fn parse_bundle(raw: &str) -> Result<ThemeBundle, String> {
    let bundle: ThemeBundle = serde_json::from_str(raw.trim_start_matches('\u{feff}'))
        .map_err(|_| "This is not a Church Presenter theme file.".to_string())?;
    if bundle.format != BUNDLE_FORMAT {
        return Err("This is not a Church Presenter theme file.".to_string());
    }
    if bundle.version > BUNDLE_VERSION {
        return Err("This theme file was made by a newer version of Church Presenter. Update the app to import it.".to_string());
    }
    if bundle.themes.is_empty() {
        return Err("The theme file contains no themes.".to_string());
    }
    if bundle.themes.len() > MAX_BUNDLE_THEMES {
        return Err(format!("The theme file has too many themes (maximum {}).", MAX_BUNDLE_THEMES));
    }
    Ok(bundle)
}

fn unique_name(wanted: &str, taken: &[String]) -> String {
    let wanted = wanted.trim();
    let is_taken = |n: &str| taken.iter().any(|t| t.eq_ignore_ascii_case(n));
    if !is_taken(wanted) {
        return wanted.to_string();
    }
    (2..)
        .map(|n| format!("{} ({})", wanted, n))
        .find(|candidate| !is_taken(candidate))
        .expect("an unused name always exists")
}

fn is_generic_font(name: &str) -> bool {
    matches!(
        name.to_lowercase().as_str(),
        "serif" | "sans-serif" | "monospace" | "cursive" | "fantasy" | "system-ui" | "ui-serif"
            | "ui-sans-serif" | "ui-monospace" | "ui-rounded" | "math" | "emoji" | "fangsong"
            | "-apple-system" | "blinkmacsystemfont" | "inherit" | "initial"
    )
}

/// Named (non-generic) font families in a CSS font-family list.
pub fn named_fonts(font_family: &str) -> Vec<String> {
    font_family
        .split(',')
        .map(|f| f.trim().trim_matches(|c| c == '"' || c == '\'').trim().to_string())
        .filter(|f| !f.is_empty() && !is_generic_font(f))
        .collect()
}

/// Validates the whole bundle first, then stores its themes as new custom themes. Nothing is
/// stored if any theme is invalid. Name clashes are resolved by renaming the imported theme.
pub fn import_bundle(db: &DbManager, bundle: &ThemeBundle, app_data_dir: &Path) -> Result<ThemeImportResult, String> {
    // 1. validate everything, decode every image
    let mut decoded: Vec<Option<(Vec<u8>, &'static str)>> = Vec::new();
    for t in &bundle.themes {
        validate_bundle_theme(t)?;
        decoded.push(match &t.background_image {
            Some(img) => Some(decode_image(img, t.name.trim())?),
            None => None,
        });
    }

    // 2. store
    let mut taken: Vec<String> = db.list_themes().map_err(|e| e.to_string())?.into_iter().map(|t| t.name).collect();
    let image_dir = app_data_dir.join("media").join("themes");
    let mut written: Vec<PathBuf> = Vec::new();
    let mut imported = Vec::new();
    let mut warnings = Vec::new();
    let mut fonts: Vec<String> = Vec::new();

    let result: Result<(), String> = (|| {
        for (t, image) in bundle.themes.iter().zip(decoded.iter()) {
            let name = unique_name(&t.name, &taken);
            if name != t.name.trim() {
                warnings.push(format!("'{}' already exists, so it was imported as '{}'.", t.name.trim(), name));
            }
            taken.push(name.clone());

            let image_path = match image {
                Some((bytes, ext)) => {
                    fs::create_dir_all(&image_dir).map_err(|e| format!("Could not create the themes folder: {}", e))?;
                    let file = image_dir.join(format!("{}.{}", Uuid::new_v4(), ext));
                    fs::write(&file, bytes).map_err(|e| format!("Could not save a background image: {}", e))?;
                    written.push(file.clone());
                    Some(format!("media/themes/{}", file.file_name().and_then(|n| n.to_str()).unwrap_or("")))
                }
                None => None,
            };

            for f in named_fonts(&t.font_family) {
                if !fonts.iter().any(|x| x.eq_ignore_ascii_case(&f)) {
                    fonts.push(f);
                }
            }

            let now = chrono::Utc::now().to_rfc3339();
            let theme = db
                .create_theme(&Theme {
                    id: String::new(),
                    name,
                    is_built_in: false,
                    background_color: t.background_color.trim().to_string(),
                    background_image_id: None,
                    background_image_path: image_path,
                    background_mode: t.background_mode.clone(),
                    font_family: t.font_family.trim().to_string(),
                    font_size: t.font_size.clone(),
                    font_weight: t.font_weight.clone(),
                    text_color: t.text_color.trim().to_string(),
                    text_alignment: t.text_alignment.clone(),
                    vertical_alignment: t.vertical_alignment.clone(),
                    line_spacing: t.line_spacing,
                    text_margin: t.text_margin,
                    text_shadow: t.text_shadow.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                    overlay_color: t.overlay_color.as_ref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
                    layout: t.layout.clone().filter(|l| !l.is_empty()),
                    created_at: now.clone(),
                    updated_at: now,
                })
                .map_err(|e| e.to_string())?;
            imported.push(theme);
        }
        Ok(())
    })();

    if let Err(e) = result {
        // undo: remove the images and themes created so far
        for f in &written {
            let _ = fs::remove_file(f);
        }
        for t in &imported {
            let _ = db.delete_theme(&t.id);
        }
        return Err(e);
    }

    Ok(ThemeImportResult { imported, warnings, fonts })
}

pub fn import_themes_from_file(db: &DbManager, src: &Path, app_data_dir: &Path) -> Result<ThemeImportResult, String> {
    let meta = fs::metadata(src).map_err(|_| "The selected file could not be read.".to_string())?;
    if !meta.is_file() {
        return Err("The selected item is not a file.".to_string());
    }
    if meta.len() > MAX_BUNDLE_FILE_BYTES {
        return Err("That file is too large to be a theme file.".to_string());
    }
    let raw = fs::read_to_string(src).map_err(|_| "This is not a Church Presenter theme file.".to_string())?;
    let bundle = parse_bundle(&raw)?;
    import_bundle(db, &bundle, app_data_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    fn tmp(label: &str) -> PathBuf {
        let p = std::env::temp_dir().join(format!("cp-theme-{}-{}", label, Uuid::new_v4()));
        fs::create_dir_all(&p).unwrap();
        p
    }

    fn bundle_theme() -> BundleTheme {
        BundleTheme {
            name: "Sunrise".into(),
            background_color: "#0a0f1d".into(),
            background_mode: "cover".into(),
            font_family: "\"Noto Sans Tamil\", system-ui, sans-serif".into(),
            font_size: "large".into(),
            font_weight: "bold".into(),
            text_color: "#ffffff".into(),
            text_alignment: "center".into(),
            vertical_alignment: "center".into(),
            line_spacing: 1.4,
            text_margin: 24,
            text_shadow: Some("0 2px 8px rgba(0,0,0,0.8)".into()),
            overlay_color: Some("rgba(0, 0, 0, 0.25)".into()),
            layout: Some(SlideLayout { margin_pct: Some(5.0), outline_width: Some(2.0), outline_color: Some("#000000".into()) }),
            background_image: None,
        }
    }

    fn bundle_of(themes: Vec<BundleTheme>) -> ThemeBundle {
        ThemeBundle { format: BUNDLE_FORMAT.into(), version: BUNDLE_VERSION, exported_at: String::new(), app: String::new(), themes }
    }

    #[test]
    fn css_colours_accept_hex_and_rgb_forms_only() {
        for ok in ["#fff", "#ffff", "#ffffff", "#FFFFFFaa", "rgb(0,0,0)", "rgb( 255 , 128 , 0 )", "rgba(0,0,0,0.25)", "rgba(0, 0, 0, .5)", "rgba(0,0,0,1)", "rgba(0,0,0,0)"] {
            assert!(is_safe_css_color(ok), "{ok}");
        }
        for bad in [
            "red", "", "#ff", "#fffff", "#gggggg", "rgb(256,0,0)", "rgb(0,0)", "rgba(0,0,0)", "rgba(0,0,0,1.5)",
            "rgba(0,0,0,1e0)", "rgb(0,0,0);x", "#fff;background:url(x)", "url(x)", "var(--x)",
            "rgba(-1,0,0,1)", "rgb(0,0,0))",
        ] {
            assert!(!is_safe_css_color(bad), "{bad:?} must be rejected");
        }
        // surrounding whitespace is trimmed
        assert!(is_safe_css_color("  #fff  "));
    }

    #[test]
    fn fonts_and_shadows_cannot_carry_other_css() {
        assert!(is_safe_font_family("\"Noto Sans Tamil\", 'Latha', system-ui, sans-serif"));
        assert!(is_safe_font_family("தமிழ் Font"));
        for bad in ["", "Arial; background:url(x)", "a{b}", "url(x)", "Arial\\", "<b>", &"a".repeat(201)] {
            assert!(!is_safe_font_family(bad), "{bad:?}");
        }
        assert!(is_safe_text_shadow("0 2px 8px rgba(0,0,0,0.8)"));
        assert!(is_safe_text_shadow("1px 1px #000, -1px -1px #fff"));
        for bad in ["0 0 0 url(x)", "0 0 0 #000; x", "0 0 0 {#000}", "((0 0 0", "0 0 0 #000)", "0 0 0 \"x\"", &"1".repeat(201)] {
            assert!(!is_safe_text_shadow(bad), "{bad:?}");
        }
    }

    #[test]
    fn a_normal_theme_is_valid_and_each_field_is_checked() {
        assert!(validate_bundle_theme(&bundle_theme()).is_ok());
        let bad = |f: &dyn Fn(&mut BundleTheme)| {
            let mut t = bundle_theme();
            f(&mut t);
            validate_bundle_theme(&t).unwrap_err()
        };
        assert!(bad(&|t| t.name = "  ".into()).contains("no name"));
        assert!(bad(&|t| t.name = "n".repeat(61)).contains("too long"));
        assert!(bad(&|t| t.background_color = "red".into()).contains("background colour"));
        assert!(bad(&|t| t.text_color = "x".into()).contains("text colour"));
        assert!(bad(&|t| t.overlay_color = Some("url(x)".into())).contains("overlay"));
        assert!(bad(&|t| t.font_family = "a;b".into()).contains("font"));
        assert!(bad(&|t| t.text_shadow = Some("url(x)".into())).contains("shadow"));
        assert!(bad(&|t| t.font_size = "huge".into()).contains("font size"));
        assert!(bad(&|t| t.font_weight = "900".into()).contains("font weight"));
        assert!(bad(&|t| t.text_alignment = "justify".into()).contains("alignment"));
        assert!(bad(&|t| t.vertical_alignment = "middle".into()).contains("vertical"));
        assert!(bad(&|t| t.background_mode = "tile".into()).contains("background mode"));
        for ls in [0.1, 3.5, f64::NAN] {
            assert!(bad(&|t| t.line_spacing = ls).contains("line spacing"));
        }
        for tm in [-1, 201] {
            assert!(bad(&|t| t.text_margin = tm).contains("text margin"));
        }
        assert!(bad(&|t| t.layout = Some(SlideLayout { margin_pct: Some(90.0), ..Default::default() })).contains("margin"));
        // errors name the theme
        assert!(bad(&|t| t.text_color = "x".into()).starts_with("Theme 'Sunrise'"));
    }

    #[test]
    fn images_are_recognised_by_content_not_by_name() {
        assert_eq!(sniff_image_extension(PNG), Some("png"));
        assert_eq!(sniff_image_extension(&[0xFF, 0xD8, 0xFF, 0xE0, 0]), Some("jpg"));
        assert_eq!(sniff_image_extension(b"GIF89a....."), Some("gif"));
        assert_eq!(sniff_image_extension(b"GIF87a....."), Some("gif"));
        assert_eq!(sniff_image_extension(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
        for bad in [&b"<svg xmlns='http://www.w3.org/2000/svg'/>"[..], b"MZ\x90\x00", b"#!/bin/sh", b"", b"RIFF\0\0\0\0WAVEfmt "] {
            assert_eq!(sniff_image_extension(bad), None);
        }
    }

    #[test]
    fn bundle_parsing_rejects_wrong_files_and_future_versions() {
        let ok = serde_json::to_string(&bundle_of(vec![bundle_theme()])).unwrap();
        assert!(parse_bundle(&ok).is_ok());
        assert!(parse_bundle(&format!("\u{feff}{ok}")).is_ok());

        assert!(parse_bundle("not json").unwrap_err().contains("not a Church Presenter theme file"));
        assert!(parse_bundle("{}").unwrap_err().contains("not a Church Presenter theme file"));
        let mut other = bundle_of(vec![bundle_theme()]);
        other.format = "something-else".into();
        assert!(parse_bundle(&serde_json::to_string(&other).unwrap()).unwrap_err().contains("not a Church Presenter"));

        let mut future = bundle_of(vec![bundle_theme()]);
        future.version = BUNDLE_VERSION + 1;
        assert!(parse_bundle(&serde_json::to_string(&future).unwrap()).unwrap_err().contains("newer version"));

        assert!(parse_bundle(&serde_json::to_string(&bundle_of(vec![])).unwrap()).unwrap_err().contains("no themes"));
        let many = bundle_of((0..=MAX_BUNDLE_THEMES).map(|_| bundle_theme()).collect());
        assert!(parse_bundle(&serde_json::to_string(&many).unwrap()).unwrap_err().contains("too many"));
    }

    #[test]
    fn fonts_lists_skip_generic_families_and_quotes() {
        assert_eq!(named_fonts("\"Noto Sans Tamil\", 'Latha', system-ui, -apple-system, sans-serif"), vec!["Noto Sans Tamil", "Latha"]);
        assert!(named_fonts("serif, sans-serif").is_empty());
        assert!(named_fonts("").is_empty());
    }

    #[test]
    fn names_are_made_unique_case_insensitively() {
        let taken = vec!["Sunrise".to_string(), "sunrise (2)".to_string(), "Other".to_string()];
        assert_eq!(unique_name("Fresh", &taken), "Fresh");
        assert_eq!(unique_name("SUNRISE", &taken), "SUNRISE (3)");
        assert_eq!(unique_name("  Other ", &taken), "Other (2)");
    }

    fn custom_theme(db: &DbManager, name: &str, image: Option<&str>) -> Theme {
        let mut t = db.get_theme("theme-builtin-dark").unwrap().unwrap();
        t.id = String::new();
        t.name = name.into();
        t.is_built_in = false;
        t.background_image_path = image.map(String::from);
        t.layout = Some(SlideLayout { margin_pct: Some(6.0), outline_width: Some(3.0), outline_color: Some("#112233".into()) });
        t.font_family = "\"Noto Sans Tamil\", sans-serif".into();
        db.create_theme(&t).unwrap()
    }

    #[test]
    fn export_then_import_on_another_machine_reproduces_the_theme_and_its_image() {
        // machine A
        let a_db = DbManager::new_in_memory().unwrap();
        let a_dir = tmp("a");
        fs::create_dir_all(a_dir.join("media")).unwrap();
        let mut png = PNG.to_vec();
        png.extend_from_slice(b"pixel data");
        fs::write(a_dir.join("media").join("bg.png"), &png).unwrap();
        let original = custom_theme(&a_db, "Sunrise", Some("media/bg.png"));

        let file = a_dir.join("sunrise.cptheme");
        let res = export_themes_to_file(&a_db, &[original.id.clone()], &a_dir, &file).unwrap();
        assert_eq!(res.count, 1);
        assert!(res.warnings.is_empty());

        // machine B: a different database and a different data folder
        let b_db = DbManager::new_in_memory().unwrap();
        let b_dir = tmp("b");
        let result = import_themes_from_file(&b_db, &file, &b_dir).unwrap();

        assert_eq!(result.imported.len(), 1);
        let t = &result.imported[0];
        assert_ne!(t.id, original.id);
        assert!(!t.is_built_in);
        assert_eq!(t.name, "Sunrise");
        assert_eq!(t.background_color, original.background_color);
        assert_eq!(t.font_family, original.font_family);
        assert_eq!(t.text_color, original.text_color);
        assert_eq!(t.line_spacing, original.line_spacing);
        assert_eq!(t.text_shadow, original.text_shadow);
        assert_eq!(t.overlay_color, original.overlay_color);
        assert_eq!(t.layout, original.layout);

        // the image travelled with it, byte for byte, inside machine B's own data folder
        let path = t.background_image_path.clone().unwrap();
        assert!(path.starts_with("media/themes/") && path.ends_with(".png"));
        assert_eq!(fs::read(b_dir.join(&path)).unwrap(), png);
        assert_eq!(b_db.get_theme(&t.id).unwrap().unwrap().background_image_path.as_deref(), Some(path.as_str()));
        assert_eq!(result.fonts, vec!["Noto Sans Tamil"]);

        fs::remove_dir_all(&a_dir).ok();
        fs::remove_dir_all(&b_dir).ok();
    }

    #[test]
    fn exporting_several_themes_and_importing_twice_renames_instead_of_overwriting() {
        let db = DbManager::new_in_memory().unwrap();
        let dir = tmp("multi");
        let a = custom_theme(&db, "One", None);
        let b = custom_theme(&db, "Two", None);
        let file = dir.join("both.cptheme");
        assert_eq!(export_themes_to_file(&db, &[a.id.clone(), b.id.clone()], &dir, &file).unwrap().count, 2);

        let first = import_themes_from_file(&db, &file, &dir).unwrap();
        assert_eq!(first.imported.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), vec!["One (2)", "Two (2)"]);
        assert_eq!(first.warnings.len(), 2);
        let second = import_themes_from_file(&db, &file, &dir).unwrap();
        assert_eq!(second.imported.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), vec!["One (3)", "Two (3)"]);
        // originals untouched
        assert!(db.list_themes().unwrap().iter().any(|t| t.id == a.id && t.name == "One"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn nothing_is_stored_when_any_theme_in_the_file_is_invalid() {
        let db = DbManager::new_in_memory().unwrap();
        let dir = tmp("atomic");
        let before = db.list_themes().unwrap().len();
        let mut bad = bundle_theme();
        bad.name = "Broken".into();
        bad.text_color = "url(javascript:alert(1))".into();
        let bundle = bundle_of(vec![bundle_theme(), bad]);

        let err = import_bundle(&db, &bundle, &dir).unwrap_err();
        assert!(err.contains("Broken") && err.contains("text colour"));
        assert_eq!(db.list_themes().unwrap().len(), before);
        assert!(!dir.join("media").exists());
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn hostile_images_are_rejected_before_anything_is_written() {
        let db = DbManager::new_in_memory().unwrap();
        let dir = tmp("hostile");
        let with_image = |data: &[u8]| {
            let mut t = bundle_theme();
            t.background_image = Some(BundleImage { extension: "png".into(), data_base64: STANDARD.encode(data) });
            bundle_of(vec![t])
        };
        // a script renamed to .png, an SVG, and garbage
        for payload in [&b"#!/bin/sh\nrm -rf ~"[..], b"<svg onload='x'/>", b"plain text"] {
            let err = import_bundle(&db, &with_image(payload), &dir).unwrap_err();
            assert!(err.contains("not a PNG"), "{err}");
        }
        // invalid base64
        let mut t = bundle_theme();
        t.background_image = Some(BundleImage { extension: "png".into(), data_base64: "!!!not base64!!!".into() });
        assert!(import_bundle(&db, &bundle_of(vec![t]), &dir).unwrap_err().contains("damaged"));
        // too large
        let mut huge = PNG.to_vec();
        huge.resize(MAX_IMAGE_BYTES + 1, 0);
        assert!(import_bundle(&db, &with_image(&huge), &dir).unwrap_err().contains("larger than"));

        assert!(!dir.join("media").exists());
        assert!(db.list_themes().unwrap().iter().all(|t| t.name != "Sunrise"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn the_extension_claimed_in_the_file_is_ignored_in_favour_of_the_real_type() {
        let db = DbManager::new_in_memory().unwrap();
        let dir = tmp("ext");
        let mut t = bundle_theme();
        t.background_image = Some(BundleImage { extension: "exe".into(), data_base64: STANDARD.encode(PNG) });
        let res = import_bundle(&db, &bundle_of(vec![t]), &dir).unwrap();
        assert!(res.imported[0].background_image_path.as_deref().unwrap().ends_with(".png"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn export_never_embeds_files_from_outside_the_app_folder() {
        let db = DbManager::new_in_memory().unwrap();
        let dir = tmp("scope");
        let outside = tmp("outside");
        fs::write(outside.join("secret.png"), PNG).unwrap();
        let abs = outside.join("secret.png").to_string_lossy().to_string();
        let t = custom_theme(&db, "Sneaky", Some(&abs));
        let traversal = custom_theme(&db, "Traversal", Some("../../etc/hostname"));

        let (bundle, warnings) = build_bundle(&db, &[t.id.clone(), traversal.id.clone()], &dir).unwrap();
        assert!(bundle.themes.iter().all(|b| b.background_image.is_none()));
        assert_eq!(warnings.len(), 2);
        assert!(warnings.iter().all(|w| w.contains("not found")));
        fs::remove_dir_all(&dir).ok();
        fs::remove_dir_all(&outside).ok();
    }

    #[test]
    fn export_warns_about_non_image_backgrounds_and_rejects_empty_or_unknown_selections() {
        let db = DbManager::new_in_memory().unwrap();
        let dir = tmp("warn");
        fs::create_dir_all(dir.join("media")).unwrap();
        fs::write(dir.join("media").join("notes.png"), b"just text pretending").unwrap();
        let t = custom_theme(&db, "Fake", Some("media/notes.png"));

        let (bundle, warnings) = build_bundle(&db, &[t.id.clone()], &dir).unwrap();
        assert!(bundle.themes[0].background_image.is_none());
        assert!(warnings[0].contains("not a PNG"));

        assert!(build_bundle(&db, &[], &dir).unwrap_err().contains("at least one"));
        assert!(build_bundle(&db, &["ghost".into()], &dir).unwrap_err().contains("no longer exists"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn import_from_file_handles_missing_directories_and_wrong_files() {
        let db = DbManager::new_in_memory().unwrap();
        let dir = tmp("files");
        assert!(import_themes_from_file(&db, &dir.join("missing.cptheme"), &dir).unwrap_err().contains("could not be read"));
        assert!(import_themes_from_file(&db, &dir, &dir).unwrap_err().contains("not a file"));
        let junk = dir.join("junk.cptheme");
        fs::write(&junk, b"\x00\x01\x02 binary").unwrap();
        assert!(import_themes_from_file(&db, &junk, &dir).unwrap_err().contains("not a Church Presenter"));
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_failure_part_way_rolls_back_the_themes_and_images_already_written() {
        let db = DbManager::new_in_memory().unwrap();
        let dir = tmp("rollback");
        // make the images folder unusable: a file where the directory should be
        fs::create_dir_all(dir.join("media")).unwrap();
        fs::write(dir.join("media").join("themes"), b"i am a file").unwrap();
        let mut t = bundle_theme();
        t.background_image = Some(BundleImage { extension: "png".into(), data_base64: STANDARD.encode(PNG) });
        let before = db.list_themes().unwrap().len();
        assert!(import_bundle(&db, &bundle_of(vec![bundle_theme(), t]), &dir).is_err());
        assert_eq!(db.list_themes().unwrap().len(), before, "the first theme must be rolled back");
        fs::remove_dir_all(&dir).ok();
    }
}
