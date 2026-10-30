//! Native PowerPoint (.pptx) import: reads the file directly, with no PowerPoint or LibreOffice, and makes
//! editable slides from it.
//!
//! - Title and body placeholders become the slide's text.
//! - Other text boxes, pictures and plain shapes become positioned slide elements.
//! - Anything the app cannot show (charts, SmartArt, tables, video, notes, animations ...) is left out and
//!   reported back as a warning, so nothing is dropped silently.
//!
//! A .pptx is a zip of XML parts. The file is untrusted: sizes, depth and counts are all limited, names inside the
//! zip are never used as file paths, and pictures are identified by their content, not their name.

use crate::layout::{validate_element, validate_layout, SlideElement, SlideLayout, MAX_ELEMENTS, MAX_ELEMENT_TEXT_CHARS};
use quick_xml::events::{BytesStart, Event};
use quick_xml::reader::Reader;
use quick_xml::XmlVersion;
use std::collections::HashMap;
use std::io::{Read, Seek};
use zip::result::ZipError;
use zip::ZipArchive;

pub const MAX_FILE_BYTES: u64 = 200 * 1024 * 1024;
pub const MAX_SLIDES: usize = 500;
pub const MAX_ZIP_ENTRIES: usize = 20_000;
pub const MAX_XML_BYTES: u64 = 20 * 1024 * 1024;
pub const MAX_IMAGE_BYTES: u64 = 25 * 1024 * 1024;
pub const MAX_TOTAL_IMAGE_BYTES: u64 = 300 * 1024 * 1024;
const MAX_XML_DEPTH: usize = 64;
const MAX_SHAPES_PER_SLIDE: usize = 500;
const MAX_BODY_CHARS: usize = 5000;
const MAX_TITLE_CHARS: usize = 80;
const EMU_PER_PT: f64 = 12700.0;
const DEFAULT_SLIDE_W: f64 = 12_192_000.0;
const DEFAULT_SLIDE_H: f64 = 6_858_000.0;
const DEFAULT_TEXT_PT: f64 = 18.0;

// ---------------------------------------------------------------------------------------------------------------
// Result types

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedSlide {
    /// A short label (the title text, or "Slide N").
    pub title: String,
    /// The title and body text, as it should be shown.
    pub body: String,
    pub background_color: String,
    pub foreground_color: String,
    pub text_alignment: String,
    /// A `media/...` path, when the slide has a picture background.
    pub background_image: Option<String>,
    pub elements: Vec<SlideElement>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ImportedDeck {
    pub slides: Vec<ImportedSlide>,
    /// What could not be imported, in plain words.
    pub warnings: Vec<String>,
}

/// Where imported pictures go. Returns the `media/...` path the picture can be shown from.
pub trait ImageSink {
    fn store(&mut self, data: &[u8], ext: &str) -> Result<String, String>;
}

/// The type of picture, judged from its first bytes (a file's name proves nothing).
pub fn sniff_image(data: &[u8]) -> Option<&'static str> {
    if data.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("png")
    } else if data.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("jpg")
    } else if data.starts_with(b"GIF87a") || data.starts_with(b"GIF89a") {
        Some("gif")
    } else if data.len() >= 12 && &data[0..4] == b"RIFF" && &data[8..12] == b"WEBP" {
        Some("webp")
    } else {
        None
    }
}

// ---------------------------------------------------------------------------------------------------------------
// A small XML tree

#[derive(Debug, Default, Clone)]
struct Node {
    /// Element name without its namespace prefix (`p:sp` -> `sp`).
    name: String,
    /// Attributes with their prefix kept (`r:embed`).
    attrs: Vec<(String, String)>,
    children: Vec<Node>,
    text: String,
}

impl Node {
    fn attr(&self, key: &str) -> Option<&str> {
        self.attrs.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str())
    }
    fn child(&self, name: &str) -> Option<&Node> {
        self.children.iter().find(|c| c.name == name)
    }
    fn kids<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Node> + 'a {
        self.children.iter().filter(move |c| c.name == name)
    }
    fn find(&self, path: &[&str]) -> Option<&Node> {
        let mut n = self;
        for p in path {
            n = n.child(p)?;
        }
        Some(n)
    }
    fn num(&self, key: &str) -> Option<f64> {
        self.attr(key).and_then(|v| v.trim().parse::<f64>().ok()).filter(|v| v.is_finite())
    }
}

fn local_name(raw: &str) -> String {
    raw.rsplit(':').next().unwrap_or("").to_string()
}

fn node_from(e: &BytesStart) -> Result<Node, String> {
    let mut attrs = Vec::new();
    for a in e.attributes() {
        let a = a.map_err(|err| format!("XML error: {err}"))?;
        let key = a.key.as_ref().to_string();
        let value = a.normalized_value(XmlVersion::Implicit1_0).map_err(|err| format!("XML error: {err}"))?.to_string();
        attrs.push((key, value));
    }
    Ok(Node { name: local_name(e.name().as_ref()), attrs, children: Vec::new(), text: String::new() })
}

/// What an `&name;` or `&#123;` reference stands for.
fn resolve_reference(name: &str) -> Option<char> {
    match name {
        "amp" => Some('&'),
        "lt" => Some('<'),
        "gt" => Some('>'),
        "quot" => Some('"'),
        "apos" => Some('\''),
        _ => {
            let digits = name.strip_prefix('#')?;
            let code = match digits.strip_prefix('x').or_else(|| digits.strip_prefix('X')) {
                Some(hex) => u32::from_str_radix(hex, 16).ok()?,
                None => digits.parse::<u32>().ok()?,
            };
            char::from_u32(code).filter(|c| !c.is_control() || *c == '\n' || *c == '\t')
        }
    }
}

fn parse_xml(bytes: &[u8]) -> Result<Node, String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(false);
    let mut stack: Vec<Node> = vec![Node::default()];
    let mut buf = Vec::new();
    loop {
        let event = reader.read_event_into(&mut buf).map_err(|e| format!("XML error: {e}"))?;
        match event {
            Event::Start(e) => {
                if stack.len() > MAX_XML_DEPTH {
                    return Err("The file's XML is nested too deeply.".to_string());
                }
                stack.push(node_from(&e)?);
            }
            Event::Empty(e) => {
                let n = node_from(&e)?;
                stack.last_mut().unwrap().children.push(n);
            }
            Event::End(_) => {
                if stack.len() < 2 {
                    return Err("The file's XML is not well formed.".to_string());
                }
                let n = stack.pop().unwrap();
                stack.last_mut().unwrap().children.push(n);
            }
            Event::Text(t) => stack.last_mut().unwrap().text.push_str(&t.xml10_content()),
            Event::CData(c) => stack.last_mut().unwrap().text.push_str(&c.xml10_content()),
            Event::GeneralRef(r) => {
                if let Some(ch) = resolve_reference(&r.into_inner()) {
                    stack.last_mut().unwrap().text.push(ch);
                }
            }
            Event::Eof => break,
            _ => {}
        }
        buf.clear();
    }
    if stack.len() != 1 {
        return Err("The file's XML ended unexpectedly.".to_string());
    }
    stack.pop().unwrap().children.into_iter().next().ok_or_else(|| "The file's XML is empty.".to_string())
}

// ---------------------------------------------------------------------------------------------------------------
// Parts and relationships

fn read_part<R: Read + Seek>(zip: &mut ZipArchive<R>, name: &str, limit: u64) -> Result<Option<Vec<u8>>, String> {
    let file = match zip.by_name(name) {
        Ok(f) => f,
        Err(ZipError::FileNotFound) => return Ok(None),
        Err(e) => return Err(format!("Could not read '{name}' from the file: {e}")),
    };
    if file.size() > limit {
        return Err(format!("'{name}' is too large to import."));
    }
    let mut out = Vec::new();
    file.take(limit + 1).read_to_end(&mut out).map_err(|e| format!("Could not read '{name}' from the file: {e}"))?;
    if out.len() as u64 > limit {
        return Err(format!("'{name}' is too large to import."));
    }
    Ok(Some(out))
}

fn read_xml<R: Read + Seek>(zip: &mut ZipArchive<R>, name: &str) -> Result<Option<Node>, String> {
    match read_part(zip, name, MAX_XML_BYTES)? {
        Some(bytes) => parse_xml(&bytes).map(Some).map_err(|e| format!("{name}: {e}")),
        None => Ok(None),
    }
}

/// `target` as written in a relationship, made into a full part name. None if it leaves the package.
fn resolve_target(base_dir: &str, target: &str) -> Option<String> {
    let mut parts: Vec<&str> = if target.starts_with('/') { vec![] } else { base_dir.split('/').filter(|s| !s.is_empty()).collect() };
    for seg in target.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop()?;
            }
            s => parts.push(s),
        }
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

fn part_dir(part: &str) -> &str {
    part.rsplit_once('/').map(|(d, _)| d).unwrap_or("")
}

fn rels_name(part: &str) -> String {
    match part.rsplit_once('/') {
        Some((dir, file)) => format!("{dir}/_rels/{file}.rels"),
        None => format!("_rels/{part}.rels"),
    }
}

/// id -> (relationship type, full part name), for the internal relationships of one part.
type Rels = HashMap<String, (String, String)>;

fn read_rels<R: Read + Seek>(zip: &mut ZipArchive<R>, part: &str) -> Result<Rels, String> {
    let mut rels = Rels::new();
    if let Some(root) = read_xml(zip, &rels_name(part))? {
        for r in root.kids("Relationship") {
            if r.attr("TargetMode") == Some("External") {
                continue;
            }
            let (Some(id), Some(ty), Some(target)) = (r.attr("Id"), r.attr("Type"), r.attr("Target")) else { continue };
            if let Some(full) = resolve_target(part_dir(part), target) {
                rels.insert(id.to_string(), (ty.rsplit('/').next().unwrap_or("").to_string(), full));
            }
        }
    }
    Ok(rels)
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry and colour

#[derive(Debug, Clone, Copy)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

/// Maps a shape's own coordinates to slide coordinates (groups scale and move their children).
#[derive(Debug, Clone, Copy)]
struct Xf {
    ox: f64,
    oy: f64,
    sx: f64,
    sy: f64,
}

const IDENTITY: Xf = Xf { ox: 0.0, oy: 0.0, sx: 1.0, sy: 1.0 };

impl Xf {
    fn apply(&self, r: Rect) -> Rect {
        Rect { x: self.ox + r.x * self.sx, y: self.oy + r.y * self.sy, w: r.w * self.sx, h: r.h * self.sy }
    }
}

fn xfrm_rect(x: &Node) -> Option<Rect> {
    let off = x.child("off")?;
    let ext = x.child("ext")?;
    let rect = Rect { x: off.num("x")?, y: off.num("y")?, w: ext.num("cx")?, h: ext.num("cy")? };
    (rect.w >= 0.0 && rect.h >= 0.0).then_some(rect)
}

/// The transform a group applies to its children, inside `parent`.
fn group_xf(grp: &Node, parent: Xf) -> Xf {
    let Some(x) = grp.find(&["grpSpPr", "xfrm"]) else { return parent };
    let (Some(off), Some(ext), Some(ch_off), Some(ch_ext)) = (x.child("off"), x.child("ext"), x.child("chOff"), x.child("chExt")) else { return parent };
    let (Some(ox), Some(oy), Some(cx), Some(cy), Some(chx), Some(chy), Some(chw), Some(chh)) =
        (off.num("x"), off.num("y"), ext.num("cx"), ext.num("cy"), ch_off.num("x"), ch_off.num("y"), ch_ext.num("cx"), ch_ext.num("cy"))
    else {
        return parent;
    };
    if chw <= 0.0 || chh <= 0.0 {
        return parent;
    }
    let (sx, sy) = (cx / chw, cy / chh);
    Xf { ox: parent.ox + (ox - chx * sx) * parent.sx, oy: parent.oy + (oy - chy * sy) * parent.sy, sx: sx * parent.sx, sy: sy * parent.sy }
}

fn hex6(s: &str) -> Option<String> {
    let t = s.trim().trim_start_matches('#');
    (t.len() == 6 && t.chars().all(|c| c.is_ascii_hexdigit())).then(|| format!("#{}", t.to_lowercase()))
}

fn luminance(hex: &str) -> f64 {
    let v = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).unwrap_or(0) as f64 / 255.0;
    0.2126 * v(1) + 0.7152 * v(3) + 0.0722 * v(5)
}

