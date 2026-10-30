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

## 10.2 Stream Deck and other control
- Ship a Stream Deck profile or documented OSC presets using the existing OSC paths.
- Add DMX output (lighting scenes on slide change) behind a setting, off by default.
- Timecode follow is optional; defer unless requested.

## 10.3 Media Inspector
- Per-media settings: crop, rotation, volume, trim in/out, loop. Stored with the media asset and applied in `AudienceView`.
- Thumbnails for video in the media library.

## 10.4 Auto-updater
- Tauri updater plugin with a signed update feed; check on start, never install during a live service.

## 10.5 Remote hardening
From `plan.md` gap 16: remote and OSC listeners are plain HTTP and password-less OSC.
- TLS for the phone remote (self-signed with a pairing-time fingerprint check).
- Optional OSC shared secret.

## Risks
- Planning Center API terms and rate limits; read them before building.
- Updater needs a signing key and hosting decision.
