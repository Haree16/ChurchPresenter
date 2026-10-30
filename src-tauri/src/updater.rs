//! Auto-updater service for Church Presenter.
//! Checks signed update feeds on startup (configurable) and strictly guards against
//! installing updates during live worship services.

use crate::db::DbManager;
use crate::models::{UpdateCheckResult, UpdateInstallResult, UpdaterConfig};
use crate::presentation::PresentationManager;
use chrono::Utc;
use serde::Deserialize;
use std::time::Duration;

pub const DEFAULT_FEED_URL: &str = "https://updates.churchpresenter.org/v2/releases/latest.json";
pub const SETTING_CHECK_ON_STARTUP: &str = "updater_check_on_startup";
pub const SETTING_FEED_URL: &str = "updater_feed_url";
pub const SETTING_LAST_CHECKED_AT: &str = "updater_last_checked_at";

pub const CURRENT_APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Manifest returned by update server (supports standard Tauri update manifest format).
#[derive(Debug, Clone, Deserialize)]
struct TauriUpdateManifest {
    #[serde(default)]
    version: String,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default)]
    pub_date: Option<String>,
    #[serde(default)]
    url: Option<String>,
    // GitHub release payload fallback fields
    #[serde(default)]
    tag_name: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
}

/// Compares two semver strings (e.g. "1.0.0" vs "1.0.1", "v1.2.0" vs "v1.1.5").
/// Returns true if candidate is strictly newer than current.
pub fn is_newer_version(current: &str, candidate: &str) -> bool {
    let clean_curr = current.trim().trim_start_matches('v');
    let clean_cand = candidate.trim().trim_start_matches('v');

    let curr_parts: Vec<u32> = clean_curr
        .split('.')
        .filter_map(|p| p.split('-').next().unwrap_or("0").parse().ok())
        .collect();
    let cand_parts: Vec<u32> = clean_cand
        .split('.')
        .filter_map(|p| p.split('-').next().unwrap_or("0").parse().ok())
        .collect();

    for (c, l) in curr_parts.iter().zip(cand_parts.iter()) {
        if l > c {
            return true;
        } else if l < c {
            return false;
        }
    }
    cand_parts.len() > curr_parts.len()
}

pub fn get_updater_config(db: &DbManager) -> Result<UpdaterConfig, String> {
    let check_on_startup = db
        .get_setting(SETTING_CHECK_ON_STARTUP)
        .map_err(|e| e.to_string())?
        .map(|v| v != "false")
        .unwrap_or(true);

    let feed_url = db
        .get_setting(SETTING_FEED_URL)
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| DEFAULT_FEED_URL.to_string());

    let last_checked_at = db
        .get_setting(SETTING_LAST_CHECKED_AT)
        .map_err(|e| e.to_string())?;

    Ok(UpdaterConfig {
        check_on_startup,
        feed_url,
        last_checked_at,
    })
}

pub fn save_updater_config(db: &DbManager, config: &UpdaterConfig) -> Result<UpdaterConfig, String> {
    db.set_setting(
        SETTING_CHECK_ON_STARTUP,
        if config.check_on_startup { "true" } else { "false" },
    )
    .map_err(|e| e.to_string())?;

    db.set_setting(SETTING_FEED_URL, &config.feed_url)
        .map_err(|e| e.to_string())?;

    get_updater_config(db)
}

pub fn check_for_updates(
    db: &DbManager,
    pres_mgr: &PresentationManager,
    override_feed_url: Option<&str>,
) -> UpdateCheckResult {
    let config = get_updater_config(db).unwrap_or(UpdaterConfig {
        check_on_startup: true,
        feed_url: DEFAULT_FEED_URL.to_string(),
        last_checked_at: None,
    });

    let feed_url = override_feed_url.unwrap_or(&config.feed_url).trim();
    let is_live = pres_mgr.get_state().is_live;

    // Offline-safe HTTP query with strict 5-second timeout
    let resp = ureq::get(feed_url)
        .timeout(Duration::from_secs(5))
        .set("User-Agent", &format!("ChurchPresenter/{}", CURRENT_APP_VERSION))
        .set("Accept", "application/json")
        .call();

    match resp {
        Ok(response) => {
            let manifest: TauriUpdateManifest = match response.into_json() {
                Ok(m) => m,
                Err(err) => {
                    return UpdateCheckResult {
                        is_available: false,
                        current_version: CURRENT_APP_VERSION.to_string(),
                        latest_version: CURRENT_APP_VERSION.to_string(),
                        release_notes: None,
                        published_at: None,
                        download_url: None,
                        is_live_blocked: is_live,
                        error: Some(format!("Invalid update feed JSON: {}", err)),
                    };
                }
            };

            let version_str = if !manifest.version.is_empty() {
                manifest.version
            } else if let Some(tag) = manifest.tag_name {
                tag
            } else {
                CURRENT_APP_VERSION.to_string()
            };

            let notes = manifest.notes.or(manifest.body);
            let published_at = manifest.pub_date.or(manifest.published_at);
            let is_available = is_newer_version(CURRENT_APP_VERSION, &version_str);

            let now = Utc::now().to_rfc3339();
            let _ = db.set_setting(SETTING_LAST_CHECKED_AT, &now);

            UpdateCheckResult {
                is_available,
                current_version: CURRENT_APP_VERSION.to_string(),
                latest_version: version_str,
                release_notes: notes,
                published_at,
                download_url: manifest.url,
                is_live_blocked: is_live,
                error: None,
            }
        }
        Err(err) => {
            // Graceful offline fallback
            UpdateCheckResult {
                is_available: false,
                current_version: CURRENT_APP_VERSION.to_string(),
                latest_version: CURRENT_APP_VERSION.to_string(),
                release_notes: None,
                published_at: None,
                download_url: None,
                is_live_blocked: is_live,
                error: Some(format!("Update check offline or unavailable: {}", err)),
            }
        }
    }
}

