use crate::models::{AudienceWindowStatus, DisplayMonitor, OverlayWindowStatus, StageWindowStatus};
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub struct DisplayManager;

impl DisplayManager {
    pub fn get_available_monitors(app: &AppHandle) -> Result<Vec<DisplayMonitor>, String> {
        let monitors = app
            .available_monitors()
            .map_err(|e| format!("Failed to query monitors: {}", e))?;

        let primary_monitor = app.primary_monitor().ok().flatten();
        let primary_name = primary_monitor.as_ref().and_then(|m| m.name());

        let mut result = Vec::new();

        for (idx, m) in monitors.iter().enumerate() {
            let name = m
                .name()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("Display {}", idx + 1));

            let is_primary = if let Some(p_name) = primary_name {
                m.name() == Some(p_name)
            } else {
                idx == 0
            };

            let pos = m.position();
            let size = m.size();

            result.push(DisplayMonitor {
                id: format!("display-{}", idx),
                name,
                width: size.width,
                height: size.height,
                x: pos.x,
                y: pos.y,
                scale_factor: m.scale_factor(),
                is_primary,
            });
        }

        if result.is_empty() {
            // Provide safe fallback monitor if OS doesn't report any
            result.push(DisplayMonitor {
                id: "display-0".to_string(),
                name: "Primary Display (Default)".to_string(),
                width: 1920,
                height: 1080,
                x: 0,
                y: 0,
                scale_factor: 1.0,
                is_primary: true,
            });
        }

