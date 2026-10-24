# Church Presenter — Offline Church Presentation Software

Church Presenter is a production-minded, offline-first native desktop application engineered for church audiovisual teams and volunteers to prepare, organize, and present worship lyrics, scripture passages, sermon slides, and announcements on an audience display or projector while retaining full control from the primary operator monitor.

Built with **Tauri 2**, **React 18**, **TypeScript**, **Vite**, and **SQLite (rusqlite)**.

---

## 📚 Technical Documentation Guides

- [**Building & Packaging Guide (`BUILDING.md`)**](BUILDING.md): Prerequisites, Linux (Arch/EndeavourOS/Ubuntu) and Windows native compilation, WiX/NSIS bundlers.
- [**Testing & QA Guide (`TESTING.md`)**](TESTING.md): Running Vitest frontend suites, Rust Cargo tests, and pre-service live checklist.
- [**Data Safety & Disaster Recovery (`BACKUP-RESTORE.md`)**](BACKUP-RESTORE.md): Automatic pre-migration backups, `PRAGMA integrity_check`, atomic transactions, and recovery procedures.
- [**Security & Network Hardening (`SECURITY.md`)**](SECURITY.md): Content Security Policy (CSP), Tauri capability permissions, PIN pairing handshake, and rate limiting.
- [**Release Notes v1.0.0 (`RELEASE-NOTES.md`)**](RELEASE-NOTES.md): Complete summary of all features and capabilities implemented across Phases 1 through 6.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               Church Presenter Architecture                                 │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                               │
       ┌───────────────────────┬───────────────┴───────────────┬────────────────────────┐
       ▼                       ▼                               ▼                        ▼
┌──────────────┐       ┌──────────────┐                 ┌──────────────┐         ┌──────────────┐
│   Operator   │       │   Audience   │                 │   Stage /    │         │  Livestream  │
│    Window    │       │ Output Window│                 │  Confidence  │         │  OBS Overlay │
│ - Full state │       │ - Main screen│                 │ - High-contr.│         │ - Transparent│
│ - Service    │       │ - Zero ctrls │                 │ - Large text │         │ - Lower-third│
│ - Media bar  │       │ - Motion BGs │                 │ - Next slide │         │ - Token URL  │
│ - Outputs mgr│       │ - Video sl.  │                 │ - Timers     │         │ - Lyrics only│
│ - Integrat.  │       │ - Audio plyr │                 │ - Private cue│         │ - Quick clear│
│ - Settings UI│       │ - Fallbacks  │                 │ - Clock      │         │ - Rot. token │
└──────┬───────┘       └──────▲───────┘                 └──────▲───────┘         └──────▲───────┘
       │                      │                                │                        │
       │                      └────────────────Tauri IPC Events────────────────────────┘
       │                                       "presentation:state-changed"
       │
       ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     Rust Backend Core                                       │
│  - SQLite Database Manager with WAL Mode & Foreign Keys (Migration 1 through 6)             │
│  - Zero Data Loss Engine (Automatic `.pre-migration` & `.pre-restore` backups, Pragma check)│
│  - Workspace Session Recovery (`workspace_state` auto-save on change & restore on boot)     │
│  - Independent Output System (`output_configs`, custom resolution & safe margins)           │
│  - Livestream & OBS Engine (Transparent Tauri Overlay & Tokenized HTTP `/overlay`)          │
│  - Local Micro HTTP Server (`tiny_http`, PIN pairing, mobile web `/remote`, rate limited)   │
│  - Hardware MIDI Subsystem (`midir`, device enumeration, live event monitor, note/CC map)   │
│  - Open Sound Control Subsystem (`rosc`, UDP receiver, allowlisted `/cp/*` commands)        │
│  - Unified Action Registry with 80ms Atomic Debounce Pipeline (`ActionDispatcher`)          │
│  - Drift-Free Epoch Timers & Multilingual Typography Engine                                 │
│  - Sanitized Backup & Restore Engine (Version 6.0.0, credential protection)                  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Phase 6: Production Readiness, Reliability, Packaging & Release Engineering

