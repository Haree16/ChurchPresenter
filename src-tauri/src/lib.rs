mod actions;
mod bible_import;
mod bible_suggest;
mod ccli;
mod clear_groups;
mod commands;
mod db;
mod display;
mod midi;
mod keybindings;
mod layout;
mod looks;
mod macros;
mod models;
mod net_guard;
mod osc;
mod overlay;
mod presentation;
mod pptx_import;
mod props;
mod stage_layout;
mod templates;
mod theme_io;
mod remote;
mod search;
mod service_templates;
pub mod planning_center;
pub mod dmx;
pub mod updater;
pub mod recorder;
pub mod obs;

use db::DbManager;
use midi::MidiService;
use osc::OscService;
use presentation::PresentationManager;
use remote::RemoteServerManager;
use tauri::Manager;

pub fn resolve_app_data_path() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return std::path::PathBuf::from(appdata).join("church-presenter");
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join("church-presenter");
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
            return std::path::PathBuf::from(xdg).join("church-presenter");
        }
        if let Ok(home) = std::env::var("HOME") {
            return std::path::PathBuf::from(home)
                .join(".local")
                .join("share")
                .join("church-presenter");
        }
    }
    std::env::current_dir().unwrap_or_default().join(".data")
}

pub fn perform_rolling_backup(app_data_dir: &std::path::Path, db: &DbManager, max_backups: usize) {
    let backup_dir = app_data_dir.join("backups");
    let _ = std::fs::create_dir_all(&backup_dir);
    let filename = format!(
        "auto-backup-{}.json",
        chrono::Utc::now().format("%Y%m%d-%H%M%S")
    );
    let backup_file = backup_dir.join(filename);
    if let Ok(backup) = db.export_backup() {
        if let Ok(json) = serde_json::to_string_pretty(&backup) {
            let _ = std::fs::write(backup_file, json);
        }
    }

    if let Ok(entries) = std::fs::read_dir(&backup_dir) {
        let mut auto_backups: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name.starts_with("auto-backup-") && name.ends_with(".json")
            })
            .collect();
        auto_backups.sort_by_key(|e| e.file_name());
        if auto_backups.len() > max_backups {
            let to_remove = auto_backups.len() - max_backups;
            for entry in auto_backups.iter().take(to_remove) {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Install panic hook that records crash diagnostics to disk in app data dir
    std::panic::set_hook(Box::new(|info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".into());
        let msg = match info.payload().downcast_ref::<&str>() {
            Some(s) => *s,
            None => match info.payload().downcast_ref::<String>() {
                Some(s) => &s[..],
                None => "Box<Any>",
            },
        };
        eprintln!("PANIC in Church Presenter at {}: {}", location, msg);
        let app_dir = resolve_app_data_path();
        let _ = std::fs::create_dir_all(&app_dir);
        let log_file = app_dir.join("panic.log");
        let timestamp = chrono::Utc::now().to_rfc3339();
        let log_entry = format!("[{}] PANIC at {}: {}\n", timestamp, location, msg);
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_file)
            .and_then(|mut f| std::io::Write::write_all(&mut f, log_entry.as_bytes()));
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Resolve app data directory for SQLite database storage
            let app_data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| resolve_app_data_path());

            let db_path = app_data_dir.join("church_presenter.db");
            let db_manager = match DbManager::new(&db_path) {
                Ok(db) => db,
                Err(err) => {
                    eprintln!("CRITICAL: Database initialization failed at {:?}: {}", db_path, err);
                    DbManager::new_with_error(&db_path, err.to_string())
                        .expect("Failed to initialize fallback database error state")
                }
            };

            let pres_manager = PresentationManager::new();
            pres_manager.init_pointers(&db_manager);

            // Start monitor hotplug resilience watcher
            display::DisplayManager::start_monitor_hotplug_watcher(app.handle().clone());

            app.manage(db_manager);
            app.manage(pres_manager);
            app.manage(RemoteServerManager::new());
            app.manage(macros::MacroRunner::new());
            app.manage(MidiService::new());
            app.manage(OscService::new());
            app.manage(dmx::DmxService::new());
            app.manage(std::sync::Arc::new(recorder::RecorderService::new(app_data_dir.clone())));
            app.manage(std::sync::Arc::new(obs::ObsService::new()));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Presentations
            commands::list_presentations,
            commands::get_presentation,
            commands::create_presentation,
            commands::update_presentation,
            commands::delete_presentation,
            commands::duplicate_presentation,
            // Slides
            commands::get_slides,
            commands::create_slide,
            commands::update_slide,
            commands::delete_slide,
            commands::duplicate_slide,
            commands::reorder_slides,
            // Presentation Controls
            commands::get_presentation_state,
            commands::set_live_slide,
            commands::toggle_blackout,
            commands::toggle_logo,
            commands::clear_media,
            commands::send_alert,
            commands::start_auto_advance,
            commands::suggest_bible_references,
            commands::list_service_templates,
            commands::save_service_as_template,
            commands::delete_service_template,
            commands::create_service_from_template,
            commands::search_song_lyrics,
            commands::search_slide_text,
            commands::get_ccli_licence_number,
            commands::set_ccli_licence_number,
            commands::get_ccli_report,
            commands::list_song_usage,
            commands::delete_song_usage,
            commands::list_clear_groups,
            commands::create_clear_group,
            commands::update_clear_group,
            commands::delete_clear_group,
            commands::run_clear_group,
            commands::list_key_bindings,
            commands::create_key_binding,
            commands::update_key_binding,
            commands::delete_key_binding,
            commands::list_looks,
            commands::create_look,
            commands::update_look,
            commands::delete_look,
            commands::apply_look,
            commands::capture_look,
            commands::list_macros,
            commands::create_macro,
            commands::update_macro,
            commands::delete_macro,
            commands::run_macro,
            commands::stop_macro,
            commands::stop_auto_advance,
            commands::list_props,
            commands::create_prop,
            commands::update_prop,
            commands::delete_prop,
            commands::list_slide_templates,
            commands::create_slide_template,
            commands::update_slide_template,
            commands::delete_slide_template,
            commands::toggle_prop,
            commands::clear_props,
            commands::clear_alert,
            commands::clear_all,
            commands::next_slide,
            commands::previous_slide,
            commands::set_announcements_presentation,
            commands::set_announcements_slide,
            commands::next_announcements_slide,
            commands::previous_announcements_slide,
            commands::clear_announcements,
            // Display & Audience
            commands::get_available_monitors,
            commands::open_audience_window,
            commands::close_audience_window,
            commands::get_audience_status,
            // Backup & Settings
            commands::export_backup,
            commands::import_backup,
            commands::get_setting,
            commands::set_setting,
            // Phase 2: Songs & Sections
            commands::list_songs,
            commands::get_song,
            commands::create_song,
            commands::update_song,
            commands::delete_song,
            commands::duplicate_song,
            commands::search_songs,
            commands::get_song_sections,
            commands::save_song_sections,
            // Phase 2: Themes
            commands::list_themes,
            commands::get_theme,
            commands::create_theme,
            commands::update_theme,
            commands::delete_theme,
            commands::duplicate_theme,
            commands::export_themes_to_file,
            commands::import_themes_from_file,
            // Phase 2: Media Assets
            commands::list_media_assets,
            commands::import_media_asset,
            commands::set_custom_logo,
            commands::clear_custom_logo,
            commands::delete_media_asset,
            commands::update_media_asset,
            // Phase 2: Slide Generation & Interchange
            commands::generate_slides_from_song,
            commands::export_song,
            commands::export_all_songs,
            commands::import_songs,
            // Phase 3: Services & Playlists
            commands::list_services,
            commands::get_service,
            commands::get_service_with_items,
            commands::create_service,
            commands::update_service,
            commands::delete_service,
            commands::duplicate_service,
            commands::get_service_items,
            commands::get_service_item,
            commands::get_service_item_with_slides,
            commands::add_service_item,
            commands::update_service_item,
            commands::delete_service_item,
            commands::reorder_service_items,
            commands::duplicate_service_item,
            commands::get_service_item_slides,
            commands::save_service_item_slides,
            commands::add_song_to_service,
            commands::get_song_arrangements,
            commands::save_song_arrangements,
            // Phase 3: Bible Passage Lookup
            commands::query_bible_passage,
            commands::add_bible_passage_to_service,
            // Phase 3: Live Service Item & Selection State
            commands::set_live_service_item_slide,
            commands::set_selected_service_item,
            commands::clear_live,
            // Phase 4: Media Assets Extensions
            commands::get_media_asset,
            commands::check_media_asset_usage,
            // Phase 4: Stage Display & Timers
            commands::open_stage_window,
            commands::close_stage_window,
            commands::get_stage_status,
            commands::list_timers,
            commands::get_timer,
            commands::create_timer,
            commands::update_timer,
            commands::delete_timer,
            commands::get_stage_config,
            commands::list_stage_configs,
            commands::delete_stage_config,
            commands::update_stage_config,
            commands::set_media_playback,
            commands::set_timer_state,
            // Phase 5: Independent Outputs
            commands::list_outputs,
            commands::get_output,
            commands::create_output,
            commands::update_output,
            commands::delete_output,
            // Phase 5: Livestream Overlay
            commands::get_overlay_config,
            commands::update_overlay_config,
            commands::regenerate_overlay_token,
            commands::toggle_overlay_clear,
            commands::open_overlay_window,
            commands::close_overlay_window,
            commands::get_overlay_status,
            commands::get_overlay_render_payload,
            // Phase 5: Remote Control
            commands::get_remote_server_status,
            commands::start_remote_server,
            commands::stop_remote_server,
            commands::get_network_bind_mode,
            commands::set_network_bind_mode,
            commands::list_remote_devices,
            commands::approve_remote_device,
            commands::update_remote_device_permissions,
            commands::delete_remote_device,
            commands::get_remote_tls_enabled,
            commands::set_remote_tls_enabled,
            // Phase 5: MIDI Integration
            commands::get_midi_status,
            commands::list_midi_devices,
            commands::start_midi_listener,
            commands::stop_midi_listener,
            commands::list_midi_mappings,
            commands::create_midi_mapping,
            commands::update_midi_mapping,
            commands::delete_midi_mapping,
            // Phase 5: OSC Integration
            commands::get_osc_config,
            commands::update_osc_config,
            commands::get_osc_status,
            commands::start_osc_listener,
            commands::stop_osc_listener,
            // Phase 5: Action Mapping & Unified Dispatch
            commands::list_action_mappings,
            commands::update_action_mapping,
            commands::reset_action_mappings_to_default,
            commands::dispatch_action,
            // Phase 5: System Diagnostics
            commands::get_system_diagnostics,
            // Phase 6: Reliability, Recovery, Diagnostics & App Info
            commands::get_workspace_state,
            commands::save_workspace_state,
            commands::get_diagnostics_log,
            commands::log_client_diagnostic,
            commands::clear_diagnostics_log,
            commands::verify_database_integrity,
            commands::get_app_info,
            commands::open_devtools,
            commands::get_app_data_dir,
            commands::resolve_media_url,
            commands::parse_bible_reference,
            commands::import_bible_verses,
            commands::search_bible_verses,
            commands::list_bible_translations,
            commands::import_bible_files,
            commands::import_bible_text,
            commands::get_database_health,
            commands::recover_database_from_backup,
            commands::import_pptx_native,
            commands::import_presentation_document,
            commands::set_stage_message,
            // Phase 10.1: Planning Center Integration
            commands::get_planning_center_status,
            commands::save_planning_center_credentials,
            commands::disconnect_planning_center,
            commands::list_planning_center_service_types,
            commands::list_planning_center_plans,
            commands::get_planning_center_plan_details,
            commands::import_planning_center_plan,
            // Phase 10.2: Stream Deck & DMX Lighting Control
            commands::get_dmx_config,
            commands::update_dmx_config,
            commands::send_dmx_test_cue,
            commands::get_stream_deck_profile,
            // Phase 10.4: Auto-updater
            commands::get_updater_config,
            commands::save_updater_config,
            commands::check_for_updates,
            commands::install_update,
            // Phase 11.1: Audience Output Recording
            commands::get_recording_config,
            commands::update_recording_config,
            commands::start_recording,
            commands::append_recording_chunk,
            commands::pause_recording,
            commands::resume_recording,
            commands::stop_recording,
            commands::get_recording_status,
            commands::list_recordings,
            commands::delete_recording,
            commands::open_recording_folder,
            // Phase 11.2: OBS Studio WebSocket v5
            commands::get_obs_config,
            commands::update_obs_config,
            commands::get_obs_status,
            commands::obs_connect,
            commands::obs_disconnect,
            commands::obs_set_scene,
            commands::obs_start_stream,
            commands::obs_stop_stream,
            commands::obs_start_record,
            commands::obs_stop_record,
            // Phase 11.3: Live Video Input
            commands::get_live_video_config,
            commands::update_live_video_config,
            commands::toggle_live_camera,
            commands::get_live_video_status,
            commands::list_camera_devices,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Perform rolling auto-backup (max 10 backups kept)
                if let Some(db) = app_handle.try_state::<DbManager>() {
                    let app_data_dir = app_handle
                        .path()
                        .app_data_dir()
                        .unwrap_or_else(|_| resolve_app_data_path());
                    perform_rolling_backup(&app_data_dir, &db, 10);
                }
            }
        });
}
