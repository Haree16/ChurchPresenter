# Phase 10: Integrations and hardware control

Goal: connect to the tools churches already use. Effort: about 6 to 8 weeks. Depends on Phase 7.4 (macros over OSC and MIDI).

Done when: a Planning Center plan imports into a service and a Stream Deck page runs a service.

## 10.1 Planning Center [COMPLETED]
- **Personal Access Token & Credentials Security**:
  - Direct connection to Planning Center Services v2 API (`https://api.planningcenteronline.com/services/v2`) using Personal Access Tokens (Application ID + Secret) over HTTP Basic Auth.
  - Stored in local SQLite `planning_center_config` table (Migration 26).
  - Explicitly stripped and excluded from database backups (`export_backup`), guaranteeing credentials never leak when database backups are shared or restored.
  - Application ID is masked in UI displays (`c037••••a8b1`).
- **Plan Browsing & Order of Service Preview**:
  - Lists Planning Center Service Types (`GET /services/v2/service_types?order=name`).
  - Lists plans with dates, series titles, and sort dates.
  - Fetches plan items with included songs (`GET /services/v2/service_types/{st}/plans/{p}/items?include=song`).
  - Displays full order of service with item sequences, types (`[Song]`, `[Header]`, `[Item]`), durations, and notes.
- **Library Song Matching & Service Creation**:
  - Automatically matches songs against the local Church Presenter song library:
    - 1st priority: Exact CCLI song number match (`songs.ccli_number`).
    - 2nd priority: Case-insensitive title match (`songs.title`).
  - Matched songs are attached to the service with their default arrangement and slides intact, enabling automatic CCLI tracking.
  - Unmatched songs are created as placeholder divider items with CCLI number, author, and description notes for easy lyric pasting.
  - Header items are created as divider lines in the service order.
- **UI & Modal Integration**:
  - Added `PlanningCenterModal.tsx` accessible directly from the Services planner header via "PCO" button.
  - Includes connection status badge, organization name display, disconnect flow, and "Open Service" button upon successful import.
- **Verification**: Verified with 295 passing backend Rust unit tests (`cargo test`) and 500 passing Vitest unit tests (`npm test`), including dedicated tests in `tests/planning-center.test.tsx`.

## 10.2 Stream Deck and other control [COMPLETED]
- **Stream Deck 15-Key Interactive Profile & Export**:
  - Pre-packaged 15-key (3×5 grid) layout mapping standard church production workflows:
    - Navigation: Prev Slide, Next Slide, Prev Item, Next Item, Toggle Live.
    - Master Clear & Overlays: Blackout, Logo, Clear Text, Clear Props, Clear All.
    - Media, Looks & Automation: Play/Pause Media, Lower Third Prop, Stage Message, Look 1 Preset, DMX Lighting Cue.
  - Interactive Visual Surface in UI with color-coded keycaps, real-time Action / OSC endpoint inspector.
  - Direct download of Stream Deck Profile JSON (`ChurchPresenter-StreamDeck-Profile-port{port}.json`).
  - Bitfocus Companion quick setup guide with copy-to-clipboard functionality.
- **DMX512 Lighting Control (Art-Net)**:
  - Standard Art-Net (ArtDmx over UDP on port 6454, OpCode `0x5000`, Version 14) sender module (`dmx.rs`).
  - Disabled by default (`is_enabled: 0`) per requirement; safely persists configuration in SQLite `dmx_configs` table (Migration 27).
  - Target IP (unicast or subnet broadcast `255.255.255.255`), Target Port (6454), Sub-Net / Universe selector (0-32767).
  - Slide Cue Following: automatically triggers DMX lighting cues on presentation slide changes via dedicated cue channel (1-512).
  - Live Fixture Test Panel: channel selector (1-512), 0-255 intensity slider, blackout (0), full flash (255), and live cue dispatch without modifying saved state.
  - Full backup & restore inclusion: DMX settings export and restore cleanly in system backups.
- **Macro DMX Step**:
  - Added `MacroStep::Dmx { universe, channel, value }` step variant with validation and Art-Net packet dispatch during macro execution.
- **Timecode Follow & MTC Guidance**:
  - Documented MTC (MIDI Time Code) and OSC SMPTE timecode integration (`/timecode`, `/timecode/seconds`) for syncing with external DAWs (Ableton Live, Logic Pro, Pro Tools).
- **UI & Modal Integration**:
  - `StreamDeckDmxModal.tsx` wired into header via "Hardware" button and operator view with keyboard shortcut escape dismissal.
- **Verification**: Verified with 298 passing backend Rust unit tests and 508 passing Vitest unit tests (`tests/streamdeck-dmx.test.tsx`).

## 10.3 Media Inspector [COMPLETED]
- **Per-Media Inspector Settings & Persistence**:
  - Extended SQLite `media_assets` table schema via Migration 28:
    - Inset Crop: `crop_top`, `crop_bottom`, `crop_left`, `crop_right` (percentage 0-45%).
    - Rotation: `rotation` (0°, 90°, 180°, 270°).
    - Audio Level: `volume` (0.0 to 1.0) with instant mute/unmute.
    - Playback Timing: `trim_in` (seconds), `trim_out` (seconds or nullable), `is_looping` (boolean).
    - Custom Video Thumbnail: `thumbnail_path` (storing file path or data URI).
  - Clean backup & restore integration: all inspector metadata is included in `export_backup` and restored in `import_backup`.
- **Media Inspector UI Component**:
  - Created `MediaInspector.tsx` integrated directly into the right preview pane of `MediaLibraryModal.tsx` via Details / Inspector tab toggle.
  - Interactive crop sliders with percentage indicators and "Clear" quick button.
  - 4-way rotation selector (0°, 90°, 180°, 270°) with immediate live visual rotation in the preview container.
  - Audio volume slider with Mute/Unmute quick toggle.
  - Video scrub bar with "Here" (set in/out point from current player frame) and loop playback checkbox.
  - "Capture Current Frame as Thumbnail" button that snaps the current video frame to an offscreen `<canvas>` and saves as `thumbnailPath`.
  - "Reset All" button to restore asset to raw defaults.
- **Media Library Grid Video Thumbnails**:
  - `MediaLibraryModal.tsx` renders custom video thumbnail frames (`<img>`) in the library grid cards when `thumbnailPath` is present.
- **AudienceView Live Application**:
  - Loads asset settings dynamically and listens to `media:asset-updated` Tauri events.
  - Applies CSS `clipPath: inset(top% right% bottom% left%)` and `transform: rotate(deg)`.
  - Enforces `volume`, `trimIn`, `trimOut` boundary loops, and `isLooping` state on both standalone fullscreen presentations and background motion videos.
- **Verification**: Verified with 300 passing backend Rust unit tests and 515 passing Vitest unit tests (`tests/media-inspector.test.tsx`).

## 10.4 Auto-updater
- Tauri updater plugin with a signed update feed; check on start, never install during a live service.

## 10.5 Remote hardening
From `plan.md` gap 16: remote and OSC listeners are plain HTTP and password-less OSC.
- TLS for the phone remote (self-signed with a pairing-time fingerprint check).
- Optional OSC shared secret.

## Risks
- Planning Center API terms and rate limits; read them before building.
- Updater needs a signing key and hosting decision.