/// White text on a dark background, black on a light one.
fn contrast_for(bg: &str) -> String {
    if luminance(bg) < 0.5 { "#ffffff" } else { "#000000" }.to_string()
}

/// Smallest difference in brightness between text and what is behind it that still reads clearly.
const MIN_TEXT_CONTRAST: f64 = 0.35;

/// `color` if it can be read on `bg`, otherwise black or white, whichever suits `bg`.
fn readable_on(color: Option<&str>, bg: &str) -> String {
    match color {
        Some(c) if (luminance(c) - luminance(bg)).abs() >= MIN_TEXT_CONTRAST => c.to_string(),
        _ => contrast_for(bg),
    }
}

/// Theme colours, and which of them the slide master calls "background" and "text".
#[derive(Debug, Clone, Default)]
struct Palette {
    theme: HashMap<String, String>,
    map: HashMap<String, String>,
}

impl Palette {
    fn scheme(&self, name: &str) -> Option<String> {
        let mapped = self.map.get(name).map(|s| s.as_str()).unwrap_or(name);
        let key = match mapped {
            "bg1" => "lt1",
            "tx1" => "dk1",
            "bg2" => "lt2",
            "tx2" => "dk2",
            other => other,
        };
        self.theme.get(key).cloned()
    }

    /// A colour element (`srgbClr`, `schemeClr`, `sysClr`, `prstClr`) as `#rrggbb`, with its opacity if it has one.
    fn color(&self, n: &Node) -> Option<(String, Option<f64>)> {
        let hex = match n.name.as_str() {
            "srgbClr" => hex6(n.attr("val")?)?,
            "schemeClr" => self.scheme(n.attr("val")?)?,
            "sysClr" => n.attr("lastClr").and_then(hex6).or_else(|| match n.attr("val")? {
                "window" => Some("#ffffff".to_string()),
                "windowText" => Some("#000000".to_string()),
                _ => None,
            })?,
            "prstClr" => match n.attr("val")? {
                "black" => "#000000".to_string(),
                "white" => "#ffffff".to_string(),
                _ => return None,
            },
            _ => return None,
        };
        let alpha = n.child("alpha").and_then(|a| a.num("val")).map(|v| (v / 100_000.0).clamp(0.0, 1.0));
        Some((hex, alpha))
    }

    /// The colour of a solid or gradient fill inside `parent` (for example a shape's `spPr`).
    fn fill(&self, parent: &Node) -> Option<(String, Option<f64>)> {
        if let Some(solid) = parent.child("solidFill") {
            return solid.children.iter().find_map(|c| self.color(c));
        }
        if let Some(grad) = parent.child("gradFill") {
            return grad.find(&["gsLst"])?.kids("gs").next()?.children.iter().find_map(|c| self.color(c));
        }
        None
    }
}

fn read_palette(theme: Option<&Node>, master: Option<&Node>) -> Palette {
    let mut pal = Palette::default();
    if let Some(scheme) = theme.and_then(|t| t.find(&["themeElements", "clrScheme"])) {
        for c in &scheme.children {
            let hex = c.children.iter().find_map(|v| match v.name.as_str() {
                "srgbClr" => v.attr("val").and_then(hex6),
                "sysClr" => v.attr("lastClr").and_then(hex6),
                _ => None,
            });
            if let Some(h) = hex {
                pal.theme.insert(c.name.clone(), h);
            }
        }
    }
    if let Some(m) = master.and_then(|m| m.child("clrMap")) {
        for (k, v) in &m.attrs {
            pal.map.insert(k.clone(), v.clone());
        }
    }
    pal
}

// ---------------------------------------------------------------------------------------------------------------
// Placeholders

/// A placeholder's place on a layout or master.
#[derive(Debug, Clone)]
struct PhGeom {
    kind: String,
    idx: String,
    rect: Rect,
}

fn ph_kind(ph: &Node) -> String {
    match ph.attr("type").unwrap_or("body") {
        "ctrTitle" => "title".to_string(),
        other => other.to_string(),
    }
}

fn ph_geoms(tree: &Node) -> Vec<PhGeom> {
    let mut out = Vec::new();
    let Some(sp_tree) = tree.find(&["cSld", "spTree"]) else { return out };
    for sp in sp_tree.kids("sp") {
        let (Some(ph), Some(x)) = (sp.find(&["nvSpPr", "nvPr", "ph"]), sp.find(&["spPr", "xfrm"])) else { continue };
        if let Some(rect) = xfrm_rect(x) {
            out.push(PhGeom { kind: ph_kind(ph), idx: ph.attr("idx").unwrap_or("0").to_string(), rect });
        }
    }
    out
}

/// Finds where a placeholder sits: the same kind and index on the layout, then the same index, then the same kind;
/// the master is tried after the layout.
fn lookup_geom(geoms: &[PhGeom], kind: &str, idx: &str) -> Option<Rect> {
    geoms
        .iter()
        .find(|g| g.kind == kind && g.idx == idx)
        .or_else(|| geoms.iter().find(|g| idx != "0" && g.idx == idx))
        .or_else(|| geoms.iter().find(|g| g.kind == kind))
        .map(|g| g.rect)
}

// ---------------------------------------------------------------------------------------------------------------
// Text

struct TextBody {
    text: String,
    size_pt: Option<f64>,
    bold: bool,
    color: Option<String>,
    align: Option<String>,
}

fn read_text(tx_body: &Node, pal: &Palette) -> TextBody {
    let mut lines: Vec<String> = Vec::new();
    let (mut size_pt, mut bold, mut color, mut align) = (None, false, None, None);
    let mut seen_run = false;
    for p in tx_body.kids("p") {
        let ppr = p.child("pPr");
        let mut line = String::new();
        if let Some(ppr) = ppr {
            if align.is_none() {
                align = ppr.attr("algn").map(|a| match a {
                    "ctr" => "center",
                    "r" => "right",
                    _ => "left",
                }.to_string());
            }
            if ppr.child("buChar").is_some() || ppr.child("buAutoNum").is_some() {
                line.push_str("• ");
            }
        }
        for node in &p.children {
            match node.name.as_str() {
                "r" | "fld" => {
                    if !seen_run {
                        if let Some(rpr) = node.child("rPr") {
                            size_pt = rpr.num("sz").map(|v| v / 100.0).filter(|v| *v > 0.0);
                            bold = rpr.attr("b") == Some("1");
                            color = pal.fill(rpr).map(|(c, _)| c);
                            seen_run = true;
                        }
                    }
                    if let Some(t) = node.child("t") {
                        line.push_str(&t.text);
                    }
                }
                "br" => line.push('\n'),
                _ => {}
            }
        }
        lines.push(line);
    }
    while lines.last().map_or(false, |l| l.trim().is_empty()) {
        lines.pop();
    }
    let text = lines.join("\n");
    TextBody { text, size_pt, bold, color, align }
}

// ---------------------------------------------------------------------------------------------------------------
// Warnings

#[derive(Default)]
struct Warnings {
    by_kind: Vec<(&'static str, Vec<usize>)>,
}

impl Warnings {
    fn add(&mut self, kind: &'static str, slide: usize) {
        match self.by_kind.iter_mut().find(|(k, _)| *k == kind) {
            Some((_, slides)) => {
                if !slides.contains(&slide) {
                    slides.push(slide);
                }
            }
            None => self.by_kind.push((kind, vec![slide])),
        }
    }

