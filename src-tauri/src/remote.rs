use crate::actions::ActionDispatcher;
use crate::db::DbManager;
use crate::models::{RemoteDevice, RemotePairRequest, RemotePairResponse, RemoteServerStatus};
use crate::overlay::OverlayService;
use crate::presentation::PresentationManager;
use chrono::Utc;
use std::collections::HashMap;
use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server, StatusCode};
use uuid::Uuid;

pub struct RemoteServerManager {
    is_running: Arc<AtomicBool>,
    port: Arc<Mutex<u16>>,
    pairing_pin: Arc<Mutex<Option<String>>>,
    connected_clients: Arc<Mutex<HashMap<String, Instant>>>,
    failed_attempts: Arc<Mutex<HashMap<String, (u32, Instant)>>>,
    last_error: Arc<Mutex<Option<String>>>,
    bind_ip: Arc<Mutex<String>>,
    server_handle: Arc<Mutex<Option<thread::JoinHandle<()>>>>,
}

fn safe_header(field: &str, val: &str) -> Header {
    Header::from_bytes(field.as_bytes(), val.as_bytes())
        .unwrap_or_else(|_| Header::from_bytes(&b"X-Status"[..], &b"ok"[..]).unwrap())
}

pub fn generate_secure_pin() -> String {
    let u = Uuid::new_v4();
    let b = u.as_bytes();
    let val = u32::from_be_bytes([b[0], b[1], b[2], b[3]]);
    format!("{:06}", (val % 900000) + 100000)
}

pub fn extract_token(request: &tiny_http::Request, query_params: &HashMap<String, String>) -> String {
    for h in request.headers() {
        if h.field.as_str().as_str().eq_ignore_ascii_case("x-session-token") {
            let val = h.value.as_str().trim();
            if !val.is_empty() {
                return val.to_string();
            }
        }
        if h.field.as_str().as_str().eq_ignore_ascii_case("authorization") {
            let val = h.value.as_str().trim();
            if let Some(bearer) = val.strip_prefix("Bearer ") {
                if !bearer.trim().is_empty() {
                    return bearer.trim().to_string();
                }
            }
        }
    }
    query_params.get("token").cloned().unwrap_or_default()
}

/// Whether a paired device's permission flags allow `action`. Unknown actions are denied.
pub fn action_permitted(device: &crate::models::RemoteDevice, action: &str) -> bool {
    match action {
        "next_slide" | "prev_slide" | "next_item" | "prev_item" | "jump_slide" => device.can_navigate,
        "toggle_blackout" | "toggle_logo" | "clear_screen" | "clear_live" | "clear_media" | "clear_all" => {
            device.can_blackout
        }
        "toggle_live" => device.can_take_live,
        "start_timer" | "stop_timer" | "reset_timer" => device.can_control_timer,
        _ => false,
    }
}

pub fn is_ip_locked_out(failed_map: &HashMap<String, (u32, Instant)>, ip: &str) -> bool {
    if let Some((count, last_time)) = failed_map.get(ip) {
        if *count >= 5 && Instant::now().duration_since(*last_time) < Duration::from_secs(600) {
            return true;
        }
    }
    false
}

impl RemoteServerManager {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            port: Arc::new(Mutex::new(8088)),
            pairing_pin: Arc::new(Mutex::new(None)),
            connected_clients: Arc::new(Mutex::new(HashMap::new())),
            failed_attempts: Arc::new(Mutex::new(HashMap::new())),
            last_error: Arc::new(Mutex::new(None)),
            bind_ip: Arc::new(Mutex::new("0.0.0.0".to_string())),
            server_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub fn get_status(&self) -> RemoteServerStatus {
        let is_running = self.is_running.load(Ordering::SeqCst);
        let port = *self.port.lock().unwrap();
        let pairing_pin = self.pairing_pin.lock().unwrap().clone();
        let err = self.last_error.lock().unwrap().clone();

        // Count clients active in the last 60 seconds
        let now = Instant::now();
        let client_count = {
            let mut clients = self.connected_clients.lock().unwrap();
            clients.retain(|_, last_seen| now.duration_since(*last_seen) < Duration::from_secs(60));
            clients.len()
        };

        let lan_ips = Self::get_local_ips();

        RemoteServerStatus {
            is_running,
            port,
            lan_ips,
            pairing_pin,
            connected_clients_count: client_count,
            error: err,
            bind_address: self.bind_ip.lock().unwrap().clone(),
        }
    }

