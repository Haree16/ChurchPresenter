# Church Presenter — Roadmap vs ProPresenter

Status as of 2026-10-27, after the Phase 0-6 commit plus uncommitted work.

**Caveat:** ProPresenter feature details are from memory and public pages, not the official docs. Verify against Renewed Vision's documentation before relying on any claim.

## Principles
- Preserve working features. No rewrite; keep Tauri + React + SQLite.
- Keep new work behind existing interfaces (`api.ts`, `invoke` commands) so the existing test files keep guarding behavior.
- Split `db.rs` (~6.7k lines) and `api.ts` by domain only as each feature touches them.
- Use permissively licensed components. Licensing risk is limited to NDI and non-public-domain Bible text.

## Done
- Services/playlists, song library (sections, slide generator, search), themes, stage display (current/next/notes/timer), timers, media library
- Database recovery modal, automatic backups, panic hook
- Remote: PIN pairing, device permissions, SSE state events, per-connection threads
- Slide fade transition (250ms) in `AudienceView`
- PDF import; PPTX import via LibreOffice (clear error if missing)
- Song import: JSON, OpenLyrics, OpenSong; export: JSON, OpenLyrics
- Monitor change handling, multiple outputs, OSC and MIDI, OBS lower-third overlay

## Gaps vs ProPresenter

| # | Gap | Phase |
|---|---|---|
| 1 | Bible: ~6 seeded passages, no import wizard (USFM/OSIS/Zefania), no FTS5 search, no abbreviation autocomplete | B |
| 2 | Slide groups (verse/chorus labels + colors) and per-song arrangements | B |
| 3 | Slide editor: multi-element slides, templates, masks, outline, safe margins | C |
| 4 | Props and audience-facing alerts (e.g. nursery calls) | C |
| 5 | Separate clear layers (slide/media/audio/props) and clear-to-logo | A |
| 6 | Macros and Looks | D |
| 7 | Slide auto-advance / per-slide timing | D |
| 8 | Stage layout editor (`StageConfig` has 4 flags) | D |
| 9 | CCLI reporting, SongSelect import | E |
| 10 | ProPresenter / EasyWorship song import | E |
| 11 | Live video input, NDI, OBS WebSocket, recording | F |
| 12 | Stream Deck, mobile app, HTTPS remote | E/F |
| 13 | Auto-updater | E |
| 14 | Multi-screen edge blending | F |
| 15 | Test depth: Rust tests: 36, mostly `db.rs`; server/UDP loops and command wrappers untested | A |
| 16 | Security: remote and OSC bind `0.0.0.0`; no TLS; OSC has no auth | A |
| 17 | `db.rs` and `api.ts` size | ongoing |

## Phases

### A. Finish and harden what exists
1. ~~Verify build + tests, commit pending work.~~ Done.
2. ~~Tests for `commands.rs`, `remote.rs`, `osc.rs`.~~ Done for the pure logic (OSC mapping/allowlist, remote permissions, presentation-import helpers). The HTTP server loop, UDP loop and Tauri command wrappers need a running `AppHandle` and are still untested; an integration harness would cover them.
3. Remote/OSC: ~~LAN-only source filtering~~ (done, `net_guard.rs`); LAN-only warning in UI, configurable bind address. *Pending.*
4. Clear-layer model: ~~logo~~ (done: `L` key, header button, `toggle_logo` action, cleared when a slide goes live; uses `public/logo.png`); clear media / props / all as independent states, Settings override for the logo image. *Pending.*
*Done when:* CI is green; clear, black and logo work independently.

### B. Songs and Bible
Slide groups with colors; arrangements; Bible import wizard; FTS5 search; abbreviations (`ps 23`, `Jn 3:16-18`); two translations side by side.
*Done when:* full KJV imports in under 30s; a song arrangement reorders without editing slides.

### C. Slide editor and themes
Multi-element slides, templates, outline and safe margins, props, audience alerts.
*Done when:* a theme exported from one machine looks identical on another.

### D. Automation
Auto-advance timing, macros, Looks, stage layout editor.
*Done when:* a "start service" macro runs in one click.

### E. Integrations
CCLI reporting, SongSelect and ProPresenter song import, Stream Deck via OSC presets, auto-updater.
*Done when:* a ProPresenter song file imports with its groups intact.

### F. Broadcast (only if users ask)
NDI (check SDK licensing first), live video input, OBS WebSocket, recording, edge blending.

## Open questions
- Which song and slide formats do current users already have?
- Are both Linux and Windows release-critical?
- Which Bible translations (and licenses) must ship out of the box?
