# Phase 11.7: Audio Routing (Multi-Zone & Hardware Output Targeting)

## Overview & Requirements
In modern church worship production, presentation audio (background instrumental pads, video soundtracks, countdown click tracks, spoken word bumpers, and choir guide cues) needs distinct routing paths:
1. **Front-of-House (Main PA / Sanctuary)**: Full-fidelity audience mix for videos, pads, and walk-in music.
2. **Stage Confidence & Musician In-Ear Monitors (IEMs / Cue)**: Pre-listen cueing, metronome click tracks, countdown alerts, and guide tracks heard exclusively by pastors/musicians without bleeding into the sanctuary sound system.
3. **Livestream / Broadcast Feed**: Isolated stereo line out to streaming encoders (OBS / ATEM / USB capture card).

---

## Technical Architecture

### 1. Web Audio & W3C `AudioDestinationNode` / `setSinkId`
HTML5 Audio and Video elements support target hardware device routing via the `HTMLMediaElement.setSinkId(sinkId)` API (supported natively across modern browser engines and Tauri WebViews).
- `applySinkId(element, deviceId)`: Binds any `<audio>` or `<video>` player element to the specified hardware device sink.
- Device discovery via `navigator.mediaDevices.enumerateDevices()` filtered to `kind === 'audiooutput'`.
- Backend hardware enumeration via `/proc/asound` on Linux or fallback to standard system audio outputs.

### 2. Global Audio Routing Configuration
Stored in SQLite table `audio_routing_configs`:
- `id`: Primary key (`default-audio`).
- `main_device_id`: Device identifier for sanctuary audience playback (default `'default'`).
- `main_device_name`: Human-readable name (e.g. "Default Audio - Speakers / Main PA", "Behringer X32 USB").
- `cue_device_id`: Device identifier for backstage monitor / headphone pre-listen (e.g. "Headphones", "USB Audio Interface").
- `cue_device_name`: Human-readable name.
- `master_volume`: 0.0 to 1.0 master gain.
- `cue_volume`: 0.0 to 1.0 cue monitor gain.
- `is_muted`: Boolean master mute state.

### 3. Per-Media Asset Override
Each `MediaAsset` in the media library includes an optional `audio_output_device_id` field:
- When null/empty: Follows the global `main_device_id`.
- When set to `'cue'`: Routed to the monitor/cue device (click tracks, metronomes, IEM bumpers).
- When set to a specific hardware sink ID: Directly routed to that hardware interface.

### 4. Macro & Unified Action Registry Integration
- Action mappings:
  - `toggle_audio_mute`: Toggle master mute on/off.
  - `volume_up`: Increase master volume by 5%.
  - `volume_down`: Decrease master volume by 5%.
- Macro engine:
  - `MacroStep::Audio { command, volume, device_id }` with commands:
    - `"mute"`, `"unmute"`, `"toggle_mute"`, `"set_volume"`, `"set_device"`.

### 5. UI Integration
- **Production Integrations Modal (Tab 9: Audio Routing)**:
  - Main Sanctuary Output selector.
  - Stage IEM / Cue Monitor selector.
  - Master volume slider and live mute toggle button.
  - Cue volume slider.
  - Hardware device inventory list with channels, sample rates, default badges, and interactive "Play Test Chime" button (`data-testid="btn-test-chime"`).
- **Media Inspector Modal / Media Library**:
  - Target Audio Output selector per audio/video asset.
- **Macro Manager Modal**:
  - Audio control step editor.
