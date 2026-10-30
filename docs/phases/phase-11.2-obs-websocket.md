# Phase 11.2: OBS Studio WebSocket Integration

## Goal
Connect Church Presenter to OBS Studio (v28+ via OBS WebSocket Protocol v5) to enable automated scene switching, streaming triggers, and recording synchronization directly from macro steps, operator action dispatches, and the Production Integrations manager.

---

## Acceptance Criteria
- [x] **Protocol v5 WebSocket Client Architecture**:
  - Connect to OBS WebSocket Server (default port `4455`).
  - SHA-256 challenge-response base64 authentication hash computation matching OBS WebSocket Protocol v5:
    `Base64(SHA256(Base64(SHA256(password + salt)) + challenge))`
  - Identify request message construction (`op: 1`).
  - Request message construction (`op: 6`) for `SetCurrentProgramScene`, `StartStream`, `StopStream`, `StartRecord`, `StopRecord`.
- [x] **Data Persistence & SQLite Migrations**:
  - SQLite database Migration 31 creating `obs_configs` table with persistence for `host`, `port`, `password`, `auto_connect`, `switch_scene_on_service_item`.
  - Database action registry mappings for OBS actions:
    - `obs_start_stream` (Start OBS Streaming)
    - `obs_stop_stream` (Stop OBS Streaming)
    - `obs_start_record` (Start OBS Recording)
    - `obs_stop_record` (Stop OBS Recording)
  - Backup & restore preservation (`obs_configs`).
- [x] **Macro Execution Engine Integration**:
  - `MacroStep::Obs { command, scene_name }` step variant.
  - Step validation ensuring non-empty command and scene name for `set_scene`.
  - Real-time step dispatch in `apply_step_core` and frontend macro runner.
- [x] **Frontend User Interface**:
  - Production Integrations modal (`ProductionIntegrationsModal.tsx`) with dedicated "OBS Studio" tab.
  - Real-time connection badge with version detection.
  - Connection & Settings card (Host, Port, Password show/hide, Auto-connect, Service item auto-switch).
  - Program Scene Switcher dropdown & test switch trigger.
  - Live broadcast & recording toggle controls.
  - Macro Manager modal (`MacroManagerModal.tsx`) OBS Studio step type editor.
- [x] **Offline-First & Fault Resilience**:
  - Graceful degradation when OBS Studio is offline or closed; presentation output and user workflows are never blocked.
  - Comprehensive unit and integration test coverage across Rust backend and React frontend.
