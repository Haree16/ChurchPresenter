use crate::actions::ActionDispatcher;
use crate::db::DbManager;
use crate::display::DisplayManager;
use crate::midi::MidiService;
use crate::models::{
    ActionMapping, AppDiagnosticEntry, AppDiagnosticFilter, AppInfo, AudienceWindowStatus,
    BackupData, BiblePassageQuery, BiblePassageResult, DatabaseHealth, DisplayMonitor, ImportResult,
    LivestreamOverlayConfig, MediaAsset, MediaPlaybackState, MidiMapping, MidiStatus,
    OscConfig, OscStatus, OutputConfig, OverlayWindowStatus, PlaylistItem, PlaylistItemWithSlides,
    Presentation, PresentationState, RemoteDevice, RemoteServerStatus, Service,
    ServiceWithItems, Slide, SlideGenerationOptions, Song, SongExportData, SongImportOptions,
    SongImportResult, SongSection, SongWithSections, StageConfig, StageWindowStatus,
    SystemDiagnostics, Theme, Timer, TimerState, WorkspaceState,
};
use crate::osc::OscService;
use crate::overlay::{OverlayRenderPayload, OverlayService};
use crate::presentation::PresentationManager;
use crate::remote::RemoteServerManager;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateSlidesResponse {
    pub presentation_id: String,
    pub slides: Vec<Slide>,
}

// ================= Presentations =================

