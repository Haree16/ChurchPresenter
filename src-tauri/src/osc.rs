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
}

impl OscService {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            port: Arc::new(Mutex::new(9000)),
            last_received_path: Arc::new(Mutex::new(None)),
            last_received_time: Arc::new(Mutex::new(None)),
            last_error: Arc::new(Mutex::new(None)),
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
        }
    }

    pub fn start_listener(
        &self,
        app: AppHandle,
        db: DbManager,
        pres_mgr: PresentationManager,
        port: u16,
    ) -> Result<OscStatus, String> {
        self.stop_listener();

        let bind_addr = format!("0.0.0.0:{}", port);
        let socket = UdpSocket::bind(&bind_addr)
            .map_err(|e| format!("Failed to bind OSC UDP socket to {}: {}", bind_addr, e))?;

        socket
            .set_read_timeout(Some(Duration::from_millis(500)))
            .map_err(|e| format!("Failed to set UDP socket timeout: {}", e))?;

        *self.port.lock().unwrap() = port;
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
                    Ok((size, _addr)) => {
                        let packet = match rosc::decoder::decode_udp(&buf[..size]) {
                            Ok((_, p)) => p,
                            Err(e) => {
                                *last_err_holder.lock().unwrap() =
                                    Some(format!("Malformed OSC packet: {:?}", e));
                                continue;
                            }
                        };

                        Self::handle_packet(&app, &db, &pres_mgr, packet, &last_path_holder, &last_time_holder);
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
    ) {
        match packet {
            OscPacket::Message(msg) => {
                Self::handle_message(app, db, pres_mgr, msg, last_path_holder, last_time_holder);
            }
            OscPacket::Bundle(bundle) => {
                for pkt in bundle.content {
                    Self::handle_packet(app, db, pres_mgr, pkt, last_path_holder, last_time_holder);
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
    ) {
        let path = msg.addr.as_str();
        let now_str = Utc::now().to_rfc3339();

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

        // Check against allowlist from osc_configs
        let osc_cfg = db.get_osc_config().unwrap_or_else(|_| crate::models::OscConfig {
            id: "default-osc".to_string(),
            is_enabled: true,
            listen_port: 9000,
            allowlist_actions: "next_slide,prev_slide,next_item,prev_item,toggle_blackout,toggle_live,start_timer,stop_timer,reset_timer,clear_overlay".to_string(),
            created_at: "".to_string(),
            updated_at: "".to_string(),
        });

        let allowed_actions: Vec<&str> = osc_cfg
            .allowlist_actions
            .split(',')
            .map(|s| s.trim())
            .collect();

        let action_to_dispatch = match path {
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
            _ => None,
        };

        if let Some(action) = action_to_dispatch {
            if allowed_actions.contains(&action) {
                let _ = ActionDispatcher::dispatch(app, db, pres_mgr, action);
            }
        }
    }
}
