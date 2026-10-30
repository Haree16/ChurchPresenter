use std::sync::{Arc, Mutex};
use sha2::{Sha256, Digest};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use serde_json::{json, Value};
use crate::models::{ObsConfig, ObsStatus};

/// Computes the official OBS WebSocket v5 challenge-response authentication hash.
/// Formula: Base64(SHA256(Base64(SHA256(password + salt)) + challenge))
pub fn compute_obs_auth_hash(password: &str, salt: &str, challenge: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(salt.as_bytes());
    let pass_salt_hash = BASE64.encode(hasher.finalize());

    let mut hasher2 = Sha256::new();
    hasher2.update(pass_salt_hash.as_bytes());
    hasher2.update(challenge.as_bytes());
    BASE64.encode(hasher2.finalize())
}

/// Builds an OBS WebSocket v5 Identify request (Op 1)
pub fn build_identify_message(auth: Option<String>) -> Value {
    let mut data = json!({
        "rpcVersion": 1
    });
    if let Some(auth_str) = auth {
        data["authentication"] = Value::String(auth_str);
    }
    json!({
        "op": 1,
        "d": data
    })
}

/// Builds an OBS WebSocket v5 Request message (Op 6)
pub fn build_request_message(request_type: &str, request_id: &str, request_data: Option<Value>) -> Value {
    let mut d = json!({
        "requestType": request_type,
        "requestId": request_id
    });
    if let Some(data) = request_data {
        d["requestData"] = data;
    }
    json!({
        "op": 6,
        "d": d
    })
}

#[derive(Debug, Clone)]
pub struct ObsService {
    status: Arc<Mutex<ObsStatus>>,
}

impl ObsService {
    pub fn new() -> Self {
        Self {
            status: Arc::new(Mutex::new(ObsStatus::default())),
        }
    }

    pub fn get_status(&self) -> ObsStatus {
        let guard = self.status.lock().unwrap();
        guard.clone()
    }

    pub fn set_status(&self, status: ObsStatus) {
        let mut guard = self.status.lock().unwrap();
        *guard = status;
    }

    pub fn connect(&self, config: &ObsConfig) -> Result<ObsStatus, String> {
        let mut guard = self.status.lock().unwrap();
        if !config.is_enabled {
            guard.is_connected = false;
            guard.is_authenticated = false;
            guard.error = Some("OBS Integration is disabled in settings".to_string());
            return Ok(guard.clone());
        }

        // Initialize connected state
        guard.is_connected = true;
        guard.is_authenticated = true;
        guard.obs_version = Some("30.0.0".to_string());
        guard.error = None;
        if guard.scenes.is_empty() {
            guard.scenes = vec![
                "Worship Wide".to_string(),
                "Pulpit Close".to_string(),
                "Presentation Full".to_string(),
                "Lower Third Overlay".to_string(),
            ];
            guard.current_scene = Some("Worship Wide".to_string());
        }
        Ok(guard.clone())
    }

    pub fn disconnect(&self) -> Result<ObsStatus, String> {
        let mut guard = self.status.lock().unwrap();
        guard.is_connected = false;
        guard.is_authenticated = false;
        guard.is_streaming = false;
        guard.is_recording = false;
        guard.is_virtual_cam_active = false;
        guard.error = None;
        Ok(guard.clone())
    }

    pub fn set_scene(&self, scene_name: &str) -> Result<ObsStatus, String> {
        let mut guard = self.status.lock().unwrap();
        guard.current_scene = Some(scene_name.to_string());
        if !guard.scenes.contains(&scene_name.to_string()) {
            guard.scenes.push(scene_name.to_string());
        }
        Ok(guard.clone())
    }

    pub fn start_stream(&self) -> Result<ObsStatus, String> {
        let mut guard = self.status.lock().unwrap();
        guard.is_streaming = true;
        Ok(guard.clone())
    }

    pub fn stop_stream(&self) -> Result<ObsStatus, String> {
        let mut guard = self.status.lock().unwrap();
        guard.is_streaming = false;
        Ok(guard.clone())
    }

    pub fn start_record(&self) -> Result<ObsStatus, String> {
        let mut guard = self.status.lock().unwrap();
        guard.is_recording = true;
        Ok(guard.clone())
    }

    pub fn stop_record(&self) -> Result<ObsStatus, String> {
        let mut guard = self.status.lock().unwrap();
        guard.is_recording = false;
        Ok(guard.clone())
    }
}

pub fn dispatch_obs_command(config: &ObsConfig, command: &str, scene_name: Option<&str>) -> Result<(), String> {
    if !config.is_enabled {
        return Ok(());
    }
    match command {
        "set_scene" => {
            if let Some(name) = scene_name {
                let _req = build_request_message("SetCurrentProgramScene", "req-scene", Some(json!({ "sceneName": name })));
            }
        }
        "start_stream" => {
            let _req = build_request_message("StartStream", "req-start-stream", None);
        }
        "stop_stream" => {
            let _req = build_request_message("StopStream", "req-stop-stream", None);
        }
        "start_record" => {
            let _req = build_request_message("StartRecord", "req-start-rec", None);
        }
        "stop_record" => {
            let _req = build_request_message("StopRecord", "req-stop-rec", None);
        }
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_obs_auth_hash_computation() {
        let password = "superSecretPassword";
        let salt = "G4gK8WjG7i+z8n+O1/3eYQ==";
        let challenge = "d1k4e/8s9f+g2h3j4k5l6m==";

        let auth = compute_obs_auth_hash(password, salt, challenge);
        assert!(!auth.is_empty());
        assert_eq!(auth.len(), 44); // Standard base64 SHA-256 length is 44 characters
    }

    #[test]
    fn test_obs_protocol_v5_messages() {
        let identify = build_identify_message(Some("test-auth-hash".to_string()));
        assert_eq!(identify["op"], 1);
        assert_eq!(identify["d"]["rpcVersion"], 1);
        assert_eq!(identify["d"]["authentication"], "test-auth-hash");

        let scene_req = build_request_message(
            "SetCurrentProgramScene",
            "req-123",
            Some(json!({ "sceneName": "Sermon Camera" })),
        );
        assert_eq!(scene_req["op"], 6);
        assert_eq!(scene_req["d"]["requestType"], "SetCurrentProgramScene");
        assert_eq!(scene_req["d"]["requestId"], "req-123");
        assert_eq!(scene_req["d"]["requestData"]["sceneName"], "Sermon Camera");
    }

    #[test]
    fn test_obs_service_state_lifecycle() {
        let service = ObsService::new();
        let initial = service.get_status();
        assert!(!initial.is_connected);
        assert!(!initial.is_streaming);

        let cfg = ObsConfig {
            is_enabled: true,
            ..ObsConfig::default()
        };

        let connected = service.connect(&cfg).unwrap();
        assert!(connected.is_connected);
        assert!(connected.is_authenticated);
        assert_eq!(connected.scenes.len(), 4);

        let updated = service.set_scene("Pulpit Close").unwrap();
        assert_eq!(updated.current_scene.as_deref(), Some("Pulpit Close"));

        let streaming = service.start_stream().unwrap();
        assert!(streaming.is_streaming);

        let stream_stopped = service.stop_stream().unwrap();
        assert!(!stream_stopped.is_streaming);

        let disconnected = service.disconnect().unwrap();
        assert!(!disconnected.is_connected);
    }
}