### 1. Database Safety & Zero-Data-Loss Migrations
- **Sequential Migration 6**: Seamlessly upgrades schema to create `workspace_state`, `app_diagnostics_log`, and performance indexes on `services`, `songs`, `media_assets`, and `song_sections`.
- **Automatic Pre-Migration Backups**: Automatically backs up `<db_path>.pre-migration.<timestamp>.bak` before running any schema migrations, preserving the 5 latest snapshots.
- **Automatic Pre-Restore Backups**: Automatically saves `<db_path>.pre-restore.<timestamp>.bak` prior to overwriting the database with an imported backup.
- **Live Database Integrity Checking**: Operators can execute `PRAGMA integrity_check;` on demand from the Settings modal to verify physical B-tree health.

### 2. Workspace Session Recovery & First Launch UX
- **State Auto-Save & Recovery**: Saves currently active presentation and selected playlist item to SQLite on every change. On next application launch, the operator's workspace is seamlessly restored exactly as left.
- **First Launch Welcome Banner**: When opening Church Presenter with an empty library, displays an onboarding banner guiding the user to create worship songs, plan a Sunday service, or explore themes.

### 3. Settings & Diagnostics UI (`SettingsModal`)
- **General & About**: Version display (`v1.0.0`), runtime target OS, offline guarantee badge, and library item counters.
- **Storage & Database**: Live SQLite database file path with copy button, media storage directory with copy button, database integrity check trigger, and backup metadata.
- **Diagnostic Event Viewer**: Filter diagnostic logs by level (`INFO`, `WARN`, `ERROR`) and component (`AudienceView`, `DbManager`, `RemoteServer`, `MIDIEngine`).
- **Safety & Reset**: Reset action mappings to factory defaults, launch full JSON backup export, and Zero Data Loss Guarantee review.

### 4. Performance & High-Capacity Presentation Optimization
- **Component Memoization (`React.memo`)**: Wrapped slide cards (`SlideCard`) and playlist rows (`PlaylistItemRow`) with memoized callbacks (`useCallback`). In presentations with 50+ or 100+ slides, advancing slides only re-renders the previous, active, and next slide cards, preventing any UI stutter or frame drops during live Sunday services.
- **Resource Teardown**: Explicit audio/video teardown on unmount in `AudienceView` to release GPU decoders and OS audio streams immediately.

### 5. Packaging & Security Hardening
- **Strict Content Security Policy (CSP)**: Disallows remote scripts, restricting execution to local bundled assets.
- **Tauri 2 Scoped Capabilities**: Scopes IPC permissions to `["main", "audience", "stage", "overlay"]`.
- **Multi-Resolution Windows Icon**: High-fidelity `.ico` bundle containing 256, 128, 64, 48, 32, and 16 pixel resolutions for seamless Windows taskbar and installer display.
- **Cross-Platform CI**: Automated GitHub Actions workflow testing Ubuntu and Windows builds on every commit.

---

### 1. Independent Output Architecture
- **Multi-Role Output Management**:
  - **Audience / Projector Output**: Full-screen borderless presentation with motion video background loops and rich typography.
  - **Stage / Confidence Display**: High-contrast, large-format lyrics, next slide preview, clock, drift-free timers, and private operator cues.
  - **Livestream Transparent Overlay**: Alpha-transparent lower-third or full-screen output for OBS Studio and broadcast switchers.
  - **Independent Presentation Output**: Secondary auxiliary output (overflow room, cry room, foyer TV) with custom monitor targeting, resolution, aspect ratio, safe margins, and optional theme overrides.
- **Dedicated Output Configuration UI (`OutputManagerModal`)**:
  - Hardware monitor auto-detection and destination assignment.
  - Granular control over resolution (Width × Height), aspect ratio (16:9, 4:3, 16:10, 21:9), and safe margins (0–20%).
  - Content source mapping (`live_slide`, `next_slide`, `lyrics_only`, `stage_layout`, `custom_theme`).