#[tauri::command]
pub async fn list_presentations(
    db: State<'_, DbManager>,
) -> Result<Vec<Presentation>, String> {
    db.list_presentations().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_presentation(
    id: String,
    db: State<'_, DbManager>,
) -> Result<Option<Presentation>, String> {
    db.get_presentation(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_presentation(
    title: String,
    category: String,
    theme_name: Option<String>,
    db: State<'_, DbManager>,
) -> Result<Presentation, String> {
    db.create_presentation(&title, &category, theme_name.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_presentation(
    id: String,
    title: String,
    category: String,
    theme_name: Option<String>,
    db: State<'_, DbManager>,
) -> Result<Presentation, String> {
    db.update_presentation(&id, &title, &category, theme_name.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_presentation(
    id: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<(), String> {
    db.delete_presentation(&id).map_err(|e| e.to_string())?;
    pres_mgr.refresh_state(&app, &db);
    Ok(())
}

#[tauri::command]
pub async fn duplicate_presentation(
    id: String,
    db: State<'_, DbManager>,
) -> Result<Presentation, String> {
    db.duplicate_presentation(&id).map_err(|e| e.to_string())
}

// ================= Slides =================

#[tauri::command]
pub async fn get_slides(
    presentation_id: String,
    db: State<'_, DbManager>,
) -> Result<Vec<Slide>, String> {
    db.get_slides(&presentation_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_slide(
    presentation_id: String,
    title: String,
    body: String,
    background_color: String,
    foreground_color: String,
    font_size: String,
    text_alignment: String,
    theme_override: Option<String>,
    background_image: Option<String>,
    overlay_color: Option<String>,
    line_spacing: Option<f64>,
    text_shadow: Option<String>,
    vertical_alignment: Option<String>,
    font_family: Option<String>,
    font_weight: Option<String>,
    layout: Option<crate::layout::SlideLayout>,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<Slide, String> {
    if let Some(l) = &layout {
        crate::layout::validate_layout(l)?;
    }
    let slide = Slide {
        id: Uuid::new_v4().to_string(),
        presentation_id,
        sort_order: -1,
        title,
        body,
        background_color,
        foreground_color,
        font_size,
        text_alignment,
        theme_override,
        background_image,
        overlay_color,
        line_spacing,
        text_shadow,
        vertical_alignment,
        font_family,
        font_weight,
        group_label: None,
        group_color: None,
        layout,
        created_at: "".to_string(),
        updated_at: "".to_string(),
    };

    let created = db.create_slide(&slide).map_err(|e| e.to_string())?;
    pres_mgr.refresh_state(&app, &db);
    Ok(created)
}

#[tauri::command]
pub async fn update_slide(
    id: String,
    title: String,
    body: String,
    background_color: String,
    foreground_color: String,
    font_size: String,
    text_alignment: String,
    theme_override: Option<String>,
    background_image: Option<String>,
    overlay_color: Option<String>,
    line_spacing: Option<f64>,
    text_shadow: Option<String>,
    vertical_alignment: Option<String>,
    font_family: Option<String>,
    font_weight: Option<String>,
    layout: Option<crate::layout::SlideLayout>,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<Slide, String> {
    if let Some(l) = &layout {
        crate::layout::validate_layout(l)?;
    }
    let slide = Slide {
        id,
        presentation_id: "".to_string(),
        sort_order: 0,
        title,
        body,
        background_color,
        foreground_color,
        font_size,
        text_alignment,
        theme_override,
        background_image,
        overlay_color,
        line_spacing,
        text_shadow,
        vertical_alignment,
        font_family,
        font_weight,
        group_label: None,
        group_color: None,
        layout,
        created_at: "".to_string(),
        updated_at: "".to_string(),
    };

    let updated = db.update_slide(&slide).map_err(|e| e.to_string())?;
    pres_mgr.refresh_state(&app, &db);
    Ok(updated)
}

#[tauri::command]
pub async fn delete_slide(
    id: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<(), String> {
    db.delete_slide(&id).map_err(|e| e.to_string())?;
    pres_mgr.refresh_state(&app, &db);
    Ok(())
}

#[tauri::command]
pub async fn duplicate_slide(
    id: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<Slide, String> {
    let slide = db.duplicate_slide(&id).map_err(|e| e.to_string())?;
    pres_mgr.refresh_state(&app, &db);
    Ok(slide)
}

#[tauri::command]
pub async fn reorder_slides(
    presentation_id: String,
    slide_ids: Vec<String>,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<(), String> {
    db.reorder_slides(&presentation_id, &slide_ids)
        .map_err(|e| e.to_string())?;
    pres_mgr.refresh_state(&app, &db);
    Ok(())
}

// ================= Presentation Controls =================

#[tauri::command]
pub async fn get_presentation_state(
    pres_mgr: State<'_, PresentationManager>,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.get_state())
}

#[tauri::command]
pub async fn set_live_slide(
    presentation_id: String,
    slide_id: String,
    pres_mgr: State<'_, PresentationManager>,
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.set_live_slide(&app, &db, &presentation_id, &slide_id))
}

/// Shows a banner on the audience screen. `duration_seconds`: omitted = 30s, 0 = until cleared.
#[tauri::command]
pub async fn send_alert(
    message: String,
    duration_seconds: Option<u32>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    pres_mgr.send_alert(&app, &message, duration_seconds)
}

#[tauri::command]
pub async fn clear_alert(
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.clear_alert(&app))
}

#[tauri::command]
pub async fn list_props(db: State<'_, DbManager>) -> Result<Vec<crate::props::Prop>, String> {
    db.list_props().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_prop(
    prop: crate::props::Prop,
    db: State<'_, DbManager>,
) -> Result<crate::props::Prop, String> {
    db.create_prop(&prop)
}

/// Saves a prop; if it is currently on screen, the screen updates too.
#[tauri::command]
pub async fn update_prop(
    prop: crate::props::Prop,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<crate::props::Prop, String> {
    let saved = db.update_prop(&prop)?;
    pres_mgr.sync_active_props(&app, &db);
    Ok(saved)
}

/// Deletes a prop and takes it off the screen if it was showing.
#[tauri::command]
pub async fn delete_prop(
    id: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<(), String> {
    db.delete_prop(&id).map_err(|e| e.to_string())?;
    pres_mgr.sync_active_props(&app, &db);
    Ok(())
}

#[tauri::command]
pub async fn toggle_prop(
    id: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    pres_mgr.toggle_prop(&app, &db, &id)
}

#[tauri::command]
pub async fn clear_props(
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.clear_props(&app))
}

/// Advances the live slide every `interval_seconds` (1-3600), optionally looping. Something must
/// be live already.
#[tauri::command]
pub async fn start_auto_advance(
    interval_seconds: u32,
    loop_at_end: bool,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    crate::presentation::start_auto_advance_running(&app, &db, &pres_mgr, interval_seconds, loop_at_end)
}

#[tauri::command]
pub async fn stop_auto_advance(
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.stop_auto_advance(&app))
}

#[tauri::command]
pub async fn list_macros(db: State<'_, DbManager>) -> Result<Vec<crate::macros::Macro>, String> {
    db.list_macros().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_macro(
    r#macro: crate::macros::Macro,
    db: State<'_, DbManager>,
) -> Result<crate::macros::Macro, String> {
    db.create_macro(&r#macro)
}

#[tauri::command]
pub async fn update_macro(
    r#macro: crate::macros::Macro,
    db: State<'_, DbManager>,
) -> Result<crate::macros::Macro, String> {
    db.update_macro(&r#macro)
}

#[tauri::command]
pub async fn delete_macro(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_macro(&id).map_err(|e| e.to_string())
}

/// Runs a saved macro in the background. Only one macro runs at a time.
#[tauri::command]
pub async fn run_macro(
    id: String,
    runner: State<'_, crate::macros::MacroRunner>,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<(), String> {
    let m = db
        .get_macro(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "That macro no longer exists.".to_string())?;
    runner.run(app, db.inner().clone(), pres_mgr.inner().clone(), m)
}

/// Stops the running macro before its next step.
#[tauri::command]
pub async fn stop_macro(
    runner: State<'_, crate::macros::MacroRunner>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    runner.cancel();
    pres_mgr.set_running_macro_core(None);
    let state = pres_mgr.get_state();
    app.emit("presentation:state-changed", &state).ok();
    Ok(state)
}

#[tauri::command]
pub async fn get_ccli_licence_number(db: State<'_, DbManager>) -> Result<Option<String>, String> {
    db.get_ccli_licence_number().map_err(|e| e.to_string())
}

/// Saves the church's CCLI licence number (digits only); an empty value removes it.
#[tauri::command]
pub async fn set_ccli_licence_number(number: String, db: State<'_, DbManager>) -> Result<Option<String>, String> {
    db.set_ccli_licence_number(&number)
}

/// The songs used between two dates (`YYYY-MM-DD`, both included) and how often.
#[tauri::command]
pub async fn get_ccli_report(from: String, to: String, db: State<'_, DbManager>) -> Result<crate::ccli::CcliReport, String> {
    db.ccli_report(&from, &to)
}

#[tauri::command]
pub async fn list_song_usage(from: String, to: String, db: State<'_, DbManager>) -> Result<Vec<crate::ccli::SongUsage>, String> {
    db.list_song_usage(&from, &to)
}

/// Removes one logged use of a song, for example one shown by mistake.
#[tauri::command]
pub async fn delete_song_usage(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_song_usage(&id).map_err(|e| e.to_string())
}

/// Reference suggestions for what is typed in the Bible lookup box, from the verses imported for `translation`.
#[tauri::command]
pub async fn suggest_bible_references(
    input: String,
    translation: String,
    limit: Option<usize>,
    db: State<'_, DbManager>,
) -> Result<Vec<crate::bible_suggest::BibleSuggestion>, String> {
    db.suggest_bible_references(&input, &translation, limit.unwrap_or(crate::bible_suggest::DEFAULT_SUGGESTION_LIMIT))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_clear_groups(db: State<'_, DbManager>) -> Result<Vec<crate::clear_groups::ClearGroup>, String> {
    db.list_clear_groups().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_clear_group(
    group: crate::clear_groups::ClearGroup,
    db: State<'_, DbManager>,
) -> Result<crate::clear_groups::ClearGroup, String> {
    db.create_clear_group(&group)
}

#[tauri::command]
pub async fn update_clear_group(
    group: crate::clear_groups::ClearGroup,
    db: State<'_, DbManager>,
) -> Result<crate::clear_groups::ClearGroup, String> {
    db.update_clear_group(&group)
}

#[tauri::command]
pub async fn delete_clear_group(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_clear_group(&id).map_err(|e| e.to_string())
}

/// Clears the layers of a saved clear group. Everything else on the output stays as it is.
#[tauri::command]
pub async fn run_clear_group(
    id: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    let group = db
        .get_clear_group(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "That clear group no longer exists.".to_string())?;
    let state = pres_mgr.clear_group_core(&group.layers);
    app.emit("presentation:state-changed", &state).ok();
    Ok(state)
}

#[tauri::command]
pub async fn list_key_bindings(db: State<'_, DbManager>) -> Result<Vec<crate::keybindings::KeyBinding>, String> {
    db.list_key_bindings().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_key_binding(
    binding: crate::keybindings::KeyBinding,
    db: State<'_, DbManager>,
) -> Result<crate::keybindings::KeyBinding, String> {
    db.create_key_binding(&binding)
}

#[tauri::command]
pub async fn update_key_binding(
    binding: crate::keybindings::KeyBinding,
    db: State<'_, DbManager>,
) -> Result<crate::keybindings::KeyBinding, String> {
    db.update_key_binding(&binding)
}

#[tauri::command]
pub async fn delete_key_binding(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_key_binding(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_looks(db: State<'_, DbManager>) -> Result<Vec<crate::looks::Look>, String> {
    db.list_looks().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_look(look: crate::looks::Look, db: State<'_, DbManager>) -> Result<crate::looks::Look, String> {
    db.create_look(&look)
}

#[tauri::command]
pub async fn update_look(look: crate::looks::Look, db: State<'_, DbManager>) -> Result<crate::looks::Look, String> {
    db.update_look(&look)
}

#[tauri::command]
pub async fn delete_look(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_look(&id).map_err(|e| e.to_string())
}

/// Sets the logo, blackout and props to match a saved look. The live slide is not changed.
#[tauri::command]
pub async fn apply_look(
    id: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    let look = db
        .get_look(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "That look no longer exists.".to_string())?;
    let state = pres_mgr.apply_look_core(&db, &look);
    app.emit("presentation:state-changed", &state).ok();
    Ok(state)
}

/// Saves the screen as it is now (logo, blackout, props) as a new look.
#[tauri::command]
pub async fn capture_look(
    name: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
) -> Result<crate::looks::Look, String> {
    db.create_look(&pres_mgr.capture_look_core(name.trim()))
}

#[tauri::command]
pub async fn clear_media(
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.clear_media(&app))
}

#[tauri::command]
pub async fn clear_all(
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.clear_all(&app))
}

#[tauri::command]
pub async fn toggle_logo(
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<bool, String> {
    Ok(pres_mgr.toggle_logo(&app))
}

#[tauri::command]
pub async fn toggle_blackout(
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<bool, String> {
    Ok(pres_mgr.toggle_blackout(&app))
}

#[tauri::command]
pub async fn next_slide(
    pres_mgr: State<'_, PresentationManager>,
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.next_slide(&app, &db))
}

#[tauri::command]
pub async fn previous_slide(
    pres_mgr: State<'_, PresentationManager>,
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.previous_slide(&app, &db))
}

// ================= Display Controls =================

#[tauri::command]
pub async fn get_available_monitors(app: AppHandle) -> Result<Vec<DisplayMonitor>, String> {
    DisplayManager::get_available_monitors(&app)
}

#[tauri::command]
pub async fn open_audience_window(
    monitor_id: Option<String>,
    fullscreen: Option<bool>,
    app: AppHandle,
) -> Result<AudienceWindowStatus, String> {
    DisplayManager::open_audience_window(&app, monitor_id, fullscreen.unwrap_or(true))
}

#[tauri::command]
pub async fn close_audience_window(app: AppHandle) -> Result<AudienceWindowStatus, String> {
    DisplayManager::close_audience_window(&app)
}

#[tauri::command]
pub async fn get_audience_status(app: AppHandle) -> Result<AudienceWindowStatus, String> {
    Ok(DisplayManager::get_audience_status(&app))
}

// ================= Phase 2: Songs =================

#[tauri::command]
pub async fn list_songs(
    sort_by: Option<String>,
    language: Option<String>,
    category: Option<String>,
    db: State<'_, DbManager>,
) -> Result<Vec<Song>, String> {
    db.list_songs(
        sort_by.as_deref(),
        language.as_deref(),
        category.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_song(id: String, db: State<'_, DbManager>) -> Result<Option<Song>, String> {
    db.get_song(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_song(song: Song, db: State<'_, DbManager>) -> Result<Song, String> {
    db.create_song(&song).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_song(song: Song, db: State<'_, DbManager>) -> Result<Song, String> {
    db.update_song(&song).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_song(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_song(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_song(
    id: String,
    db: State<'_, DbManager>,
) -> Result<SongWithSections, String> {
    db.duplicate_song(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_songs(
    query: String,
    language: Option<String>,
    category: Option<String>,
    db: State<'_, DbManager>,
) -> Result<Vec<Song>, String> {
    db.search_songs(
        &query,
        language.as_deref(),
        category.as_deref(),
    )
    .map_err(|e| e.to_string())
}

// ================= Phase 2: Song Sections =================

#[tauri::command]
pub async fn get_song_sections(
    song_id: String,
    db: State<'_, DbManager>,
) -> Result<Vec<SongSection>, String> {
    db.get_song_sections(&song_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_song_arrangements(
    song_id: String,
    db: State<'_, DbManager>,
) -> Result<Vec<crate::models::SongArrangement>, String> {
    db.list_song_arrangements(&song_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_song_arrangements(
    song_id: String,
    arrangements: Vec<crate::models::SongArrangement>,
    db: State<'_, DbManager>,
) -> Result<Vec<crate::models::SongArrangement>, String> {
    db.save_song_arrangements(&song_id, &arrangements)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_song_sections(
    song_id: String,
    sections: Vec<SongSection>,
    db: State<'_, DbManager>,
) -> Result<Vec<SongSection>, String> {
    db.save_song_sections(&song_id, &sections)
        .map_err(|e| e.to_string())
}

// ================= Phase 2: Themes =================

#[tauri::command]
pub async fn list_themes(db: State<'_, DbManager>) -> Result<Vec<Theme>, String> {
    db.list_themes().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_theme(id: String, db: State<'_, DbManager>) -> Result<Option<Theme>, String> {
    db.get_theme(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_theme(theme: Theme, db: State<'_, DbManager>) -> Result<Theme, String> {
    if let Some(l) = &theme.layout {
        crate::layout::validate_layout(l)?;
    }
    db.create_theme(&theme).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_theme(theme: Theme, db: State<'_, DbManager>) -> Result<Theme, String> {
    if let Some(l) = &theme.layout {
        crate::layout::validate_layout(l)?;
    }
    db.update_theme(&theme).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_theme(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_theme(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_theme(id: String, db: State<'_, DbManager>) -> Result<Theme, String> {
    db.duplicate_theme(&id).map_err(|e| e.to_string())
}

/// Writes the chosen themes, with their background images embedded, to a `.cptheme` file.
#[tauri::command]
pub async fn export_themes_to_file(
    ids: Vec<String>,
    path: String,
    app: AppHandle,
    db: State<'_, DbManager>,
) -> Result<crate::theme_io::ThemeExportResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| crate::resolve_app_data_path());
    let mut dest = std::path::PathBuf::from(&path);
    if dest.extension().is_none() {
        dest.set_extension("cptheme");
    }
    crate::theme_io::export_themes_to_file(&db, &ids, &app_data_dir, &dest)
}

/// Imports the themes in a `.cptheme` file as new custom themes. Nothing is imported if any
/// theme in the file is invalid.
#[tauri::command]
pub async fn import_themes_from_file(
    path: String,
    app: AppHandle,
    db: State<'_, DbManager>,
) -> Result<crate::theme_io::ThemeImportResult, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| crate::resolve_app_data_path());
    crate::theme_io::import_themes_from_file(&db, std::path::Path::new(&path), &app_data_dir)
}

#[tauri::command]
pub async fn list_slide_templates(
    db: State<'_, DbManager>,
) -> Result<Vec<crate::templates::SlideTemplate>, String> {
    db.list_slide_templates().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_slide_template(
    template: crate::templates::SlideTemplate,
    db: State<'_, DbManager>,
) -> Result<crate::templates::SlideTemplate, String> {
    db.create_slide_template(&template)
}

#[tauri::command]
pub async fn update_slide_template(
    template: crate::templates::SlideTemplate,
    db: State<'_, DbManager>,
) -> Result<crate::templates::SlideTemplate, String> {
    db.update_slide_template(&template)
}

#[tauri::command]
pub async fn delete_slide_template(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_slide_template(&id).map_err(|e| e.to_string())
}

// ================= Phase 2: Media Assets =================

#[tauri::command]
pub async fn list_media_assets(db: State<'_, DbManager>) -> Result<Vec<MediaAsset>, String> {
    db.list_media_assets().map_err(|e| e.to_string())
}

/// Setting holding the app-data-relative path of the user's custom logo image.
const LOGO_SETTING: &str = "logo_path";
const MAX_LOGO_BYTES: u64 = 10 * 1024 * 1024;

/// Validates a candidate logo file and returns its lowercased extension.
fn validate_logo_file(ext: &str, size_bytes: u64) -> Result<String, String> {
    let ext = ext.to_lowercase();
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "svg") {
        return Err("Logo must be a PNG, JPG, WEBP, GIF or SVG image.".to_string());
    }
    if size_bytes == 0 {
        return Err("The selected logo file is empty.".to_string());
    }
    if size_bytes > MAX_LOGO_BYTES {
        return Err(format!(
            "Logo is too large ({:.1} MB). Maximum is {} MB.",
            size_bytes as f64 / 1_048_576.0,
            MAX_LOGO_BYTES / 1_048_576
        ));
    }
    Ok(ext)
}

fn logo_dir(app: &AppHandle) -> std::path::PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| crate::resolve_app_data_path())
        .join("media")
        .join("logo")
}

/// Copies `source_path` into the app data folder as the logo shown by "clear to logo".
/// Returns the app-data-relative path that is also stored in the `logo_path` setting.
#[tauri::command]
pub async fn set_custom_logo(
    source_path: String,
    app: AppHandle,
    db: State<'_, DbManager>,
) -> Result<String, String> {
    let source = Path::new(&source_path);
    let meta = fs::metadata(source).map_err(|_| "The selected logo file could not be read.".to_string())?;
    if !meta.is_file() {
        return Err("The selected logo is not a file.".to_string());
    }
    let ext = validate_logo_file(
        source.extension().and_then(|e| e.to_str()).unwrap_or(""),
        meta.len(),
    )?;

    let dir = logo_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create logo folder: {}", e))?;
    // only one custom logo is kept
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }
    let file_name = format!("custom-logo.{}", ext);
    fs::copy(source, dir.join(&file_name)).map_err(|e| format!("Failed to copy logo: {}", e))?;

    let relative = format!("media/logo/{}", file_name);
    db.set_setting(LOGO_SETTING, &relative).map_err(|e| e.to_string())?;
    Ok(relative)
}

/// Removes the custom logo so the built-in one is used again.
#[tauri::command]
pub async fn clear_custom_logo(app: AppHandle, db: State<'_, DbManager>) -> Result<(), String> {
    let _ = fs::remove_dir_all(logo_dir(&app));
    db.set_setting(LOGO_SETTING, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_media_asset(
    source_path: String,
    app: AppHandle,
    db: State<'_, DbManager>,
) -> Result<MediaAsset, String> {
    let source = Path::new(&source_path);
    if !source.exists() || !source.is_file() {
        return Err("Source media file does not exist".to_string());
    }

    let original_filename = source
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("media")
        .to_string();

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (mime_type, media_type) = match ext.as_str() {
        "jpg" | "jpeg" => ("image/jpeg", "image"),
        "png" => ("image/png", "image"),
        "webp" => ("image/webp", "image"),
        "gif" => ("image/gif", "image"),
        "svg" => ("image/svg+xml", "image"),
        "mp4" => ("video/mp4", "video"),
        "webm" => ("video/webm", "video"),
        "mov" => ("video/quicktime", "video"),
        "mkv" => ("video/x-matroska", "video"),
        "mp3" => ("audio/mpeg", "audio"),
        "wav" => ("audio/wav", "audio"),
        "ogg" => ("audio/ogg", "audio"),
        "aac" => ("audio/aac", "audio"),
        "m4a" => ("audio/mp4", "audio"),
        "flac" => ("audio/flac", "audio"),
        other => {
            return Err(format!(
                "Unsupported media format '{}'. Supported formats: JPG, PNG, WEBP, GIF, SVG, MP4, WEBM, MOV, MKV, MP3, WAV, OGG, AAC, M4A, FLAC",
                other
            ));
        }
    };

    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default().join(".data"));

    let media_dir = app_data_dir.join("media");
    fs::create_dir_all(&media_dir).map_err(|e| format!("Failed to create media directory: {}", e))?;

    let unique_id = Uuid::new_v4().to_string();
    let safe_filename = format!("{}.{}", unique_id, ext);
    let dest_path = media_dir.join(&safe_filename);

    fs::copy(source, &dest_path).map_err(|e| format!("Failed to copy media file: {}", e))?;

    let file_size = fs::metadata(&dest_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let relative_path = format!("media/{}", safe_filename);

    let asset = MediaAsset {
        id: unique_id,
        filename: safe_filename,
        original_filename,
        relative_path,
        mime_type: mime_type.to_string(),
        file_size,
        media_type: media_type.to_string(),
        duration_seconds: None,
        width: None,
        height: None,
        thumbnail_path: None,
        created_at: Utc::now().to_rfc3339(),
    };

    db.create_media_asset(&asset).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_media_asset(
    id: String,
    db: State<'_, DbManager>,
) -> Result<Option<MediaAsset>, String> {
    db.get_media_asset(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn check_media_asset_usage(
    id: String,
    db: State<'_, DbManager>,
) -> Result<usize, String> {
    db.check_media_asset_usage(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_media_asset(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_media_asset(&id).map_err(|e| e.to_string())
}

// ================= Phase 2: Slide Generation & Song Import/Export =================

#[tauri::command]
pub async fn generate_slides_from_song(
    options: SlideGenerationOptions,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<GenerateSlidesResponse, String> {
    let (pres_id, slides) = db
        .generate_slides_from_song(&options)
        .map_err(|e| e.to_string())?;

    pres_mgr.refresh_state(&app, &db);

    Ok(GenerateSlidesResponse {
        presentation_id: pres_id,
        slides,
    })
}

#[tauri::command]
pub async fn export_song(
    song_id: String,
    db: State<'_, DbManager>,
) -> Result<SongExportData, String> {
    db.export_song(&song_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_all_songs(
    song_ids: Option<Vec<String>>,
    db: State<'_, DbManager>,
) -> Result<SongExportData, String> {
    db.export_all_songs(song_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_songs(
    data: SongExportData,
    options: SongImportOptions,
    db: State<'_, DbManager>,
) -> Result<SongImportResult, String> {
    db.import_songs(&data, &options).map_err(|e| e.to_string())
}

// ================= Backup & Settings =================

#[tauri::command]
pub async fn export_backup(db: State<'_, DbManager>) -> Result<BackupData, String> {
    db.export_backup().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn import_backup(
    backup: BackupData,
    mode: String,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<ImportResult, String> {
    let res = db
        .import_backup(&backup, &mode)
        .map_err(|e| e.to_string())?;
    pres_mgr.refresh_state(&app, &db);
    Ok(res)
}

#[tauri::command]
pub async fn get_setting(key: String, db: State<'_, DbManager>) -> Result<Option<String>, String> {
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_setting(
    key: String,
    value: String,
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

// ================= Phase 3: Services & Playlists =================

#[tauri::command]
pub async fn list_services(db: State<'_, DbManager>) -> Result<Vec<Service>, String> {
    db.list_services().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_service(id: String, db: State<'_, DbManager>) -> Result<Option<Service>, String> {
    db.get_service(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_service_with_items(
    id: String,
    db: State<'_, DbManager>,
) -> Result<Option<ServiceWithItems>, String> {
    db.get_service_with_items(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_service(service: Service, db: State<'_, DbManager>) -> Result<Service, String> {
    db.create_service(&service).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_service(service: Service, db: State<'_, DbManager>) -> Result<Service, String> {
    db.update_service(&service).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_service(id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_service(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_service(
    id: String,
    new_title: Option<String>,
    db: State<'_, DbManager>,
) -> Result<Service, String> {
    db.duplicate_service(&id, new_title)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_service_items(
    service_id: String,
    db: State<'_, DbManager>,
) -> Result<Vec<PlaylistItem>, String> {
    db.get_service_items(&service_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_service_item(
    item_id: String,
    db: State<'_, DbManager>,
) -> Result<Option<PlaylistItem>, String> {
    db.get_service_item(&item_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_service_item_with_slides(
    item_id: String,
    db: State<'_, DbManager>,
) -> Result<Option<PlaylistItemWithSlides>, String> {
    db.get_service_item_with_slides(&item_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_service_item(
    item: PlaylistItem,
    slides: Option<Vec<Slide>>,
    db: State<'_, DbManager>,
) -> Result<PlaylistItem, String> {
    db.add_service_item(&item, slides)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_service_item(
    item: PlaylistItem,
    db: State<'_, DbManager>,
) -> Result<PlaylistItem, String> {
    db.update_service_item(&item).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_service_item(item_id: String, db: State<'_, DbManager>) -> Result<(), String> {
    db.delete_service_item(&item_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_service_items(
    service_id: String,
    item_ids: Vec<String>,
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.reorder_service_items(&service_id, &item_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn duplicate_service_item(
    item_id: String,
    db: State<'_, DbManager>,
) -> Result<PlaylistItem, String> {
    db.duplicate_service_item(&item_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_service_item_slides(
    item_id: String,
    db: State<'_, DbManager>,
) -> Result<Vec<Slide>, String> {
    db.get_service_item_slides(&item_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_service_item_slides(
    item_id: String,
    slides: Vec<Slide>,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<Vec<Slide>, String> {
    validate_slide_layouts(&slides)?;
    let saved = db
        .save_service_item_slides(&item_id, &slides)
        .map_err(|e| e.to_string())?;
    pres_mgr.refresh_state(&app, &db);
    Ok(saved)
}

#[tauri::command]
pub async fn add_song_to_service(
    service_id: String,
    song_id: String,
    theme_id: Option<String>,
    lines_per_slide: Option<i32>,
    arrangement_id: Option<String>,
    db: State<'_, DbManager>,
) -> Result<PlaylistItem, String> {
    db.add_song_to_service(
        &service_id,
        &song_id,
        theme_id.as_deref(),
        lines_per_slide,
        arrangement_id.as_deref(),
    )
    .map_err(|e| e.to_string())
}

// ================= Phase 3: Bible Passage Lookup =================

#[tauri::command]
pub async fn query_bible_passage(
    query: BiblePassageQuery,
    db: State<'_, DbManager>,
) -> Result<BiblePassageResult, String> {
    db.query_bible_passage(&query).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_bible_passage_to_service(
    service_id: String,
    query: BiblePassageQuery,
    theme_id: Option<String>,
    verses_per_slide: Option<i32>,
    db: State<'_, DbManager>,
) -> Result<PlaylistItem, String> {
    db.add_bible_passage_to_service(
        &service_id,
        &query,
        theme_id.as_deref(),
        verses_per_slide,
    )
    .map_err(|e| e.to_string())
}

// ================= Phase 3: Live Service Item & Selection State =================

#[tauri::command]
pub async fn set_live_service_item_slide(
    service_id: String,
    item_id: String,
    slide_id: String,
    pres_mgr: State<'_, PresentationManager>,
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.set_live_service_item_slide(&app, &db, &service_id, &item_id, &slide_id))
}

#[tauri::command]
pub async fn set_selected_service_item(
    service_id: Option<String>,
    item_id: Option<String>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.set_selected_service_item(&app, service_id, item_id))
}

#[tauri::command]
pub async fn clear_live(
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.clear_live(&app))
}

// ================= Phase 4: Stage Display, Timers & Media Playback =================

#[tauri::command]
pub async fn open_stage_window(
    monitor_id: Option<String>,
    fullscreen: Option<bool>,
    app: AppHandle,
) -> Result<StageWindowStatus, String> {
    DisplayManager::open_stage_window(&app, monitor_id, fullscreen.unwrap_or(false))
}

#[tauri::command]
pub async fn close_stage_window(app: AppHandle) -> Result<StageWindowStatus, String> {
    DisplayManager::close_stage_window(&app)
}

#[tauri::command]
pub async fn get_stage_status(app: AppHandle) -> Result<StageWindowStatus, String> {
    Ok(DisplayManager::get_stage_status(&app))
}

#[tauri::command]
pub async fn list_timers(
    service_id: Option<String>,
    db: State<'_, DbManager>,
) -> Result<Vec<Timer>, String> {
    db.list_timers(service_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_timer(
    id: String,
    db: State<'_, DbManager>,
) -> Result<Option<Timer>, String> {
    db.get_timer(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_timer(
    timer: Timer,
    db: State<'_, DbManager>,
) -> Result<Timer, String> {
    db.create_timer(&timer).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_timer(
    timer: Timer,
    db: State<'_, DbManager>,
) -> Result<Timer, String> {
    db.update_timer(&timer).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_timer(
    id: String,
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.delete_timer(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_stage_config(
    id: Option<String>,
    db: State<'_, DbManager>,
) -> Result<StageConfig, String> {
    let config_id = id.unwrap_or_else(|| "default-stage".to_string());
    db.get_stage_config(&config_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_stage_config(
    config: StageConfig,
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<StageConfig, String> {
    crate::stage_layout::validate_panels(&config.panels)?;
    let saved = db.update_stage_config(&config).map_err(|e| e.to_string())?;
    // open stage windows pick the new layout up straight away
    app.emit("stage:config-changed", &saved).ok();
    Ok(saved)
}

#[tauri::command]
pub async fn set_media_playback(
    media_playback: Option<MediaPlaybackState>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.set_media_playback(&app, media_playback))
}

#[tauri::command]
pub async fn set_timer_state(
    timer_state: Option<TimerState>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.set_timer_state(&app, timer_state))
}

// ================= Phase 5: Independent Outputs =================

#[tauri::command]
pub async fn list_outputs(
    db: State<'_, DbManager>,
) -> Result<Vec<OutputConfig>, String> {
    db.list_outputs().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_output(
    id: String,
    db: State<'_, DbManager>,
) -> Result<Option<OutputConfig>, String> {
    db.get_output(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_output(
    output: OutputConfig,
    db: State<'_, DbManager>,
) -> Result<OutputConfig, String> {
    let mut out = output;
    if out.id.trim().is_empty() {
        out.id = format!("output-{}", Uuid::new_v4().simple());
    }
    let now = Utc::now().to_rfc3339();
    out.created_at = now.clone();
    out.updated_at = now;
    db.create_output(&out).map_err(|e| e.to_string())?;
    Ok(out)
}

#[tauri::command]
pub async fn update_output(
    output: OutputConfig,
    db: State<'_, DbManager>,
) -> Result<OutputConfig, String> {
    let mut out = output;
    out.updated_at = Utc::now().to_rfc3339();
    db.update_output(&out).map_err(|e| e.to_string())?;
    Ok(out)
}

#[tauri::command]
pub async fn delete_output(
    id: String,
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.delete_output(&id).map_err(|e| e.to_string())
}

// ================= Phase 5: Livestream Overlay =================

#[tauri::command]
pub async fn get_overlay_config(
    db: State<'_, DbManager>,
) -> Result<LivestreamOverlayConfig, String> {
    db.get_overlay_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_overlay_config(
    config: LivestreamOverlayConfig,
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<LivestreamOverlayConfig, String> {
    let mut cfg = config;
    cfg.updated_at = Utc::now().to_rfc3339();
    db.update_overlay_config(&cfg).map_err(|e| e.to_string())?;
    app.emit("overlay:config-updated", &cfg).ok();
    Ok(cfg)
}

#[tauri::command]
pub async fn regenerate_overlay_token(
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<String, String> {
    let token = db.regenerate_overlay_token().map_err(|e| e.to_string())?;
    app.emit("overlay:token-regenerated", &token).ok();
    Ok(token)
}

#[tauri::command]
pub async fn toggle_overlay_clear(
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<bool, String> {
    let current = db.get_overlay_config().unwrap_or_default();
    let new_cleared = !current.is_cleared;
    db.set_overlay_cleared(new_cleared).map_err(|e| e.to_string())?;
    app.emit("overlay:cleared", new_cleared).ok();
    Ok(new_cleared)
}

#[tauri::command]
pub async fn open_overlay_window(
    monitor_id: Option<String>,
    fullscreen: Option<bool>,
    app: AppHandle,
) -> Result<OverlayWindowStatus, String> {
    DisplayManager::open_overlay_window(&app, monitor_id, fullscreen.unwrap_or(false))
}

#[tauri::command]
pub async fn close_overlay_window(
    app: AppHandle,
) -> Result<OverlayWindowStatus, String> {
    DisplayManager::close_overlay_window(&app)
}

#[tauri::command]
pub async fn get_overlay_status(
    app: AppHandle,
) -> Result<OverlayWindowStatus, String> {
    Ok(DisplayManager::get_overlay_status(&app))
}

#[tauri::command]
pub async fn get_overlay_render_payload(
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
) -> Result<OverlayRenderPayload, String> {
    let state = pres_mgr.get_state();
    OverlayService::get_render_payload(&db, &state)
}

// ================= Phase 5: Remote Control =================

#[tauri::command]
pub async fn get_remote_server_status(
    remote_mgr: State<'_, RemoteServerManager>,
) -> Result<RemoteServerStatus, String> {
    Ok(remote_mgr.get_status())
}

#[tauri::command]
pub async fn start_remote_server(
    port: Option<u16>,
    remote_mgr: State<'_, RemoteServerManager>,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<RemoteServerStatus, String> {
    let p = port.unwrap_or(8088);
    let bind = bind_mode(&db);
    remote_mgr.start_server(app, db.inner().clone(), pres_mgr.inner().clone(), p, bind.bind_ip())
}

fn bind_mode(db: &DbManager) -> crate::net_guard::BindMode {
    let stored = db.get_setting(crate::net_guard::BIND_MODE_SETTING).ok().flatten();
    crate::net_guard::BindMode::from_setting(stored.as_deref())
}

/// Returns "lan" or "local": who may reach the remote server and OSC listener.
#[tauri::command]
pub async fn get_network_bind_mode(db: State<'_, DbManager>) -> Result<String, String> {
    Ok(bind_mode(&db).as_setting().to_string())
}

/// Sets the listening scope. Takes effect the next time the remote server / OSC listener starts.
#[tauri::command]
pub async fn set_network_bind_mode(mode: String, db: State<'_, DbManager>) -> Result<String, String> {
    let normalized = match mode.trim().to_lowercase().as_str() {
        "local" => crate::net_guard::BindMode::Local,
        "lan" => crate::net_guard::BindMode::Lan,
        other => return Err(format!("Unknown network mode '{}'. Use 'local' or 'lan'.", other)),
    };
    db.set_setting(crate::net_guard::BIND_MODE_SETTING, normalized.as_setting())
        .map_err(|e| e.to_string())?;
    Ok(normalized.as_setting().to_string())
}

#[tauri::command]
pub async fn stop_remote_server(
    remote_mgr: State<'_, RemoteServerManager>,
) -> Result<RemoteServerStatus, String> {
    Ok(remote_mgr.stop_server())
}

#[tauri::command]
pub async fn list_remote_devices(
    db: State<'_, DbManager>,
) -> Result<Vec<RemoteDevice>, String> {
    db.list_remote_devices().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn approve_remote_device(
    id: String,
    is_approved: bool,
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<(), String> {
    db.approve_remote_device(&id, is_approved).map_err(|e| e.to_string())?;
    app.emit("remote:device-approved", serde_json::json!({ "id": id, "isApproved": is_approved })).ok();
    Ok(())
}

#[tauri::command]
pub async fn update_remote_device_permissions(
    id: String,
    can_navigate: bool,
    can_blackout: bool,
    can_take_live: bool,
    can_control_timer: bool,
    can_run_macros: bool,
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.update_remote_device_permissions(&id, can_navigate, can_blackout, can_take_live, can_control_timer, can_run_macros)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_remote_device(
    id: String,
    db: State<'_, DbManager>,
    app: AppHandle,
) -> Result<(), String> {
    db.delete_remote_device(&id).map_err(|e| e.to_string())?;
    app.emit("remote:device-revoked", serde_json::json!({ "id": id })).ok();
    Ok(())
}

// ================= Phase 5: MIDI Integration =================

#[tauri::command]
pub async fn get_midi_status(
    midi_svc: State<'_, MidiService>,
) -> Result<MidiStatus, String> {
    Ok(midi_svc.get_status())
}

#[tauri::command]
pub async fn list_midi_devices(
    midi_svc: State<'_, MidiService>,
) -> Result<Vec<String>, String> {
    midi_svc.list_devices()
}

#[tauri::command]
pub async fn start_midi_listener(
    device_pattern: Option<String>,
    midi_svc: State<'_, MidiService>,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<MidiStatus, String> {
    midi_svc.start_listener(app, db.inner().clone(), pres_mgr.inner().clone(), device_pattern)
}

#[tauri::command]
pub async fn stop_midi_listener(
    midi_svc: State<'_, MidiService>,
) -> Result<MidiStatus, String> {
    Ok(midi_svc.stop_listener())
}

#[tauri::command]
pub async fn list_midi_mappings(
    db: State<'_, DbManager>,
) -> Result<Vec<MidiMapping>, String> {
    db.list_midi_mappings().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_midi_mapping(
    mapping: MidiMapping,
    db: State<'_, DbManager>,
) -> Result<MidiMapping, String> {
    let mut map = mapping;
    if map.id.trim().is_empty() {
        map.id = format!("midi-{}", Uuid::new_v4().simple());
    }
    let now = Utc::now().to_rfc3339();
    map.created_at = now.clone();
    map.updated_at = now;
    db.create_midi_mapping(&map).map_err(|e| e.to_string())?;
    Ok(map)
}

#[tauri::command]
pub async fn update_midi_mapping(
    mapping: MidiMapping,
    db: State<'_, DbManager>,
) -> Result<MidiMapping, String> {
    let mut map = mapping;
    map.updated_at = Utc::now().to_rfc3339();
    db.update_midi_mapping(&map).map_err(|e| e.to_string())?;
    Ok(map)
}

#[tauri::command]
pub async fn delete_midi_mapping(
    id: String,
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.delete_midi_mapping(&id).map_err(|e| e.to_string())
}

// ================= Phase 5: OSC Integration =================

#[tauri::command]
pub async fn get_osc_config(
    db: State<'_, DbManager>,
) -> Result<OscConfig, String> {
    db.get_osc_config().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_osc_config(
    config: OscConfig,
    db: State<'_, DbManager>,
) -> Result<OscConfig, String> {
    let mut cfg = config;
    cfg.updated_at = Utc::now().to_rfc3339();
    db.update_osc_config(&cfg).map_err(|e| e.to_string())?;
    Ok(cfg)
}

#[tauri::command]
pub async fn get_osc_status(
    osc_svc: State<'_, OscService>,
) -> Result<OscStatus, String> {
    Ok(osc_svc.get_status())
}

#[tauri::command]
pub async fn start_osc_listener(
    port: Option<u16>,
    osc_svc: State<'_, OscService>,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
    app: AppHandle,
) -> Result<OscStatus, String> {
    let p = port.unwrap_or(9000);
    let bind = bind_mode(&db);
    osc_svc.start_listener(app, db.inner().clone(), pres_mgr.inner().clone(), p, bind.bind_ip())
}

#[tauri::command]
pub async fn stop_osc_listener(
    osc_svc: State<'_, OscService>,
) -> Result<OscStatus, String> {
    Ok(osc_svc.stop_listener())
}

// ================= Phase 5: Action Mapping & Unified Dispatch =================

#[tauri::command]
pub async fn list_action_mappings(
    db: State<'_, DbManager>,
) -> Result<Vec<ActionMapping>, String> {
    db.list_action_mappings().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_action_mapping(
    mapping: ActionMapping,
    db: State<'_, DbManager>,
) -> Result<ActionMapping, String> {
    let mut map = mapping;
    map.updated_at = Utc::now().to_rfc3339();
    db.update_action_mapping(&map).map_err(|e| e.to_string())?;
    Ok(map)
}

#[tauri::command]
pub async fn reset_action_mappings_to_default(
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.reset_action_mappings_to_default().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn dispatch_action(
    action: String,
    app: AppHandle,
    db: State<'_, DbManager>,
    pres_mgr: State<'_, PresentationManager>,
) -> Result<PresentationState, String> {
    ActionDispatcher::dispatch(&app, &db, &pres_mgr, &action)
}

// ================= Phase 5: System Diagnostics =================

#[tauri::command]
pub async fn get_system_diagnostics(
    db: State<'_, DbManager>,
    remote_mgr: State<'_, RemoteServerManager>,
    midi_svc: State<'_, MidiService>,
    osc_svc: State<'_, OscService>,
    app: AppHandle,
) -> Result<SystemDiagnostics, String> {
    let outputs = db.list_outputs().unwrap_or_default();
    let audience_window_open = DisplayManager::get_audience_status(&app).is_open;
    let stage_window_open = DisplayManager::get_stage_status(&app).is_open;
    let overlay_window_open = DisplayManager::get_overlay_status(&app).is_open;
    let remote_server = remote_mgr.get_status();
    let midi_status = midi_svc.get_status();
    let osc_status = osc_svc.get_status();

    let mut recent_errors = Vec::new();
    if let Some(ref e) = remote_server.error {
        recent_errors.push(format!("Remote server: {}", e));
    }
    if let Some(ref e) = midi_status.error {
        recent_errors.push(format!("MIDI subsystem: {}", e));
    }
    if let Some(ref e) = osc_status.error {
        recent_errors.push(format!("OSC subsystem: {}", e));
    }

    Ok(SystemDiagnostics {
        outputs,
        audience_window_open,
        stage_window_open,
        overlay_window_open,
        remote_server,
        midi_status,
        osc_status,
        recent_errors,
    })
}

// ================= Phase 6: Reliability, Recovery, Diagnostics & App Info =================

#[tauri::command]
pub async fn get_workspace_state(
    db: State<'_, DbManager>,
) -> Result<Option<WorkspaceState>, String> {
    db.get_workspace_state().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_workspace_state(
    state: WorkspaceState,
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.save_workspace_state(&state).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_diagnostics_log(
    filter: Option<AppDiagnosticFilter>,
    db: State<'_, DbManager>,
) -> Result<Vec<AppDiagnosticEntry>, String> {
    let f = filter.unwrap_or(AppDiagnosticFilter {
        level: None,
        component: None,
        limit: Some(100),
    });
    db.list_diagnostics(&f).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn log_client_diagnostic(
    level: String,
    component: String,
    message: String,
    details: Option<String>,
    db: State<'_, DbManager>,
) -> Result<(), String> {
    db.log_diagnostic(&level, &component, &message, details.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_diagnostics_log(
    before_timestamp: Option<String>,
    db: State<'_, DbManager>,
) -> Result<usize, String> {
    db.clear_diagnostics(before_timestamp.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_database_integrity(
    db: State<'_, DbManager>,
) -> Result<Vec<String>, String> {
    db.verify_integrity().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_app_info(
    app: AppHandle,
    db: State<'_, DbManager>,
) -> Result<AppInfo, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default().join(".data"));
    let media_dir = app_data_dir.join("media");
    let db_path = db.get_db_path().unwrap_or_else(|| app_data_dir.join("church_presenter.db"));

    let integrity = db.verify_integrity().unwrap_or_default();
    let is_ok = integrity.len() == 1 && integrity[0] == "ok";

    let (services, songs, media) = db.get_counts().unwrap_or((0, 0, 0));

    let build_profile = if cfg!(debug_assertions) {
        "debug"
    } else {
        "release"
    };

    Ok(AppInfo {
        name: "Church Presenter".to_string(),
        version: "1.0.0".to_string(),
        build_profile: build_profile.to_string(),
        target_os: std::env::consts::OS.to_string(),
        database_path: db_path.to_string_lossy().to_string(),
        media_dir: media_dir.to_string_lossy().to_string(),
        database_integrity: is_ok,
        total_services: services,
        total_songs: songs,
        total_media: media,
    })
}

#[tauri::command]
pub async fn open_devtools(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
    }
    Ok(())
}

#[tauri::command]
pub async fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default().join(".data"));
    Ok(app_data_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn resolve_media_url(
    app: AppHandle,
    relative_path: String,
) -> Result<String, String> {
    if relative_path.starts_with("http://")
        || relative_path.starts_with("https://")
        || relative_path.starts_with("data:")
        || relative_path.starts_with("asset://")
        || relative_path.starts_with("tauri://")
    {
        return Ok(relative_path);
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default().join(".data"));
    let cleaned = relative_path.trim_start_matches('/').trim_start_matches('\\');
    let full_path = app_data_dir.join(cleaned);
    Ok(full_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn parse_bible_reference(
    reference: String,
) -> Result<Option<BiblePassageQuery>, String> {
    Ok(crate::db::parse_bible_reference(&reference))
}

#[tauri::command]
pub async fn import_bible_verses(
    verses: Vec<crate::models::BibleVerse>,
    db: State<'_, DbManager>,
) -> Result<usize, String> {
    db.import_bible_verses(&verses).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_bible_translations(
    db: State<'_, DbManager>,
) -> Result<Vec<crate::models::BibleTranslationInfo>, String> {
    db.list_bible_translations().map_err(|e| e.to_string())
}

/// Imports Bible text pasted by the user (USFM, OSIS, Zefania, JSON) as `translation`.
#[tauri::command]
pub async fn import_bible_text(
    raw: String,
    translation: String,
    db: State<'_, DbManager>,
) -> Result<usize, String> {
    let translation = translation.trim().to_string();
    if translation.is_empty() {
        return Err("Enter a translation name (e.g. ESV) before importing.".to_string());
    }
    let verses = crate::bible_import::parse_bible_text(&raw, &translation)?;
    db.import_bible_books(&verses).map_err(|e| e.to_string())
}

/// Reads one or more Bible files (USFM, OSIS, Zefania, JSON) and imports them as `translation`.
/// Returns the number of verses imported.
#[tauri::command]
pub async fn import_bible_files(
    paths: Vec<String>,
    translation: String,
    db: State<'_, DbManager>,
) -> Result<usize, String> {
    let translation = translation.trim().to_string();
    if translation.is_empty() {
        return Err("Enter a translation name (e.g. ESV) before importing.".to_string());
    }
    if paths.is_empty() {
        return Err("No files selected.".to_string());
    }
    let mut all = Vec::new();
    for path in &paths {
        let raw = std::fs::read_to_string(path)
            .map_err(|e| format!("Could not read {}: {}", path, e))?;
        let verses = crate::bible_import::parse_bible_text(&raw, &translation)
            .map_err(|e| format!("{}: {}", path, e))?;
        all.extend(verses);
    }
    db.import_bible_books(&all).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_bible_verses(
    query: String,
    translation: Option<String>,
    limit: Option<usize>,
    db: State<'_, DbManager>,
) -> Result<Vec<crate::models::BibleVerse>, String> {
    db.search_bible_verses(&query, translation.as_deref(), limit)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_database_health(
    db: State<'_, DbManager>,
) -> Result<DatabaseHealth, String> {
    Ok(db.check_health())
}

#[tauri::command]
pub async fn recover_database_from_backup(
    backup_file: Option<String>,
    db: State<'_, DbManager>,
) -> Result<bool, String> {
    db.recover_from_backup_file(backup_file.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_stage_message(
    message: Option<String>,
    app: AppHandle,
    pres_mgr: State<'_, PresentationManager>,
) -> Result<PresentationState, String> {
    Ok(pres_mgr.set_stage_message(&app, message))
}

#[tauri::command]
pub async fn import_presentation_document(
    file_path: String,
    title: Option<String>,
    app: AppHandle,
    db: State<'_, DbManager>,
) -> Result<Presentation, String> {
    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let ext = presentation_extension(path)?;

    let app_data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| crate::resolve_app_data_path());

    let pres_id = Uuid::new_v4().to_string();
    let slides_dir = app_data_dir.join("media").join("presentations").join(&pres_id);
    let _ = std::fs::create_dir_all(&slides_dir);

    let pdf_to_process = if ext == "pptx" || ext == "ppt" {
        let lo_available = std::process::Command::new("libreoffice")
            .arg("--version")
            .output()
            .is_ok()
            || std::process::Command::new("soffice")
                .arg("--version")
                .output()
                .is_ok();

        if !lo_available {
            return Err("LibreOffice is required to convert PPTX presentations directly. Please install LibreOffice or export your presentation as PDF and import the PDF.".to_string());
        }

        let binary = if std::process::Command::new("libreoffice")
            .arg("--version")
            .output()
            .is_ok()
        {
            "libreoffice"
        } else {
            "soffice"
        };

        let temp_dir = app_data_dir.join("temp_lo").join(&pres_id);
        let _ = std::fs::create_dir_all(&temp_dir);

        let status = std::process::Command::new(binary)
            .args(&[
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                temp_dir.to_str().unwrap_or("."),
                &file_path,
            ])
            .status()
            .map_err(|e| format!("Failed to run LibreOffice conversion: {}", e))?;

        if !status.success() {
            return Err("LibreOffice failed to convert PPTX presentation to PDF.".to_string());
        }

        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("document");
        let generated_pdf = temp_dir.join(format!("{}.pdf", stem));
        if !generated_pdf.exists() {
            return Err("Converted PDF file was not found after LibreOffice processing.".to_string());
        }
        generated_pdf
    } else {
        path.to_path_buf()
    };

    let prefix = slides_dir.join("slide");
    let ppm_status = std::process::Command::new("pdftoppm")
        .args(&[
            "-png",
            "-r",
            "150",
            pdf_to_process.to_str().unwrap_or(""),
            prefix.to_str().unwrap_or(""),
        ])
        .status();

    let slide_images = match ppm_status {
        Ok(st) if st.success() => collect_slide_images(&slides_dir),
        _ => Vec::new(),
    };

    if slide_images.is_empty() {
        return Err("Failed to extract presentation slides with pdftoppm. Please ensure pdftoppm is installed.".to_string());
    }

    let pres_title = title.unwrap_or_else(|| {
        path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Presentation")
            .to_string()
    });

    let presentation = db
        .create_presentation(&pres_title, "presentation", None)
        .map_err(|e| e.to_string())?;

    for (idx, img_path) in slide_images.iter().enumerate() {
        let slide = image_slide(&presentation.id, img_path, idx);
        let _ = db.create_slide(&slide);
    }

    let updated_pres = db
        .get_presentation(&presentation.id)
        .map_err(|e| e.to_string())?
        .unwrap_or(presentation);

    Ok(updated_pres)
}




/// Rejects the whole batch if any slide carries an invalid safe margin or outline.
fn validate_slide_layouts(slides: &[Slide]) -> Result<(), String> {
    for (i, slide) in slides.iter().enumerate() {
        if let Some(layout) = &slide.layout {
            crate::layout::validate_layout(layout).map_err(|e| format!("Slide {}: {}", i + 1, e))?;
        }
    }
    Ok(())
}

/// Validates the file extension of an importable presentation and returns it lowercased.
fn presentation_extension(path: &std::path::Path) -> Result<String, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext != "pdf" && ext != "pptx" && ext != "ppt" {
        return Err("Only PDF and PPTX presentation files are supported.".to_string());
    }
    Ok(ext)
}

/// Lists the PNG pages `pdftoppm` wrote into `dir`, in page order.
fn collect_slide_images(dir: &std::path::Path) -> Vec<std::path::PathBuf> {
    let mut images: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|e| e.to_str()) == Some("png"))
                .collect()
        })
        .unwrap_or_default();
    images.sort();
    images
}

/// Builds a full-bleed image slide for page `idx` (0-based) of an imported presentation.
fn image_slide(presentation_id: &str, img_path: &std::path::Path, idx: usize) -> Slide {
    Slide {
        id: Uuid::new_v4().to_string(),
        presentation_id: presentation_id.to_string(),
        sort_order: idx as i32,
        title: format!("Slide {}", idx + 1),
        body: String::new(),
        background_color: "#000000".to_string(),
        foreground_color: "#ffffff".to_string(),
        font_size: "medium".to_string(),
        text_alignment: "center".to_string(),
        theme_override: None,
        background_image: Some(img_path.to_string_lossy().to_string()),
        overlay_color: None,
        line_spacing: Some(1.35),
        text_shadow: None,
        vertical_alignment: Some("center".to_string()),
        font_family: None,
        font_weight: None,
        group_label: None,
        group_color: None,
        layout: None,
        created_at: Utc::now().to_rfc3339(),
        updated_at: Utc::now().to_rfc3339(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn accepts_pdf_and_powerpoint_extensions_case_insensitively() {
        assert_eq!(presentation_extension(Path::new("a.pdf")).unwrap(), "pdf");
        assert_eq!(presentation_extension(Path::new("a.PPTX")).unwrap(), "pptx");
        assert_eq!(presentation_extension(Path::new("/x/y/deck.Ppt")).unwrap(), "ppt");
    }

    #[test]
    fn rejects_other_or_missing_extensions() {
        for p in ["a.docx", "a.odp", "a", "a.pdf.exe", ".pdf", "archive.zip"] {
            assert!(presentation_extension(Path::new(p)).is_err(), "{p} should be rejected");
        }
    }

    #[test]
    fn collects_only_png_pages_in_order() {
        let dir = std::env::temp_dir().join(format!("cp-slides-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        for name in ["slide-03.png", "slide-01.png", "slide-02.png", "notes.txt", "slide-04.jpg"] {
            std::fs::write(dir.join(name), b"x").unwrap();
        }

        let names: Vec<String> = collect_slide_images(&dir)
            .iter()
            .map(|p| p.file_name().unwrap().to_string_lossy().to_string())
            .collect();
        std::fs::remove_dir_all(&dir).ok();

        assert_eq!(names, vec!["slide-01.png", "slide-02.png", "slide-03.png"]);
    }

    #[test]
    fn missing_directory_yields_no_images() {
        let dir = std::env::temp_dir().join(format!("cp-missing-{}", Uuid::new_v4()));
        assert!(collect_slide_images(&dir).is_empty());
    }

    #[test]
    fn image_slide_is_one_based_titled_and_zero_based_ordered() {
        let slide = image_slide("pres-1", Path::new("/tmp/slide-02.png"), 1);
        assert_eq!(slide.presentation_id, "pres-1");
        assert_eq!(slide.title, "Slide 2");
        assert_eq!(slide.sort_order, 1);
        assert_eq!(slide.background_image.as_deref(), Some("/tmp/slide-02.png"));
        assert!(slide.body.is_empty());
    }

    #[test]
    fn imported_slides_persist_in_database_order() {
        let db = DbManager::new_in_memory().unwrap();
        let pres = db.create_presentation("Deck", "presentation", None).unwrap();
        for i in 0..3 {
            let img = format!("/tmp/slide-{}.png", i + 1);
            db.create_slide(&image_slide(&pres.id, Path::new(&img), i)).unwrap();
        }
        let slides = db.get_slides(&pres.id).unwrap();
        let titles: Vec<&str> = slides.iter().map(|s| s.title.as_str()).collect();
        assert_eq!(titles, vec!["Slide 1", "Slide 2", "Slide 3"]);
    }

    #[test]
    fn logo_accepts_common_image_types_case_insensitively() {
        for ext in ["png", "PNG", "jpg", "jpeg", "webp", "gif", "svg"] {
            assert_eq!(validate_logo_file(ext, 1024).unwrap(), ext.to_lowercase());
        }
    }

    #[test]
    fn logo_rejects_non_images_empty_and_oversized_files() {
        assert!(validate_logo_file("mp4", 1024).is_err());
        assert!(validate_logo_file("exe", 1024).is_err());
        assert!(validate_logo_file("", 1024).is_err());
        assert!(validate_logo_file("png", 0).is_err());
        assert!(validate_logo_file("png", MAX_LOGO_BYTES).is_ok());
        let err = validate_logo_file("png", MAX_LOGO_BYTES + 1).unwrap_err();
        assert!(err.contains("too large"));
    }

    #[test]
    fn slide_layout_batches_are_validated_with_the_slide_number() {
        let mut ok = image_slide("p", Path::new("/tmp/a.png"), 0);
        ok.layout = Some(crate::layout::SlideLayout { margin_pct: Some(5.0), ..Default::default() });
        let mut bad = image_slide("p", Path::new("/tmp/b.png"), 1);
        bad.layout = Some(crate::layout::SlideLayout { margin_pct: Some(90.0), ..Default::default() });
        let plain = image_slide("p", Path::new("/tmp/c.png"), 2);

        assert!(validate_slide_layouts(&[ok.clone(), plain.clone()]).is_ok());
        assert!(validate_slide_layouts(&[]).is_ok());
        let err = validate_slide_layouts(&[ok, bad, plain]).unwrap_err();
        assert!(err.starts_with("Slide 2:") && err.contains("margin"), "{err}");
    }
}