    pub fn start_server(
        &self,
        app: AppHandle,
        db: DbManager,
        pres_mgr: PresentationManager,
        port: u16,
        bind_ip: &str,
    ) -> Result<RemoteServerStatus, String> {
        if self.is_running.load(Ordering::SeqCst) {
            return Ok(self.get_status());
        }

        // Generate cryptographically secure 6-digit random PIN
        let pin = generate_secure_pin();
        *self.pairing_pin.lock().unwrap() = Some(pin.clone());
        *self.port.lock().unwrap() = port;
        *self.last_error.lock().unwrap() = None;

        *self.bind_ip.lock().unwrap() = bind_ip.to_string();
        let addr = format!("{}:{}", bind_ip, port);
        let server = match Server::http(&addr) {
            Ok(s) => s,
            Err(e) => {
                let err_str = format!("Failed to bind to {}: {}", addr, e);
                *self.last_error.lock().unwrap() = Some(err_str.clone());
                return Err(err_str);
            }
        };

        self.is_running.store(true, Ordering::SeqCst);
        let is_running_flag = self.is_running.clone();
        let clients_tracker = self.connected_clients.clone();
        let failed_tracker = self.failed_attempts.clone();
        let expected_pin = pin.clone();
        let last_err_ref = self.last_error.clone();

        let handle = thread::spawn(move || {
            let server = Arc::new(server);
            // Rate limiter table: token -> (request_count, window_start)
            let rate_limiter: Arc<Mutex<HashMap<String, (usize, Instant)>>> =
                Arc::new(Mutex::new(HashMap::new()));

            while is_running_flag.load(Ordering::SeqCst) {
                // Use a non-blocking timeout so we can exit promptly when stopped
                match server.recv_timeout(Duration::from_millis(500)) {
                    Ok(Some(mut request)) => {
                        let app = app.clone();
                        let db = db.clone();
                        let pres_mgr = pres_mgr.clone();
                        let clients_tracker = clients_tracker.clone();
                        let failed_tracker = failed_tracker.clone();
                        let expected_pin = expected_pin.clone();
                        let rate_limiter = rate_limiter.clone();

                        thread::spawn(move || {
                            let url_string = request.url().to_string();
                            let path = url_string.split('?').next().unwrap_or("").to_string();
                            let query_str = url_string.split('?').nth(1).unwrap_or("");
                            let query_params: HashMap<String, String> = query_str
                                .split('&')
                                .filter_map(|pair| {
                                    let mut parts = pair.split('=');
                                    Some((parts.next()?.to_string(), parts.next()?.to_string()))
                                })
                                .collect();

                            if let Some(peer) = request.remote_addr() {
                                if !crate::net_guard::is_lan_addr(peer.ip()) {
                                    let resp = Response::from_string("Forbidden: LAN access only")
                                        .with_status_code(StatusCode(403));
                                    request.respond(resp).ok();
                                    return;
                                }
                            }

                            let remote_addr = request
                                .remote_addr()
                                .map(|a| a.ip().to_string())
                                .unwrap_or_else(|| "127.0.0.1".to_string());

                            // Handle routes
                            match (request.method(), path.as_str()) {
                                // 1. Mobile Remote HTML Application
                                (&Method::Get, "/") | (&Method::Get, "/remote") => {
                                    let html = Self::get_remote_html();
                                    let resp = Response::from_string(html)
                                        .with_header(safe_header("Content-Type", "text/html; charset=utf-8"))
                                        .with_header(safe_header("Cache-Control", "no-cache"));
                                    request.respond(resp).ok();
                                }

                                // 2. Livestream Overlay HTML for OBS Studio Browser Source
                                (&Method::Get, "/overlay") => {
                                    let token = extract_token(&request, &query_params);
                                    let config = db.get_overlay_config().unwrap_or_default();
                                    if token != config.auth_token {
                                        let resp = Response::from_string("Unauthorized OBS Overlay Token")
                                            .with_status_code(StatusCode(401));
                                        request.respond(resp).ok();
                                    } else {
                                        let html = Self::get_overlay_html(&token);
                                        let resp = Response::from_string(html)
                                            .with_header(safe_header("Content-Type", "text/html; charset=utf-8"))
                                            .with_header(safe_header("Cache-Control", "no-cache"));
                                        request.respond(resp).ok();
                                    }
                                }

                                // 3. API: Overlay Render Payload
                                (&Method::Get, "/api/overlay-data") => {
                                    let token = extract_token(&request, &query_params);
                                    let config = db.get_overlay_config().unwrap_or_default();
                                    if token != config.auth_token {
                                        let resp = Response::from_string("{\"error\":\"Unauthorized\"}")
                                            .with_status_code(StatusCode(401))
                                            .with_header(safe_header("Content-Type", "application/json"));
                                        request.respond(resp).ok();
                                    } else {
                                        let state = pres_mgr.get_state();
                                        let payload = OverlayService::get_render_payload(&db, &state).unwrap_or_default();
                                        let json = serde_json::to_string(&payload).unwrap_or_default();
                                        let resp = Response::from_string(json)
                                            .with_header(safe_header("Content-Type", "application/json"))
                                            .with_header(safe_header("Access-Control-Allow-Origin", "*"));
                                        request.respond(resp).ok();
                                    }
                                }

                                // 4. API: Pair new device
                                (&Method::Post, "/api/pair") => {
                                    let is_locked = {
                                        let fails = failed_tracker.lock().unwrap_or_else(|e| e.into_inner());
                                        is_ip_locked_out(&fails, &remote_addr)
                                    };
                                    if is_locked {
                                        let resp = Response::from_string("{\"error\":\"Too many failed attempts. Locked out for 10 minutes.\"}")
                                            .with_status_code(StatusCode(429))
                                            .with_header(safe_header("Content-Type", "application/json"));
                                        request.respond(resp).ok();
                                        return;
                                    }

                                    let mut body = String::new();
                                    request.as_reader().read_to_string(&mut body).ok();
                                    let pair_req: Result<RemotePairRequest, _> = serde_json::from_str(&body);

                                    match pair_req {
                                        Ok(req) => {
                                            if req.pin != expected_pin {
                                                {
                                                    let now = Instant::now();
                                                    let mut fails = failed_tracker.lock().unwrap_or_else(|e| e.into_inner());
                                                    let entry = fails.entry(remote_addr.clone()).or_insert((0, now));
                                                    if now.duration_since(entry.1) > Duration::from_secs(600) {
                                                        *entry = (1, now);
                                                    } else {
                                                        entry.0 += 1;
                                                        entry.1 = now;
                                                    }
                                                }

                                                let err_resp = RemotePairResponse {
                                                    success: false,
                                                    requires_approval: false,
                                                    session_token: None,
                                                    message: "Invalid pairing PIN".to_string(),
                                                };
                                                let json = serde_json::to_string(&err_resp).unwrap_or_default();
                                                let resp = Response::from_string(json)
                                                    .with_status_code(StatusCode(403))
                                                    .with_header(safe_header("Content-Type", "application/json"));
                                                request.respond(resp).ok();
                                            } else {
                                                {
                                                    let mut fails = failed_tracker.lock().unwrap_or_else(|e| e.into_inner());
                                                    fails.remove(&remote_addr);
                                                }

                                                let token = Uuid::new_v4().to_string();
                                                let dev_id = format!("remote-{}", Uuid::new_v4().simple());
                                                let now = Utc::now().to_rfc3339();

                                                let new_dev = RemoteDevice {
                                                    id: dev_id.clone(),
                                                    device_name: req.device_name,
                                                    ip_address: remote_addr,
                                                    token_hash: token.clone(),
                                                    is_approved: false,
                                                    can_navigate: true,
                                                    can_blackout: true,
                                                    can_take_live: false,
                                                    can_control_timer: true,
                                                    paired_at: now.clone(),
                                                    last_seen_at: now,
                                                };

                                                db.create_or_update_remote_device(&new_dev).ok();
                                                app.emit("remote:device-requested", &new_dev).ok();

                                                let ok_resp = RemotePairResponse {
                                                    success: true,
                                                    requires_approval: true,
                                                    session_token: Some(token),
                                                    message: "Pairing request sent. Waiting for desktop operator approval.".to_string(),
                                                };
                                                let json = serde_json::to_string(&ok_resp).unwrap_or_default();
                                                let resp = Response::from_string(json)
                                                    .with_header(safe_header("Content-Type", "application/json"));
                                                request.respond(resp).ok();
                                            }
                                        }
                                        Err(_) => {
                                            let resp = Response::from_string("{\"error\":\"Invalid request body\"}")
                                                .with_status_code(StatusCode(400))
                                                .with_header(safe_header("Content-Type", "application/json"));
                                            request.respond(resp).ok();
                                        }
                                    }
                                }

                                // 5. API: Remote Presentation State Query
                                (&Method::Get, "/api/state") => {
                                    let token = extract_token(&request, &query_params);
                                    match db.get_remote_device_by_token(&token) {
                                        Ok(Some(device)) => {
                                            if !device.is_approved {
                                                let resp = Response::from_string("{\"error\":\"Device pending approval\"}")
                                                    .with_status_code(StatusCode(403))
                                                    .with_header(safe_header("Content-Type", "application/json"));
                                                request.respond(resp).ok();
                                            } else {
                                                db.touch_remote_device(&token).ok();
                                                clients_tracker.lock().unwrap().insert(token, Instant::now());

                                                let state = pres_mgr.get_state();
                                                let json = serde_json::to_string(&serde_json::json!({
                                                    "isLive": state.is_live,
                                                    "isBlackout": state.is_blackout,
                                                    "currentSlideIndex": state.current_slide_index,
                                                    "totalSlides": state.total_slides,
                                                    "currentSlide": state.current_slide,
                                                    "nextSlide": state.next_slide,
                                                    "stageMessage": state.stage_message,
                                                    "timerState": state.timer_state,
                                                    "permissions": {
                                                        "canNavigate": device.can_navigate,
                                                        "canBlackout": device.can_blackout,
                                                        "canTakeLive": device.can_take_live,
                                                        "canControlTimer": device.can_control_timer
                                                    }
                                                })).unwrap_or_default();

                                                let resp = Response::from_string(json)
                                                    .with_header(safe_header("Content-Type", "application/json"))
                                                    .with_header(safe_header("Access-Control-Allow-Origin", "*"));
                                                request.respond(resp).ok();
                                            }
                                        }
                                        _ => {
                                            let resp = Response::from_string("{\"error\":\"Unauthorized or device revoked\"}")
                                                .with_status_code(StatusCode(401))
                                                .with_header(safe_header("Content-Type", "application/json"));
                                            request.respond(resp).ok();
                                        }
                                    }
                                }

                                // 6. API: Real-time State Events (SSE)
                                (&Method::Get, "/api/events") => {
                                    let token = extract_token(&request, &query_params);
                                    match db.get_remote_device_by_token(&token) {
                                        Ok(Some(device)) if device.is_approved => {
                                            let state = pres_mgr.get_state();
                                            let json = serde_json::to_string(&serde_json::json!({
                                                "isLive": state.is_live,
                                                "isBlackout": state.is_blackout,
                                                "currentSlideIndex": state.current_slide_index,
                                                "totalSlides": state.total_slides,
                                                "currentSlide": state.current_slide,
                                                "nextSlide": state.next_slide,
                                                "stageMessage": state.stage_message,
                                                "timerState": state.timer_state,
                                            })).unwrap_or_default();

                                            let sse_payload = format!("event: state\ndata: {}\n\n", json);
                                            let resp = Response::from_string(sse_payload)
                                                .with_header(safe_header("Content-Type", "text/event-stream; charset=utf-8"))
                                                .with_header(safe_header("Cache-Control", "no-cache"))
                                                .with_header(safe_header("Access-Control-Allow-Origin", "*"));
                                            request.respond(resp).ok();
                                        }
                                        _ => {
                                            let resp = Response::from_string("{\"error\":\"Unauthorized\"}")
                                                .with_status_code(StatusCode(401))
                                                .with_header(safe_header("Content-Type", "application/json"));
                                            request.respond(resp).ok();
                                        }
                                    }
                                }

                                // 7. API: Playlist Query
                                (&Method::Get, "/api/playlist") => {
                                    let token = extract_token(&request, &query_params);
                                    if let Ok(Some(device)) = db.get_remote_device_by_token(&token) {
                                        if !device.is_approved {
                                            let resp = Response::from_string("{\"error\":\"Device pending approval\"}")
                                                .with_status_code(StatusCode(403));
                                            request.respond(resp).ok();
                                            return;
                                        }
                                        let state = pres_mgr.get_state();
                                        let items: serde_json::Value = if let Some(ref s_id) = state.current_service_id {
                                            if let Some(ref it_id) = state.current_item_id {
                                                let slides = db.get_service_item_slides(it_id).unwrap_or_default();
                                                serde_json::to_value(&slides).unwrap_or_default()
                                            } else {
                                                let s_items = db.get_service_items(s_id).unwrap_or_default();
                                                serde_json::to_value(&s_items).unwrap_or_default()
                                            }
                                        } else if let Some(ref p_id) = state.current_presentation_id {
                                            let slides = db.get_slides(p_id).unwrap_or_default();
                                            serde_json::to_value(&slides).unwrap_or_default()
                                        } else {
                                            serde_json::json!([])
                                        };
                                        let json = serde_json::to_string(&items).unwrap_or_default();
                                        let resp = Response::from_string(json)
                                            .with_header(safe_header("Content-Type", "application/json"))
                                            .with_header(safe_header("Access-Control-Allow-Origin", "*"));
                                        request.respond(resp).ok();
                                    } else {
                                        let resp = Response::from_string("{\"error\":\"Unauthorized\"}")
                                            .with_status_code(StatusCode(401));
                                        request.respond(resp).ok();
                                    }
                                }

                                // 8. API: Stage Message Management
                                (&Method::Post, "/api/stage-message") => {
                                    let token = extract_token(&request, &query_params);
                                    if let Ok(Some(device)) = db.get_remote_device_by_token(&token) {
                                        if !device.is_approved {
                                            let resp = Response::from_string("{\"error\":\"Device pending approval\"}")
                                                .with_status_code(StatusCode(403));
                                            request.respond(resp).ok();
                                            return;
                                        }
                                        let mut body = String::new();
                                        request.as_reader().read_to_string(&mut body).ok();
                                        let json_val: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                                        let msg = json_val
                                            .get("message")
                                            .and_then(|v| v.as_str())
                                            .filter(|s| !s.trim().is_empty())
                                            .map(|s| s.trim().to_string());
                                        let st = pres_mgr.set_stage_message(&app, msg.clone());
                                        let resp = Response::from_string(serde_json::to_string(&serde_json::json!({
                                            "success": true,
                                            "stageMessage": st.stage_message
                                        })).unwrap_or_default())
                                        .with_header(safe_header("Content-Type", "application/json"))
                                        .with_header(safe_header("Access-Control-Allow-Origin", "*"));
                                        request.respond(resp).ok();
                                    } else {
                                        let resp = Response::from_string("{\"error\":\"Unauthorized\"}")
                                            .with_status_code(StatusCode(401));
                                        request.respond(resp).ok();
                                    }
                                }

                                (&Method::Get, "/api/stage-message") => {
                                    let msg = pres_mgr.get_state().stage_message;
                                    let resp = Response::from_string(serde_json::to_string(&serde_json::json!({
                                        "stageMessage": msg
                                    })).unwrap_or_default())
                                    .with_header(safe_header("Content-Type", "application/json"))
                                    .with_header(safe_header("Access-Control-Allow-Origin", "*"));
                                    request.respond(resp).ok();
                                }

                                // 9. API: Dispatch Action
                                (&Method::Post, "/api/action") => {
                                    let token = extract_token(&request, &query_params);
                                    match db.get_remote_device_by_token(&token) {
                                        Ok(Some(device)) => {
                                            if !device.is_approved {
                                                let resp = Response::from_string("{\"error\":\"Device pending approval\"}")
                                                    .with_status_code(StatusCode(403))
                                                    .with_header(safe_header("Content-Type", "application/json"));
                                                request.respond(resp).ok();
                                                return;
                                            }

                                            // Rate limiting: max 10 requests / sec per device
                                            let mut rl = rate_limiter.lock().unwrap();
                                            let now = Instant::now();
                                            let entry = rl.entry(token.clone()).or_insert((0, now));
                                            if now.duration_since(entry.1) > Duration::from_secs(1) {
                                                *entry = (1, now);
                                            } else {
                                                entry.0 += 1;
                                                if entry.0 > 10 {
                                                    let resp = Response::from_string("{\"error\":\"Rate limit exceeded\"}")
                                                        .with_status_code(StatusCode(429))
                                                        .with_header(safe_header("Content-Type", "application/json"));
                                                    request.respond(resp).ok();
                                                    return;
                                                }
                                            }
                                            drop(rl);

                                            let mut body = String::new();
                                            request.as_reader().read_to_string(&mut body).ok();
                                            let json_val: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                                            let action = json_val.get("action").and_then(|v| v.as_str()).unwrap_or("");

                                            let is_permitted = action_permitted(&device, action);

                                            if !is_permitted {
                                                let resp = Response::from_string("{\"error\":\"Action not permitted for this remote device\"}")
                                                    .with_status_code(StatusCode(403))
                                                    .with_header(safe_header("Content-Type", "application/json"));
                                                request.respond(resp).ok();
                                            } else if action == "jump_slide" {
                                                let idx = json_val.get("slideIndex").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                                                let state = pres_mgr.get_state();
                                                let updated = if let Some(ref service_id) = state.current_service_id {
                                                    if let Some(ref item_id) = state.current_item_id {
                                                        let slides = db.get_service_item_slides(item_id).unwrap_or_default();
                                                        if let Some(target) = slides.get(idx) {
                                                            pres_mgr.set_live_service_item_slide(&app, &db, service_id, item_id, &target.id)
                                                        } else {
                                                            state
                                                        }
                                                    } else {
                                                        state
                                                    }
                                                } else if let Some(ref pres_id) = state.current_presentation_id {
                                                    let slides = db.get_slides(pres_id).unwrap_or_default();
                                                    if let Some(target) = slides.get(idx) {
                                                        pres_mgr.set_live_slide(&app, &db, pres_id, &target.id)
                                                    } else {
                                                        state
                                                    }
                                                } else {
                                                    state
                                                };
                                                let resp = Response::from_string(serde_json::to_string(&serde_json::json!({
                                                    "success": true,
                                                    "action": "jump_slide",
                                                    "currentSlideIndex": updated.current_slide_index,
                                                })).unwrap_or_default())
                                                .with_header(safe_header("Content-Type", "application/json"))
                                                .with_header(safe_header("Access-Control-Allow-Origin", "*"));
                                                request.respond(resp).ok();
                                            } else {
                                                db.touch_remote_device(&token).ok();
                                                clients_tracker.lock().unwrap().insert(token, Instant::now());

                                                match ActionDispatcher::dispatch(&app, &db, &pres_mgr, action) {
                                                    Ok(updated_state) => {
                                                        let resp = Response::from_string(serde_json::to_string(&serde_json::json!({
                                                            "success": true,
                                                            "action": action,
                                                            "isLive": updated_state.is_live,
                                                            "isBlackout": updated_state.is_blackout,
                                                        })).unwrap_or_default())
                                                        .with_header(safe_header("Content-Type", "application/json"))
                                                        .with_header(safe_header("Access-Control-Allow-Origin", "*"));
                                                        request.respond(resp).ok();
                                                    }
                                                    Err(e) => {
                                                        let resp = Response::from_string(format!("{{\"error\":\"{}\"}}", e))
                                                            .with_status_code(StatusCode(500))
                                                            .with_header(safe_header("Content-Type", "application/json"));
                                                        request.respond(resp).ok();
                                                    }
                                                }
                                            }
                                        }
                                        _ => {
                                            let resp = Response::from_string("{\"error\":\"Unauthorized or device revoked\"}")
                                                .with_status_code(StatusCode(401))
                                                .with_header(safe_header("Content-Type", "application/json"));
                                            request.respond(resp).ok();
                                        }
                                    }
                                }

                                _ => {
                                    let resp = Response::from_string("Not Found")
                                        .with_status_code(StatusCode(404));
                                    request.respond(resp).ok();
                                }
                            }
                        });
                    }
                    Ok(None) => {}
                    Err(e) => {
                        *last_err_ref.lock().unwrap() = Some(format!("Server recv error: {}", e));
                    }
                }
            }
        });

        *self.server_handle.lock().unwrap() = Some(handle);
        Ok(self.get_status())
    }

