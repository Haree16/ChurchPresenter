use crate::actions::ActionDispatcher;
use crate::db::DbManager;
use crate::models::OscStatus;
use crate::presentation::PresentationManager;
use chrono::Utc;
use rosc::{OscMessage, OscPacket};
use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct OscService {
    is_running: Arc<AtomicBool>,
    port: Arc<Mutex<u16>>,
    last_received_path: Arc<Mutex<Option<String>>>,
    last_received_time: Arc<Mutex<Option<String>>>,
    last_error: Arc<Mutex<Option<String>>>,
    bind_ip: Arc<Mutex<String>>,
    has_shared_secret: Arc<AtomicBool>,
}

impl OscService {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            port: Arc::new(Mutex::new(9000)),
            last_received_path: Arc::new(Mutex::new(None)),
            last_received_time: Arc::new(Mutex::new(None)),
            last_error: Arc::new(Mutex::new(None)),
            bind_ip: Arc::new(Mutex::new("0.0.0.0".to_string())),
            has_shared_secret: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get_status(&self) -> OscStatus {
        let is_running = self.is_running.load(Ordering::SeqCst);
        let port = *self.port.lock().unwrap();
        let last_received_path = self.last_received_path.lock().unwrap().clone();
        let last_received_time = self.last_received_time.lock().unwrap().clone();
        let error = self.last_error.lock().unwrap().clone();

        OscStatus {
            is_running,
            port,
            last_received_path,
            last_received_time,
            error,
            bind_address: self.bind_ip.lock().unwrap().clone(),
            has_shared_secret: self.has_shared_secret.load(Ordering::SeqCst),
        }
    }

    pub fn start_listener(
        &self,
        app: AppHandle,
        db: DbManager,
        pres_mgr: PresentationManager,
        port: u16,
        bind_ip: &str,
    ) -> Result<OscStatus, String> {
        self.stop_listener();

        let cfg = db.get_osc_config().unwrap_or_else(|_| crate::models::OscConfig {
            id: "default-osc".to_string(),
            is_enabled: true,
            listen_port: port,
            allowlist_actions: "next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay".to_string(),
            shared_secret: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        });

        let has_secret = cfg.shared_secret.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
        self.has_shared_secret.store(has_secret, Ordering::SeqCst);

        let bind_addr = format!("{}:{}", bind_ip, port);
        let socket = UdpSocket::bind(&bind_addr)
            .map_err(|e| format!("Failed to bind OSC UDP socket to {}: {}", bind_addr, e))?;

        socket
            .set_read_timeout(Some(Duration::from_millis(500)))
            .map_err(|e| format!("Failed to set UDP socket timeout: {}", e))?;

        *self.port.lock().unwrap() = port;
        *self.bind_ip.lock().unwrap() = bind_ip.to_string();
        *self.last_error.lock().unwrap() = None;
        self.is_running.store(true, Ordering::SeqCst);

        let is_running_flag = self.is_running.clone();
        let last_path_holder = self.last_received_path.clone();
        let last_time_holder = self.last_received_time.clone();
        let last_err_holder = self.last_error.clone();

        thread::spawn(move || {
            let mut buf = [0u8; rosc::decoder::MTU];

            while is_running_flag.load(Ordering::SeqCst) {
                match socket.recv_from(&mut buf) {
                    Ok((size, addr)) => {
                        if !crate::net_guard::is_lan_addr(addr.ip()) {
                            *last_err_holder.lock().unwrap() =
                                Some(format!("Dropped OSC packet from non-LAN address {}", addr.ip()));
                            continue;
                        }
                        let packet = match rosc::decoder::decode_udp(&buf[..size]) {
                            Ok((_, p)) => p,
                            Err(e) => {
                                *last_err_holder.lock().unwrap() =
                                    Some(format!("Malformed OSC packet: {:?}", e));
                                continue;
                            }
                        };

                        Self::handle_packet(&app, &db, &pres_mgr, packet, &last_path_holder, &last_time_holder, &last_err_holder);
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {
                        // normal timeout, continue loop
                    }
                    Err(e) => {
                        *last_err_holder.lock().unwrap() = Some(format!("OSC socket error: {}", e));
                    }
                }
            }
        });

        Ok(self.get_status())
    }

    pub fn stop_listener(&self) -> OscStatus {
        self.is_running.store(false, Ordering::SeqCst);
        self.get_status()
    }

    fn handle_packet(
        app: &AppHandle,
        db: &DbManager,
        pres_mgr: &PresentationManager,
        packet: OscPacket,
        last_path_holder: &Arc<Mutex<Option<String>>>,
        last_time_holder: &Arc<Mutex<Option<String>>>,
        last_err_holder: &Arc<Mutex<Option<String>>>,
    ) {
        match packet {
            OscPacket::Message(msg) => {
                Self::handle_message(app, db, pres_mgr, msg, last_path_holder, last_time_holder, last_err_holder);
            }
            OscPacket::Bundle(bundle) => {
                for pkt in bundle.content {
                    Self::handle_packet(app, db, pres_mgr, pkt, last_path_holder, last_time_holder, last_err_holder);
                }
            }
        }
    }

    fn handle_message(
        app: &AppHandle,
        db: &DbManager,
        pres_mgr: &PresentationManager,
        msg: OscMessage,
        last_path_holder: &Arc<Mutex<Option<String>>>,
        last_time_holder: &Arc<Mutex<Option<String>>>,
        last_err_holder: &Arc<Mutex<Option<String>>>,
    ) {
        let raw_path = msg.addr.as_str();
        let now_str = Utc::now().to_rfc3339();

        // Check against allowlist and shared_secret from osc_configs
        let osc_cfg = db.get_osc_config().unwrap_or_else(|_| crate::models::OscConfig {
            id: "default-osc".to_string(),
            is_enabled: true,
            listen_port: 9000,
            allowlist_actions: "next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay".to_string(),
            shared_secret: None,
            created_at: "".to_string(),
            updated_at: "".to_string(),
        });

        let expected_secret = osc_cfg
            .shared_secret
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());

        let (path, is_authenticated) = if let Some(secret) = expected_secret {
            let prefix_slash = format!("/{}", secret);
            let prefix_auth = format!("/auth:{}", secret);

            if raw_path.starts_with(&prefix_slash) && raw_path[prefix_slash.len()..].starts_with('/') {
                (&raw_path[prefix_slash.len()..], true)
            } else if raw_path.starts_with(&prefix_auth) && raw_path[prefix_auth.len()..].starts_with('/') {
                (&raw_path[prefix_auth.len()..], true)
            } else {
                // Check if first argument is secret string
                let arg_secret_match = msg.args.first().and_then(|arg| match arg {
                    rosc::OscType::String(s) => Some(s.trim() == secret),
                    _ => None,
                }).unwrap_or(false);

                if arg_secret_match {
                    (raw_path, true)
                } else {
                    (raw_path, false)
                }
            }
        } else {
            (raw_path, true)
        };

        if !is_authenticated {
            let err_msg = format!("OSC authentication failed: invalid or missing shared secret for path {}", raw_path);
            *last_err_holder.lock().unwrap() = Some(err_msg.clone());
            app.emit("osc:auth-failed", serde_json::json!({ "path": raw_path, "error": err_msg })).ok();
            return;
        }

        *last_path_holder.lock().unwrap() = Some(path.to_string());
        *last_time_holder.lock().unwrap() = Some(now_str.clone());

        app.emit(
            "osc:message-received",
            serde_json::json!({
                "path": path,
                "timestamp": now_str,
            }),
        )
        .ok();

        if let Some(action) = osc_path_to_action(path) {
            if is_action_allowed(&osc_cfg.allowlist_actions, action) {
                let _ = ActionDispatcher::dispatch(app, db, pres_mgr, action);
            }
        } else if let Some(action) = osc_macro_action(path) {
            // Macros are opt-in one by one (`run_macro:<id>`) or all at once (`run_macro:*`).
            if is_action_allowed(&osc_cfg.allowlist_actions, &action) {
                let _ = ActionDispatcher::dispatch(app, db, pres_mgr, &action);
            }
        }
    }
}