    fn messages(&self) -> Vec<String> {
        self.by_kind
            .iter()
            .map(|(kind, slides)| {
                let what = match *kind {
                    "notes" => "Speaker notes were not imported",
                    "transitions" => "Transitions and animations were not imported",
                    "chart" => "Charts were left out",
                    "smartart" => "SmartArt diagrams were left out",
                    "table" => "Tables that could not be read were left out",
                    "table_text" => "Tables were imported as plain text, without their grid",
                    "media" => "Video and audio were left out",
                    "graphic" => "Other embedded objects were left out",
                    "image_format" => "Pictures in a format that cannot be shown (such as EMF, WMF, SVG or TIFF) were left out",
                    "image_bad" => "Pictures that could not be read were left out",
                    "shape_kind" => "Shapes other than rectangles and ellipses were left out",
                    "rotated" => "Rotated items are shown unrotated",
                    "too_many" => "Only the first 20 extra items on a slide are kept",
                    "long_text" => "Long text in text boxes was shortened",
                    "invalid" => "Some items could not be placed on the slide and were left out",
                    "too_complex" => "Slides with a very large number of items were cut short",
                    _ => "Some content was not imported",
                };
                format!("{what} (slide{} {}).", if slides.len() == 1 { "" } else { "s" }, list_slides(slides))
            })
            .collect()
    }
}

fn list_slides(slides: &[usize]) -> String {
    let mut sorted = slides.to_vec();
    sorted.sort_unstable();
    let shown: Vec<String> = sorted.iter().take(8).map(|n| n.to_string()).collect();
    if sorted.len() > 8 {
        format!("{} and {} more", shown.join(", "), sorted.len() - 8)
    } else {
        shown.join(", ")
    }
}

// ---------------------------------------------------------------------------------------------------------------
// One slide

enum Draft {
    Text { rect: Rect, text: String, size_pt: f64, bold: bool, color: Option<String>, align: String },
    Shape { rect: Rect, shape: &'static str, fill: String, opacity: Option<f64> },
    Image { rect: Rect, part: String },
}

struct MainText {
    is_title: bool,
    y: f64,
    x: f64,
    text: String,
    align: Option<String>,
}

struct SlideCtx<'a> {
    slide_no: usize,
    rels: &'a Rels,
    geoms: &'a [PhGeom],
    pal: &'a Palette,
    drafts: Vec<Draft>,
    mains: Vec<MainText>,
    warnings: &'a mut Warnings,
    seen: usize,
}

/// True for a shape PowerPoint does not show (its "hidden" flag is set). Hidden groups hide everything inside them.
fn is_hidden(shape: &Node) -> bool {
    ["nvSpPr", "nvPicPr", "nvGrpSpPr", "nvGraphicFramePr", "nvCxnSpPr"]
        .iter()
        .filter_map(|nv| shape.find(&[nv, "cNvPr"]))
        .any(|c| matches!(c.attr("hidden"), Some("1") | Some("true")))
}

fn walk(tree: &Node, xf: Xf, cx: &mut SlideCtx) {
    for child in &tree.children {
        if cx.seen >= MAX_SHAPES_PER_SLIDE {
            cx.warnings.add("too_complex", cx.slide_no);
            return;
        }
        if is_hidden(child) {
            continue;
        }
        match child.name.as_str() {
            "sp" => {
                cx.seen += 1;
                handle_sp(child, xf, cx);
            }
            "pic" => {
                cx.seen += 1;
                handle_pic(child, xf, cx);
            }
            "grpSp" => {
                cx.seen += 1;
                walk(child, group_xf(child, xf), cx);
            }
            "graphicFrame" => {
                cx.seen += 1;
                let uri = child.find(&["graphic", "graphicData"]).and_then(|g| g.attr("uri")).unwrap_or("");
                if uri.contains("table") {
                    let kind = if handle_table(child, xf, cx) { "table_text" } else { "table" };
                    cx.warnings.add(kind, cx.slide_no);
                    continue;
                }
                let kind = if uri.contains("chart") {
                    "chart"
                } else if uri.contains("diagram") {
                    "smartart"
                } else {
                    "graphic"
                };
                cx.warnings.add(kind, cx.slide_no);
            }
            "AlternateContent" => {
                if let Some(fallback) = child.child("Fallback") {
                    walk(fallback, xf, cx);
                }
            }
            _ => {}
        }
    }
}

fn handle_sp(sp: &Node, xf: Xf, cx: &mut SlideCtx) {
    let ph = sp.find(&["nvSpPr", "nvPr", "ph"]);
    let xfrm = sp.find(&["spPr", "xfrm"]);
    if xfrm.and_then(|x| x.num("rot")).map_or(false, |r| r != 0.0) {
        cx.warnings.add("rotated", cx.slide_no);
    }
    let own = xfrm.and_then(xfrm_rect).map(|r| xf.apply(r));
    let body = sp.child("txBody").map(|t| read_text(t, cx.pal));

    if let Some(ph) = ph {
        let kind = ph_kind(ph);
        if matches!(kind.as_str(), "dt" | "ftr" | "sldNum" | "hdr") {
            return;
        }
        let rect = own.or_else(|| lookup_geom(cx.geoms, &kind, ph.attr("idx").unwrap_or("0")));
        let text_kinds = matches!(kind.as_str(), "title" | "subTitle" | "body" | "obj");
        if let (true, Some(b)) = (text_kinds, &body) {
            if !b.text.trim().is_empty() {
                cx.mains.push(MainText {
                    is_title: kind == "title",
                    y: rect.map_or(f64::MAX, |r| r.y),
                    x: rect.map_or(f64::MAX, |r| r.x),
                    text: b.text.clone(),
                    align: b.align.clone(),
                });
            }
        }
        return;
    }

    let Some(rect) = own else { return };
    let geometry = sp.find(&["spPr", "prstGeom"]).and_then(|g| g.attr("prst")).unwrap_or("rect");
    if let Some((fill, alpha)) = sp.child("spPr").and_then(|p| cx.pal.fill(p)) {
        match geometry {
            "rect" | "roundRect" | "snip1Rect" | "round1Rect" => cx.drafts.push(Draft::Shape { rect, shape: "rect", fill, opacity: alpha }),
            "ellipse" => cx.drafts.push(Draft::Shape { rect, shape: "ellipse", fill, opacity: alpha }),
            _ => cx.warnings.add("shape_kind", cx.slide_no),
        }
    }
    if let Some(b) = body {
        if !b.text.trim().is_empty() {
            cx.drafts.push(Draft::Text {
                rect,
                text: b.text,
                size_pt: b.size_pt.unwrap_or(DEFAULT_TEXT_PT),
                bold: b.bold,
                color: b.color,
                align: b.align.unwrap_or_else(|| "left".to_string()),
            });
        }
    }
}

/// A table as plain text: one line per row, cells separated by " | ". Returns false if there was nothing to show.
fn handle_table(frame: &Node, xf: Xf, cx: &mut SlideCtx) -> bool {
    let Some(tbl) = frame.find(&["graphic", "graphicData", "tbl"]) else { return false };
    let Some(rect) = frame.child("xfrm").and_then(xfrm_rect).map(|r| xf.apply(r)) else { return false };
    let (mut size_pt, mut color) = (None, None);
    let mut rows: Vec<String> = Vec::new();
    for tr in tbl.kids("tr") {
        let mut cells: Vec<String> = Vec::new();
        for tc in tr.kids("tc") {
            let Some(tx) = tc.child("txBody") else {
                cells.push(String::new());
                continue;
            };
            let t = read_text(tx, cx.pal);
            if size_pt.is_none() && !t.text.trim().is_empty() {
                size_pt = t.size_pt;
                color = t.color.clone();
            }
            cells.push(t.text.split_whitespace().collect::<Vec<_>>().join(" "));
        }
        while cells.last().map_or(false, |c| c.is_empty()) {
            cells.pop();
        }
        if !cells.is_empty() {
            rows.push(cells.join("  |  "));
        }
    }
    if rows.is_empty() {
        return false;
    }
    cx.drafts.push(Draft::Text { rect, text: rows.join("\n"), size_pt: size_pt.unwrap_or(DEFAULT_TEXT_PT), bold: false, color, align: "left".to_string() });
    true
}

fn handle_pic(pic: &Node, xf: Xf, cx: &mut SlideCtx) {
    let nv = pic.find(&["nvPicPr", "nvPr"]);
    if nv.map_or(false, |n| n.child("videoFile").is_some() || n.child("audioFile").is_some() || n.child("wavAudioFile").is_some()) {
        cx.warnings.add("media", cx.slide_no);
        return;
    }
    let Some(rect) = pic.find(&["spPr", "xfrm"]).and_then(xfrm_rect).map(|r| xf.apply(r)) else { return };
    let embed = pic.find(&["blipFill", "blip"]).and_then(|b| b.attr("r:embed"));
    match embed.and_then(|id| cx.rels.get(id)) {
        Some((_, part)) => cx.drafts.push(Draft::Image { rect, part: part.clone() }),
        None => cx.warnings.add("image_bad", cx.slide_no),
    }
}

// ---------------------------------------------------------------------------------------------------------------
// The whole file

struct Importer<'a, R: Read + Seek> {
    zip: ZipArchive<R>,
    sink: &'a mut dyn ImageSink,
    sw: f64,
    sh: f64,
    xml_cache: HashMap<String, Option<Node>>,
    palettes: HashMap<String, Palette>,
    images: HashMap<String, Option<String>>,
    image_bytes: u64,
    warnings: Warnings,
}

impl<'a, R: Read + Seek> Importer<'a, R> {
    /// An XML part, read and parsed once.
    fn cached_xml(&mut self, part: &str) -> Result<Option<Node>, String> {
        if !self.xml_cache.contains_key(part) {
            let node = read_xml(&mut self.zip, part)?;
            self.xml_cache.insert(part.to_string(), node);
        }
        Ok(self.xml_cache.get(part).cloned().flatten())
    }

    fn palette_for(&mut self, master_part: &str) -> Result<Palette, String> {
        if let Some(p) = self.palettes.get(master_part) {
            return Ok(p.clone());
        }
        let master = self.cached_xml(master_part)?;
        let rels = read_rels(&mut self.zip, master_part)?;
        let theme_part = rels.values().find(|(ty, _)| ty == "theme").map(|(_, p)| p.clone()).unwrap_or_else(|| "ppt/theme/theme1.xml".to_string());
        let theme = self.cached_xml(&theme_part)?;
        let pal = read_palette(theme.as_ref(), master.as_ref());
        self.palettes.insert(master_part.to_string(), pal.clone());
        Ok(pal)
    }

    /// Stores a picture once and returns where it can be shown from (None: it cannot be used).
    fn image(&mut self, part: &str, slide_no: usize) -> Option<String> {
        if let Some(known) = self.images.get(part) {
            return known.clone();
        }
        let result = (|| -> Option<String> {
            let data = match read_part(&mut self.zip, part, MAX_IMAGE_BYTES) {
                Ok(Some(d)) => d,
                Ok(None) => {
                    self.warnings.add("image_bad", slide_no);
                    return None;
                }
                Err(_) => {
                    self.warnings.add("image_bad", slide_no);
                    return None;
                }
            };
            let Some(ext) = sniff_image(&data) else {
                self.warnings.add("image_format", slide_no);
                return None;
            };
            if self.image_bytes + data.len() as u64 > MAX_TOTAL_IMAGE_BYTES {
                self.warnings.add("image_bad", slide_no);
                return None;
            }
            match self.sink.store(&data, ext) {
                Ok(path) => {
                    self.image_bytes += data.len() as u64;
                    Some(path)
                }
                Err(_) => {
                    self.warnings.add("image_bad", slide_no);
                    None
                }
            }
        })();
        self.images.insert(part.to_string(), result.clone());
        result
    }

    /// The background of a slide: its own, else its layout's, else its master's.
    fn background(&mut self, trees: &[&Node], pal: &Palette, slide_no: usize, rels_for: &[&Rels]) -> (Option<String>, Option<String>) {
        for (tree, rels) in trees.iter().zip(rels_for) {
            let Some(bg) = tree.find(&["cSld", "bg"]) else { continue };
            if let Some(pr) = bg.child("bgPr") {
                if let Some((c, _)) = pal.fill(pr) {
                    return (Some(c), None);
                }
                if let Some(embed) = pr.find(&["blipFill", "blip"]).and_then(|b| b.attr("r:embed")) {
                    if let Some((_, part)) = rels.get(embed) {
                        let part = part.clone();
                        return (None, self.image(&part, slide_no));
                    }
                }
            }
            if let Some(color) = bg.child("bgRef").and_then(|r| r.children.iter().find_map(|c| pal.color(c))) {
                return (Some(color.0), None);
            }
        }
        (None, None)
    }

