# Phase 11.5: NDI Output (Network Device Interface Streaming over LAN)

## Goal
Enable Church Presenter to broadcast live presentation screens (Audience display, Stage confidence monitor, or Livestream lower thirds) as high-definition, low-latency NDI® (Network Device Interface) video streams over the church local area network (LAN). Video switchers like OBS Studio, vMix, Wirecast, TriCaster, and hardware NDI decoders can discover and ingest the live graphics with pristine quality and native 32-bit alpha transparency.

---

## NDI SDK Licensing & Architectural Decision Gate

### License Analysis
- The NewTek / Vizrt NDI® SDK is proprietary software.
- The NDI Advanced SDK license allows developers to create NDI applications. However, redistribution of dynamic libraries (`libndi.so`, `Processing.NDI.Lib.x64.dll`) with open-source binaries requires a commercial agreement.
- Standard broadcast practice (adopted by OBS Studio `obs-ndi`, CasparCG, and VLC):
  1. **Dynamic Runtime Binding**: Church Presenter dynamically binds to the official NDI Runtime installed on the host system (Linux: `libndi.so.6`, `libndi.so.5`, `libndi.so`; Windows: `Processing.NDI.Lib.x64.dll`).
  2. **Zero Proprietary Bloatware Bundled**: No proprietary binaries are bundled into the git repository or installers.
  3. **Auto-Detection & Guidance**: If the user has not installed NDI Tools/Runtime, Church Presenter gracefully detects this, presents an informative status banner with a one-click download link to [https://ndi.video](https://ndi.video), and continues operating normally without crash.
  4. **Software Frame Emitter**: The video rendering pipeline captures rendered output frames with full 32-bit RGBA color and alpha channels, streaming frames to the NDI Sender service.

---

## Features & Capabilities

1. **32-Bit RGBA Native Alpha Transparency**:
   - Single-cable Ethernet connectivity delivering both Color and Alpha mask directly to OBS/vMix/TriCaster downstream keyers without needing dual HDMI/SDI cables or hardware converters.
2. **Multi-Source Routing**:
   - Source choices: Main Audience Screen, Lower-Third Livestream Overlay, Confidence Stage Monitor, or Alpha Key Matte.
3. **LAN Auto-Discovery**:
   - Publishes mDNS / NDI announcements so any NDI receiver on the church subnet (e.g. production laptop, overflow TV, control room) sees `"ChurchPresenter - Audience"` automatically.
4. **Resolution & Framerate Customization**:
   - Configurable for 1080p, 720p, or 4K at 60, 59.94, 30, 29.97, or 25 fps.
5. **Automation & Action Mapping**:
   - Actions: `toggle_ndi_output`, `start_ndi_output`, `stop_ndi_output`.
   - Macro Engine: `MacroStep::Ndi { command: "start" | "stop" | "toggle" }`.
6. **Live Production Controls**:
   - Header status badge and toggle button (`NDI ON`).
   - Production Integrations Modal Tab 8 ("NDI Video Output") with live video monitor, tally feedback (active receivers counter), stream renaming, and runtime diagnostic card.

---

## Acceptance Criteria

1. **SQLite Database Migration 34**:
   - Table `ndi_configs` storing `id`, `is_enabled`, `is_active`, `stream_name`, `output_source`, `resolution`, `frame_rate`, `include_alpha`, `ndi_group`, `created_at`, `updated_at`.
   - Integrated into application Backup & Restore.
2. **Backend Rust NDI Service (`src-tauri/src/ndi.rs`)**:
   - `NdiService` with dynamic runtime detection and frame transmission lifecycle.
   - Tauri commands: `get_ndi_config`, `update_ndi_config`, `toggle_ndi_output`, `get_ndi_status`, `send_ndi_frame`.
3. **Action Registry & Macros**:
   - Register `toggle_ndi_output`, `start_ndi_output`, `stop_ndi_output`.
   - `MacroStep::Ndi { command }` validation and execution.
4. **UI Integration**:
   - Tab 8 in `ProductionIntegrationsModal.tsx` ("NDI Output").
   - Header quick toggle button with live `NDI ON` indicator.
   - Macro editor support in `MacroManagerModal.tsx`.
5. **Testing & Verification**:
   - Rust unit tests for database migration and NDI service state.
   - Vitest test suite in `tests/ndi.test.tsx` verifying configuration, status detection, macro execution, and UI components.