/// Maps an OSC address pattern to the action it triggers, if any.
fn osc_path_to_action(path: &str) -> Option<&'static str> {
    match path {
        "/slide/next" => Some("next_slide"),
        "/slide/prev" | "/slide/previous" => Some("prev_slide"),
        "/item/next" => Some("next_item"),
        "/item/prev" | "/item/previous" => Some("prev_item"),
        "/presentation/blackout" | "/blackout" => Some("toggle_blackout"),
        "/presentation/live" | "/live" => Some("toggle_live"),
        "/timer/start" => Some("start_timer"),
        "/timer/stop" | "/timer/pause" => Some("stop_timer"),
        "/timer/reset" => Some("reset_timer"),
        "/overlay/clear" => Some("clear_overlay"),
        "/logo" => Some("toggle_logo"),
        "/clear/media" => Some("clear_media"),
        "/alert/clear" => Some("clear_alert"),
        "/clear/props" => Some("clear_props"),
        "/autoadvance/stop" => Some("stop_auto_advance"),
        "/clear/all" => Some("clear_all"),
        _ => None,
    }
}

/// `/macro/<id>` runs the saved macro with that id; the action is `run_macro:<id>`.
fn osc_macro_action(path: &str) -> Option<String> {
    let id = path.strip_prefix("/macro/")?;
    let action = format!("{}{}", crate::macros::RUN_MACRO_PREFIX, id);
    crate::macros::macro_id_from_action(&action).is_some().then_some(action)
}

