use crate::actions::ActionDispatcher;
use crate::db::DbManager;
use crate::models::{MidiEventMonitor, MidiStatus};
use crate::presentation::PresentationManager;
use chrono::Utc;
use midir::{Ignore, MidiInput, MidiInputConnection};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

pub struct MidiService {
    is_running: Arc<AtomicBool>,
    current_device_name: Arc<Mutex<Option<String>>>,
    last_event: Arc<Mutex<Option<MidiEventMonitor>>>,
    last_error: Arc<Mutex<Option<String>>>,
    // The active connection must be kept alive
    active_connection: Arc<Mutex<Option<MidiInputConnection<()>>>>,
}

impl MidiService {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
            current_device_name: Arc::new(Mutex::new(None)),
            last_event: Arc::new(Mutex::new(None)),
            last_error: Arc::new(Mutex::new(None)),
            active_connection: Arc::new(Mutex::new(None)),
        }
    }

    pub fn list_devices(&self) -> Result<Vec<String>, String> {
        let midi_in = MidiInput::new("ChurchPresenterInput")
            .map_err(|e| format!("Failed to initialize MIDI: {}", e))?;
        let ports = midi_in.ports();
        let mut names = Vec::new();
        for port in &ports {
            if let Ok(name) = midi_in.port_name(port) {
                names.push(name);
            }
        }
        Ok(names)
    }

    pub fn get_status(&self) -> MidiStatus {
        let available_devices = self.list_devices().unwrap_or_default();
        let is_running = self.is_running.load(Ordering::SeqCst);
        let current_device_name = self.current_device_name.lock().unwrap().clone();
        let last_event = self.last_event.lock().unwrap().clone();
        let error = self.last_error.lock().unwrap().clone();

        MidiStatus {
            is_running,
            current_device_name,
            available_devices,
            last_event,
            error,
        }
    }

    pub fn start_listener(
        &self,
        app: AppHandle,
        db: DbManager,
        pres_mgr: PresentationManager,
        device_name_pattern: Option<String>,
    ) -> Result<MidiStatus, String> {
        self.stop_listener();

        let mut midi_in = MidiInput::new("ChurchPresenterInput")
            .map_err(|e| format!("Failed to create MIDI input: {}", e))?;
        midi_in.ignore(Ignore::None);

        let ports = midi_in.ports();
        if ports.is_empty() {
            let msg = "No MIDI input devices found on system".to_string();
            *self.last_error.lock().unwrap() = Some(msg.clone());
            return Err(msg);
        }

        // Select matching port or first available
        let selected_port = if let Some(ref pattern) = device_name_pattern {
            ports.into_iter().find(|p| {
                if let Ok(name) = midi_in.port_name(p) {
                    name.contains(pattern)
                } else {
                    false
                }
            })
        } else {
            ports.into_iter().next()
        };

        let port = match selected_port {
            Some(p) => p,
            None => {
                let msg = "Selected MIDI device not available".to_string();
                *self.last_error.lock().unwrap() = Some(msg.clone());
                return Err(msg);
            }
        };

        let port_name = midi_in
            .port_name(&port)
            .unwrap_or_else(|_| "MIDI Controller".to_string());
        *self.current_device_name.lock().unwrap() = Some(port_name.clone());
        *self.last_error.lock().unwrap() = None;

        let last_event_holder = self.last_event.clone();

        let conn = midi_in
            .connect(
                &port,
                "church-presenter-midi-read",
                move |_timestamp, message, _| {
                    if message.len() < 3 {
                        return;
                    }
                    let status = message[0];
                    let channel = (status & 0x0F) + 1; // 1-indexed MIDI channel
                    let msg_type_nibble = status & 0xF0;

                    let (msg_type, note_or_cc, value) = match msg_type_nibble {
                        0x90 => {
                            // Note On (if velocity > 0, else Note Off)
                            let note = message[1];
                            let vel = message[2];
                            if vel > 0 {
                                ("note_on", note, vel)
                            } else {
                                return;
                            }
                        }
                        0xB0 => {
                            // Control Change
                            let cc = message[1];
                            let val = message[2];
                            ("control_change", cc, val)
                        }
                        _ => return, // ignore pitch bend, poly pressure, etc.
                    };

                    let event = MidiEventMonitor {
                        channel,
                        message_type: msg_type.to_string(),
                        note_or_cc,
                        value,
                        timestamp: Utc::now().to_rfc3339(),
                    };

                    *last_event_holder.lock().unwrap() = Some(event.clone());
                    app.emit("midi:event-received", &event).ok();

                    // Check action mapping
                    if let Ok(mappings) = db.list_midi_mappings() {
                        for m in mappings {
                            if !m.is_enabled {
                                continue;
                            }
                            if m.message_type == msg_type && m.note_or_cc == note_or_cc {
                                // Channel 0 means any channel
                                if m.channel == 0 || m.channel == channel {
                                    let _ = ActionDispatcher::dispatch(&app, &db, &pres_mgr, &m.action_type);
                                    break;
                                }
                            }
                        }
                    }
                },
                (),
            )
            .map_err(|e| format!("Failed to connect to MIDI device: {}", e))?;

        *self.active_connection.lock().unwrap() = Some(conn);
        self.is_running.store(true, Ordering::SeqCst);

        Ok(self.get_status())
    }

    pub fn stop_listener(&self) -> MidiStatus {
        self.is_running.store(false, Ordering::SeqCst);
        let mut conn_lock = self.active_connection.lock().unwrap();
        *conn_lock = None;
        *self.current_device_name.lock().unwrap() = None;
        self.get_status()
    }
}