### 2. Livestream & OBS Studio Overlay Integration
- **Transparent Desktop Window & HTTP Browser Source**:
  - Native Tauri transparent borderless window (`alwaysOnTop: true`, `transparent: true`).
  - Embedded HTTP micro-server endpoint: `http://<lan-ip>:<port>/overlay?token=<auth-token>`.
  - Zero-chroma transparent alpha channel rendering compatible with OBS Studio Browser Source, vMix, and ATEM Mini switchers.
- **Dynamic Overlay Layout Modes**:
  - **Lower-Third**: Elegant broadcast bar positioned at bottom safe margin with section labels.
  - **Full-Screen**: Center-screen transparent lyrics overlay for musical preludes and worship climaxes.
  - **Picture-in-Picture (PIP)**: Compact corner overlay for pastor or speaker captions.
- **Operator Clear / Mute Control (`clear_overlay`)**:
  - Operator hotkey (`C` or `F8`) instantly hides lyric overlays from livestream while preserving motion video backgrounds and projector outputs.
  - Authenticated token rotation prevents unauthorized viewers on the local church Wi-Fi from scraping the overlay feed.

### 3. Local Mobile Remote Control
- **Offline Micro HTTP Server (`tiny_http`)**:
  - Runs on a configurable port (default 8088), completely operational without internet access.
  - Responsive standalone mobile web application served directly from `/remote`.
  - Displays currently live slide lyrics, next slide preview, service items, and quick action buttons.
- **Secure 6-Digit PIN Handshake & Operator Approval Queue**:
  - Phones and tablets connect to `http://<lan-ip>:<port>/remote` and enter the 6-digit PIN displayed on the operator screen.
  - New devices enter a **Pending Approval** queue; the operator must explicitly click **Approve** before the remote can issue commands.
  - Operator can revoke access or adjust granular device permissions at any time:
    - Slide navigation (`canNavigate`)
    - Projector blackout (`canBlackout`)
    - Go live triggers (`canTakeLive`)
    - Service countdown timers (`canControlTimer`)
  - **Security Protections**: Rate-limiting to 10 requests/second per client IP to prevent flood attacks; tokens are hashed in SQLite.

### 4. Hardware MIDI Controller Integration
- **Cross-Platform Native MIDI Input (`midir`)**:
  - Auto-enumerates connected USB MIDI keyboards, foot pedals, and Stream Decks (e.g. Behringer FCB1010, Korg nanoKEY, Elgato).
  - Real-time background listener with automatic reconnect and error diagnostics.
- **Live MIDI Event Monitor & Mapping Table**:
  - Interactive event monitor displays channel, message type (`Note On`, `Control Change`), note/CC number, velocity/value, and timestamp in real time.
  - Map any MIDI note or CC to presentation operations: `next_slide`, `previous_slide`, `toggle_blackout`, `toggle_clear`, `go_live`, `toggle_timer`.
  - Omnichannel (channel 0 = Any) or channel-specific (1–16) matching.

### 5. Open Sound Control (OSC) Network Integration
- **Low-Latency UDP Receiver (`rosc`)**:
  - Listens on configurable UDP port (default 8000) for control packets from digital audio mixers (Behringer X32, Allen & Heath dLive), QLab, or Bitfocus Companion.
- **Supported OSC Command Paths**:
  - `/cp/next` — Advance to next slide across playlist items
  - `/cp/prev` — Return to previous slide
  - `/cp/blackout` — Toggle presentation blackout
  - `/cp/clear` — Toggle livestream overlay lyrics clear
  - `/cp/live` — Take current preview item live on air
  - `/cp/slide/{index}` — Jump directly to a 1-indexed slide in the active item
  - `/cp/item/{index}` — Jump directly to a 1-indexed playlist item
  - `/cp/timer/toggle` — Start or pause the active service timer
