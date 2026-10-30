# Phase 11.1: Audience Output Recording [COMPLETED]

**Goal**: Record the live audience presentation output directly to a video file on disk with zero external hardware or third-party software required.

---

## 1. Overview & Architecture

### User Flow
1. Operator clicks the **Record** button in the top navigation toolbar (or triggers it via Stream Deck, MIDI, OSC `/recording/start`, or a Service Macro).
2. The audience output is captured seamlessly in real-time (including slide graphics, motion backgrounds, fonts, shapes, scripture, props tickers, alert banners, and application audio).
3. The toolbar displays a pulsing red recording pill: `● REC 00:14:23`.
4. When the service concludes, the operator stops recording. The finished video file is finalized and saved to the designated recordings folder (e.g., `~/Videos/ChurchPresenterRecordings/Service-2026-10-30-160000.mp4`).
5. A list of recent recordings allows one-click playback, inspection, opening in the system file manager, or deletion.

---

## 2. Components & Work Items

### 2.1 Backend Engine (`src-tauri/src/recorder.rs`)
- SQLite Table & Settings (`recording_configs`, Migration 30):
  - `output_directory`: string (defaults to AppData/recordings or custom folder)
  - `container_format`: string (`webm` or `mp4`)
  - `resolution`: string (`1080p`, `720p`, `4k`, `native`)
  - `video_bitrate`: integer (bps, e.g., 5_000_000)
  - `frame_rate`: integer (30 or 60 fps)
  - `include_audio`: boolean
- Tauri Commands:
  - `get_recording_config() -> Result<RecordingConfig, String>`
  - `update_recording_config(config: RecordingConfig) -> Result<RecordingConfig, String>`
  - `start_recording(session_id: String, filename: Option<String>) -> Result<RecordingStatus, String>`
  - `append_recording_chunk(session_id: String, chunk: Vec<u8>) -> Result<(), String>`
  - `pause_recording() -> Result<RecordingStatus, String>`
  - `resume_recording() -> Result<RecordingStatus, String>`
  - `stop_recording(session_id: Option<String>) -> Result<RecordedFile, String>`
  - `get_recording_status() -> Result<RecordingStatus, String>`
  - `list_recordings() -> Result<Vec<RecordedFile>, String>`
  - `delete_recording(filename: String) -> Result<(), String>`
  - `open_recording_folder() -> Result<(), String>`

### 2.2 Frontend Capture & UI
- **Audience View Stream Recorder (`src/services/recordingService.ts`)**:
  - `RecordingCoordinator` handles HTML5 canvas / stream capture and streams video chunks to `api.appendRecordingChunk(...)`.
- **Top Header Live Recording Indicator (`src/components/Header.tsx`)**:
  - Toolbar button showing "Record" in standby, or red `● REC 00:04:12` pill with elapsed time when recording is live.
- **Recording Modal (`src/components/Broadcast/RecordingModal.tsx`)**:
  - Live preview & recording control center (Start / Stop / Pause / Resume).
  - Video & output settings: format (WebM/MP4), resolution (1080p/720p/4K/native), framerate (30/60 fps), bitrate (2.5 - 16 Mbps), and audio toggle.
  - Recent recordings library table with duration, filesize, timestamp, and delete action.
  - System file explorer launcher button ("Open Folder").
- **Action Registry & Macro Integration**:
  - Registered `start_recording`, `stop_recording`, `toggle_recording` in `action_mappings`.
  - Dispatched directly via Stream Deck, MIDI, OSC, and macros.

---

## 3. Acceptance Criteria & Tests
- Backend unit tests in `src-tauri/src/recorder.rs` verifying recording lifecycle, file creation, chunk appending, pause/resume, and deletion.
- Frontend test suite in `tests/recording.test.tsx` (7 tests passing):
  - Configuration retrieval and persistence.
  - Lifecycle: start, append chunks, pause, resume, stop.
  - Action dispatch for `start_recording`, `stop_recording`, `toggle_recording`.
  - `RecordingModal` UI controls and settings.
  - `Header` recording indicator and elapsed time formatting.
- TypeScript verification with 0 errors (`npx tsc --noEmit`).
