use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use chrono::{DateTime, Utc};
use crate::models::{RecordingStatus, RecordedFile};
use crate::db::DbManager;

#[derive(Debug)]
struct ActiveSession {
    session_id: String,
    started_at: DateTime<Utc>,
    file_path: PathBuf,
    file: File,
    bytes_written: u64,
    frames_count: u64,
    is_paused: bool,
}

pub struct RecorderService {
    app_data_dir: PathBuf,
    active_session: Arc<Mutex<Option<ActiveSession>>>,
}

impl RecorderService {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            app_data_dir,
            active_session: Arc::new(Mutex::new(None)),
        }
    }

    /// Resolves the effective recordings directory
    pub fn resolve_output_dir(&self, db: &DbManager) -> PathBuf {
        if let Ok(cfg) = db.get_recording_config() {
            if let Some(dir) = cfg.output_directory {
                let p = PathBuf::from(dir.trim());
                if !p.as_os_str().is_empty() {
                    return p;
                }
            }
        }

        // Default to app_data_dir/recordings
        self.app_data_dir.join("recordings")
    }

    pub fn get_status(&self, db: &DbManager) -> RecordingStatus {
        let output_dir = self.resolve_output_dir(db).to_string_lossy().to_string();
        let guard = self.active_session.lock().unwrap();
        if let Some(ref session) = *guard {
            let elapsed = (Utc::now() - session.started_at).num_seconds().max(0) as u64;
            RecordingStatus {
                is_recording: true,
                is_paused: session.is_paused,
                session_id: Some(session.session_id.clone()),
                started_at: Some(session.started_at.to_rfc3339()),
                elapsed_seconds: elapsed,
                current_file_path: Some(session.file_path.to_string_lossy().to_string()),
                current_file_size_bytes: session.bytes_written,
                total_frames_recorded: session.frames_count,
                output_directory: output_dir,
            }
        } else {
            RecordingStatus {
                is_recording: false,
                is_paused: false,
                session_id: None,
                started_at: None,
                elapsed_seconds: 0,
                current_file_path: None,
                current_file_size_bytes: 0,
                total_frames_recorded: 0,
                output_directory: output_dir,
            }
        }
    }

    pub fn start_recording(
        &self,
        db: &DbManager,
        session_id: String,
        custom_filename: Option<String>,
    ) -> Result<RecordingStatus, String> {
        let mut guard = self.active_session.lock().unwrap();
        if guard.is_some() {
            return Err("A recording session is already active".to_string());
        }

        let output_dir = self.resolve_output_dir(db);
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create recording directory {:?}: {}", output_dir, e))?;

        let cfg = db.get_recording_config().unwrap_or_default();
        let ext = if cfg.container_format.eq_ignore_ascii_case("mp4") {
            "mp4"
        } else {
            "webm"
        };

        let now = Utc::now();
        let filename = if let Some(custom) = custom_filename {
            let sanitized: String = custom
                .chars()
                .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ' || *c == '.')
                .collect();
            let base = sanitized.trim();
            if base.is_empty() {
                format!("Service-Recording-{}.{}", now.format("%Y-%m-%d-%H%M%S"), ext)
            } else if base.ends_with(".webm") || base.ends_with(".mp4") {
                base.to_string()
            } else {
                format!("{}.{}", base, ext)
            }
        } else {
            format!("Service-Recording-{}.{}", now.format("%Y-%m-%d-%H%M%S"), ext)
        };

        let target_path = output_dir.join(&filename);
        let file = File::create(&target_path)
            .map_err(|e| format!("Failed to create recording file {:?}: {}", target_path, e))?;

        *guard = Some(ActiveSession {
            session_id: session_id.clone(),
            started_at: now,
            file_path: target_path.clone(),
            file,
            bytes_written: 0,
            frames_count: 0,
            is_paused: false,
        });

        Ok(RecordingStatus {
            is_recording: true,
            is_paused: false,
            session_id: Some(session_id),
            started_at: Some(now.to_rfc3339()),
            elapsed_seconds: 0,
            current_file_path: Some(target_path.to_string_lossy().to_string()),
            current_file_size_bytes: 0,
            total_frames_recorded: 0,
            output_directory: output_dir.to_string_lossy().to_string(),
        })
    }

    pub fn append_chunk(&self, session_id: &str, chunk: &[u8]) -> Result<(), String> {
        let mut guard = self.active_session.lock().unwrap();
        let session = guard
            .as_mut()
            .ok_or_else(|| "No active recording session".to_string())?;

        if session.session_id != session_id {
            return Err("Session ID mismatch for recording chunk".to_string());
        }

        if session.is_paused {
            return Ok(());
        }

        session
            .file
            .write_all(chunk)
            .map_err(|e| format!("Failed writing recording chunk: {}", e))?;

        session.bytes_written += chunk.len() as u64;
        session.frames_count += 1;
        Ok(())
    }

    pub fn pause_recording(&self) -> Result<RecordingStatus, String> {
        let mut guard = self.active_session.lock().unwrap();
        let session = guard
            .as_mut()
            .ok_or_else(|| "No active recording session to pause".to_string())?;
        session.is_paused = true;
        let elapsed = (Utc::now() - session.started_at).num_seconds().max(0) as u64;
        Ok(RecordingStatus {
            is_recording: true,
            is_paused: true,
            session_id: Some(session.session_id.clone()),
            started_at: Some(session.started_at.to_rfc3339()),
            elapsed_seconds: elapsed,
            current_file_path: Some(session.file_path.to_string_lossy().to_string()),
            current_file_size_bytes: session.bytes_written,
            total_frames_recorded: session.frames_count,
            output_directory: session
                .file_path
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
        })
    }

    pub fn resume_recording(&self) -> Result<RecordingStatus, String> {
        let mut guard = self.active_session.lock().unwrap();
        let session = guard
            .as_mut()
            .ok_or_else(|| "No active recording session to resume".to_string())?;
        session.is_paused = false;
        let elapsed = (Utc::now() - session.started_at).num_seconds().max(0) as u64;
        Ok(RecordingStatus {
            is_recording: true,
            is_paused: false,
            session_id: Some(session.session_id.clone()),
            started_at: Some(session.started_at.to_rfc3339()),
            elapsed_seconds: elapsed,
            current_file_path: Some(session.file_path.to_string_lossy().to_string()),
            current_file_size_bytes: session.bytes_written,
            total_frames_recorded: session.frames_count,
            output_directory: session
                .file_path
                .parent()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default(),
        })
    }

    pub fn stop_recording(&self, session_id: Option<String>) -> Result<RecordedFile, String> {
        let mut guard = self.active_session.lock().unwrap();
        let session = guard
            .take()
            .ok_or_else(|| "No active recording session to stop".to_string())?;

        if let Some(req_id) = session_id {
            if session.session_id != req_id {
                // Put it back
                *guard = Some(session);
                return Err("Session ID mismatch when stopping recording".to_string());
            }
        }

        let _ = session.file.sync_all();
        drop(session.file);

        let duration = (Utc::now() - session.started_at).num_seconds().max(0) as u64;
        let filename = session
            .file_path
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "recording.webm".to_string());

        let ext = session
            .file_path
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_else(|| "webm".to_string());

        let size = fs::metadata(&session.file_path)
            .map(|m| m.len())
            .unwrap_or(session.bytes_written);

        Ok(RecordedFile {
            filename,
            full_path: session.file_path.to_string_lossy().to_string(),
            file_size_bytes: size,
            duration_seconds: duration,
            created_at: session.started_at.to_rfc3339(),
            container_format: ext,
        })
    }

    pub fn list_recordings(&self, db: &DbManager) -> Result<Vec<RecordedFile>, String> {
        let output_dir = self.resolve_output_dir(db);
        if !output_dir.exists() {
            return Ok(Vec::new());
        }

        let entries = fs::read_dir(&output_dir)
            .map_err(|e| format!("Failed to read recordings directory: {}", e))?;

        let mut recordings = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if ext == "webm" || ext == "mp4" || ext == "mkv" {
                let metadata = match fs::metadata(&path) {
                    Ok(m) => m,
                    Err(_) => continue,
                };

                let filename = path
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_default();

                let created_at = metadata
                    .created()
                    .or_else(|_| metadata.modified())
                    .map(|t| {
                        let dt: DateTime<Utc> = t.into();
                        dt.to_rfc3339()
                    })
                    .unwrap_or_else(|_| Utc::now().to_rfc3339());

                // Rough duration estimation based on 5Mbps bitrate if metadata unavailable
                let estimated_duration = (metadata.len() / (5_000_000 / 8)).max(1);

                recordings.push(RecordedFile {
                    filename,
                    full_path: path.to_string_lossy().to_string(),
                    file_size_bytes: metadata.len(),
                    duration_seconds: estimated_duration,
                    created_at,
                    container_format: ext,
                });
            }
        }

        // Sort descending by created_at (newest first)
        recordings.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(recordings)
    }

    pub fn delete_recording(&self, db: &DbManager, filename: &str) -> Result<(), String> {
        // Prevent directory traversal
        let clean = Path::new(filename)
            .file_name()
            .ok_or_else(|| "Invalid filename".to_string())?;

        let output_dir = self.resolve_output_dir(db);
        let target = output_dir.join(clean);

        if !target.exists() {
            return Err(format!("File {:?} does not exist", clean));
        }

        fs::remove_file(&target)
            .map_err(|e| format!("Failed to delete recording {:?}: {}", clean, e))?;
        Ok(())
    }

    pub fn open_recording_folder(&self, db: &DbManager) -> Result<(), String> {
        let output_dir = self.resolve_output_dir(db);
        fs::create_dir_all(&output_dir)
            .map_err(|e| format!("Failed to create folder {:?}: {}", output_dir, e))?;

        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("explorer")
                .arg(&output_dir)
                .spawn()
                .map_err(|e| format!("Failed to open Explorer: {}", e))?;
        }

        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("open")
                .arg(&output_dir)
                .spawn()
                .map_err(|e| format!("Failed to open Finder: {}", e))?;
        }

        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdg-open")
                .arg(&output_dir)
                .spawn()
                .map_err(|e| format!("Failed to open file manager: {}", e))?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recording_service_lifecycle() {
        let dir = std::env::temp_dir().join(format!("rec-test-{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&dir);
        let app_data = dir.clone();
        let db_path = app_data.join("test.db");
        let db = DbManager::new(&db_path).unwrap();

        let service = RecorderService::new(app_data.clone());
        let status = service.get_status(&db);
        assert!(!status.is_recording);
        assert!(!status.is_paused);

        // Start recording
        let session_id = "test-session-123".to_string();
        let started = service
            .start_recording(&db, session_id.clone(), Some("Sunday-Service.webm".to_string()))
            .unwrap();
        assert!(started.is_recording);
        assert_eq!(started.session_id.as_deref(), Some("test-session-123"));

        // Append chunks
        let chunk1 = vec![0x1a, 0x45, 0xdf, 0xa3]; // EBML header prefix
        service.append_chunk(&session_id, &chunk1).unwrap();

        let chunk2 = vec![0x00, 0x01, 0x02, 0x03];
        service.append_chunk(&session_id, &chunk2).unwrap();

        // Pause and resume
        let paused = service.pause_recording().unwrap();
        assert!(paused.is_paused);

        let resumed = service.resume_recording().unwrap();
        assert!(!resumed.is_paused);

        // Append chunk with invalid session id should fail
        let wrong_res = service.append_chunk("wrong-id", &chunk2);
        assert!(wrong_res.is_err());

        // Stop recording
        let recorded = service.stop_recording(Some(session_id)).unwrap();
        assert_eq!(recorded.filename, "Sunday-Service.webm");
        assert_eq!(recorded.file_size_bytes, 8);
        assert!(Path::new(&recorded.full_path).exists());

        // Listing should find the recorded file
        let list = service.list_recordings(&db).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].filename, "Sunday-Service.webm");

        // Delete recording
        service.delete_recording(&db, "Sunday-Service.webm").unwrap();
        let list_after = service.list_recordings(&db).unwrap();
        assert_eq!(list_after.len(), 0);

        let _ = fs::remove_dir_all(&dir);
    }
}
