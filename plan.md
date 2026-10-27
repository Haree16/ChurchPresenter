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

### A. Finish and harden what exists — done except the loop tests
1. ~~Verify build + tests, commit pending work.~~
2. Tests for pure logic in `commands.rs`, `remote.rs`, `osc.rs`, `net_guard.rs` — done. The HTTP server loop, UDP loop and Tauri command wrappers are still untested: they take `AppHandle<Wry>`, and `tauri::test::mock_app()` gives `AppHandle<MockRuntime>`, so testing them means making the server, `ActionDispatcher` and `PresentationManager` generic over `Runtime`.
3. ~~Network exposure~~: remote + OSC accept only private/loopback sources (`net_guard.rs`); a "Who can connect" setting (this computer only / local network) applies on next start; the integrations modal warns about unencrypted HTTP and password-less OSC.
4. ~~Output layers~~: logo (`L`), clear media (`M`), clear all (`C`) as separate states and actions; header buttons; OSC `/logo`, `/clear/media`, `/clear/all` (opt-in via the allowlist); phone remote "Clear All" (needs the blackout permission); custom logo image in Settings. Letter shortcuts ignore Ctrl/Cmd/Alt.
   *Props layer:* "clear props" arrives with props in Phase C.
*Done when:* CI is green; clear, black and logo work independently. (Verified in unit tests; not yet run in the live app.)

### B. Songs and Bible — mostly done
Done:
- Bible: Rust importers for USFM, OSIS, Zefania and JSON (correct book numbers, multi-line verses, footnote stripping); file picker + paste import; re-importing a book replaces it; translation list comes from the database; FTS5 keyword search (ASCII; Tamil falls back to LIKE); book-name normalisation (`1John`, `Jn.`, `First John`); a 31k-verse import and search test (<0.4s in memory).
- Slide cards: slides generated from songs (presentation or service) carry their group label + colour (migration 9) and the slide grid shows a coloured tag; survives duplicate and backup/restore. Slides already in existing services have no tag until the song is re-added.
- Group tag also shows in the preview panel, stage display (current + next) and the phone remote page.
- Song export/import/duplicate keep arrangements and colours (JSON); OpenLyrics gets the default arrangement as `<verseOrder>` (colours have no OpenLyrics equivalent); OpenLyrics import now keeps line breaks.
- Songs: per-section group colours (type default + custom override); named arrangements with repeats, a default per song, used by "add to service" and the slide generator; included in backup/restore.

Not done:
- Two translations side by side existed already; no layout work was done on it.
- Bible autocomplete suggestions still come from a short hard-coded passage list (reference parsing itself accepts any book).
- Real-world import not yet tried against a full public-domain USFM/Zefania file.

### C. Slide editor and themes — in progress
Done:
- **Audience alerts** (nursery calls): banner over the audience output (above slides, logo, blackout), auto-dismiss (10s / 30s / 1 min / until cleared), 200-char limit, operator control, phone-remote control (`/api/alert`, needs the blackout permission), `clear_alert` action (OSC `/alert/clear`, opt-in), cleared by Clear All.
- **Props**: saved text / image overlays in 8 preset positions, toggled on and off from the operator panel, edited live, hidden by blackout, cleared by `clear_props` (OSC `/clear/props`, opt-in) and Clear All; included in backup/restore. Colours are plain hex only; text is rendered as text.

Not done (design notes):
- **Safe margins and text outline**: `text_margin` exists on themes but is not applied to the output, and slides copy theme values, so this needs a per-slide layout field. Plan: one `layout` JSON column on slides (margin, outline, elements) so margins, outline, elements and templates share one migration.
- **Multi-element slides** (extra text boxes, images, shapes positioned in % of the slide) and **templates** (saved layouts).
- **Portable theme export/import** with the background image embedded, so a theme looks identical on another machine.
- Props are not drawn in the operator preview panel; phones cannot toggle individual props (only clear them).
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