- **Configurable Action Allowlist**: Operators can selectively enable or disable individual OSC commands for rehearsal security.

### 6. Unified Action Registry & Debounce Pipeline
- **Centralized Action Dispatcher (`ActionDispatcher`)**:
  - Routes keyboard strokes, mobile remote requests, MIDI events, and OSC packets through a single typed dispatch pipeline.
  - **80ms Atomic Debounce Guard**: Eliminates accidental double-triggers from noisy foot switches, bouncing relay buttons, or rapid touchscreen taps.
- **Factory Reset**: Operator can reset all action shortcuts and triggers back to default configurations with one click.

### 7. Operational Diagnostics & Subsystem Health Monitor
- **System Health Monitor (`DiagnosticsModal`)**:
  - Real-time status cards for Audience Window, Stage Window, Overlay Window, Remote Server, MIDI, and OSC.
  - Physical monitor hardware discovery and resolution probe.
  - Diagnostic error log with timestamped event notifications.
  - Copy Diagnostics JSON button for fast troubleshooting.

### 8. Database Migration 5 & Sanitized Backups
- **SQLite Migration 5**: Seamlessly creates tables `output_configs`, `overlay_configs`, `remote_devices`, `midi_mappings`, `osc_configs`, and `action_mappings`.
- **Credential Protection**: When exporting database backups (format version `5.0.0`), sensitive session tokens and authentication hashes in `remote_devices` are automatically sanitized to `"[SANITIZED]"` to prevent credential leaks.

---

## Phase 4: Media Engine, Motion Backgrounds, Timers and Stage Display

### 1. Reusable Media Subsystem & Engine
- **Unified Media Pipeline**: Centralized `MediaService` decoupling media loading, metadata extraction, validation, and error recovery from UI components.
- **Supported Formats**:
  - **Images**: JPEG (`.jpg`, `.jpeg`), PNG (`.png`), WebP (`.webp`).
  - **Videos**: MP4 (`.mp4`), WebM (`.webm`) with hardware-accelerated playback.
  - **Audio**: MP3 (`.mp3`), WAV (`.wav`), OGG (`.ogg`).
- **Safe Sandboxed Media Management**:
  - Automatically copies imported files into the app-managed `media/` directory (`app_data_dir/media/<uuid>.<ext>`).
  - Prevents path traversal vulnerabilities and protects against external file deletion or external path changes.
  - Stores rich metadata: file size, MIME type, `media_type` (`image` | `video` | `audio`), dimensions, and duration in seconds.

### 2. Media Library, Search & Deletion Safety Checks
- **Interactive Media Manager**:
  - Search by filename or original title.
  - Filter by media category pills: `All Media`, `Images`, `Videos`, `Audio`.
  - Grid card view with thumbnail preview, file size, and format badges.
  - Interactive preview pane with integrated HTML5 video and audio playback.
  - **Deletion Protection Warning**: Before deleting any media asset, queries `check_media_asset_usage` across all themes and presentation slides. If in use, alerts the operator with an explicit warning showing how many slides/themes will be affected.
  - **Instant Live Trigger**: `Present Live Now` button to test or cast media directly to the audience display.

### 3. Motion Backgrounds & Live Video Presentation
- **Motion Video Backgrounds behind Lyrics**:
  - Supports looping MP4/WebM videos behind worship song slides.
  - **Zero Restart / Zero Flicker Guarantee**: Lyric slide changes maintain uninterrupted background video playback without resetting the video element or losing position.
  - Dark scrim and color overlays ensure high contrast readability for multilingual and Tamil lyrics.
  - Preload and error fallbacks: missing or corrupted files gracefully fall back to solid theme backgrounds without crashing or rendering broken UI elements.
- **Standalone Video Slides**:
  - Dedicated presentation mode for sermon intro videos, testimonies, and announcement clips.
  - Flexible fit modes: `Cover`, `Contain`, and `Stretch`.

