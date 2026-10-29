# Phase 9: Screens, Looks and editor

Goal: match ProPresenter 7's multi-screen model and bring the slide editor closer to it. Effort: about 6 to 8 weeks. Depends on Phase 7.

Done when: the main screen and a lobby screen show different content and themes at the same time, switched by one Look.

## 9.1 Per-screen Looks
Today a Look (`looks.rs`) stores logo, blackout and props globally.
- Add an output id to each Look entry so layers and a theme override apply per output (`output_configs` already exists).
- Keep old Looks working: a Look with no output ids applies to all outputs.
- Migration, backup/restore support, Looks panel shows a per-screen grid.
- Tests: apply a Look to one output leaves the others unchanged.

## 9.2 Announcements layer
- A second presentation or service item that plays on chosen outputs while the main one is operated separately (state split in `presentation.rs`).
- Operator panel: a second live slot with its own next/previous; clears independently; included in Clear All.
- Typical use: looping foyer slides before service.

## 9.3 Per-screen stage layouts
Today there is one stage layout for all stage screens (`stage_layout.rs`).
- Key layouts by stage output id; the editor picks which screen it edits.
- Add a multi-viewer panel (shows what a chosen main output displays).

## 9.4 Editor polish
- Rotate and resize handles on elements; alignment guides and snapping.
- Draw elements on the stage display and the phone preview (not done today).
- "New slide from template" button.

## 9.5 Scrolling text and messages
- Props gain a scroll mode (speed, direction); a message prop for lobby tickers.
- Cleared by Clear All and `clear_props`.

## Risks
- Splitting presentation state for the announcements layer touches the core of `presentation.rs`; write tests first and keep the single-layer path unchanged.