/// True when `action` appears in the comma-separated allowlist. `run_macro:*` allows every macro.
fn is_action_allowed(allowlist: &str, action: &str) -> bool {
    allowlist.split(',').map(|s| s.trim()).any(|a| {
        a == action || (a == "run_macro:*" && crate::macros::macro_id_from_action(action).is_some())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_known_paths_and_aliases() {
        assert_eq!(osc_path_to_action("/slide/next"), Some("next_slide"));
        assert_eq!(osc_path_to_action("/slide/prev"), Some("prev_slide"));
        assert_eq!(osc_path_to_action("/slide/previous"), Some("prev_slide"));
        assert_eq!(osc_path_to_action("/blackout"), Some("toggle_blackout"));
        assert_eq!(osc_path_to_action("/presentation/blackout"), Some("toggle_blackout"));
        assert_eq!(osc_path_to_action("/live"), Some("toggle_live"));
        assert_eq!(osc_path_to_action("/timer/pause"), Some("stop_timer"));
        assert_eq!(osc_path_to_action("/overlay/clear"), Some("clear_overlay"));
    }

    #[test]
    fn maps_logo_and_clear_paths() {
        assert_eq!(osc_path_to_action("/logo"), Some("toggle_logo"));
        assert_eq!(osc_path_to_action("/clear/media"), Some("clear_media"));
        assert_eq!(osc_path_to_action("/clear/all"), Some("clear_all"));
        assert_eq!(osc_path_to_action("/alert/clear"), Some("clear_alert"));
        assert_eq!(osc_path_to_action("/clear/props"), Some("clear_props"));
        // new actions are opt-in: not part of the default allowlist
        let default = "next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay";
        for a in ["toggle_logo", "clear_media", "clear_all", "clear_alert", "clear_props"] {
            assert!(!is_action_allowed(default, a));
        }
    }

    #[test]
    fn macro_paths_carry_the_macro_id_and_are_opt_in() {
        assert_eq!(osc_macro_action("/macro/abc-123").as_deref(), Some("run_macro:abc-123"));
        for bad in ["/macro/", "/macro", "/macro/a/b", "/macros/abc", "macro/abc", "/MACRO/abc", "/macro/ "] {
            assert_eq!(osc_macro_action(bad), None, "{bad:?}");
        }
        let default = "next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay";
        assert!(!is_action_allowed(default, "run_macro:abc"));
        assert!(is_action_allowed("next_slide,run_macro:abc", "run_macro:abc"));
        assert!(!is_action_allowed("next_slide,run_macro:abc", "run_macro:other"));
        assert!(is_action_allowed("run_macro:*", "run_macro:anything"));
        // the wildcard covers macros only, and a bad id is never allowed
        assert!(!is_action_allowed("run_macro:*", "clear_all"));
        assert!(!is_action_allowed("run_macro:*", "run_macro:"));
    }

    #[test]
    fn unknown_or_malformed_paths_map_to_nothing() {
        for p in ["", "/", "/slide", "/slide/next/", "/SLIDE/NEXT", "slide/next", "/app/quit"] {
            assert_eq!(osc_path_to_action(p), None, "{p:?} must not map");
        }
    }

    #[test]
    fn allowlist_matches_exact_names_and_trims_whitespace() {
        let list = "next_slide, prev_slide ,toggle_blackout";
        assert!(is_action_allowed(list, "next_slide"));
        assert!(is_action_allowed(list, "prev_slide"));
        assert!(is_action_allowed(list, "toggle_blackout"));
        assert!(!is_action_allowed(list, "toggle_live"));
        // substring of an allowed name must not match
        assert!(!is_action_allowed(list, "next"));
        assert!(!is_action_allowed("", "next_slide"));
    }

    #[test]
    fn every_mapped_action_is_in_the_default_allowlist_or_deliberately_excluded() {
        let default = "next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay";
        for p in ["/slide/next", "/slide/prev", "/item/next", "/item/prev", "/blackout", "/live", "/timer/start", "/timer/stop", "/timer/reset", "/overlay/clear"] {
            let action = osc_path_to_action(p).unwrap();
            assert!(is_action_allowed(default, action), "{action} missing from default allowlist");
        }
    }

    #[test]
    fn test_osc_shared_secret_path_prefix_and_argument_auth() {
        let secret = "sanctuary2026";
        let prefix_slash = format!("/{}", secret);
        let prefix_auth = format!("/auth:{}", secret);

        // Path prefix format 1: /<secret>/slide/next
        let path1 = "/sanctuary2026/slide/next";
        assert!(path1.starts_with(&prefix_slash) && path1[prefix_slash.len()..].starts_with('/'));
        let subpath1 = &path1[prefix_slash.len()..];
        assert_eq!(subpath1, "/slide/next");
        assert_eq!(osc_path_to_action(subpath1), Some("next_slide"));

        // Path prefix format 2: /auth:<secret>/slide/next
        let path2 = "/auth:sanctuary2026/slide/next";
        assert!(path2.starts_with(&prefix_auth) && path2[prefix_auth.len()..].starts_with('/'));
        let subpath2 = &path2[prefix_auth.len()..];
        assert_eq!(subpath2, "/slide/next");
        assert_eq!(osc_path_to_action(subpath2), Some("next_slide"));

        // Wrong secret prefix
        let bad_path = "/wrongsecret/slide/next";
        assert!(!(bad_path.starts_with(&prefix_slash) && bad_path[prefix_slash.len()..].starts_with('/')));
    }
}
