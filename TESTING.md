# Testing & Quality Assurance Guide

This document describes the testing architecture, test suites, execution commands, and verification protocols for **Church Presenter**.

---

## 1. Testing Philosophy

Because Church Presenter operates in live Sunday worship environments, presentation stability is the highest priority:
1. **Uninterrupted Projector Output**: No crash dialog, unhandled exception, or corrupt asset should ever disrupt the audience screen.
2. **Zero Data Loss**: Migrations and software upgrades must never silently drop or overwrite songs, services, or playlist order.
3. **No Fake Stubs**: Integrations (MIDI, OSC, Mobile Remote, Media) are tested against real data structures and verified protocols.

---

## 2. Test Execution Commands

### Run Complete Test Suite
```bash
# 1. Frontend Test Suite (17 test files, 103 passing tests)
npm test -- --run

# 2. Rust Backend Test Suite (13 passing tests)
cargo test --manifest-path src-tauri/Cargo.toml

# 3. TypeScript Typecheck and Vite Production Build
npm run build
```

---

## 3. Rust Backend Test Suite

Located in `src-tauri/src/db.rs`, backend unit tests run in an in-memory SQLite environment with WAL mode and foreign key constraints enabled.

| Test Function | Phase | Verified Capability |
| :--- | :--- | :--- |
| `test_migrations_and_initial_seeds` | Phase 1 | Sequential execution of Migrations 1 through 6, schema integrity, default themes |
| `test_slide_generation_from_song` | Phase 1 | Parsing song sections into ordered presentation slides with title metadata |
| `test_slide_reordering_and_delete` | Phase 1 | Drag-and-drop slide index reordering and atomic slide deletion |
| `test_backup_and_restore` | Phase 1 | Exporting and importing full database JSON snapshots |
| `test_song_crud_and_sections` | Phase 2 | Creating, updating, and querying worship songs with multi-stanza verses |
| `test_song_snapshot_isolation_from_library` | Phase 2 | Editing a library song does not corrupt already-generated presentation slides |
| `test_song_import_and_export_modes` | Phase 2 | JSON interchange conflict strategies (`skip`, `copy`, `update`) |
| `test_theme_crud_and_built_in_protection` | Phase 2 | Preventing deletion or modification of built-in system themes |
| `test_service_crud_and_playlist_operations` | Phase 3 | Service playlist items CRUD, reordering, and item type metadata |
| `test_bible_passage_lookup_and_offline_query`| Phase 3 | Offline verse lookup, chapter queries, and multi-verse slide generation |
| `test_phase4_media_timers_and_stage` | Phase 4 | Media assets tracking, stage configuration, drift-free epoch countdown timers |
| `test_phase5_advanced_production` | Phase 5 | Independent output configs, overlay configs, mobile remote tokens, MIDI/OSC |
| `test_phase6_database_safety_and_workspace_state` | Phase 6 | Pre-migration automatic backups, `PRAGMA integrity_check`, workspace recovery |

---

## 4. Frontend Vitest Test Suites

Located in `tests/`, covering all user interfaces, presentation state machines, and keyboard navigation.

| Test File | Tests | Focus Area |
| :--- | :--- | :--- |
| `backup-restore.test.ts` | 3 | Full database export/import and schema verification |
| `database-safety-and-migrations.test.ts` | 5 | Workspace state persistence, integrity check IPC, and diagnostic logging |
| `display-manager.test.ts` | 3 | Multi-monitor enumeration and audience window creation |
| `independent-outputs.test.ts` | 7 | Secondary outputs, custom resolutions, safe margins, and layout modes |
| `keyboard-navigation.test.tsx` | 5 | Live presentation hotkeys (Spacebar, Arrows, B, C, Escape) and input suppression |
| `media-engine.test.ts` | 13 | Media extension detection, resolution, preload caching, and playback controls |
| `midi-osc-actions.test.ts` | 13 | Hardware MIDI mapping, OSC UDP command parser, and 80ms atomic debounce |
| `presentation-controls.test.ts` | 4 | Next slide, previous slide, blackout toggle, and slide boundary limits |
| `remote-and-overlay.test.ts` | 10 | Mobile remote approval queue, rate limiter, and transparent overlay rendering |
| `service-planning.test.ts` | 8 | Service playlist item types (song, scripture, sermon, announcement, divider, timer) |
| `slide-generator.test.ts` | 4 | Line wrapping, stanza grouping, and title slide generation |
| `slide-management.test.ts` | 1 | Live/preview slide selection and index tracking |
| `song-interchange.test.ts` | 6 | OpenSong/JSON interchange format import and conflict strategies |
| `song-library.test.ts` | 6 | Song search, filtering by language/category, and section editing |
| `theme-manager.test.ts` | 3 | High-contrast text shadows, typography scale, and background scrim |
| `timers-and-stage.test.ts` | 10 | Drift-free countdown calculation, warning thresholds, and stage cues |
| `unicode-tamil-rendering.test.tsx` | 2 | Complex Tamil vowel combining signs (உயிர்மெய் எழுத்துக்கள்) rendering without clipping |

---

## 5. Live Production Checklist (Pre-Service Gate)

Perform these quick checks before every live service:

1. **Monitor Targeting**: Open `Display` menu. Verify projector monitor is selected and click `Launch Audience Window`.
2. **Blackout Test**: Press `B` on operator keyboard. Confirm projector displays pure black. Press `B` again to restore.
3. **Stage Display**: Launch Stage Display. Confirm current slide, next slide preview, and real-time clock are synchronized.
4. **Mobile Remote**: Open `Settings > Integrations > Remote Control`. Confirm PIN matches the mobile web prompt at `http://<lan-ip>:8088/remote`.
5. **Livestream Overlay**: In OBS Studio, check the Browser Source `http://<lan-ip>:8088/overlay?token=...`. Press `C` to confirm quick clear function.
6. **Integrity Check**: Open `Settings > Storage & Database > Verify Database Integrity`. Verify result displays `Integrity Check Passed (OK)`.
