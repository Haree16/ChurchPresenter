# Church Presenter v1.0.0 — Release Notes

**Release Date**: October 2026  
**Build Target**: Linux (Arch Linux / EndeavourOS / Ubuntu / Debian) & Windows (10 / 11)  
**Database Schema**: Version 6.0.0 (SQLite WAL Mode)

---

## Executive Summary

Church Presenter v1.0.0 represents the complete, production-ready release of our offline-first church presentation and live-production desktop software. Engineered specifically for church AV teams, worship leaders, and volunteers, Church Presenter combines professional multi-window projection capabilities with zero-cloud reliability, deep hardware integration, and comprehensive data safety guarantees.

---

## Key Capabilities by Subsystem

### 1. Presentation & Projection Engine (Phases 1 & 4)
- **Multi-Window Desktop Architecture**: Decoupled Operator control window and borderless audience display with native multi-monitor targeting.
- **Uninterrupted Projection**: Seamless slide transitions, live 16:9 previews, blackout hotkey (`B`), and automatic graceful fallback if a background media asset fails.
- **Motion Video Backgrounds**: Loop smooth MP4/WebM video backgrounds continuously behind worship lyrics without stuttering or video resets across slide changes.
- **Standalone Media Playback**: Fullscreen video playback and audio playback with transport controls (Play, Pause, Seek, Loop, Volume).

### 2. Worship Library & Typography (Phase 2)
- **Multi-Stanza Song Management**: Stanza grouping (Verse 1, Chorus, Bridge, Tag), search, and language categorization.
- **Multilingual & Tamil Unicode Support**: Complete UTF-8 preservation for complex Tamil vowel combining characters (உயிர்மெய் எழுத்துக்கள்) without clipping or font corruption.
- **Theme Designer**: Visual typography configuration, high-contrast text drop shadows, and dark background scrims for maximum legibility.
- **Built-in System Themes**: Pre-configured classical and modern themes protected against accidental deletion.
- **Song Interchange**: Import and export songs via OpenSong and JSON interchange schemas with conflict resolution modes (`skip`, `copy`, `update`).

### 3. Service Planning & Scripture (Phase 3)
- **Service Order of Worship**: Construct Sunday service playlists mixing songs, scripture passages, sermon outlines, announcements, countdown timers, and section dividers.
- **Offline Scripture Engine**: Instant Bible verse lookup and presentation slide generation without an internet connection.
- **Preview vs. Live Separation**: Operator can audition, edit, and inspect upcoming slides without affecting the live projector feed.

### 4. Stage & Confidence Display (Phase 4)
- **Confidence Monitor Output**: High-contrast, large-format stage output showing current slide lyrics, next slide preview, real-time clock, and private operator stage messages.
- **Drift-Free Epoch Timers**: Accurate countdown and elapsed timers calculated from Unix epoch timestamps, featuring amber warning thresholds and red expiration states.

### 5. Advanced Production & Hardware Integrations (Phase 5)
- **Independent Outputs**: Configure distinct resolutions, aspect ratios (16:9, 4:3, 21:9), safe margins, and layout modes for auxiliary screens.
- **Livestream & OBS Studio Overlay**: Alpha-transparent desktop window and tokenized HTTP browser source (`/overlay?token=...`) supporting lower-third and full-screen layouts.
- **Quick Clear Hotkey (`C` / `F8`)**: Instantly clear lyric overlays from the livestream broadcast while preserving the projector output.
- **Local Mobile Remote Control**: Embedded micro HTTP server (`tiny_http`) serving a responsive mobile web controller (`/remote`) protected by a 6-digit PIN handshake, operator approval queue, and rate limiting.
- **Hardware MIDI Controllers**: Plug-and-play USB MIDI controller mapping with real-time event monitoring.
- **Open Sound Control (OSC)**: Low-latency UDP receiver accepting commands from digital audio consoles (Behringer X32, Allen & Heath) and Bitfocus Companion.
- **Unified Action Dispatcher**: Centralized command pipeline with an 80ms atomic debounce window preventing accidental double-triggers.

### 6. Production Readiness, Reliability & Safety (Phase 6)
- **Zero Data Loss Upgrades**: Versioned sequential SQLite migrations (1 through 6) with automatic pre-migration and pre-restore snapshots (`.bak`).
- **Live Database Integrity Checking**: Run `PRAGMA integrity_check;` on demand directly from the Settings interface.
- **Workspace State Auto-Recovery**: Automatically saves the active presentation and service selection on exit, seamlessly restoring them on the next launch.
- **Strict Content Security Policy (CSP)**: Eliminates remote code execution risks and restricts IPC invocations strictly to application windows.
- **Component Memoization**: `React.memo` optimizations in `SlideGrid` and `PlaylistPanel` to ensure silky-smooth navigation even in 100+ slide presentations.
- **Settings & Diagnostic Viewer**: Dedicated settings modal providing application statistics, storage paths, SQLite verification, diagnostic log filter, and factory reset shortcuts.
- **Multi-Resolution Packaging**: Windows ICO asset bundling 256, 128, 64, 48, 32, and 16 px resolutions for pristine desktop and installer rendering.
- **Cross-Platform Continuous Integration**: GitHub Actions CI workflow verifying both Linux and Windows builds on every commit.

---

## Upgrade & Migration Notes

- Upgrading from previous development builds is 100% automated. On initial boot, Migration 6 creates the `workspace_state` and `app_diagnostics_log` tables while preserving all existing songs, services, and media.
- An automatic pre-migration backup (`church_presenter.db.pre-migration.<timestamp>.bak`) is saved before applying schema updates.