### 4. Operator Playback Controls (`MediaControlsBar`)
- **Strict Audience / Operator Separation**: Playback controls (play, pause, seek, volume, scrubber) **never appear on the audience display**.
- Operator gets instant live control via the top `MediaControlsBar`:
  - Play / Pause / Resume
  - Stop & Rewind to beginning
  - Time counter (`01:24 / 03:45`)
  - Volume slider and Mute toggle
  - Seamless loop toggle
  - Fit mode selector (`Cover`, `Contain`, `Stretch`)
  - Eject / dismiss button

### 5. Drift-Free Countdown & Elapsed Timers
- **Drift-Free Epoch Timestamp Architecture**:
  - Avoids interval counter drift by calculating time from absolute epoch timestamps (`Date.now() - start_time_epoch_ms`).
  - Guarantees sub-second accuracy across backgrounding, UI stalls, or multi-window IPC delays.
- **Service & Stage Timers**:
  - Pre-seeded with *Pre-Service Countdown* (5 minutes) and *Sermon Elapsed Timer*.
  - Configurable target duration and color-coded warning thresholds (turns amber when warning time remains, turns red and announces "TIME UP" when expired).
  - Operator controls: Start Live, Pause/Resume, Reset, and Clear from Stage.

### 6. Stage / Confidence Display Window (`window=stage`)
- **Dedicated Dual Window & Safe Preview**:
  - Native stage window targetable to a dedicated 3rd monitor or confidence display via `index.html?window=stage`.
  - Built-in safe preview modal allowing operators to verify confidence output directly on a single-monitor laptop.
- **Purpose-Built Worship & Preacher Layout**:
  - **Large High-Contrast Typography**: Ultra-legible from distance on the stage floor or pulpit.
  - **Current Slide (Live)**: Prominent lyrics or scripture passage currently displayed to the congregation.
  - **Next Slide (Preview)**: Anticipatory preview of upcoming lyrics so worship leaders and singers can lead smoothly.
  - **Real-Time Clock**: Live digital clock with seconds display.
  - **Synchronized Live Timer**: Prominent countdown/elapsed timer with warning status.
  - **Private Operator Notes / Cues**: Stage-exclusive production notes (e.g., *"Key of D"*, *"Pastor entering pulpit"*), strictly isolated from the audience display.
  - **Customizable Preferences**: Adjustable font sizes (`small`, `medium`, `large`, `xlarge`) and high-contrast toggle, persisted locally via `stage_configs` SQLite table.

### 7. Database Migration 4 & Backup v4.0.0
- **Version 4 Schema Migration**:
  - Extends `media_assets` with `media_type`, `duration_seconds`, `width`, `height`, and `thumbnail_path`.
  - Creates `timers` table for service and stage timer definitions.
  - Creates `stage_configs` table for stage display preferences.
- **Backup & Restore 4.0.0**: Fully exports and restores all presentations, slides, songs, themes, media assets, services, playlist items, timers, and stage configurations.

---

## Phase 3: Service Planning and Live Presentation Control

### 1. Service Management
- **Dedicated Services View**: Integrated as a primary tab in the top navigation bar (`Services`, `Presentations`, `Songs Library`, `Themes`).
- **Complete Service Planning Lifecycle**:
  - Stable UUID internal identifiers.
  - Service title, description, and optional service date/time (creating and presenting never requires a date).
  - Categorization: *Sunday Worship*, *Prayer Meeting*, *Youth Meeting*, *Special Event*, *Midweek Service*, or custom categories.
  - Private operator notes for production crew and AV team coordination.
  - Actions: Create, Edit Details, Duplicate Service, and Delete with safe confirmation.
  - Real-time search and category filtering in the services list sidebar.
  - Autosave status indicator with visual badges: **All changes saved**, **Saving...**, and **Unsaved changes**. Session persistence automatically recovers the active service across restarts.