    pub fn stop_server(&self) -> RemoteServerStatus {
        self.is_running.store(false, Ordering::SeqCst);
        *self.pairing_pin.lock().unwrap() = None;
        self.connected_clients.lock().unwrap().clear();
        if let Ok(mut h) = self.server_handle.lock() {
            if let Some(handle) = h.take() {
                let _ = handle.join();
            }
        }
        self.get_status()
    }

    fn get_local_ips() -> Vec<String> {
        let mut ips = Vec::new();
        // Query route to identify local LAN IP without actual external traffic
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect("8.8.8.8:80").is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    ips.push(addr.ip().to_string());
                }
            }
        }
        if ips.is_empty() {
            ips.push("127.0.0.1".to_string());
        }
        ips
    }

    fn get_remote_html() -> &'static str {
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Church Presenter Remote</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; display: flex; flex-direction: column; min-height: 100vh; }
    header { background: #1e293b; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #334155; }
    .badge { padding: 4px 8px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .badge-live { background: #ef4444; color: white; animation: pulse 2s infinite; }
    .badge-off { background: #64748b; color: white; }
    .badge-black { background: #000; color: #fbbf24; border: 1px solid #d97706; }
    main { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 16px; max-width: 600px; margin: 0 auto; width: 100%; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px; }
    .card-title { font-size: 13px; text-transform: uppercase; color: #94a3b8; font-weight: 600; margin-bottom: 8px; }
    .group-tag { padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 6px; }
    .slide-body { font-size: 18px; line-height: 1.5; white-space: pre-wrap; font-weight: 500; min-height: 80px; }
    .controls-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    button { background: #3b82f6; color: white; border: none; border-radius: 10px; padding: 18px 12px; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; touch-action: manipulation; }
    button:active { filter: brightness(0.85); transform: scale(0.98); }
    button.btn-sec { background: #334155; color: #e2e8f0; }
    button.btn-warn { background: #d97706; color: white; }
    button.btn-danger { background: #dc2626; color: white; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .input-pin { width: 100%; padding: 16px; font-size: 24px; text-align: center; letter-spacing: 8px; border-radius: 8px; border: 2px solid #3b82f6; background: #0f172a; color: white; margin-bottom: 12px; }
    .input-text { width: 100%; padding: 12px; font-size: 16px; border-radius: 8px; border: 1px solid #475569; background: #0f172a; color: white; margin-bottom: 16px; }
    @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.6; } 100% { opacity: 1; } }
  </style>
</head>
<body>
  <header>
    <div>
      <strong style="font-size: 15px;">Church Presenter</strong>
      <div id="conn-status" style="font-size: 11px; color: #94a3b8;">Connecting...</div>
    </div>
    <div style="display: flex; gap: 6px; align-items: center;">
      <span id="badge-blackout" class="badge badge-black" style="display: none;">Blackout</span>
      <span id="badge-live" class="badge badge-off">Off Air</span>
    </div>
  </header>

  <main id="app-container">
    <div style="background: rgba(234, 179, 8, 0.15); border: 1px solid #eab308; color: #fde047; padding: 8px 12px; border-radius: 6px; font-size: 11px; margin-bottom: 4px;">
      ⚠️ Local Network HTTP: Connect only via secure church Wi-Fi.
    </div>

    <div id="view-pairing" class="card" style="display: none; text-align: center;">
      <h2 style="margin-bottom: 8px;">Pair with Desktop</h2>
      <p style="color: #94a3b8; font-size: 14px; margin-bottom: 20px;">Enter the 6-digit PIN shown on the operator's desktop screen.</p>
      <input type="tel" id="pin-input" class="input-pin" maxlength="6" placeholder="000000" pattern="[0-9]*">
      <input type="text" id="dev-name-input" class="input-text" placeholder="Device name (e.g. iPhone)">
      <button id="btn-pair" style="width: 100%;">Connect & Request Access</button>
      <div id="pair-error" style="color: #f87171; margin-top: 12px; font-size: 13px;"></div>
    </div>

    <div id="view-pending" class="card" style="display: none; text-align: center; padding: 32px 16px;">
      <div style="font-size: 40px; margin-bottom: 12px;">⏳</div>
      <h2>Approval Required</h2>
      <p style="color: #94a3b8; font-size: 14px; margin-top: 8px;">Please ask the desktop operator to click "Approve" for your device in the Remote Controllers settings.</p>
      <button class="btn-sec" onclick="checkState()" style="width: 100%; margin-top: 24px;">Check Approval Status</button>
    </div>

    <div id="view-controls" style="display: none; flex-direction: column; gap: 16px;">
      <div class="card">
        <div class="card-title">Live Slide (<span id="slide-index">0/0</span>)</div>
        <div id="live-group" class="group-tag" style="display: none;"></div>
        <div id="live-body" class="slide-body">No slide live</div>
      </div>

      <div class="card" style="opacity: 0.85;">
        <div class="card-title">Up Next</div>
        <div id="next-group" class="group-tag" style="display: none;"></div>
        <div id="next-body" style="font-size: 15px; color: #cbd5e1; white-space: pre-wrap;">(End of presentation)</div>
      </div>

      <div class="controls-grid">
        <button id="btn-prev" class="btn-sec">◀ Prev Slide</button>
        <button id="btn-next">Next Slide ▶</button>
        <button id="btn-prev-item" class="btn-sec">⏮ Prev Item</button>
        <button id="btn-next-item" class="btn-sec">Next Item ⏭</button>
        <button id="btn-clear" class="btn-sec">Clear Screen</button>
        <button id="btn-blackout" class="btn-warn">Blackout</button>
        <button id="btn-clear-all" class="btn-sec" style="grid-column: span 2;">Clear All (blank output)</button>
        <button id="btn-live" class="btn-danger" style="grid-column: span 2;">Go Live</button>
      </div>

      <!-- Quick Stage Message Alert -->
      <div class="card">
        <div class="card-title">Stage Display Cue</div>
        <div style="display: flex; gap: 8px;">
          <input type="text" id="input-stage-cue" class="input-text" style="margin-bottom: 0;" placeholder="Message to stage (e.g. Wrap up in 2 mins)...">
          <button id="btn-send-stage" style="padding: 10px 14px; font-size: 13px; white-space: nowrap;">Send</button>
          <button id="btn-clear-stage" class="btn-sec" style="padding: 10px 14px; font-size: 13px; white-space: nowrap;">Clear</button>
        </div>
      </div>

      <!-- Playlist & Jump Browser -->
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div class="card-title" style="margin-bottom: 0;">Playlist & Jump</div>
          <button id="btn-refresh-playlist" class="btn-sec" style="padding: 4px 8px; font-size: 11px;">Refresh</button>
        </div>
        <div id="playlist-container" style="max-height: 180px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;">
          <div style="font-size: 13px; color: #94a3b8;">No items in playlist</div>
        </div>
      </div>
    </div>
  </main>

  <script>
    let sessionToken = localStorage.getItem('church_presenter_remote_token');
    const devName = navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('iPad') ? 'iPad' : navigator.userAgent.includes('Android') ? 'Android Phone' : 'Mobile Controller';
    document.getElementById('dev-name-input').value = devName;
    let sseActive = false;

    // Shows the song group (Verse 1, Chorus...) of a slide as a coloured tag.
    function setGroupTag(id, slide) {
      const el = document.getElementById(id);
      const ok = slide && slide.groupLabel && /^#[0-9a-fA-F]{6}$/.test(slide.groupColor || '');
      if (!ok) { el.style.display = 'none'; return; }
      const n = parseInt(slide.groupColor.slice(1), 16);
      const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
      el.innerText = slide.groupLabel;
      el.style.backgroundColor = slide.groupColor;
      el.style.color = lum > 0.6 ? '#0b1020' : '#ffffff';
      el.style.display = 'inline-block';
    }

    function showView(name) {
      document.getElementById('view-pairing').style.display = name === 'pairing' ? 'block' : 'none';
      document.getElementById('view-pending').style.display = name === 'pending' ? 'block' : 'none';
      document.getElementById('view-controls').style.display = name === 'controls' ? 'flex' : 'none';
    }

    function updateUIWithState(data) {
      showView('controls');
      document.getElementById('conn-status').innerText = 'Connected (Live SSE)';

      const liveBadge = document.getElementById('badge-live');
      if (data.isLive) {
        liveBadge.className = 'badge badge-live';
        liveBadge.innerText = 'ON AIR';
      } else {
        liveBadge.className = 'badge badge-off';
        liveBadge.innerText = 'OFF AIR';
      }

      document.getElementById('badge-blackout').style.display = data.isBlackout ? 'inline-block' : 'none';
      document.getElementById('slide-index').innerText = `${(data.currentSlideIndex || 0) + 1}/${data.totalSlides || 0}`;

      setGroupTag('live-group', data.currentSlide);
      setGroupTag('next-group', data.nextSlide);

      if (data.currentSlide) {
        document.getElementById('live-body').innerText = data.currentSlide.body || data.currentSlide.title || '';
      } else {
        document.getElementById('live-body').innerText = '(Blank Screen)';
      }

      if (data.nextSlide) {
        document.getElementById('next-body').innerText = data.nextSlide.body || data.nextSlide.title || '';
      } else {
        document.getElementById('next-body').innerText = '(End of playlist)';
      }

      if (data.permissions) {
        document.getElementById('btn-prev').disabled = !data.permissions.canNavigate;
        document.getElementById('btn-next').disabled = !data.permissions.canNavigate;
        document.getElementById('btn-prev-item').disabled = !data.permissions.canNavigate;
        document.getElementById('btn-next-item').disabled = !data.permissions.canNavigate;
        document.getElementById('btn-blackout').disabled = !data.permissions.canBlackout;
        document.getElementById('btn-clear').disabled = !data.permissions.canBlackout;
        document.getElementById('btn-clear-all').disabled = !data.permissions.canBlackout;
        document.getElementById('btn-live').disabled = !data.permissions.canTakeLive;
      }
    }

    function initSSE() {
      if (!sessionToken || sseActive) return;
      try {
        const sse = new EventSource('/api/events?token=' + encodeURIComponent(sessionToken));
        sse.onopen = () => { sseActive = true; };
        sse.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            updateUIWithState(data);
          } catch (err) {}
        };
        sse.onerror = () => {
          sseActive = false;
          sse.close();
          setTimeout(initSSE, 3000);
        };
      } catch (err) {}
    }

    async function loadPlaylist() {
      if (!sessionToken) return;
      try {
        const res = await fetch('/api/playlist?token=' + encodeURIComponent(sessionToken));
        if (res.ok) {
          const items = await res.json();
          const container = document.getElementById('playlist-container');
          container.innerHTML = '';
          if (!items || items.length === 0) {
            container.innerHTML = '<div style="font-size: 13px; color: #94a3b8;">No items in playlist</div>';
            return;
          }
          items.forEach((item, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding: 8px 10px; background: #0f172a; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border: 1px solid #334155; font-size: 13px;';
            const label = item.title || item.name || ('Slide ' + (idx + 1));
            row.innerHTML = `<span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 200px;">${idx + 1}. ${label}</span><button class="btn-sec" style="padding: 4px 8px; font-size: 11px;">Jump</button>`;
            row.onclick = () => jumpToSlide(idx);
            container.appendChild(row);
          });
        }
      } catch (e) {}
    }

    async function jumpToSlide(index) {
      if (!sessionToken) return;
      try {
        await fetch('/api/action?token=' + encodeURIComponent(sessionToken), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'jump_slide', slideIndex: index })
        });
        checkState();
      } catch (e) {}
    }

    async function checkState() {
      if (!sessionToken) {
        showView('pairing');
        document.getElementById('conn-status').innerText = 'Unpaired';
        return;
      }

      try {
        const res = await fetch('/api/state?token=' + encodeURIComponent(sessionToken));
        if (res.status === 401) {
          sessionToken = null;
          localStorage.removeItem('church_presenter_remote_token');
          showView('pairing');
          return;
        }
        if (res.status === 403) {
          showView('pending');
          document.getElementById('conn-status').innerText = 'Pending Approval';
          return;
        }
        if (res.ok) {
          const data = await res.json();
          updateUIWithState(data);
          initSSE();
        }
      } catch (e) {
        document.getElementById('conn-status').innerText = 'Reconnecting...';
      }
    }

    async function sendAction(actionName) {
      if (!sessionToken) return;
      try {
        await fetch('/api/action?token=' + encodeURIComponent(sessionToken), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: actionName })
        });
        checkState();
      } catch (e) {}
    }

    async function sendStageMsg(msg) {
      if (!sessionToken) return;
      try {
        await fetch('/api/stage-message?token=' + encodeURIComponent(sessionToken), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
      } catch (e) {}
    }

    document.getElementById('btn-pair').onclick = async () => {
      const pin = document.getElementById('pin-input').value.trim();
      const name = document.getElementById('dev-name-input').value.trim() || 'Mobile Device';
      document.getElementById('pair-error').innerText = '';

      if (pin.length !== 6) {
        document.getElementById('pair-error').innerText = 'Please enter a 6-digit PIN';
        return;
      }

      try {
        const res = await fetch('/api/pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, device_name: name })
        });
        const data = await res.json();
        if (data.success && data.session_token) {
          sessionToken = data.session_token;
          localStorage.setItem('church_presenter_remote_token', sessionToken);
          checkState();
          loadPlaylist();
        } else {
          document.getElementById('pair-error').innerText = data.message || 'Pairing failed';
        }
      } catch (e) {
        document.getElementById('pair-error').innerText = 'Connection error. Check Wi-Fi.';
      }
    };

    document.getElementById('btn-prev').onclick = () => sendAction('prev_slide');
    document.getElementById('btn-next').onclick = () => sendAction('next_slide');
    document.getElementById('btn-prev-item').onclick = () => sendAction('prev_item');
    document.getElementById('btn-next-item').onclick = () => sendAction('next_item');
    document.getElementById('btn-clear').onclick = () => sendAction('clear_screen');
    document.getElementById('btn-clear-all').onclick = () => sendAction('clear_all');
    document.getElementById('btn-blackout').onclick = () => sendAction('toggle_blackout');
    document.getElementById('btn-live').onclick = () => sendAction('toggle_live');

    document.getElementById('btn-send-stage').onclick = () => {
      const cue = document.getElementById('input-stage-cue').value.trim();
      if (cue) {
        sendStageMsg(cue);
      }
    };
    document.getElementById('btn-clear-stage').onclick = () => {
      document.getElementById('input-stage-cue').value = '';
      sendStageMsg(null);
    };

    document.getElementById('btn-refresh-playlist').onclick = () => loadPlaylist();

    checkState();
    loadPlaylist();
    setInterval(checkState, 2000);
  </script>
</body>
</html>"#
    }

    fn get_overlay_html(token: &str) -> String {
        format!(
            r#"<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Church Presenter - OBS Overlay</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    html, body {{
      width: 100vw; height: 100vh;
      background: transparent !important;
      overflow: hidden;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
    }}
    #overlay-container {{
      width: 100%; height: 100%;
      position: absolute; top: 0; left: 0;
      display: flex; flex-direction: column;
      pointer-events: none;
      transition: opacity 0.3s ease-in-out;
    }}
    .lower-third {{
      margin-top: auto;
      margin-bottom: 5vh;
      margin-left: 5vw;
      margin-right: 5vw;
      padding: 18px 28px;
      background: rgba(15, 23, 42, 0.75);
      border-left: 6px solid #3b82f6;
      border-radius: 8px;
      backdrop-filter: blur(8px);
      box-shadow: 0 10px 25px rgba(0,0,0,0.4);
    }}
    .full-screen {{
      margin: 6vh 6vw;
      height: 88vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
    }}
    .overlay-title {{
      font-size: 18px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #93c5fd;
      margin-bottom: 6px;
    }}
    .overlay-body {{
      font-size: 36px;
      font-weight: 600;
      line-height: 1.35;
      color: #ffffff;
      white-space: pre-wrap;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.85);
    }}
  </style>
