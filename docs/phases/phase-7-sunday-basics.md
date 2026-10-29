# Phase 7: Sunday basics

Goal: finish what is half-built and close small operator gaps. Effort: about 2 to 3 weeks. Depends on nothing.

Done when: an operator can run a full service using only custom keys and one macro button, and every item below has a test.

## 7.1 Land the uncommitted work
Status: committed (paste lyrics, slide jump, video backgrounds); live-app check by hand still open.

Files: `SongPasteModal.tsx`, `lyricsParser.ts`, `slideJump.ts`, `backgroundMedia.ts` and their tests.
- Run `npm test` and `cargo test`; fix failures.
- Try each in the live app: paste lyrics into a song, type a number to jump to a slide, set a video background.
- Commit as separate commits (songs, jump, backgrounds).

## 7.2 Custom key mapping
Status: done (migration 19, `keybindings.rs`, Settings > General > Custom shortcuts).

Finding: the `keyboard_shortcut` column in `action_mappings` is a display label only; the hook never read it. Custom shortcuts use a new `key_bindings` table instead, and built-in keys stay fixed.
- Load mappings from `key_bindings` and drive the hook from them; keep current keys as defaults.
- Extend the mapping target beyond actions: a prop (toggle), a macro (run), a Look (apply).
- Settings UI: click a row, press a key, warn on conflicts and on browser or OS reserved keys.
- Tests: conflict detection, default restore, modifier handling (Ctrl/Cmd/Alt must not fire letter shortcuts, as today).

## 7.3 Custom clear groups
Status: done (migration 20, `clear_groups.rs`, operator panel, macro step, shortcut target). Not yet reachable from OSC, MIDI or the phone remote (7.4).

- Model: a named set of layers (slide, media, logo, blackout, alert, props, auto-advance; media covers audio) stored in the database (migration 20).
- Built as a "Clear groups" panel under Looks (not a header button), a `clearGroup` macro step and a `clearGroup` shortcut target, rather than a `clear_group:<id>` action string.
- A group that was deleted fails with "no longer exists" in a macro or shortcut, instead of being skipped silently.
- Groups can be created and deleted but not edited (delete and recreate).
- Tests: group clears only its layers; clearing every layer matches Clear All; macro step and shortcut target.

## 7.4 Macros from every control path
Status: done (migration 21). A macro runs with the action `run_macro:<id>` from OSC, MIDI and the phone remote.
- OSC: `/macro/<id>`; opt-in per macro (or "allow every macro") in Integrations > OSC. Never in the default allowlist.
- MIDI: pick "Macros" in the trigger's action list. The list also had names the app could not run (`previous_slide`, `toggle_clear`, `go_live`, `toggle_timer`); it now offers the same actions macros use. MIDI triggers saved earlier with those old names still do nothing; delete and recreate them.
- Phone remote: new per-device "Macros" permission, off by default (a macro can do anything the operator can). The page lists macro names as buttons and never receives the steps.
- Unchanged: one macro at a time, no macro inside a macro, macro names shown as plain text.
- Not covered by tests: starting a macro through the live app handle (needs a running app); the pure parts (path parsing, allowlist, permission, page contents, persistence) are tested.
- Not done: clear groups and looks cannot be triggered from OSC, MIDI or the phone directly; wrap them in a macro.

## 7.5 Per-slide auto-advance timing
Status: done. No new migration: the time is `advanceSeconds` inside the slide's existing `layout` JSON, so it follows the slide through duplicate, copy to a service, templates and backup.
- A slide can set how long auto-advance keeps it up (1 to 3600 s); empty uses the interval chosen when the run starts.
- Slide editor field "Auto-advance time (seconds)"; the slide card shows "Auto-advance N s".
- Behaviour change: when the operator moves to another slide by hand during a run, the countdown restarts with that slide's time. Before, the old countdown carried on.
- Pausing (blackout or blank) pushes the next advance back by the current slide's time.
- Applying a slide template also copies its time (templates store the layout).
- Not done: setting a time on several slides at once; showing the per-slide times in the auto-advance panel.
- Tests: scheduler with mixed times, manual move restarts the countdown, pause and loop, layout rules and storage, editor field, card badge.

## Risks
- `db.rs` is 8,000+ lines; put new tables in their own module (as `looks.rs` and `props.rs` do) and call from `run_migrations`.
- Key capture differs between Linux and Windows layouts; test on both.