### 2. Ordered Playlist & Item Types
Each service contains an ordered playlist supporting **8 distinct item types**:
1. **Worship Song**: Imported directly from the worship library with snapshot slide generation and theme selection.
2. **Scripture Passage**: Offline scripture reference query formatted into verses.
3. **Sermon Presentation**: Multi-slide sermon outlines with headers and points.
4. **Announcement**: Event and church announcements.
5. **General Text Slides**: Freeform text cards with customizable typography.
6. **Image Slide**: Local picture presentations with path and aspect-ratio preview.
7. **Section Divider**: Clean visual headings separating service segments (e.g., *Praise & Worship*, *Sermon*, *Offering*).
8. **Countdown Timer Placeholder**: Scheduled timers for pre-service countdowns.

Each item features:
- Unique ID and playlist position.
- Visual icon and color badge matching its item type.
- Drag-and-drop reordering with accessible Up/Down arrow buttons.
- Distinct visual badges for **SELECTED** (operator preview), **LIVE** (red badge and glow), and **NEXT** (amber border).

### 3. Non-Destructive Snapshot Isolation
- Adding a song or scripture passage to a service plan creates independent snapshot slides in the `service_item_slides` database table.
- **Library Safety**: Editing, updating, or deleting a song in the worship library does **not** corrupt or modify existing service presentations.
- **Service Independence**: Volunteers can customize lyrics, reorder slides, or adjust notes for a specific service without altering the master song in the library.

### 4. Offline Scripture & Passage Lookup
- **Zero Internet Requirement**: Bundles offline scripture verses for English (**KJV**, **WEB**) and **Tamil** translations directly in SQLite (`bible_verses` table).
- **Flexible Reference Parser**: Lookup passages such as `John 3:16-17`, `Psalms 23:1-6`, `Romans 8:38-39`, or `யோவான் 3:16-17`.
- **Verse Grouping**: Split scripture into 1 verse/slide, 2 verses/slide, or group entire passages on one slide.
- **Safe Layout**: Real-time validation, error reporting for invalid chapters/verses, and instant 16:9 theme preview before adding to the service playlist.

### 5. Sermon & Announcement Editor with Safe Text Warnings
- **Multi-Slide Deck Editor**: Add, duplicate, reorder, and delete slides within a single sermon or announcement item.
- **Quick Split Helper**: Paste outline text or paragraphs separated by double-newlines or `---` to automatically generate slides.
- **Safe Text Length Warnings**: Live character counter displaying amber warnings when text exceeds **300 characters** or **8 lines**, preventing silent overflow or unreadable text on lower-resolution projectors.

### 6. Deliberate Live Presentation & Boundary Navigation
- **Deliberate Action Required**: Selecting or previewing an item or slide updates the operator inspection preview without pushing to the audience screen. Content only goes live upon pressing **Take Live** or double-clicking.
- **Seamless Playlist Boundary Navigation**:
  - Advancing (`Next Slide`) at the last slide of an item automatically transitions into the first slide of the subsequent playlist item.
  - Retreating (`Previous Slide`) at the first slide of an item automatically transitions into the last slide of the preceding item.
  - Service boundary stopping: Advancing past the end or retreating before the beginning halts predictably without looping.
- **Live State Controls**: Instant blackout toggle (`B`), clear live slide (`Clear Live`), and toggle audience window.

---

## Phase 2: Worship Library and Lyrics Management

### 1. Song Library
- **Dedicated Songs View**: Seamlessly accessible via the top view switcher tabs: `Presentations`, `Songs Library`, and `Themes`.
- **Rich Worship Metadata**:
  - Stable UUID internal identifiers.
  - Primary Song Title (English, Tamil Unicode, or any language).
  - Optional Alternate Title (e.g. English title for a Tamil hymn).
  - Language indicator (`Tamil`, `English`, `Bilingual`, etc.).
  - Author, Composer, Copyright, and CCLI Number attribution.
  - Musical Key (e.g. `D Major`, `G`) and Tempo in BPM.
  - Categories (`Worship`, `Praise`, `Hymn`, `Offertory`, `Communion`) and searchable tags.
  - Creation and modification timestamps.