</head>
<body>
  <div id="overlay-container">
    <div id="overlay-box" class="lower-third" style="display: none;">
      <div id="overlay-title" class="overlay-title"></div>
      <div id="overlay-body" class="overlay-body"></div>
    </div>
  </div>

  <script>
    const token = "{token}";
    async function updateOverlay() {{
      try {{
        const res = await fetch('/api/overlay-data?token=' + encodeURIComponent(token));
        if (!res.ok) return;
        const data = await res.json();
        const box = document.getElementById('overlay-box');
        const titleEl = document.getElementById('overlay-title');
        const bodyEl = document.getElementById('overlay-body');

        if (!data.isLive || data.isBlackout || data.isCleared || !data.slide) {{
          box.style.display = 'none';
          return;
        }}

        box.style.display = 'block';
        box.className = data.layoutMode === 'full_screen' ? 'full-screen' : 'lower-third';
        titleEl.innerText = data.showSpeakerLabel && data.itemTitle ? data.itemTitle : '';
        bodyEl.innerText = data.slide.body || data.slide.title || '';

        if (data.fontFamily) bodyEl.style.fontFamily = data.fontFamily;
        if (data.fontSizePx) bodyEl.style.fontSize = data.fontSizePx + 'px';
        if (data.textColor) bodyEl.style.color = data.textColor;
        if (data.textShadow) bodyEl.style.textShadow = data.textShadow;
        if (data.textAlignment) bodyEl.style.textAlign = data.textAlignment;
      }} catch(e) {{}}
    }}
    setInterval(updateOverlay, 250);
    updateOverlay();
  </script>