        Ok(result)
    }

    pub fn find_monitor_index(
        monitors: &[DisplayMonitor],
        spec: &str,
    ) -> Option<usize> {
        if monitors.is_empty() {
            return None;
        }

        // 1. Match by position and size: e.g. "pos:1920,0;size:1920x1080" or "1920,0"
        if spec.starts_with("pos:") || spec.contains(',') {
            if let Some(pos) = monitors.iter().position(|m| {
                let key = format!("pos:{},{};size:{}x{}", m.x, m.y, m.width, m.height);
                let coords = format!("{},{}", m.x, m.y);
                key == spec || spec == coords
            }) {
                return Some(pos);
            }
        }

        // 2. Match by exact id
        if let Some(pos) = monitors.iter().position(|m| m.id == spec) {
            return Some(pos);
        }

        // 3. Match by name
        if let Some(pos) = monitors.iter().position(|m| m.name.eq_ignore_ascii_case(spec)) {
            return Some(pos);
        }

        // 4. Match by "display-N" index
        if let Some(idx) = spec.strip_prefix("display-").and_then(|s| s.parse::<usize>().ok()) {
            if idx < monitors.len() {
                return Some(idx);
            }
        }

        // 5. If "external-projector", pick non-primary
        if spec == "external-projector" {
            if let Some(pos) = monitors.iter().position(|m| !m.is_primary) {
                return Some(pos);
            }
        }

        // Fallback: non-primary or first
        monitors.iter().position(|m| !m.is_primary).or(Some(0))
    }

    pub fn open_audience_window(
        app: &AppHandle,
        monitor_id: Option<String>,
        fullscreen: bool,
    ) -> Result<AudienceWindowStatus, String> {
        let available = Self::get_available_monitors(app)?;
        let monitors = app
            .available_monitors()
            .map_err(|e| format!("Failed to query available monitors: {}", e))?;

        // Find matching monitor
        let target_monitor = if let Some(ref mid) = monitor_id {
            if let Some(idx) = Self::find_monitor_index(&available, mid) {
                monitors.get(idx).cloned()
            } else {
                None
            }
        } else {
            // Prefer non-primary external monitor if available
            if let Some(idx) = Self::find_monitor_index(&available, "") {
                monitors.get(idx).cloned()
            } else {
                monitors.first().cloned()
            }
        };

        // If audience window already exists, bring it up and re-position
        let window = if let Some(existing) = app.get_webview_window("audience") {
            existing
        } else {
            // Build new audience window
            WebviewWindowBuilder::new(
                app,
                "audience",
                WebviewUrl::App("index.html?window=audience".into()),
            )
            .title("Church Presenter - Audience Display")
            .decorations(!fullscreen)
            .skip_taskbar(true)
            .visible(false)
            .build()
            .map_err(|e| format!("Failed to create audience window: {}", e))?
        };

        let mut monitor_name = None;

        // Position on selected display
        if let Some(ref target) = target_monitor {
            monitor_name = target.name().map(|s| s.to_string());
            let pos = target.position();
            let size = target.size();

            // Set position before fullscreen
            window
                .set_position(PhysicalPosition::new(pos.x, pos.y))
                .ok();

            if fullscreen {
                window.set_decorations(false).ok();
                window.set_fullscreen(true).ok();
            } else {
                window.set_fullscreen(false).ok();
                window.set_decorations(true).ok();
                // Safe preview mode: set reasonable size (half screen width/height)
                let preview_w = (size.width / 2).max(800);
                let preview_h = (size.height / 2).max(600);
                window.set_size(PhysicalSize::new(preview_w, preview_h)).ok();
            }
        } else {
            // Fallback preview
            window.set_fullscreen(fullscreen).ok();
        }

        window.show().map_err(|e| format!("Failed to display audience window: {}", e))?;
        window.set_focus().ok();

        Ok(AudienceWindowStatus {
            is_open: true,
            monitor_name,
            is_fullscreen: fullscreen,
            error: None,
        })
    }

    pub fn close_audience_window(app: &AppHandle) -> Result<AudienceWindowStatus, String> {
        if let Some(window) = app.get_webview_window("audience") {
            window.hide().map_err(|e| format!("Failed to hide audience window: {}", e))?;
        }
        Ok(AudienceWindowStatus {
            is_open: false,
            monitor_name: None,
            is_fullscreen: false,
            error: None,
        })
    }

    pub fn get_audience_status(app: &AppHandle) -> AudienceWindowStatus {
        if let Some(window) = app.get_webview_window("audience") {
            let is_visible = window.is_visible().unwrap_or(false);
            let is_fullscreen = window.is_fullscreen().unwrap_or(false);
            let monitor_name = window
                .current_monitor()
                .ok()
                .flatten()
                .and_then(|m| m.name().map(|s| s.to_string()));

            AudienceWindowStatus {
                is_open: is_visible,
                monitor_name,
                is_fullscreen,
                error: None,
            }
        } else {
            AudienceWindowStatus {
                is_open: false,
                monitor_name: None,
                is_fullscreen: false,
                error: None,
            }
        }
    }

    pub fn open_stage_window(
        app: &AppHandle,
        monitor_id: Option<String>,
        fullscreen: bool,
    ) -> Result<StageWindowStatus, String> {
        let available = Self::get_available_monitors(app)?;
        let monitors = app
            .available_monitors()
            .map_err(|e| format!("Failed to query available monitors: {}", e))?;

        // Find matching monitor
        let target_monitor = if let Some(ref mid) = monitor_id {
            if let Some(idx) = Self::find_monitor_index(&available, mid) {
                monitors.get(idx).cloned()
            } else {
                None
            }
        } else {
            // If more than 2 displays, choose 3rd or 2nd
            if monitors.len() >= 3 {
                monitors.get(2).cloned()
            } else if monitors.len() >= 2 {
                monitors.get(1).cloned()
            } else {
                monitors.first().cloned()
            }
        };

        let window = if let Some(existing) = app.get_webview_window("stage") {
            existing
        } else {
            WebviewWindowBuilder::new(
                app,
                "stage",
                WebviewUrl::App("index.html?window=stage".into()),
            )
            .title("Church Presenter - Stage Display")
            .decorations(!fullscreen)
            .skip_taskbar(true)
            .visible(false)
            .build()
            .map_err(|e| format!("Failed to create stage window: {}", e))?
        };

        let mut monitor_name = None;

        if let Some(ref target) = target_monitor {
            monitor_name = target.name().map(|s| s.to_string());
            let pos = target.position();
            let size = target.size();

            window
                .set_position(PhysicalPosition::new(pos.x, pos.y))
                .ok();

            if fullscreen {
                window.set_decorations(false).ok();
                window.set_fullscreen(true).ok();
            } else {
                window.set_fullscreen(false).ok();
                window.set_decorations(true).ok();
                let preview_w = (size.width / 2).max(800);
                let preview_h = (size.height / 2).max(600);
                window.set_size(PhysicalSize::new(preview_w, preview_h)).ok();
            }
        } else {
            window.set_fullscreen(fullscreen).ok();
        }

        window.show().map_err(|e| format!("Failed to display stage window: {}", e))?;
        window.set_focus().ok();

        Ok(StageWindowStatus {
            is_open: true,
            monitor_name,
            is_fullscreen: fullscreen,
            error: None,
        })
    }

    pub fn close_stage_window(app: &AppHandle) -> Result<StageWindowStatus, String> {
        if let Some(window) = app.get_webview_window("stage") {
            window.hide().map_err(|e| format!("Failed to hide stage window: {}", e))?;
        }
        Ok(StageWindowStatus {
            is_open: false,
            monitor_name: None,
            is_fullscreen: false,
            error: None,
        })
    }

    pub fn get_stage_status(app: &AppHandle) -> StageWindowStatus {
        if let Some(window) = app.get_webview_window("stage") {
            let is_visible = window.is_visible().unwrap_or(false);
            let is_fullscreen = window.is_fullscreen().unwrap_or(false);
            let monitor_name = window
                .current_monitor()
                .ok()
                .flatten()
                .and_then(|m| m.name().map(|s| s.to_string()));

            StageWindowStatus {
                is_open: is_visible,
                monitor_name,
                is_fullscreen,
                error: None,
            }
        } else {
            StageWindowStatus {
                is_open: false,
                monitor_name: None,
                is_fullscreen: false,
                error: None,
            }
        }
    }

    pub fn open_overlay_window(
        app: &AppHandle,
        monitor_id: Option<String>,
        fullscreen: bool,
    ) -> Result<OverlayWindowStatus, String> {
        let monitors = app
            .available_monitors()
            .map_err(|e| format!("Failed to query available monitors: {}", e))?;

        let target_monitor = if let Some(ref mid) = monitor_id {
            let idx = mid
                .strip_prefix("display-")
                .and_then(|s| s.parse::<usize>().ok());
            if let Some(i) = idx {
                monitors.get(i).cloned()
            } else {
                None
            }
        } else {
            monitors.iter().find(|m| {
                if let Ok(Some(primary)) = app.primary_monitor() {
                    m.name() != primary.name()
                } else {
                    false
                }
            }).cloned().or_else(|| monitors.first().cloned())
        };

        let window = if let Some(existing) = app.get_webview_window("overlay") {
            existing
        } else {
            WebviewWindowBuilder::new(
                app,
                "overlay",
                WebviewUrl::App("index.html?window=overlay".into()),
            )
            .title("Church Presenter - Livestream Overlay")
            .inner_size(1920.0, 1080.0)
            .resizable(true)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .build()
            .map_err(|e| format!("Failed to create overlay window: {}", e))?
        };

        let monitor_name = target_monitor.as_ref().and_then(|m| m.name().map(|s| s.to_string()));

        if let Some(m) = target_monitor {
            let pos = m.position();
            let size = m.size();
            window.set_position(PhysicalPosition::new(pos.x, pos.y)).ok();
            if fullscreen {
                window.set_size(PhysicalSize::new(size.width, size.height)).ok();
                window.set_fullscreen(true).ok();
            } else {
                window.set_fullscreen(false).ok();
                window.set_size(PhysicalSize::new(size.width, size.height)).ok();
            }
        } else {
            window.set_fullscreen(fullscreen).ok();
        }

        window.show().map_err(|e| format!("Failed to display overlay window: {}", e))?;

        Ok(OverlayWindowStatus {
            is_open: true,
            monitor_name,
            is_fullscreen: fullscreen,
            error: None,
        })
    }

    pub fn close_overlay_window(app: &AppHandle) -> Result<OverlayWindowStatus, String> {
        if let Some(window) = app.get_webview_window("overlay") {
            window.hide().map_err(|e| format!("Failed to hide overlay window: {}", e))?;
        }
        Ok(OverlayWindowStatus {
            is_open: false,
            monitor_name: None,
            is_fullscreen: false,
            error: None,
        })
    }

    pub fn get_overlay_status(app: &AppHandle) -> OverlayWindowStatus {
        if let Some(window) = app.get_webview_window("overlay") {
            let is_visible = window.is_visible().unwrap_or(false);
            let is_fullscreen = window.is_fullscreen().unwrap_or(false);
            let monitor_name = window
                .current_monitor()
                .ok()
                .flatten()
                .and_then(|m| m.name().map(|s| s.to_string()));

            OverlayWindowStatus {
                is_open: is_visible,
                monitor_name,
                is_fullscreen,
                error: None,
            }
        } else {
            OverlayWindowStatus {
                is_open: false,
                monitor_name: None,
                is_fullscreen: false,
                error: None,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_monitor_resolution_and_matching() {
        let monitors = vec![
            DisplayMonitor {
                id: "display-0".to_string(),
                name: "Built-in Screen".to_string(),
                width: 1920,
                height: 1080,
                x: 0,
                y: 0,
                scale_factor: 1.0,
                is_primary: true,
            },
            DisplayMonitor {
                id: "display-1".to_string(),
                name: "Epson Projector".to_string(),
                width: 1920,
                height: 1080,
                x: 1920,
                y: 0,
                scale_factor: 1.0,
                is_primary: false,
            },
        ];

        // 1. Match by position coordinates
        let idx = DisplayManager::find_monitor_index(&monitors, "pos:1920,0;size:1920x1080");
        assert_eq!(idx, Some(1));

        // 2. Match by coordinates shortcut
        let idx = DisplayManager::find_monitor_index(&monitors, "1920,0");
        assert_eq!(idx, Some(1));

        // 3. Match by name
        let idx = DisplayManager::find_monitor_index(&monitors, "Epson Projector");
        assert_eq!(idx, Some(1));

        // 4. Match by index
        let idx = DisplayManager::find_monitor_index(&monitors, "display-1");
        assert_eq!(idx, Some(1));

        // 5. Fallback for external-projector
        let idx = DisplayManager::find_monitor_index(&monitors, "external-projector");
        assert_eq!(idx, Some(1));
    }
}

