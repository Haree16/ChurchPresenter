//! Slide templates: a saved look (colours, text size and alignment, background image, safe
//! margin / outline and extra elements) that can be applied to any slide.

use crate::db::DbManager;
use crate::layout::{is_safe_media_path, validate_layout, SlideLayout};
use crate::theme_io::is_safe_css_color;
use chrono::Utc;
use rusqlite::{params, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub const MAX_TEMPLATE_NAME_CHARS: usize = 60;
pub const MAX_TEMPLATES: usize = 200;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlideTemplate {
    #[serde(default)]
    pub id: String,
    pub name: String,
    pub background_color: String,
    pub foreground_color: String,
    /// small, medium, large or xlarge
    pub font_size: String,
    /// left, center or right
    pub text_alignment: String,
    /// Media-library path, or `None` for a plain colour background.
    #[serde(default)]
    pub background_image: Option<String>,
    #[serde(default)]
    pub layout: Option<SlideLayout>,
    #[serde(default)]
    pub sort_order: i32,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

pub fn validate_template(t: &SlideTemplate) -> std::result::Result<(), String> {
    let name = t.name.trim();
    if name.is_empty() {
        return Err("Give the template a name.".to_string());
    }
    if name.chars().count() > MAX_TEMPLATE_NAME_CHARS {
        return Err(format!("Template name is too long (maximum {} characters).", MAX_TEMPLATE_NAME_CHARS));
    }
    if !is_safe_css_color(&t.background_color) {
        return Err("Background colour is not a valid colour.".to_string());
    }
    if !is_safe_css_color(&t.foreground_color) {
        return Err("Text colour is not a valid colour.".to_string());
    }
    if !["small", "medium", "large", "xlarge"].contains(&t.font_size.as_str()) {
        return Err(format!("Unknown font size '{}'.", t.font_size));
    }
    if !["left", "center", "right"].contains(&t.text_alignment.as_str()) {
        return Err(format!("Unknown alignment '{}'.", t.text_alignment));
    }
    if let Some(img) = &t.background_image {
        if !img.trim().is_empty() && !is_safe_media_path(img) {
            return Err("The background image must come from the media library.".to_string());
        }
    }
    if let Some(l) = &t.layout {
        validate_layout(l)?;
    }
    Ok(())
}

fn row_to_template(row: &rusqlite::Row) -> Result<SlideTemplate> {
    let layout_json: Option<String> = row.get(7)?;
    Ok(SlideTemplate {
        id: row.get(0)?,
        name: row.get(1)?,
        background_color: row.get(2)?,
        foreground_color: row.get(3)?,
        font_size: row.get(4)?,
        text_alignment: row.get(5)?,
        background_image: row.get(6)?,
        layout: crate::layout::layout_from_json(layout_json),
        sort_order: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

const SELECT: &str = "SELECT id, name, background_color, foreground_color, font_size, text_alignment, background_image, layout, sort_order, created_at, updated_at FROM slide_templates";

impl DbManager {
    pub fn list_slide_templates(&self) -> Result<Vec<SlideTemplate>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(&format!("{} ORDER BY sort_order ASC, created_at ASC;", SELECT))?;
        let rows = stmt.query_map([], row_to_template)?;
        rows.collect()
    }

    pub fn get_slide_template(&self, id: &str) -> Result<Option<SlideTemplate>> {
        Ok(self.list_slide_templates()?.into_iter().find(|t| t.id == id))
    }

    pub fn create_slide_template(&self, template: &SlideTemplate) -> std::result::Result<SlideTemplate, String> {
        validate_template(template)?;
        let existing = self.list_slide_templates().map_err(|e| e.to_string())?;
        if existing.len() >= MAX_TEMPLATES {
            return Err(format!("You can keep at most {} templates.", MAX_TEMPLATES));
        }
        let now = Utc::now().to_rfc3339();
        let saved = SlideTemplate {
            id: Uuid::new_v4().to_string(),
            name: template.name.trim().to_string(),
            background_image: template.background_image.clone().filter(|s| !s.trim().is_empty()),
            layout: template.layout.clone().filter(|l| !l.is_empty()),
            sort_order: existing.len() as i32,
            created_at: now.clone(),
            updated_at: now,
            ..template.clone()
        };
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO slide_templates (id, name, background_color, foreground_color, font_size, text_alignment, background_image, layout, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);",
            params![
                saved.id, saved.name, saved.background_color, saved.foreground_color, saved.font_size,
                saved.text_alignment, saved.background_image, crate::layout::layout_to_json(&saved.layout),
                saved.sort_order, saved.created_at, saved.updated_at
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(saved)
    }

    pub fn update_slide_template(&self, template: &SlideTemplate) -> std::result::Result<SlideTemplate, String> {
        validate_template(template)?;
        let now = Utc::now().to_rfc3339();
        let changed = {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE slide_templates SET name = ?2, background_color = ?3, foreground_color = ?4, font_size = ?5,
                        text_alignment = ?6, background_image = ?7, layout = ?8, updated_at = ?9 WHERE id = ?1;",
                params![
                    template.id,
                    template.name.trim(),
                    template.background_color,
                    template.foreground_color,
                    template.font_size,
                    template.text_alignment,
                    template.background_image.clone().filter(|s| !s.trim().is_empty()),
                    crate::layout::layout_to_json(&template.layout),
                    now
                ],
            )
            .map_err(|e| e.to_string())?
        };
        if changed == 0 {
            return Err("That template no longer exists.".to_string());
        }
        self.get_slide_template(&template.id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "That template no longer exists.".to_string())
    }

    pub fn delete_slide_template(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM slide_templates WHERE id = ?1;", params![id])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::layout::SlideElement;

    fn element(id: &str) -> SlideElement {
        SlideElement {
            id: id.into(), kind: "text".into(), x: 5.0, y: 5.0, w: 50.0, h: 15.0, text: Some("Church name".into()),
            font_size_pct: Some(6.0), color: Some("#ffffff".into()), align: Some("left".into()), weight: Some("bold".into()),
            image_path: None, shape: None, fill: None, opacity: None,
            rotation: None,
        }
    }

    fn template() -> SlideTemplate {
        SlideTemplate {
            id: String::new(),
            name: "Announcement".into(),
            background_color: "#0a0f1d".into(),
            foreground_color: "#ffffff".into(),
            font_size: "large".into(),
            text_alignment: "center".into(),
            background_image: Some("media/bg.png".into()),
            layout: Some(SlideLayout { margin_pct: Some(6.0), elements: vec![element("h")], ..Default::default() }),
            sort_order: 0,
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn a_normal_template_is_valid_and_each_field_is_checked() {
        assert!(validate_template(&template()).is_ok());
        let bad = |f: &dyn Fn(&mut SlideTemplate)| {
            let mut t = template();
            f(&mut t);
            validate_template(&t).unwrap_err()
        };
        assert!(bad(&|t| t.name = "  ".into()).contains("name"));
        assert!(bad(&|t| t.name = "n".repeat(61)).contains("too long"));
        assert!(bad(&|t| t.background_color = "red; x".into()).contains("Background colour"));
        assert!(bad(&|t| t.foreground_color = "url(x)".into()).contains("Text colour"));
        assert!(bad(&|t| t.font_size = "huge".into()).contains("font size"));
        assert!(bad(&|t| t.text_alignment = "justify".into()).contains("alignment"));
        assert!(bad(&|t| t.background_image = Some("http://evil/x.png".into())).contains("media library"));
        assert!(bad(&|t| t.background_image = Some("../x.png".into())).contains("media library"));
        assert!(bad(&|t| t.layout = Some(SlideLayout { margin_pct: Some(99.0), ..Default::default() })).contains("margin"));
        let mut hostile = template();
        hostile.layout.as_mut().unwrap().elements[0].x = 99.0;
        assert!(validate_template(&hostile).unwrap_err().contains("Element 1"));
        // optional parts really are optional
        let mut plain = template();
        plain.background_image = None;
        plain.layout = None;
        assert!(validate_template(&plain).is_ok());
    }

    #[test]
    fn create_list_update_delete_round_trip_keeps_elements_in_order() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.list_slide_templates().unwrap().is_empty());

        let mut t = template();
        t.layout.as_mut().unwrap().elements.push(element("second"));
        let a = db.create_slide_template(&SlideTemplate { name: "  First  ".into(), ..t }).unwrap();
        let b = db.create_slide_template(&SlideTemplate { name: "Second".into(), layout: None, ..template() }).unwrap();
        assert_eq!(a.name, "First");
        assert_ne!(a.id, b.id);

        let list = db.list_slide_templates().unwrap();
        assert_eq!(list.iter().map(|t| t.name.as_str()).collect::<Vec<_>>(), vec!["First", "Second"]);
        let elements = &list[0].layout.as_ref().unwrap().elements;
        assert_eq!(elements.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(), vec!["h", "second"]);
        assert!(list[1].layout.is_none());

        let updated = db
            .update_slide_template(&SlideTemplate { name: "Renamed".into(), font_size: "xlarge".into(), layout: None, ..a.clone() })
            .unwrap();
        assert_eq!(updated.name, "Renamed");
        assert_eq!(updated.font_size, "xlarge");
        assert!(updated.layout.is_none());
        assert_eq!(updated.created_at, a.created_at);

        db.delete_slide_template(&a.id).unwrap();
        assert_eq!(db.list_slide_templates().unwrap().len(), 1);
        db.delete_slide_template("ghost").unwrap();
    }

    #[test]
    fn invalid_templates_are_never_stored_and_missing_ones_cannot_be_updated() {
        let db = DbManager::new_in_memory().unwrap();
        assert!(db.create_slide_template(&SlideTemplate { font_size: "x".into(), ..template() }).is_err());
        assert!(db.list_slide_templates().unwrap().is_empty());
        assert!(db
            .update_slide_template(&SlideTemplate { id: "ghost".into(), ..template() })
            .unwrap_err()
            .contains("no longer exists"));

        let saved = db.create_slide_template(&template()).unwrap();
        assert!(db.update_slide_template(&SlideTemplate { name: String::new(), ..saved.clone() }).is_err());
        assert_eq!(db.get_slide_template(&saved.id).unwrap().unwrap().name, "Announcement");
    }

    #[test]
    fn empty_layouts_and_blank_background_images_are_stored_as_nothing() {
        let db = DbManager::new_in_memory().unwrap();
        let t = db
            .create_slide_template(&SlideTemplate {
                background_image: Some("  ".into()),
                layout: Some(SlideLayout::default()),
                ..template()
            })
            .unwrap();
        assert_eq!(t.background_image, None);
        assert_eq!(t.layout, None);
    }

    #[test]
    fn the_number_of_templates_is_capped() {
        let db = DbManager::new_in_memory().unwrap();
        for i in 0..MAX_TEMPLATES {
            db.create_slide_template(&SlideTemplate { name: format!("T{i}"), ..template() }).unwrap();
        }
        assert!(db.create_slide_template(&template()).unwrap_err().contains("at most"));
    }

    #[test]
    fn a_damaged_stored_layout_does_not_hide_the_template() {
        let db = DbManager::new_in_memory().unwrap();
        let t = db.create_slide_template(&template()).unwrap();
        db.conn
            .lock()
            .unwrap()
            .execute("UPDATE slide_templates SET layout = 'garbage' WHERE id = ?1;", params![t.id])
            .unwrap();
        let back = db.get_slide_template(&t.id).unwrap().unwrap();
        assert_eq!(back.name, "Announcement");
        assert_eq!(back.layout, None);
    }

    #[test]
    fn templates_survive_backup_and_restore_and_old_backups_still_load() {
        let db = DbManager::new_in_memory().unwrap();
        let t = db.create_slide_template(&template()).unwrap();
        let backup = db.export_backup().unwrap();
        assert_eq!(backup.slide_templates.len(), 1);

        db.delete_slide_template(&t.id).unwrap();
        db.import_backup(&backup, "overwrite").unwrap();
        let restored = db.list_slide_templates().unwrap();
        assert_eq!(restored.len(), 1);
        assert_eq!(restored[0].layout, t.layout);

        let mut value = serde_json::to_value(&backup).unwrap();
        value.as_object_mut().unwrap().remove("slideTemplates");
        let old: crate::models::BackupData = serde_json::from_value(value).unwrap();
        assert!(old.slide_templates.is_empty());
    }
}