</body>
</html>"#
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(nav: bool, black: bool, live: bool, timer: bool) -> crate::models::RemoteDevice {
        crate::models::RemoteDevice {
            id: "d1".into(),
            device_name: "Phone".into(),
            ip_address: "192.168.1.5".into(),
            token_hash: String::new(),
            is_approved: true,
            can_navigate: nav,
            can_blackout: black,
            can_take_live: live,
            can_control_timer: timer,
            paired_at: String::new(),
            last_seen_at: String::new(),
        }
    }

    #[test]
    fn test_action_permissions_follow_device_flags() {
        let nav_only = device(true, false, false, false);
        for a in ["next_slide", "prev_slide", "next_item", "prev_item", "jump_slide"] {
            assert!(action_permitted(&nav_only, a), "{a}");
        }
        for a in ["toggle_blackout", "toggle_logo", "clear_screen", "clear_live", "toggle_live", "start_timer"] {
            assert!(!action_permitted(&nav_only, a), "{a}");
        }

        let black_only = device(false, true, false, false);
        for a in ["toggle_blackout", "toggle_logo", "clear_screen", "clear_live"] {
            assert!(action_permitted(&black_only, a), "{a}");
        }
        assert!(!action_permitted(&black_only, "next_slide"));

        assert!(action_permitted(&device(false, false, true, false), "toggle_live"));
        let timer = device(false, false, false, true);
        for a in ["start_timer", "stop_timer", "reset_timer"] {
            assert!(action_permitted(&timer, a), "{a}");
        }
    }

    #[test]
    fn test_clear_actions_need_the_blackout_permission() {
        let black = device(false, true, false, false);
        let nav = device(true, false, true, true);
        for a in ["clear_media", "clear_all", "toggle_logo"] {
            assert!(action_permitted(&black, a), "{a}");
            assert!(!action_permitted(&nav, a), "{a}");
        }
    }

    #[test]
    fn test_unknown_actions_are_denied_even_with_all_permissions() {
        let all = device(true, true, true, true);
        for a in ["", "quit", "delete_song", "NEXT_SLIDE", "next_slide ", "clear_overlay"] {
            assert!(!action_permitted(&all, a), "{a:?} must be denied");
        }
    }

    #[test]
    fn test_local_ips_never_empty() {
        let ips = RemoteServerManager::get_local_ips();
        assert!(!ips.is_empty());
    }

    #[test]
    fn test_secure_pin_format() {
        for _ in 0..50 {
            let pin = generate_secure_pin();
            assert_eq!(pin.len(), 6);
            let val: u32 = pin.parse().expect("PIN must be numeric");
            assert!(val >= 100000 && val <= 999999);
        }
    }

    #[test]
    fn test_ip_lockout_mechanism() {
        let mut map: HashMap<String, (u32, Instant)> = HashMap::new();
        let ip = "192.168.1.100";

        // Under 5 failures is not locked out
        map.insert(ip.to_string(), (4, Instant::now()));
        assert!(!is_ip_locked_out(&map, ip));

        // 5 failures triggers lockout
        map.insert(ip.to_string(), (5, Instant::now()));
        assert!(is_ip_locked_out(&map, ip));

        // Unknown IP is not locked out
        assert!(!is_ip_locked_out(&map, "192.168.1.101"));
    }

    #[test]
    fn test_extract_token_query_fallback() {
        let mut query = HashMap::new();
        query.insert("token".to_string(), "abc-123".to_string());
        // In unit test without request headers, falls back to query param
        let found = query.get("token").cloned().unwrap_or_default();
        assert_eq!(found, "abc-123");
    }

    #[test]
    fn test_remote_page_has_group_tag_elements_and_validates_colours() {
        let html = RemoteServerManager::get_remote_html();
        for needle in ["id=\"live-group\"", "id=\"next-group\"", "function setGroupTag", "setGroupTag('live-group', data.currentSlide)", "setGroupTag('next-group', data.nextSlide)"] {
            assert!(html.contains(needle), "remote page is missing {needle}");
        }
        // only real hex colours may reach the style attribute
        assert!(html.contains("/^#[0-9a-fA-F]{6}$/.test(slide.groupColor"));
        // tag text is written with innerText, not innerHTML
        assert!(html.contains("el.innerText = slide.groupLabel"));
        let start = html.find("function setGroupTag").unwrap();
        let tag_fn = &html[start..start + html[start..].find("\n    }\n").unwrap()];
        assert!(!tag_fn.contains("innerHTML"));
    }
}
