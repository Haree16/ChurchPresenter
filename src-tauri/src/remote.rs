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
    last_error: Arc<Mutex<Option<String>>>,
}

impl RemoteServerManager {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            port: Arc::new(Mutex::new(8088)),
            pairing_pin: Arc::new(Mutex::new(None)),
            connected_clients: Arc::new(Mutex::new(HashMap::new())),
            last_error: Arc::new(Mutex::new(None)),
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
        }
    }

    pub fn start_server(
        &self,
        app: AppHandle,
        db: DbManager,
        pres_mgr: PresentationManager,
        port: u16,
    ) -> Result<RemoteServerStatus, String> {
        if self.is_running.load(Ordering::SeqCst) {
            return Ok(self.get_status());
        }

        // Generate 6-digit random PIN
        use std::time::SystemTime;
        let seed = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap_or_default()
            .subsec_nanos();
        let pin = format!("{:06}", (seed % 900000) + 100000);
        *self.pairing_pin.lock().unwrap() = Some(pin.clone());
        *self.port.lock().unwrap() = port;
        *self.last_error.lock().unwrap() = None;

        let addr = format!("0.0.0.0:{}", port);
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
        let expected_pin = pin.clone();
        let last_err_ref = self.last_error.clone();

        thread::spawn(move || {
            let server = Arc::new(server);
            // Rate limiter table: token -> (request_count, window_start)
            let rate_limiter: Arc<Mutex<HashMap<String, (usize, Instant)>>> =
                Arc::new(Mutex::new(HashMap::new()));

            while is_running_flag.load(Ordering::SeqCst) {
                // Use a non-blocking timeout so we can exit promptly when stopped
                match server.recv_timeout(Duration::from_millis(500)) {
                    Ok(Some(mut request)) => {
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

                        let remote_addr = request.remote_addr().map(|a| a.ip().to_string()).unwrap_or_else(|| "127.0.0.1".to_string());

                        // Handle routes
                        match (request.method(), path.as_str()) {
                            // 1. Mobile Remote HTML Application
                            (&Method::Get, "/") | (&Method::Get, "/remote") => {
                                let html = Self::get_remote_html();
                                let resp = Response::from_string(html)
                                    .with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap())
                                    .with_header(Header::from_bytes(&b"Cache-Control"[..], &b"no-cache"[..]).unwrap());
                                request.respond(resp).ok();
                            }

                            // 2. Livestream Overlay HTML for OBS Studio Browser Source
                            (&Method::Get, "/overlay") => {
                                let token = query_params.get("token").cloned().unwrap_or_default();
                                let config = db.get_overlay_config().unwrap_or_default();
                                if token != config.auth_token {
                                    let resp = Response::from_string("Unauthorized OBS Overlay Token")
                                        .with_status_code(StatusCode(401));
                                    request.respond(resp).ok();
                                } else {
                                    let html = Self::get_overlay_html(&token);
                                    let resp = Response::from_string(html)
                                        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap())
                                        .with_header(Header::from_bytes(&b"Cache-Control"[..], &b"no-cache"[..]).unwrap());
                                    request.respond(resp).ok();
                                }
                            }

                            // 3. API: Overlay Render Payload
                            (&Method::Get, "/api/overlay-data") => {
                                let token = query_params.get("token").cloned().unwrap_or_default();
                                let config = db.get_overlay_config().unwrap_or_default();
                                if token != config.auth_token {
                                    let resp = Response::from_string("{\"error\":\"Unauthorized\"}")
                                        .with_status_code(StatusCode(401))
                                        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                    request.respond(resp).ok();
                                } else {
                                    let state = pres_mgr.get_state();
                                    let payload = OverlayService::get_render_payload(&db, &state).unwrap();
                                    let json = serde_json::to_string(&payload).unwrap_or_default();
                                    let resp = Response::from_string(json)
                                        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
                                        .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                                    request.respond(resp).ok();
                                }
                            }

                            // 4. API: Pair new device
                            (&Method::Post, "/api/pair") => {
                                let mut body = String::new();
                                request.as_reader().read_to_string(&mut body).ok();
                                let pair_req: Result<RemotePairRequest, _> = serde_json::from_str(&body);

                                match pair_req {
                                    Ok(req) => {
                                        if req.pin != expected_pin {
                                            let err_resp = RemotePairResponse {
                                                success: false,
                                                requires_approval: false,
                                                session_token: None,
                                                message: "Invalid pairing PIN".to_string(),
                                            };
                                            let json = serde_json::to_string(&err_resp).unwrap_or_default();
                                            let resp = Response::from_string(json)
                                                .with_status_code(StatusCode(403))
                                                .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                            request.respond(resp).ok();
                                        } else {
                                            let token = Uuid::new_v4().to_string();
                                            let dev_id = format!("remote-{}", Uuid::new_v4().simple());
                                            let now = Utc::now().to_rfc3339();

                                            let new_dev = RemoteDevice {
                                                id: dev_id.clone(),
                                                device_name: req.device_name,
                                                ip_address: remote_addr,
                                                token_hash: token.clone(),
                                                is_approved: false, // operator must approve on desktop
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
                                                .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                            request.respond(resp).ok();
                                        }
                                    }
                                    Err(_) => {
                                        let resp = Response::from_string("{\"error\":\"Invalid request body\"}")
                                            .with_status_code(StatusCode(400))
                                            .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                        request.respond(resp).ok();
                                    }
                                }
                            }

                            // 5. API: Remote Presentation State Query
                            (&Method::Get, "/api/state") => {
                                let token = query_params.get("token").cloned().unwrap_or_default();
                                match db.get_remote_device_by_token(&token) {
                                    Ok(Some(device)) => {
                                        if !device.is_approved {
                                            let resp = Response::from_string("{\"error\":\"Device pending approval\"}")
                                                .with_status_code(StatusCode(403))
                                                .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                            request.respond(resp).ok();
                                        } else {
                                            // Update last seen
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
                                                "timerState": state.timer_state,
                                                "permissions": {
                                                    "canNavigate": device.can_navigate,
                                                    "canBlackout": device.can_blackout,
                                                    "canTakeLive": device.can_take_live,
                                                    "canControlTimer": device.can_control_timer
                                                }
                                            })).unwrap_or_default();

                                            let resp = Response::from_string(json)
                                                .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
                                                .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                                            request.respond(resp).ok();
                                        }
                                    }
                                    _ => {
                                        let resp = Response::from_string("{\"error\":\"Unauthorized or device revoked\"}")
                                            .with_status_code(StatusCode(401))
                                            .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                        request.respond(resp).ok();
                                    }
                                }
                            }

                            // 6. API: Dispatch Action
                            (&Method::Post, "/api/action") => {
                                let token = query_params.get("token").cloned().unwrap_or_default();
                                match db.get_remote_device_by_token(&token) {
                                    Ok(Some(device)) => {
                                        if !device.is_approved {
                                            let resp = Response::from_string("{\"error\":\"Device pending approval\"}")
                                                .with_status_code(StatusCode(403))
                                                .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                            request.respond(resp).ok();
                                            continue;
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
                                                    .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                                request.respond(resp).ok();
                                                continue;
                                            }
                                        }
                                        drop(rl);

                                        let mut body = String::new();
                                        request.as_reader().read_to_string(&mut body).ok();
                                        let json_val: serde_json::Value = serde_json::from_str(&body).unwrap_or_default();
                                        let action = json_val.get("action").and_then(|v| v.as_str()).unwrap_or("");

                                        // Permission check
                                        let is_permitted = match action {
                                            "next_slide" | "prev_slide" | "next_item" | "prev_item" => device.can_navigate,
                                            "toggle_blackout" => device.can_blackout,
                                            "toggle_live" => device.can_take_live,
                                            "start_timer" | "stop_timer" | "reset_timer" => device.can_control_timer,
                                            _ => false,
                                        };

                                        if !is_permitted {
                                            let resp = Response::from_string("{\"error\":\"Action not permitted for this remote device\"}")
                                                .with_status_code(StatusCode(403))
                                                .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
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
                                                    .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap())
                                                    .with_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
                                                    request.respond(resp).ok();
                                                }
                                                Err(e) => {
                                                    let resp = Response::from_string(format!("{{\"error\":\"{}\"}}", e))
                                                        .with_status_code(StatusCode(500))
                                                        .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                                                    request.respond(resp).ok();
                                                }
                                            }
                                        }
                                    }
                                    _ => {
                                        let resp = Response::from_string("{\"error\":\"Unauthorized or device revoked\"}")
                                            .with_status_code(StatusCode(401))
                                            .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
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
                    }
                    Ok(None) => {}
                    Err(e) => {
                        *last_err_ref.lock().unwrap() = Some(format!("Server recv error: {}", e));
                    }
                }
            }
        });

        Ok(self.get_status())
    }

    pub fn stop_server(&self) -> RemoteServerStatus {
        self.is_running.store(false, Ordering::SeqCst);
        *self.pairing_pin.lock().unwrap() = None;
        self.connected_clients.lock().unwrap().clear();
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
        <div id="live-body" class="slide-body">No slide live</div>
      </div>

      <div class="card" style="opacity: 0.85;">
        <div class="card-title">Up Next</div>
        <div id="next-body" style="font-size: 15px; color: #cbd5e1; white-space: pre-wrap;">(End of presentation)</div>
      </div>

      <div class="controls-grid">
        <button id="btn-prev" class="btn-sec">◀ Prev Slide</button>
        <button id="btn-next">Next Slide ▶</button>
        <button id="btn-prev-item" class="btn-sec">⏮ Prev Item</button>
        <button id="btn-next-item" class="btn-sec">Next Item ⏭</button>
        <button id="btn-blackout" class="btn-warn">Blackout</button>
        <button id="btn-live" class="btn-danger">Go Live</button>
      </div>
    </div>
  </main>

  <script>
    let sessionToken = localStorage.getItem('church_presenter_remote_token');
    const devName = navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('iPad') ? 'iPad' : navigator.userAgent.includes('Android') ? 'Android Phone' : 'Mobile Controller';
    document.getElementById('dev-name-input').value = devName;

    function showView(name) {
      document.getElementById('view-pairing').style.display = name === 'pairing' ? 'block' : 'none';
      document.getElementById('view-pending').style.display = name === 'pending' ? 'block' : 'none';
      document.getElementById('view-controls').style.display = name === 'controls' ? 'flex' : 'none';
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
          showView('controls');
          document.getElementById('conn-status').innerText = 'Connected';

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
            document.getElementById('btn-live').disabled = !data.permissions.canTakeLive;
          }
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
    document.getElementById('btn-blackout').onclick = () => sendAction('toggle_blackout');
    document.getElementById('btn-live').onclick = () => sendAction('toggle_live');

    checkState();
    setInterval(checkState, 1000);
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