    fn slide(&mut self, n: usize, part: &str) -> Result<ImportedSlide, String> {
        let tree = self.cached_xml(part)?.ok_or_else(|| format!("Slide {n} is missing from the file."))?;
        let rels = read_rels(&mut self.zip, part)?;

        let layout_part = rels.values().find(|(ty, _)| ty == "slideLayout").map(|(_, p)| p.clone());
        let layout = match &layout_part {
            Some(p) => self.cached_xml(p)?,
            None => None,
        };
        let layout_rels = match &layout_part {
            Some(p) => read_rels(&mut self.zip, p)?,
            None => Rels::new(),
        };
        let master_part = layout_rels.values().find(|(ty, _)| ty == "slideMaster").map(|(_, p)| p.clone());
        let master = match &master_part {
            Some(p) => self.cached_xml(p)?,
            None => None,
        };
        let master_rels = match &master_part {
            Some(p) => read_rels(&mut self.zip, p)?,
            None => Rels::new(),
        };
        let pal = match &master_part {
            Some(p) => self.palette_for(p)?,
            None => read_palette(self.cached_xml("ppt/theme/theme1.xml")?.as_ref(), None),
        };

        // placeholder positions: the layout's first, then the master's
        let mut geoms = layout.as_ref().map(ph_geoms).unwrap_or_default();
        geoms.extend(master.as_ref().map(ph_geoms).unwrap_or_default());

        let mut trees: Vec<&Node> = vec![&tree];
        let mut rel_sets: Vec<&Rels> = vec![&rels];
        if let Some(l) = layout.as_ref() {
            trees.push(l);
            rel_sets.push(&layout_rels);
        }
        if let Some(m) = master.as_ref() {
            trees.push(m);
            rel_sets.push(&master_rels);
        }
        let (bg_color, bg_image) = self.background(&trees, &pal, n, &rel_sets);
        let background_color = bg_color.unwrap_or_else(|| "#ffffff".to_string());
        let foreground_color = contrast_for(&background_color);

        let mut cx = SlideCtx { slide_no: n, rels: &rels, geoms: &geoms, pal: &pal, drafts: Vec::new(), mains: Vec::new(), warnings: &mut self.warnings, seen: 0 };
        if let Some(sp_tree) = tree.find(&["cSld", "spTree"]) {
            walk(sp_tree, IDENTITY, &mut cx);
        }
        let (drafts, mains) = (std::mem::take(&mut cx.drafts), std::mem::take(&mut cx.mains));

        if tree.child("transition").is_some() || tree.child("timing").is_some() {
            self.warnings.add("transitions", n);
        }
        if rels.values().any(|(ty, _)| ty == "notesSlide") {
            if let Some((_, notes_part)) = rels.values().find(|(ty, _)| ty == "notesSlide") {
                let notes_part = notes_part.clone();
                if let Some(notes) = self.cached_xml(&notes_part)? {
                    if has_note_text(&notes) {
                        self.warnings.add("notes", n);
                    }
                }
            }
        }

        // the main text: title first, then the rest top to bottom
        let mut title_parts: Vec<&MainText> = mains.iter().filter(|m| m.is_title).collect();
        title_parts.sort_by(|a, b| a.y.total_cmp(&b.y).then(a.x.total_cmp(&b.x)));
        let mut body_parts: Vec<&MainText> = mains.iter().filter(|m| !m.is_title).collect();
        body_parts.sort_by(|a, b| a.y.total_cmp(&b.y).then(a.x.total_cmp(&b.x)));
        let join = |parts: &[&MainText]| parts.iter().map(|m| m.text.trim()).filter(|t| !t.is_empty()).collect::<Vec<_>>().join("\n");
        let (title_text, body_text) = (join(&title_parts), join(&body_parts));
        let mut body = [title_text.as_str(), body_text.as_str()].iter().filter(|s| !s.is_empty()).cloned().collect::<Vec<_>>().join("\n\n");
        if body.chars().count() > MAX_BODY_CHARS {
            body = body.chars().take(MAX_BODY_CHARS).collect();
        }
        let label_source = if !title_text.is_empty() { &title_text } else { &body_text };
        let label: String = label_source.lines().next().unwrap_or("").trim().chars().take(MAX_TITLE_CHARS).collect();
        let title = if label.is_empty() { format!("Slide {n}") } else { label };
        let text_alignment = mains.iter().find_map(|m| m.align.clone()).unwrap_or_else(|| "center".to_string());

        // extra items, as slide elements
        let mut elements: Vec<SlideElement> = Vec::new();
        // coloured shapes drawn so far, so text on a card is judged against the card, not the page
        let mut cards: Vec<(Rect, String)> = Vec::new();
        for draft in drafts {
            let id = format!("pptx-{}", elements.len() + 1);
            let element = match draft {
                Draft::Text { rect, text, size_pt, bold, color, align } => {
                    let mut text = text.trim().to_string();
                    if text.chars().count() > MAX_ELEMENT_TEXT_CHARS {
                        text = text.chars().take(MAX_ELEMENT_TEXT_CHARS).collect();
                        self.warnings.add("long_text", n);
                    }
                    let size_pct = ((size_pt * EMU_PER_PT / self.sh) * 100.0).clamp(1.0, 30.0);
                    let (cx_mid, cy_mid) = (rect.x + rect.w / 2.0, rect.y + rect.h / 2.0);
                    let behind = cards
                        .iter()
                        .rev()
                        .find(|(r, _)| cx_mid >= r.x && cx_mid <= r.x + r.w && cy_mid >= r.y && cy_mid <= r.y + r.h)
                        .map(|(_, c)| c.clone())
                        .unwrap_or_else(|| background_color.clone());
                    let color = readable_on(color.as_deref(), &behind);
                    place(rect, self.sw, self.sh).map(|(x, y, w, h)| SlideElement {
                        id, kind: "text".into(), x, y, w, h, text: Some(text), font_size_pct: Some((size_pct * 10.0).round() / 10.0),
                        color: Some(color), align: Some(align),
                        weight: Some(if bold { "bold" } else { "normal" }.into()), image_path: None, shape: None, fill: None, opacity: None,
                        rotation: None,
                    })
                }
                Draft::Shape { rect, shape, fill, opacity } => {
                    // a mostly see-through shape does not change what the text on it is read against
                    if opacity.map_or(true, |o| o >= 0.5) {
                        cards.push((rect, fill.clone()));
                    }
                    place(rect, self.sw, self.sh).map(|(x, y, w, h)| SlideElement {
                    id, kind: "shape".into(), x, y, w, h, text: None, font_size_pct: None, color: None, align: None, weight: None,
                    image_path: None, shape: Some(shape.into()), fill: Some(fill), opacity,
                    rotation: None,
                    })
                }
                Draft::Image { rect, part } => match place(rect, self.sw, self.sh) {
                    Some((x, y, w, h)) => self.image(&part, n).map(|path| SlideElement {
                        id, kind: "image".into(), x, y, w, h, text: None, font_size_pct: None, color: None, align: None, weight: None,
                        image_path: Some(path), shape: None, fill: None, opacity: None,
                        rotation: None,
                    }),
                    None => None,
                },
            };
            if let Some(el) = element {
                if validate_element(&el).is_ok() {
                    elements.push(el);
                } else {
                    self.warnings.add("invalid", n);
                }
            }
        }
        if elements.len() > MAX_ELEMENTS {
            elements.truncate(MAX_ELEMENTS);
            self.warnings.add("too_many", n);
        }
        // renumber so the ids are tidy after anything was dropped
        for (i, el) in elements.iter_mut().enumerate() {
            el.id = format!("pptx-{}", i + 1);
        }
        let layout_check = SlideLayout { elements: elements.clone(), ..Default::default() };
        if validate_layout(&layout_check).is_err() {
            elements.clear();
            self.warnings.add("invalid", n);
        }

        Ok(ImportedSlide { title, body, background_color, foreground_color, text_alignment, background_image: bg_image, elements })
    }
}

fn has_note_text(notes: &Node) -> bool {
    fn text_of(n: &Node, out: &mut String) {
        if n.name == "t" {
            out.push_str(&n.text);
        }
        for c in &n.children {
            text_of(c, out);
        }
    }
    let Some(tree) = notes.find(&["cSld", "spTree"]) else { return false };
    for sp in tree.kids("sp") {
        // only the notes text, not the slide image or the slide number
        let is_body = sp.find(&["nvSpPr", "nvPr", "ph"]).and_then(|p| p.attr("type")) == Some("body");
        if is_body {
            let mut s = String::new();
            text_of(sp, &mut s);
            if !s.trim().is_empty() {
                return true;
            }
        }
    }
    false
}

/// A rectangle in slide units as percentages that fit inside the slide; None when it is wholly off the slide.
fn place(r: Rect, sw: f64, sh: f64) -> Option<(f64, f64, f64, f64)> {
    if r.x >= sw || r.y >= sh || r.x + r.w <= 0.0 || r.y + r.h <= 0.0 {
        return None;
    }
    let x = (r.x / sw * 100.0).clamp(0.0, 99.0);
    let y = (r.y / sh * 100.0).clamp(0.0, 99.0);
    let w = (r.w / sw * 100.0).clamp(1.0, 100.0 - x);
    let h = (r.h / sh * 100.0).clamp(1.0, 100.0 - y);
    let round = |v: f64| (v * 10.0).round() / 10.0;
    // rounding must never push an edge past the slide
    let (x, y) = (round(x), round(y));
    Some((x, y, round(w).min(100.0 - x), round(h).min(100.0 - y)))
}

/// Reads a .pptx and returns its slides. Fails with a plain-language message if it is not a usable PowerPoint file.
pub fn import_pptx<R: Read + Seek>(reader: R, sink: &mut dyn ImageSink) -> Result<ImportedDeck, String> {
    let mut zip = ZipArchive::new(reader).map_err(|_| "This is not a PowerPoint (.pptx) file, or it is damaged.".to_string())?;
    if zip.len() > MAX_ZIP_ENTRIES {
        return Err("This file contains too many parts to import.".to_string());
    }
    let presentation = read_xml(&mut zip, "ppt/presentation.xml")?.ok_or_else(|| "This is not a PowerPoint (.pptx) file: it has no presentation.".to_string())?;
    let pres_rels = read_rels(&mut zip, "ppt/presentation.xml")?;

    let (sw, sh) = presentation
        .child("sldSz")
        .and_then(|s| Some((s.num("cx")?, s.num("cy")?)))
        .filter(|(w, h)| *w > 0.0 && *h > 0.0)
        .unwrap_or((DEFAULT_SLIDE_W, DEFAULT_SLIDE_H));

    let order: Vec<String> = presentation
        .child("sldIdLst")
        .map(|l| l.kids("sldId").filter_map(|s| s.attr("r:id")).filter_map(|id| pres_rels.get(id)).map(|(_, p)| p.clone()).collect())
        .unwrap_or_default();
    if order.is_empty() {
        return Err("This PowerPoint file has no slides.".to_string());
    }
    if order.len() > MAX_SLIDES {
        return Err(format!("This presentation has more than {MAX_SLIDES} slides, which is more than can be imported."));
    }

    let mut importer = Importer { zip, sink, sw, sh, xml_cache: HashMap::new(), palettes: HashMap::new(), images: HashMap::new(), image_bytes: 0, warnings: Warnings::default() };
    let mut slides = Vec::with_capacity(order.len());
    for (i, part) in order.iter().enumerate() {
        slides.push(importer.slide(i + 1, part)?);
    }
    Ok(ImportedDeck { slides, warnings: importer.warnings.messages() })
}