- **Fast Local Search & Filters**:
  - Instant client and SQL search across song titles, alternate titles, lyric text, tags, author, and category.
  - Quick language filter chips (`All`, `Tamil`, `English`).
  - Sorting by Title (A-Z), Recently Modified, or Language.
- **Safe Song Operations**: Create, edit metadata, duplicate (creates an isolated clone with all sections), and delete with safety confirmation.

### 2. Lyrics Editor & Section Organization
- **Structured Song Sections**:
  - Support for 8 canonical section types: `Verse`, `Chorus`, `Bridge`, `Pre-Chorus`, `Intro`, `Outro`, `Refrain`, `Custom`.
  - Color-coded badges for visual clarity (e.g., amber for Chorus, blue for Verse, purple for Bridge).
  - Section labels (e.g., `Verse 1`, `Chorus`, `Bridge 1`).
  - Multi-line lyric textarea with live line count indicator.
  - Operator / band notes field (e.g. *"Sing twice"*, *"Acoustic guitar only"*).
- **Accessible Reordering**:
  - Drag-and-drop reordering with visual drag grip.
  - Accessible `Move Up` and `Move Down` button controls for keyboard/laptop trackpad users.
- **Section Duplication**: Instantly copy verses or choruses.
- **Atomic Persistence**: All sections and ordering are committed atomically within a single database transaction.

### 3. Lyric-to-Slide Generation & Grouping Rules
- **Non-Destructive Slide Snapshot Guarantee**:
  - When slides are generated from a song into a service presentation, slides store an **isolated snapshot** of lyrics, titles, and theme styling.
  - Later modifying or deleting a song in the library will **never** alter or corrupt an active presentation or the live audience display.
- **Flexible Splitting & Grouping Rules**:
  - **Natural Stanzas (Blank lines)**: Automatically splits lyrics by blank lines into stanzas (recommended default).
  - **Fixed Lines per Slide**: Allows grouping by 1, 2, 3, or 4 lines per slide.
  - **Custom Delimiter**: Supports explicit slide splits using delimiters such as `---`.
- **Section Selector**: Checkbox selection allowing operators to generate slides for the entire song or pick specific sections (e.g. Verses 1-2 and Chorus).
- **Target Presentation Destination**:
  - Append slides to an existing service presentation.
  - Or generate a brand-new presentation titled after the song.
- **Live 16:9 Presentation Preview**: Interactive preview carousel displaying exact slide rendering, line breaks, typography, and theme styling before generating.

### 4. Tamil and Multilingual Unicode Support
- **100% UTF-8 Throughout**: Database schema, Rust backend, Tauri IPC, and React DOM are strictly UTF-8 compliant.
- **Tamil Unicode Combining Characters**: Proper handling of Tamil vowel signs (உயிர்மெய் எழுத்துக்கள், கொம்பு, புள்ளி) without clipping or unsafe character truncation.
- **Preserved Formatting**: Line breaks, whitespace, and punctuation are preserved across imports, storage, and projections.
- **Cross-Platform Font Stack**:
  ```css
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, 
    "Noto Sans Tamil", "Latha", "Mukta Malar", "Tamil Sangam MN", "Baamini", sans-serif;
  ```
  - **Linux**: Resolves to `Noto Sans Tamil` (SIL OFL) or system font.
  - **Windows**: Uses Windows native `Latha` or `Nirmala UI` OpenType rendering.
  - **macOS**: Uses `Tamil Sangam MN`.

