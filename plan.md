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
- PDF import (needs `pdftoppm`); PPTX import into editable slides with no extra software (see `docs/phases/phase-8-content.md`, 8.4); "Import as pictures" for PPTX and old PPT still uses LibreOffice (clear error if missing)
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

- **Safe margins and text outline**: a `layout` value on slides and themes (migration 13, validated, bad stored values ignored). Slides made from a theme inherit its layout. Drawn on the audience screen, operator preview, slide cards and both editors (slide editor, theme manager). The outline is a ring of shadows sized in `em`, so it matches in previews and on the real screen. The old theme `text_margin` field is left as is (it only affected the theme preview and is now overridden there by the safe margin).
- Fixed: saving a slide from the editor reset its background image, overlay, line spacing, shadow and font (the editor sent only six fields while the backend wrote them all). `update_slide` now returns the stored slide, so edits no longer drop its group tag either.

- **Portable themes**: export one theme or all custom themes to a `.cptheme` file with the background image embedded; import creates new custom themes (name clashes are renamed, nothing is imported if any theme is invalid, images are checked by content and copied into the app's own folder). Imports list the fonts a theme needs and the app warns about ones not installed on that computer. The theme manager also gained a background image picker (from the media library) and fit mode, which did not exist before.

- **Multi-element slides**: a slide's `layout` can carry up to 20 extra elements (text boxes, images from the media library, rectangles/ellipses), positioned in percent of the slide and drawn in order on the audience screen, operator preview and slide cards. The slide editor adds, edits, reorders and deletes them, and elements can be dragged in the preview.
- **Templates** (migration 14): save a slide's look (colours, text size, alignment, background image, margin, outline, elements) and apply it to any slide; applying keeps the slide's text and gives the elements fresh ids. Included in backup/restore.

Not done (design notes):
- Elements have no rotation or resize handles (size is set with number fields); there is no "new slide from template" button (apply a template inside the editor).
- Elements are not drawn on the stage display or the phone remote preview.
- Fonts are not embedded in theme files (reported instead); only PNG/JPG/GIF/WEBP backgrounds travel with a theme.
- Props are not drawn in the operator preview panel; phones cannot toggle individual props (only clear them).
*Done when:* a theme exported from one machine looks identical on another.

### D. Automation — in progress
Done:
- **Auto-advance**: advance the live slide every 1-3600 s, optionally looping; starts from the live slide only (never puts something on screen by surprise); pauses while blacked out or blank; stops after the last slide unless looping; Clear All and `stop_auto_advance` (OSC `/autoadvance/stop`, opt-in; phone needs the navigation permission) end it. Operator control with presets and a countdown.
- **Macros** (migration 16): saved lists of up to 30 steps run with one click: any of 17 listed actions, an alert, show/hide/toggle a prop, wait (up to 10 min, 30 min total), start auto-advance. They run on a background thread with progress shown, can be stopped, only one runs at a time, and cannot run other macros. Steps are validated (unknown actions refused). Included in backup/restore. Manager window to build, reorder and delete steps.
- **Looks** (migration 17): save the output layers (logo on/off, blackout, which props show, in order) and apply them with one click; the live slide is never touched; props that were deleted are skipped. "Save current" captures the screen as it is; the Look matching the screen is highlighted. A macro can apply a Look as a step. Included in backup/restore.
- **Stage layout editor** (migration 18): design what the stage monitor shows. Panels (current slide, next slide, clock, timer, stage message, status, notes) are placed in percent of the screen with a text size each; drag them on a live preview, set numbers, or start from a preset (Confidence, Lyrics only, Side by side, Speaker). With no panels the stage keeps its classic layout, so nothing changes until a layout is saved; saving updates an open stage window immediately. Edited from Settings > General. Included in backup/restore.
- Fixed a test-only race: the action repeat-filter (80 ms) was a process-wide static; it now lives in each presentation manager.

Not done:
- Per-screen stage layouts (there is one layout for all stage screens).
- Auto-advance timing is one interval for all slides (no per-slide timing).
- Macros can only be run from the operator panel (not yet from OSC, MIDI or the phone remote).
- The scheduler and macro runner threads themselves are untested (they need a live app handle); the logic they call is covered.
*Done when:* a "start service" macro runs in one click. (Macros, auto-advance, Looks and the stage layout editor are done and tested; not yet tried in the live app.)

### E. Integrations
CCLI reporting, SongSelect and ProPresenter song import, Stream Deck via OSC presets, auto-updater.
*Done when:* a ProPresenter song file imports with its groups intact.

### F. Broadcast (only if users ask)
NDI (check SDK licensing first), live video input, OBS WebSocket, recording, edge blending.

## Open questions
- Which song and slide formats do current users already have?
- Are both Linux and Windows release-critical?
- Which Bible translations (and licenses) must ship out of the box?