/// Writes imported pictures into a folder under the app's media directory.
pub struct DiskSink {
    dir: std::path::PathBuf,
    /// The folder as a `media/...` path.
    rel_dir: String,
    count: usize,
}

impl DiskSink {
    pub fn new(dir: std::path::PathBuf, rel_dir: String) -> Result<Self, String> {
        std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create the picture folder: {e}"))?;
        Ok(Self { dir, rel_dir, count: 0 })
    }
}

impl DiskSink {
    fn is_empty(&self) -> bool {
        self.count == 0
    }
}

impl ImageSink for DiskSink {
    fn store(&mut self, data: &[u8], ext: &str) -> Result<String, String> {
        self.count += 1;
        let name = format!("image{}.{}", self.count, ext);
        std::fs::write(self.dir.join(&name), data).map_err(|e| format!("Could not save a picture: {e}"))?;
        Ok(format!("{}/{}", self.rel_dir, name))
    }
}

/// What the import command gives back.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxImportResult {
    pub presentation: crate::models::Presentation,
    pub slide_count: usize,
    /// What could not be imported, in plain words.
    pub warnings: Vec<String>,
}

/// Imports a .pptx file as a new presentation of editable slides. Pictures are saved under
/// `<app_data_dir>/media/presentations/<id>/`. If anything fails, nothing is left behind.
pub fn import_pptx_file(
    db: &crate::db::DbManager,
    app_data_dir: &std::path::Path,
    file_path: &str,
    title: Option<String>,
) -> Result<PptxImportResult, String> {
    let path = std::path::Path::new(file_path);
    if !path.is_file() {
        return Err(format!("File not found: {file_path}"));
    }
    if path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() != Some("pptx") {
        return Err("Only .pptx files can be imported this way.".to_string());
    }
    let size = std::fs::metadata(path).map_err(|e| format!("Could not read the file: {e}"))?.len();
    if size > MAX_FILE_BYTES {
        return Err(format!("This file is larger than {} MB, which is more than can be imported.", MAX_FILE_BYTES / 1024 / 1024));
    }
    let file = std::fs::File::open(path).map_err(|e| format!("Could not open the file: {e}"))?;

    let folder_id = uuid::Uuid::new_v4().to_string();
    let dir = app_data_dir.join("media").join("presentations").join(&folder_id);
    let mut sink = DiskSink::new(dir.clone(), format!("media/presentations/{folder_id}"))?;
    let cleanup = |dir: &std::path::Path| {
        let _ = std::fs::remove_dir_all(dir);
    };

    let deck = match import_pptx(std::io::BufReader::new(file), &mut sink) {
        Ok(d) => d,
        Err(e) => {
            cleanup(&dir);
            return Err(e);
        }
    };

    let name = title
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| path.file_stem().and_then(|s| s.to_str()).unwrap_or("Presentation").to_string());
    let presentation = match db.create_presentation(&name, "presentation", None) {
        Ok(p) => p,
        Err(e) => {
            cleanup(&dir);
            return Err(e.to_string());
        }
    };
    let now = chrono::Utc::now().to_rfc3339();
    for (i, s) in deck.slides.iter().enumerate() {
        let slide = crate::models::Slide {
            id: String::new(),
            presentation_id: presentation.id.clone(),
            sort_order: i as i32,
            title: s.title.clone(),
            body: s.body.clone(),
            background_color: s.background_color.clone(),
            foreground_color: s.foreground_color.clone(),
            font_size: "medium".to_string(),
            text_alignment: s.text_alignment.clone(),
            theme_override: None,
            background_image: s.background_image.clone(),
            overlay_color: None,
            line_spacing: None,
            text_shadow: None,
            vertical_alignment: None,
            font_family: None,
            font_weight: None,
            group_label: None,
            group_color: None,
            layout: if s.elements.is_empty() { None } else { Some(SlideLayout { elements: s.elements.clone(), ..Default::default() }) },
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        if let Err(e) = db.create_slide(&slide) {
            // never leave a half-imported presentation behind
            let _ = db.delete_presentation(&presentation.id);
            cleanup(&dir);
            return Err(format!("Could not save slide {}: {e}", i + 1));
        }
    }
    if sink.is_empty() {
        cleanup(&dir); // no pictures: do not leave an empty folder
    }
    let presentation = db.get_presentation(&presentation.id).map_err(|e| e.to_string())?.unwrap_or(presentation);
    Ok(PptxImportResult { presentation, slide_count: deck.slides.len(), warnings: deck.warnings })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Write};
    use zip::write::SimpleFileOptions;

    const NS: &str = r#"xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main""#;
    // 10 x 5.625 inch slide
    const W: f64 = 9_144_000.0;
    const H: f64 = 5_143_500.0;

    #[derive(Default)]
    struct MemSink {
        stored: Vec<(String, usize)>,
    }
    impl ImageSink for MemSink {
        fn store(&mut self, data: &[u8], ext: &str) -> Result<String, String> {
            self.stored.push((ext.to_string(), data.len()));
            Ok(format!("media/presentations/test/image{}.{}", self.stored.len(), ext))
        }
    }

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    fn rels_xml(items: &[(&str, &str, &str)]) -> String {
        let body: String = items.iter().map(|(id, ty, target)| format!(r#"<Relationship Id="{id}" Type="http://x/rel/{ty}" Target="{target}"/>"#)).collect();
        format!(r#"<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>"#)
    }

    fn slide_xml(shapes: &str, extra: &str) -> String {
        format!(r#"<?xml version="1.0"?><p:sld {NS}><p:cSld><p:spTree><p:nvGrpSpPr/><p:grpSpPr/>{shapes}</p:spTree></p:cSld>{extra}</p:sld>"#)
    }

    /// A text shape: `ph` is a placeholder tag such as `<p:ph type="title"/>`; `xfrm` is an `<a:xfrm>` or empty.
    fn sp(ph: &str, xfrm: &str, extra_sp_pr: &str, paras: &str) -> String {
        format!(r#"<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>{ph}</p:nvPr></p:nvSpPr><p:spPr>{xfrm}{extra_sp_pr}</p:spPr><p:txBody><a:bodyPr/><a:p>{paras}</a:p></p:txBody></p:sp>"#)
    }
    fn xfrm(x: i64, y: i64, w: i64, h: i64) -> String {
        format!(r#"<a:xfrm><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm>"#)
    }
    fn run(text: &str, rpr: &str) -> String {
        format!(r#"<a:r><a:rPr lang="en-US" {rpr}/><a:t>{text}</a:t></a:r>"#)
    }

    struct Deck {
        slides: Vec<(String, Vec<(&'static str, &'static str, &'static str)>)>,
        files: Vec<(String, Vec<u8>)>,
        layout: String,
        master: String,
        theme: String,
    }

    fn deck() -> Deck {
        Deck {
            slides: vec![],
            files: vec![],
            layout: format!(r#"<?xml version="1.0"?><p:sldLayout {NS}><p:cSld><p:spTree>{}{}</p:spTree></p:cSld></p:sldLayout>"#,
                sp(r#"<p:ph type="title"/>"#, &xfrm(457200, 228600, 8229600, 857250), "", ""),
                sp(r#"<p:ph idx="1"/>"#, &xfrm(457200, 1200150, 8229600, 3394472), "", "")),
            master: format!(r#"<?xml version="1.0"?><p:sldMaster {NS}><p:cSld><p:spTree/></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2"/></p:sldMaster>"#),
            theme: format!(r#"<?xml version="1.0"?><a:theme {NS}><a:themeElements><a:clrScheme name="t"><a:dk1><a:srgbClr val="111111"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3864"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="C00000"/></a:accent1></a:clrScheme></a:themeElements></a:theme>"#),
        }
    }

    impl Deck {
        fn slide(mut self, xml: String, rels: Vec<(&'static str, &'static str, &'static str)>) -> Self {
            self.slides.push((xml, rels));
            self
        }
        fn file(mut self, name: &str, data: &[u8]) -> Self {
            self.files.push((name.to_string(), data.to_vec()));
            self
        }
        fn build(&self) -> Vec<u8> {
            let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
            let opt = SimpleFileOptions::default();
            let mut put = |name: &str, data: &[u8]| {
                w.start_file(name, opt).unwrap();
                w.write_all(data).unwrap();
            };
            let ids: String = (1..=self.slides.len()).map(|i| format!(r#"<p:sldId id="{}" r:id="rId{}"/>"#, 255 + i, i)).collect();
            put("ppt/presentation.xml", format!(r#"<?xml version="1.0"?><p:presentation {NS}><p:sldIdLst>{ids}</p:sldIdLst><p:sldSz cx="{}" cy="{}"/></p:presentation>"#, W as i64, H as i64).as_bytes());
            let pres_rels: Vec<(String, String, String)> = (1..=self.slides.len()).map(|i| (format!("rId{i}"), "slide".to_string(), format!("slides/slide{i}.xml"))).collect();
            let rels_body: String = pres_rels.iter().map(|(id, ty, t)| format!(r#"<Relationship Id="{id}" Type="http://x/rel/{ty}" Target="{t}"/>"#)).collect();
            put("ppt/_rels/presentation.xml.rels", format!(r#"<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{rels_body}</Relationships>"#).as_bytes());
            put("ppt/slideLayouts/slideLayout1.xml", self.layout.as_bytes());
            put("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels_xml(&[("rId1", "slideMaster", "../slideMasters/slideMaster1.xml")]).as_bytes());
            put("ppt/slideMasters/slideMaster1.xml", self.master.as_bytes());
            put("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels_xml(&[("rId1", "theme", "../theme/theme1.xml")]).as_bytes());
            put("ppt/theme/theme1.xml", self.theme.as_bytes());
            for (i, (xml, rels)) in self.slides.iter().enumerate() {
                put(&format!("ppt/slides/slide{}.xml", i + 1), xml.as_bytes());
                let mut all = vec![("rIdL", "slideLayout", "../slideLayouts/slideLayout1.xml")];
                all.extend(rels.iter().cloned());
                put(&format!("ppt/slides/_rels/slide{}.xml.rels", i + 1), rels_xml(&all).as_bytes());
            }
            for (name, data) in &self.files {
                put(name, data);
            }
            w.finish().unwrap().into_inner()
        }
        fn import(&self) -> (Result<ImportedDeck, String>, MemSink) {
            let mut sink = MemSink::default();
            let r = import_pptx(Cursor::new(self.build()), &mut sink);
            (r, sink)
        }
    }

    fn import_one(shapes: &str) -> ImportedDeck {
        deck().slide(slide_xml(shapes, ""), vec![]).import().0.unwrap()
    }

    #[test]
    fn title_and_body_placeholders_become_the_slide_text_in_reading_order() {
        let title = sp(r#"<p:ph type="title"/>"#, "", "", &run("Welcome", ""));
        let body = sp(r#"<p:ph idx="1"/>"#, "", "", &format!("{}</a:p><a:p>{}", run("First point", ""), run("Second point", "")));
        // the body is listed first in the file, but the title still leads
        let d = import_one(&format!("{body}{title}"));
        let s = &d.slides[0];
        assert_eq!(s.title, "Welcome");
        assert_eq!(s.body, "Welcome\n\nFirst point\nSecond point");
        assert!(s.elements.is_empty()); // placeholders are text, not extra items
        assert!(d.warnings.is_empty());
    }

    #[test]
    fn slides_come_in_the_order_the_presentation_lists_them() {
        let one = slide_xml(&sp(r#"<p:ph type="title"/>"#, "", "", &run("One", "")), "");
        let two = slide_xml(&sp(r#"<p:ph type="title"/>"#, "", "", &run("Two", "")), "");
        let d = deck().slide(one, vec![]).slide(two, vec![]).import().0.unwrap();
        assert_eq!(d.slides.iter().map(|s| s.title.as_str()).collect::<Vec<_>>(), vec!["One", "Two"]);
    }

    #[test]
    fn a_slide_with_no_text_gets_a_numbered_title() {
        let d = import_one("");
        assert_eq!(d.slides[0].title, "Slide 1");
        assert_eq!(d.slides[0].body, "");
    }

    #[test]
    fn text_boxes_become_positioned_elements_with_size_colour_weight_and_alignment() {
        let tb = format!(
            r#"<p:sp><p:nvSpPr><p:cNvPr id="3" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>{}</p:spPr><p:txBody><a:bodyPr/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="2400" b="1"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:rPr><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp>"#,
            xfrm(914_400, 457_200, 1_828_800, 914_400)
        );
        let d = import_one(&tb);
        let el = &d.slides[0].elements[0];
        assert_eq!((el.kind.as_str(), el.text.as_deref()), ("text", Some("Hello")));
        assert_eq!((el.x, el.y, el.w, el.h), (10.0, 8.9, 20.0, 17.8)); // percentages of the slide
        assert_eq!(el.color.as_deref(), Some("#ff0000"));
        assert_eq!((el.weight.as_deref(), el.align.as_deref()), (Some("bold"), Some("center")));
        // 24 pt on a 405 pt tall slide
        let expected = (24.0 * 12700.0 / H * 100.0 * 10.0_f64).round() / 10.0;
        assert_eq!(el.font_size_pct, Some(expected));
        assert!(validate_element(el).is_ok());
    }

    #[test]
    fn text_that_could_not_be_read_is_changed_to_black_or_white_for_what_is_behind_it() {
        let text = |x: i64, color: &str| format!(
            r#"<p:sp><p:nvSpPr><p:cNvPr id="3" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>{}</p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="2000">{color}</a:rPr><a:t>Hi</a:t></a:r></a:p></p:txBody></p:sp>"#,
            xfrm(x, 0, 900_000, 400_000)
        );
        let fill = |c: &str| format!(r#"<a:solidFill><a:srgbClr val="{c}"/></a:solidFill>"#);
        // light grey on the white page: unreadable, so it becomes black; dark blue on white is fine and kept
        let d = import_one(&format!("{}{}", text(0, &fill("CFD2D9")), text(1_000_000, &fill("1F3864"))));
        let (grey, blue) = (&d.slides[0].elements[0], &d.slides[0].elements[1]);
        assert_eq!((grey.color.as_deref(), blue.color.as_deref()), (Some("#000000"), Some("#1f3864")));
        // text with no colour of its own follows the page
        assert_eq!(import_one(&text(0, "")).slides[0].elements[0].color.as_deref(), Some("#000000"));

        // on a dark blue card the same grey is readable, black is not, and text with no colour turns white
        let card = format!(
            r#"<p:sp><p:nvSpPr><p:cNvPr id="4" name="c"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>{}<a:prstGeom prst="rect"/>{}</p:spPr></p:sp>"#,
            xfrm(0, 0, 3_000_000, 1_000_000), fill("102060")
        );
        let d = import_one(&format!("{card}{}{}{}", text(0, &fill("CFD2D9")), text(1_000_000, &fill("000000")), text(2_000_000, "")));
        let colors: Vec<&str> = d.slides[0].elements.iter().filter(|e| e.kind == "text").map(|e| e.color.as_deref().unwrap()).collect();
        assert_eq!(colors, vec!["#cfd2d9", "#ffffff", "#ffffff"]);
    }

    #[test]
    fn shapes_become_filled_rectangles_and_ellipses_and_other_shapes_are_reported() {
        let shape = |prst: &str, fill: &str| format!(r#"<p:sp><p:nvSpPr><p:cNvPr id="4" name="x"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>{}<a:prstGeom prst="{prst}"/>{fill}</p:spPr></p:sp>"#, xfrm(0, 0, 4_572_000, 2_571_750));
        let d = import_one(&format!(
            "{}{}{}",
            shape("rect", r#"<a:solidFill><a:srgbClr val="00FF00"><a:alpha val="50000"/></a:srgbClr></a:solidFill>"#),
            shape("ellipse", r#"<a:solidFill><a:srgbClr val="0000FF"/></a:solidFill>"#),
            shape("triangle", r#"<a:solidFill><a:srgbClr val="0000FF"/></a:solidFill>"#),
        ));
        let els = &d.slides[0].elements;
        assert_eq!(els.len(), 2);
        assert_eq!((els[0].shape.as_deref(), els[0].fill.as_deref(), els[0].opacity), (Some("rect"), Some("#00ff00"), Some(0.5)));
        assert_eq!((els[1].shape.as_deref(), els[1].fill.as_deref()), (Some("ellipse"), Some("#0000ff")));
        assert_eq!((els[0].w, els[0].h), (50.0, 50.0));
        assert!(d.warnings.iter().any(|w| w.contains("Shapes other than rectangles and ellipses")));
        // an outline-only shape with no fill adds nothing
        assert!(import_one(&shape("rect", "<a:noFill/>")).slides[0].elements.is_empty());
    }

    #[test]
    fn items_in_a_group_are_moved_and_scaled_with_it() {
        // the group is drawn at (1000000, 500000) 2x2 inches, its children are laid out in a 100x100 space
        let child = format!(r#"<p:sp><p:nvSpPr><p:cNvPr id="5" name="c"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>{}<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="123456"/></a:solidFill></p:spPr></p:sp>"#, xfrm(50, 50, 25, 25));
        let grp = format!(
            r#"<p:grpSp><p:nvGrpSpPr/><p:grpSpPr><a:xfrm><a:off x="914400" y="457200"/><a:ext cx="1828800" cy="1828800"/><a:chOff x="0" y="0"/><a:chExt cx="100" cy="100"/></a:xfrm></p:grpSpPr>{child}</p:grpSp>"#
        );
        let el = &import_one(&grp).slides[0].elements[0];
        // child x = 914400 + 50 * 18288 = 1828800 -> 20 %; width = 25 * 18288 = 457200 -> 5 %
        assert_eq!((el.x, el.w), (20.0, 5.0));
        let expected_y = (((457_200.0 + 50.0 * 18_288.0) / H * 100.0) * 10.0_f64).round() / 10.0;
        assert_eq!(el.y, expected_y);
    }

    #[test]
    fn a_placeholder_without_its_own_position_is_placed_from_the_layout() {
        // two placeholders with no position of their own, listed bottom-first in the file: the layout puts the
        // body (idx 1) on the page but has no place for a subtitle, so the body reads first
        let second = sp(r#"<p:ph type="subTitle" idx="2"/>"#, "", "", &run("Second", ""));
        let first = sp(r#"<p:ph idx="1"/>"#, "", "", &run("First", ""));
        assert_eq!(import_one(&format!("{second}{first}")).slides[0].body, "First\nSecond");
        // a position on the slide itself wins over the layout: idx 1 moved below the unplaced one
        let moved = sp(r#"<p:ph idx="1"/>"#, &xfrm(0, 4_500_000, 1_000_000, 500_000), "", &run("First", ""));
        let placed = sp(r#"<p:ph idx="3"/>"#, &xfrm(0, 100_000, 1_000_000, 500_000), "", &run("Top", ""));
        assert_eq!(import_one(&format!("{moved}{placed}")).slides[0].body, "Top\nFirst");
        // titles always lead, whatever their position
        let low = sp(r#"<p:ph type="title"/>"#, &xfrm(0, 4_000_000, 1_000_000, 500_000), "", &run("Lower title", ""));
        assert_eq!(import_one(&format!("{low}{first}")).slides[0].body, "Lower title\n\nFirst");
    }

    #[test]
    fn the_background_comes_from_the_slide_else_the_theme_and_text_colour_follows_it() {
        // no background anywhere: white page, dark text
        let plain = import_one("");
        assert_eq!((plain.slides[0].background_color.as_str(), plain.slides[0].foreground_color.as_str()), ("#ffffff", "#000000"));
        // a solid colour on the slide: dark page, light text
        let dark = deck().slide(
            format!(r#"<?xml version="1.0"?><p:sld {NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="102030"/></a:solidFill></p:bgPr></p:bg><p:spTree/></p:cSld></p:sld>"#),
            vec![],
        ).import().0.unwrap();
        assert_eq!((dark.slides[0].background_color.as_str(), dark.slides[0].foreground_color.as_str()), ("#102030", "#ffffff"));
        // a theme colour, resolved through the master's colour map
        let mut themed = deck();
        themed.master = format!(r#"<?xml version="1.0"?><p:sldMaster {NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree/></p:cSld><p:clrMap bg1="dk2" tx1="lt1" bg2="dk1" tx2="lt2"/></p:sldMaster>"#);
        let d = themed.slide(slide_xml("", ""), vec![]).import().0.unwrap();
        assert_eq!((d.slides[0].background_color.as_str(), d.slides[0].foreground_color.as_str()), ("#1f3864", "#ffffff")); // bg1 -> dk2
    }

    #[test]
    fn special_characters_line_breaks_and_bullets_are_kept() {
        let body = sp(
            r#"<p:ph idx="1"/>"#, "", "",
            &format!(r#"<a:pPr><a:buChar char="•"/></a:pPr>{}<a:br/>{}</a:p><a:p>{}"#, run("Tom &amp; Jerry &lt;3 &#x41;&#66;", ""), run("next line", ""), run("plain", "")),
        );
        let s = &import_one(&body).slides[0];
        assert_eq!(s.body, "• Tom & Jerry <3 AB\nnext line\nplain");
    }

    #[test]
    fn pictures_are_stored_once_by_content_and_shown_as_image_elements() {
        let pic = |id: &str, x: i64| format!(r#"<p:pic><p:nvPicPr><p:cNvPr id="6" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="{id}"/></p:blipFill><p:spPr>{}</p:spPr></p:pic>"#, xfrm(x, 0, 914_400, 914_400));
        let one = slide_xml(&format!("{}{}", pic("rId5", 0), pic("rId5", 914_400)), "");
        let two = slide_xml(&pic("rId5", 0), "");
        let (d, sink) = deck()
            .slide(one, vec![("rId5", "image", "../media/logo.png")])
            .slide(two, vec![("rId5", "image", "../media/logo.png")])
            .file("ppt/media/logo.png", PNG)
            .import();
        let d = d.unwrap();
        assert_eq!(sink.stored.len(), 1); // used three times, saved once
        assert_eq!(d.slides[0].elements.len(), 2);
        assert_eq!(d.slides[0].elements[0].image_path.as_deref(), Some("media/presentations/test/image1.png"));
        assert_eq!(d.slides[1].elements[0].image_path, d.slides[0].elements[0].image_path);
        assert!(d.warnings.is_empty());
    }

    #[test]
    fn pictures_that_cannot_be_shown_or_are_not_what_they_claim_are_left_out_with_a_warning() {
        let pic = |id: &str| format!(r#"<p:pic><p:nvPicPr><p:cNvPr id="6" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="{id}"/></p:blipFill><p:spPr>{}</p:spPr></p:pic>"#, xfrm(0, 0, 914_400, 914_400));
        let (d, sink) = deck()
            .slide(slide_xml(&format!("{}{}{}", pic("rId5"), pic("rId6"), pic("rId7")), ""), vec![
                ("rId5", "image", "../media/vector.emf"),
                ("rId6", "image", "../media/fake.png"),
                ("rId7", "image", "../media/missing.png"),
            ])
            .file("ppt/media/vector.emf", &[1, 0, 0, 0, 0x20, 0x45, 0x4D, 0x46])
            .file("ppt/media/fake.png", b"<script>alert(1)</script>") // named like a picture, but is not one
            .import();
        let d = d.unwrap();
        assert!(d.slides[0].elements.is_empty());
        assert!(sink.stored.is_empty());
        assert!(d.warnings.iter().any(|w| w.contains("format that cannot be shown")));
        assert!(d.warnings.iter().any(|w| w.contains("could not be read")));
    }

    #[test]
    fn a_picture_background_is_stored_as_the_slide_background() {
        let xml = format!(r#"<?xml version="1.0"?><p:sld {NS}><p:cSld><p:bg><p:bgPr><a:blipFill><a:blip r:embed="rId5"/></a:blipFill></p:bgPr></p:bg><p:spTree/></p:cSld></p:sld>"#);
        let (d, _) = deck().slide(xml, vec![("rId5", "image", "../media/bg.png")]).file("ppt/media/bg.png", PNG).import();
        assert_eq!(d.unwrap().slides[0].background_image.as_deref(), Some("media/presentations/test/image1.png"));
    }

    #[test]
    fn what_cannot_be_imported_is_reported_by_kind_with_the_slide_numbers() {
        let frame = |uri: &str| format!(r#"<p:graphicFrame><p:nvGraphicFramePr/><p:graphic><a:graphicData uri="{uri}"/></p:graphic></p:graphicFrame>"#);
        let video = r#"<p:pic><p:nvPicPr><p:cNvPr id="9" name="v"/><p:cNvPicPr/><p:nvPr><a:videoFile r:link="rId9"/></p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="rId5"/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm></p:spPr></p:pic>"#;
        let rotated = format!(r#"<p:sp><p:nvSpPr><p:cNvPr id="4" name="r"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm rot="2700000"><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp>"#);
        let shapes = format!(
            "{}{}{}{}{}{}",
            frame("http://schemas.openxmlformats.org/drawingml/2006/chart"),
            frame("http://schemas.openxmlformats.org/drawingml/2006/diagram"),
            frame("http://schemas.openxmlformats.org/drawingml/2006/table"),
            frame("http://other"),
            video,
            rotated
        );
        let notes = format!(r#"<?xml version="1.0"?><p:notes {NS}><p:cSld><p:spTree>{}</p:spTree></p:cSld></p:notes>"#, sp(r#"<p:ph type="body" idx="1"/>"#, "", "", &run("Remember to smile", "")));
        let d = deck()
            .slide(slide_xml("", ""), vec![])
            .slide(slide_xml(&shapes, "<p:transition/><p:timing/>"), vec![("rIdN", "notesSlide", "../notesSlides/notesSlide2.xml")])
            .file("ppt/notesSlides/notesSlide2.xml", notes.as_bytes())
            .import()
            .0
            .unwrap();
        let w = d.warnings.join("\n");
        for needle in ["Charts were left out (slide 2)", "SmartArt diagrams were left out (slide 2)", "Tables that could not be read were left out (slide 2)", "Other embedded objects were left out (slide 2)",
            "Video and audio were left out (slide 2)", "Rotated items are shown unrotated (slide 2)", "Transitions and animations were not imported (slide 2)", "Speaker notes were not imported (slide 2)"] {
            assert!(w.contains(needle), "missing: {needle}\n{w}");
        }
        assert_eq!(d.slides[1].elements.len(), 1); // the rotated shape is still there, unrotated
    }

    fn table_frame(rows: &[&[&str]], with_xfrm: bool) -> String {
        let trs: String = rows
            .iter()
            .map(|r| {
                let tcs: String = r.iter().map(|c| format!(r#"<a:tc><a:txBody><a:bodyPr/><a:p>{}</a:p></a:txBody></a:tc>"#, if c.is_empty() { String::new() } else { run(c, r#"sz="1400""#) })).collect();
                format!("<a:tr>{tcs}</a:tr>")
            })
            .collect();
        let x = if with_xfrm { r#"<p:xfrm><a:off x="914400" y="914400"/><a:ext cx="4572000" cy="1028700"/></p:xfrm>"# } else { "" };
        format!(r#"<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="7" name="t"/></p:nvGraphicFramePr>{x}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblGrid/>{trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>"#)
    }

    #[test]
    fn a_table_becomes_plain_text_with_one_line_per_row() {
        let d = import_one(&table_frame(&[&["Day", "Event"], &["Wed", "Prayer meeting"], &["Sun", "Worship", ""]], true));
        let el = &d.slides[0].elements[0];
        assert_eq!(el.text.as_deref(), Some("Day  |  Event\nWed  |  Prayer meeting\nSun  |  Worship"));
        assert_eq!((el.x, el.y, el.w), (10.0, 17.8, 50.0)); // from the frame's own position
        assert_eq!(el.align.as_deref(), Some("left"));
        assert!(d.warnings.iter().any(|w| w.contains("Tables were imported as plain text") && w.contains("slide 1")));
        assert!(!d.warnings.iter().any(|w| w.contains("could not be read")));
    }

    #[test]
    fn an_empty_or_unplaced_table_is_reported_instead() {
        for frame in [table_frame(&[&["", ""], &[""]], true), table_frame(&[&["A"]], false), table_frame(&[], true)] {
            let d = import_one(&frame);
            assert!(d.slides[0].elements.is_empty());
            assert!(d.warnings.iter().any(|w| w.contains("Tables that could not be read were left out")), "{:?}", d.warnings);
        }
    }

    #[test]
    fn hidden_shapes_and_everything_in_a_hidden_group_are_skipped() {
        let shape = |hidden: &str, fill: &str| format!(r#"<p:sp><p:nvSpPr><p:cNvPr id="4" name="x" {hidden}/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>{}<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="{fill}"/></a:solidFill></p:spPr></p:sp>"#, xfrm(0, 0, 914_400, 914_400));
        let group = |hidden: &str, inner: &str| format!(r#"<p:grpSp><p:nvGrpSpPr><p:cNvPr id="8" name="g" {hidden}/></p:nvGrpSpPr><p:grpSpPr/>{inner}</p:grpSp>"#);
        let d = import_one(&format!(
            "{}{}{}{}",
            shape("", "111111"),
            shape(r#"hidden="1""#, "222222"),
            group(r#"hidden="1""#, &shape("", "333333")),
            group("", &shape("", "444444")),
        ));
        let fills: Vec<&str> = d.slides[0].elements.iter().map(|e| e.fill.as_deref().unwrap()).collect();
        assert_eq!(fills, vec!["#111111", "#444444"]);
    }

    #[test]
    fn slide_numbers_in_warnings_are_listed_compactly() {
        assert_eq!(list_slides(&[3, 1, 2]), "1, 2, 3");
        assert_eq!(list_slides(&(1..=12).collect::<Vec<_>>()), "1, 2, 3, 4, 5, 6, 7, 8 and 4 more");
    }

    #[test]
    fn extra_items_beyond_the_limit_are_dropped_and_reported() {
        let one = |i: i64| format!(r#"<p:sp><p:nvSpPr><p:cNvPr id="4" name="x"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>{}<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp>"#, xfrm(i * 100_000, 0, 50_000, 50_000));
        let d = import_one(&(0..30).map(one).collect::<String>());
        assert_eq!(d.slides[0].elements.len(), MAX_ELEMENTS);
        assert!(d.warnings.iter().any(|w| w.contains("Only the first 20 extra items")));
        let ids: Vec<&str> = d.slides[0].elements.iter().map(|e| e.id.as_str()).collect();
        assert_eq!((ids[0], ids[19]), ("pptx-1", "pptx-20"));
        assert!(validate_layout(&SlideLayout { elements: d.slides[0].elements.clone(), ..Default::default() }).is_ok());
    }

    #[test]
    fn items_off_the_slide_are_skipped_and_edge_items_are_kept_inside() {
        let r = |x: i64, y: i64, w: i64, h: i64| format!(r#"<p:sp><p:nvSpPr><p:cNvPr id="4" name="x"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>{}<a:prstGeom prst="rect"/><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></p:spPr></p:sp>"#, xfrm(x, y, w, h));
        let d = import_one(&format!(
            "{}{}{}",
            r(20_000_000, 0, 100, 100),              // far to the right
            r(-5_000_000, 0, 1_000_000, 1_000_000),  // far to the left
            r(-500_000, -500_000, 20_000_000, 20_000_000), // bigger than the slide
        ));
        let els = &d.slides[0].elements;
        assert_eq!(els.len(), 1);
        assert!(els[0].x >= 0.0 && els[0].y >= 0.0 && els[0].x + els[0].w <= 100.0 && els[0].y + els[0].h <= 100.0);
        assert!(validate_element(&els[0]).is_ok());
    }

    #[test]
    fn long_text_in_a_text_box_is_shortened_with_a_warning() {
        let tb = format!(r#"<p:sp><p:nvSpPr><p:cNvPr id="3" name="t"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>{}</p:spPr><p:txBody><a:bodyPr/><a:p>{}</a:p></p:txBody></p:sp>"#, xfrm(0, 0, 4_000_000, 2_000_000), run(&"word ".repeat(300), ""));
        let d = import_one(&tb);
        assert!(d.slides[0].elements[0].text.as_ref().unwrap().chars().count() <= MAX_ELEMENT_TEXT_CHARS);
        assert!(d.warnings.iter().any(|w| w.contains("Long text")));
    }

    #[test]
    fn files_that_are_not_usable_powerpoint_files_are_refused_in_plain_words() {
        let mut sink = MemSink::default();
        let err = |bytes: Vec<u8>, sink: &mut MemSink| import_pptx(Cursor::new(bytes), sink).unwrap_err();
        assert!(err(b"not a zip at all".to_vec(), &mut sink).contains("not a PowerPoint"));
        assert!(err(vec![], &mut sink).contains("not a PowerPoint"));
        // a zip with no presentation
        let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
        w.start_file("hello.txt", SimpleFileOptions::default()).unwrap();
        w.write_all(b"hi").unwrap();
        assert!(err(w.finish().unwrap().into_inner(), &mut sink).contains("no presentation"));
        // a presentation with no slides
        let empty = deck().build();
        assert!(err(empty, &mut sink).contains("no slides"));
    }

    #[test]
    fn hostile_xml_and_oversized_parts_are_refused() {
        let mut sink = MemSink::default();
        // XML nested far deeper than any slide
        let deep = format!("{}{}", "<a:x>".repeat(500), "</a:x>".repeat(500));
        let d = deck().slide(format!(r#"<?xml version="1.0"?><p:sld {NS}><p:cSld><p:spTree>{deep}</p:spTree></p:cSld></p:sld>"#), vec![]);
        assert!(import_pptx(Cursor::new(d.build()), &mut sink).unwrap_err().contains("nested too deeply"));
        // broken XML
        let d = deck().slide("<p:sld><unclosed>".to_string(), vec![]);
        assert!(import_pptx(Cursor::new(d.build()), &mut sink).is_err());
        // an XML part over the size limit
        let huge = format!(r#"<?xml version="1.0"?><p:sld {NS}><p:cSld><p:spTree/></p:cSld><!--{}--></p:sld>"#, "x".repeat(MAX_XML_BYTES as usize + 10));
        let d = deck().slide(huge, vec![]);
        assert!(import_pptx(Cursor::new(d.build()), &mut sink).unwrap_err().contains("too large"));
        // an entity that is not one of the five is simply dropped; nothing is expanded
        let bomb = format!(r#"<?xml version="1.0"?><!DOCTYPE p [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><p:sld {NS}><p:cSld><p:spTree>{}</p:spTree></p:cSld></p:sld>"#, sp(r#"<p:ph type="title"/>"#, "", "", &run("x&b;y", "")));
        let d = deck().slide(bomb, vec![]).import().0.unwrap();
        assert_eq!(d.slides[0].body, "xy");
    }

    #[test]
    fn a_relationship_cannot_point_outside_the_package() {
        assert_eq!(resolve_target("ppt/slides", "../media/a.png").as_deref(), Some("ppt/media/a.png"));
        assert_eq!(resolve_target("ppt/slides", "/ppt/media/a.png").as_deref(), Some("ppt/media/a.png"));
        assert_eq!(resolve_target("ppt/slides", "slide2.xml").as_deref(), Some("ppt/slides/slide2.xml"));
        assert_eq!(resolve_target("ppt/slides", "../../../etc/passwd"), None);
        assert_eq!(resolve_target("", ".."), None);
        assert_eq!(rels_name("ppt/slides/slide1.xml"), "ppt/slides/_rels/slide1.xml.rels");
    }

    #[test]
    fn pictures_are_recognised_by_their_first_bytes() {
        assert_eq!(sniff_image(PNG), Some("png"));
        assert_eq!(sniff_image(&[0xFF, 0xD8, 0xFF, 0xE0, 0]), Some("jpg"));
        assert_eq!(sniff_image(b"GIF89a....."), Some("gif"));
        assert_eq!(sniff_image(b"RIFF\x00\x00\x00\x00WEBPVP8 "), Some("webp"));
        for not in [&b""[..], b"<svg xmlns='http://www.w3.org/2000/svg'/>", b"MZ\x90\x00", b"%PDF-1.7", b"RIFF\x00\x00\x00\x00WAVEfmt "] {
            assert_eq!(sniff_image(not), None);
        }
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("cp-pptx-{tag}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn picture_deck() -> Deck {
        let pic = format!(r#"<p:pic><p:nvPicPr><p:cNvPr id="6" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId5"/></p:blipFill><p:spPr>{}</p:spPr></p:pic>"#, xfrm(0, 0, 914_400, 914_400));
        let title = sp(r#"<p:ph type="title"/>"#, "", "", &run("Announcements", ""));
        deck()
            .slide(slide_xml(&format!("{title}{pic}"), ""), vec![("rId5", "image", "../media/logo.png")])
            .slide(slide_xml(&sp(r#"<p:ph idx="1"/>"#, "", "", &run("Second slide", "")), ""), vec![])
            .file("ppt/media/logo.png", PNG)
    }

    #[test]
    fn a_file_becomes_a_presentation_of_editable_slides_with_its_pictures_saved() {
        let db = crate::db::DbManager::new_in_memory().unwrap();
        let (data, app) = (temp_dir("data"), temp_dir("app"));
        let file = data.join("Sunday Notices.pptx");
        std::fs::write(&file, picture_deck().build()).unwrap();

        let r = import_pptx_file(&db, &app, file.to_str().unwrap(), None).unwrap();
        assert_eq!((r.presentation.title.as_str(), r.slide_count), ("Sunday Notices", 2));
        assert!(r.warnings.is_empty());
        let slides = db.get_slides(&r.presentation.id).unwrap();
        assert_eq!(slides.iter().map(|s| s.title.as_str()).collect::<Vec<_>>(), vec!["Announcements", "Second slide"]);
        assert_eq!(slides[0].body, "Announcements");
        // the picture is an element of the first slide, saved where the app looks for media
        let img = slides[0].layout.as_ref().unwrap().elements[0].image_path.clone().unwrap();
        assert!(img.starts_with("media/presentations/") && img.ends_with("image1.png"));
        assert_eq!(std::fs::read(app.join(&img)).unwrap(), PNG);
        assert!(slides[1].layout.is_none());
        // and the stored layout reads back valid (a damaged one would be dropped)
        assert_eq!(db.get_slides(&r.presentation.id).unwrap()[0].layout.as_ref().unwrap().elements.len(), 1);

        // an explicit title wins
        let r2 = import_pptx_file(&db, &app, file.to_str().unwrap(), Some("  Notices  ".into())).unwrap();
        assert_eq!(r2.presentation.title, "Notices");
        let _ = std::fs::remove_dir_all(data);
        let _ = std::fs::remove_dir_all(app);
    }

    #[test]
    fn a_failed_import_leaves_no_presentation_and_no_files_behind() {
        let db = crate::db::DbManager::new_in_memory().unwrap();
        let (data, app) = (temp_dir("data"), temp_dir("app"));
        let before = db.list_presentations().unwrap().len();

        let bad = data.join("broken.pptx");
        std::fs::write(&bad, b"this is not a zip").unwrap();
        assert!(import_pptx_file(&db, &app, bad.to_str().unwrap(), None).unwrap_err().contains("not a PowerPoint"));
        assert!(import_pptx_file(&db, &app, data.join("missing.pptx").to_str().unwrap(), None).unwrap_err().contains("not found"));
        let wrong = data.join("notes.txt");
        std::fs::write(&wrong, b"x").unwrap();
        assert!(import_pptx_file(&db, &app, wrong.to_str().unwrap(), None).unwrap_err().contains("Only .pptx"));
        assert!(import_pptx_file(&db, &app, data.to_str().unwrap(), None).is_err()); // a folder

        assert_eq!(db.list_presentations().unwrap().len(), before);
        let leftover = app.join("media").join("presentations");
        assert!(!leftover.exists() || std::fs::read_dir(&leftover).unwrap().next().is_none(), "no picture folders left behind");
        let _ = std::fs::remove_dir_all(data);
        let _ = std::fs::remove_dir_all(app);
    }

    #[test]
    fn a_deck_without_pictures_does_not_leave_an_empty_folder() {
        let db = crate::db::DbManager::new_in_memory().unwrap();
        let (data, app) = (temp_dir("data"), temp_dir("app"));
        let file = data.join("plain.PPTX"); // the extension may be in any case
        std::fs::write(&file, deck().slide(slide_xml(&sp(r#"<p:ph type="title"/>"#, "", "", &run("Hi", "")), ""), vec![]).build()).unwrap();
        let r = import_pptx_file(&db, &app, file.to_str().unwrap(), None).unwrap();
        assert_eq!(r.slide_count, 1);
        let folder = app.join("media").join("presentations");
        assert!(!folder.exists() || std::fs::read_dir(&folder).unwrap().next().is_none());
        let _ = std::fs::remove_dir_all(data);
        let _ = std::fs::remove_dir_all(app);
    }

    /// Opt-in check against real PowerPoint files: `PPTX_FILES=/a.pptx:/b.pptx cargo test real_files -- --ignored --nocapture`.
    /// Prints what each file turned into, and fails if any file cannot be imported or yields an invalid slide.
    #[test]
    #[ignore = "set PPTX_FILES to a colon-separated list of real .pptx files"]
    fn real_files() {
        let Ok(list) = std::env::var("PPTX_FILES") else { return };
        for path in list.split(':').filter(|p| !p.is_empty()) {
            let mut sink = MemSink::default();
            let file = std::fs::File::open(path).unwrap_or_else(|e| panic!("{path}: {e}"));
            let deck = import_pptx(std::io::BufReader::new(file), &mut sink).unwrap_or_else(|e| panic!("{path}: {e}"));
            println!("== {path}: {} slides, {} pictures stored", deck.slides.len(), sink.stored.len());
            for (i, s) in deck.slides.iter().enumerate() {
                println!("  {:>2}. {:<40} bg {} text {} chars, {} items", i + 1, s.title.chars().take(40).collect::<String>(), s.background_color, s.body.chars().count(), s.elements.len());
                if std::env::var("PPTX_DETAIL").is_ok() {
                    println!("      body: {:?}", s.body.chars().take(70).collect::<String>());
                    for e in &s.elements {
                        println!(
                            "      - {:<5} x{:>5} y{:>5} w{:>5} h{:>5} {:>4}% {:<7} {}",
                            e.kind, e.x, e.y, e.w, e.h, e.font_size_pct.map_or(String::new(), |f| f.to_string()),
                            e.color.clone().or(e.fill.clone()).unwrap_or_default(),
                            e.text.clone().unwrap_or_default().chars().take(40).collect::<String>().replace('\n', " / ")
                        );
                    }
                }
                assert!(validate_layout(&SlideLayout { elements: s.elements.clone(), ..Default::default() }).is_ok(), "{path}: slide {} has an invalid layout", i + 1);
            }
            for w in &deck.warnings {
                println!("  ! {w}");
            }
        }
    }

    #[test]
    fn the_disk_sink_writes_numbered_files_under_the_given_folder() {
        let dir = std::env::temp_dir().join(format!("cp-pptx-test-{}", uuid::Uuid::new_v4()));
        let mut sink = DiskSink::new(dir.clone(), "media/presentations/abc".to_string()).unwrap();
        assert_eq!(sink.store(PNG, "png").unwrap(), "media/presentations/abc/image1.png");
        assert_eq!(sink.store(PNG, "jpg").unwrap(), "media/presentations/abc/image2.jpg");
        assert_eq!(std::fs::read(dir.join("image1.png")).unwrap(), PNG);
        let _ = std::fs::remove_dir_all(dir);
    }
}