### 5. Reusable Presentation Themes
- **Visual Theme Designer**:
  - Customize background color, optional background image, font size (`small`, `medium`, `large`, `xlarge`), font weight, text color, horizontal alignment (`left`, `center`, `right`), vertical alignment (`top`, `center`, `bottom`), line spacing (1.1 to 2.0), and text margins.
  - **High-Contrast Text Shadows**: Essential for readable projection over light or variable backgrounds.
  - **Dark Overlay Scrim**: Semi-transparent dark overlay (e.g., `rgba(0,0,0,0.4)`) ensures lyrics remain high-contrast on any video/photo background.
- **Built-in Theme Protection**:
  - Ships with 4 pre-loaded themes: `Default Dark`, `Tamil Worship Classical`, `Modern Scripture`, `Deep Ocean Blue`.
  - Built-in themes are protected by the Rust backend and cannot be deleted or corrupted. Operators can duplicate them to create custom variations.
- **16:9 Responsive Preview**: Live preview with sample Tamil, English, and bilingual worship lyrics.

### 6. Local Media Backgrounds Library
- Manage local background images (JPEG, PNG, WebP) copied directly into the app-managed `media/` directory.
- Database tracking with thumbnail preview, file dimensions, file size, and deletion cleanup.
- Directly assign background assets to presentation themes.

### 7. JSON Song Interchange & Duplicate Resolution
- **Documented Interchange Format (`SongExportData`)**: Standard JSON schema containing version, export timestamp, app metadata, songs with ordered sections, and optional presentation themes.
- **Single & Batch Export**: Export individual songs or the entire church library.
- **Conflict Resolution Strategies on Import**:
  - `skip`: Preserves existing songs without modifying them.
  - `copy`: Imports duplicates as new records with `(Imported)` suffix.
  - `update`: Overwrites existing records and updates song sections.
- **Validation**: Strict validation prevents corrupt or incomplete files from entering the library.

---

## Phase 1 Baseline Features (Preserved)

- **Operator Workspace**: 3-column layout with Library Panel, Slide Grid, and Live/Next Previews.
- **Dual Window Support**: Native Tauri borderless window with multi-monitor targeting, fullscreen mode, and blackout toggle (`B`).
- **Data Protection**: Full SQLite database backup and restore (`BackupData` schema version 2.0.0).
- **Keyboard Navigation**: `Spacebar`, `Right Arrow`, `Left Arrow`, `Page Down`, `Page Up`, `B` (blackout), and `Escape` (dismiss modal).

---

## Development & Build Commands

### 1. Install Dependencies
```bash
npm install
```

### 2. Run All Automated Tests
```bash
# Frontend Vitest test suite (17 test files, 103 passing tests)
npm test -- --run

# Rust backend unit and integration test suite (13 passing tests)
cargo test --manifest-path src-tauri/Cargo.toml
```

### 3. Build Frontend
```bash
npm run build
```

### 4. Build Desktop Binary
```bash
# Debug desktop binary
cargo build --manifest-path src-tauri/Cargo.toml

# Production release package (Tauri bundle)
npm run tauri build
```

---

## Keyboard Shortcuts

| Shortcut | Action | Description |
| :--- | :--- | :--- |
| **Spacebar** / **Right Arrow** / **Down Arrow** / **Page Down** | Next Slide | Advance live presentation to next slide across playlist items |
| **Left Arrow** / **Up Arrow** / **Page Up** | Previous Slide | Return live presentation to preceding slide across playlist items |
| **B** | Black Screen Toggle | Instantly black out projector without changing slide index |
| **C** / **F8** | Clear Overlay | Instantly clear livestream lyric overlay while preserving video background |
| **F5** | Take Live | Toggle active slide or item live on air |
| **Click on Slide Card** | Preview Slide | Preview slide in operator monitor without disrupting audience |
| **Double-Click on Slide Card** | Take Live | Instantly present the clicked slide to audience output |
| **Escape** | Dismiss Dialog | Close any active modal dialog or return to presentations view |

> **Typing Safeguard**: Keyboard shortcuts are automatically disabled whenever a text input, textarea, or song editor field is active.
