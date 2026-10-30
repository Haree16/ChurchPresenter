# Phase 11.3: Live Video Input (Capture Devices & IMAG)

## Goal
Integrate live video capture devices (UVC webcams, HDMI capture cards, Cam Link, and virtual cameras) into Church Presenter, allowing camera feeds to appear as standalone slides, IMAG background layers behind lyrics and scripture, or Picture-in-Picture (PiP) overlays.

---

## Technical Approach & Capture Architecture
- **Cross-Platform Device Access**:
  - WebViews on both Linux (WebKitGTK) and Windows (WebView2) natively support `navigator.mediaDevices.getUserMedia` and `navigator.mediaDevices.enumerateDevices` with hardware acceleration.
  - Native Rust backend provides SQLite persistence (Migration 32), device enumeration fallback, permission verification, and action dispatching.
- **Operating Modes**:
  1. **IMAG Background Layer**: Camera feed streams live beneath lyrics, verses, and presentation text, with optional scrim/overlay tint.
  2. **Standalone Camera Slide**: Full-screen camera view when a service item is a camera feed (e.g. sermon message, baptism, announcements).
  3. **Picture-in-Picture (PiP)**: Camera feed rendered in a configurable corner (e.g. Sign Language / ASL interpreter).
- **Macro & Action Dispatch**:
  - `MacroStep::Camera { command, device_id }` allowing automated camera toggling and switching from macros.
  - Action Registry actions: `toggle_live_camera`, `switch_camera_device`.

---

## Acceptance Criteria
1. **SQLite Database Migration 32**:
   - Table `live_video_configs` for camera device ID, resolution, frame rate, IMAG background mode, PiP mode, and opacity.
   - Action mappings in `action_mappings`.
2. **Backend Rust Models & Commands**:
   - `LiveVideoConfig`, `LiveVideoStatus`, `CameraDeviceInfo`.
   - Commands: `get_live_video_config`, `update_live_video_config`, `get_live_video_status`, `list_camera_devices`.
3. **Live Video Streaming Service & Audience Display**:
   - `src/services/liveVideoService.ts` managing `MediaStream` lifecycles, device enumeration, and error handling.
   - `AudienceView.tsx` rendering camera stream behind lyrics in IMAG mode or in PiP mode.
4. **Operator Controls & Production Integrations UI**:
   - "Live Video" tab in `ProductionIntegrationsModal.tsx` with live preview monitor, device picker, resolution/FPS settings, and PiP controls.
   - Header camera toggle indicator (`CAM` badge).
   - Macro editor support (`MacroManagerModal.tsx`).
5. **Testing & Verification**:
   - Backend unit tests for SQLite migration, models, and commands.
   - Frontend Vitest tests in `tests/live-video.test.tsx` verifying device enumeration, IMAG rendering, macro execution, and UI controls.