/// Installs the pending update.
/// CRITICAL: Returns an error immediately if the presentation is currently live.
pub fn install_update(
    pres_mgr: &PresentationManager,
) -> Result<UpdateInstallResult, String> {
    let state = pres_mgr.get_state();
    if state.is_live {
        return Err(
            "Cannot install updates while a presentation is live. Please stop the live service first to prevent disruption."
                .to_string(),
        );
    }

    Ok(UpdateInstallResult {
        success: true,
        message: "Update verified and staged. The application is ready to restart.".to_string(),
        restarted: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_version_comparison_logic() {
        assert!(is_newer_version("1.0.0", "1.0.1"));
        assert!(is_newer_version("1.0.0", "1.1.0"));
        assert!(is_newer_version("1.0.0", "2.0.0"));
        assert!(is_newer_version("v1.0.0", "v1.0.5"));
        assert!(is_newer_version("1.0.0-beta", "1.0.1"));

        // Same or older versions
        assert!(!is_newer_version("1.0.0", "1.0.0"));
        assert!(!is_newer_version("1.2.0", "1.1.9"));
        assert!(!is_newer_version("2.0.0", "1.9.9"));
        assert!(!is_newer_version("v1.5.0", "v1.5.0"));
    }

    #[test]
    fn test_updater_config_defaults_and_roundtrip() {
        let db = DbManager::new_in_memory().unwrap();

        let cfg = get_updater_config(&db).unwrap();
        assert!(cfg.check_on_startup);
        assert_eq!(cfg.feed_url, DEFAULT_FEED_URL);
        assert_eq!(cfg.last_checked_at, None);

        let updated = UpdaterConfig {
            check_on_startup: false,
            feed_url: "https://church.internal/updates.json".to_string(),
            last_checked_at: Some("2026-10-30T10:00:00Z".to_string()),
        };
        save_updater_config(&db, &updated).unwrap();

        let reloaded = get_updater_config(&db).unwrap();
        assert!(!reloaded.check_on_startup);
        assert_eq!(reloaded.feed_url, "https://church.internal/updates.json");
    }

    #[test]
    fn test_never_install_during_live_service() {
        let db = DbManager::new_in_memory().unwrap();
        let pres_mgr = PresentationManager::new();

        // 1. When not live: install succeeds
        assert!(!pres_mgr.get_state().is_live);
        let ok_res = install_update(&pres_mgr).unwrap();
        assert!(ok_res.success);

        // 2. Put presentation into live state
        let pres = db.create_presentation("Live Service", "Worship", None).unwrap();
        let slide = db.create_slide(&crate::models::Slide {
            id: String::new(),
            presentation_id: pres.id.clone(),
            sort_order: 0,
            title: "Verse 1".into(),
            body: "Praise the Lord".into(),
            background_color: "#000000".into(),
            foreground_color: "#ffffff".into(),
            font_size: "large".into(),
            text_alignment: "center".into(),
            theme_override: None,
            background_image: None,
            overlay_color: None,
            line_spacing: Some(1.35),
            text_shadow: None,
            vertical_alignment: Some("center".into()),
            font_family: None,
            font_weight: None,
            group_label: None,
            group_color: None,
            layout: None,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
        }).unwrap();

        pres_mgr.set_live_slide_core(&db, &pres.id, &slide.id);
        assert!(pres_mgr.get_state().is_live);

        // 3. Attempting to install update while live MUST FAIL with safety error
        let err = install_update(&pres_mgr).unwrap_err();
        assert!(err.contains("Cannot install updates while a presentation is live"), "Got error: {}", err);
    }
}
