# Phase 9: Screens, Looks and editor

Goal: match ProPresenter 7's multi-screen model and bring the slide editor closer to it. Effort: about 6 to 8 weeks. Depends on Phase 7.

Done when: the main screen and a lobby screen show different content and themes at the same time, switched by one Look.

## 9.1 Per-screen Looks [COMPLETED]
Today a Look (`looks.rs`) stores logo, blackout and props globally.
- **Implemented**: Added `ScreenLookConfig` (`output_id`, `logo`, `blackout`, `prop_ids`, `theme_id`) and `screen_configs: Vec<ScreenLookConfig>` to `Look`.
- **Database**: Migration 24 adds `screen_configs TEXT` column to `looks` table.
- **Backward Compatibility**: Any Look without `screen_configs` or with an empty list applies globally across all outputs. Screens without an override seamlessly inherit global layers.
- **State & Manager**: Added `ScreenLayers` struct and `screen_layers` map in `PresentationState`. `PresentationManager` isolates per-screen state via `set_look_layers_core` and `set_screen_layer_core`.
- **API & UI**:
  - `apply_look` Tauri command and frontend API take optional `target_output_id`.
  - `LooksControl` panel features a Target selector (All Screens vs. specific output), per-screen override indicator badge, and a Per-Screen Looks Grid modal to customize logo, blackout, props, and theme overrides per screen.
  - `AudienceView` respects per-screen layer overrides and theme overrides based on its target `outputId`.
- **Verification**: All Rust and Vitest test suites pass (including tests proving that applying a Look to one output leaves other outputs untouched).

## 9.2 Announcements layer [COMPLETED]
- **Implemented**: Added `AnnouncementsState` to `PresentationState` in `models.rs` and frontend `types/index.ts`.
- **Independent State Execution**: In `presentation.rs`, added `set_announcements_presentation_core`, `set_announcements_slide_core`, `next_announcements_slide_core`, `previous_announcements_slide_core`, and `clear_announcements_core`.
- **Target Outputs Filtering**: Announcements layer routes specifically to designated target outputs (e.g. Foyer, Stage, Overlay). Sanctuary/audience outputs continue rendering the main sermon/worship presentation unchanged.
- **Looping & Auto-Advance**: Configurable loop at end and background auto-advance ticker thread (`spawn_announcements_loop`) that automatically advances foyer slides on schedule.
- **Clearing Logic**: Clears independently via operator panel and is automatically included in `clear_all` and `clear_group` (with `'announcements'` layer).
- **Operator Panel**: Added `AnnouncementsControl` component to `PreviewPanel`, displaying second live slot thumbnail, slide position (`Slide X of Y`), interval control, loop toggle, and dedicated next/prev/clear buttons.
- **Verification**: Verified with both Cargo unit tests and Vitest component/integration test suite (`tests/announcements-layer.test.tsx`). Main presentation and announcements layer operate independently without collisions.

## 9.3 Per-screen stage layouts [COMPLETED]
- **Keyed by Stage Output ID**: In SQLite and in-memory mock store, `stage_configs.id` now supports arbitrary output IDs (e.g. `output-stage-pastor`, `output-stage-vocalist`, `output-stage-choir`) with automatic fallback to `default-stage`.
- **Database & Tauri API**:
  - `get_stage_config(id)` returns specific screen config or falls back to `default-stage`.
  - Added `list_stage_configs()` and `delete_stage_config(id)` in `db.rs`, `commands.rs`, and registered in `lib.rs`.
- **New Multi-Viewer Panel**:
  - Added `multiviewer` panel kind to `StagePanelKind` in both backend Rust (`stage_layout.rs`) and frontend (`stageLayouts.ts`, `types/index.ts`).
  - Allowed panel capacity expanded from 7 to 8 (`MAX_PANELS = 8`, `MAX_STAGE_PANELS = 8`).
  - Rendered in `StageCanvas` as a live audience mini-preview tile directly on stage confidence monitors.
- **Stage Layout Editor Polish**:
  - `StageLayoutEditor` features a Target Screen dropdown allowing operators to choose between global default (`default-stage`) or any specific configured stage screen.
  - Adding panels, tweaking presets, and saving targets the selected screen layout.
- **Broadcast Multi-Viewer Production Monitor Modal**:
  - Added `MultiViewerModal.tsx` accessible directly from operator header (`header-multiviewer-btn`).
  - Displays synchronized live multi-viewer tiles for all configured outputs (Main Audience, Stage Displays, Livestream Overlays, Foyer Loops).
  - Displays broadcast live status, real-time clock, aspect ratio indicators, and primary focus follow switcher.
- **Verification**: Verified with 290 passing backend Rust unit tests (`cargo test`) and 481 passing Vitest frontend unit tests (`npm test`), including dedicated tests in `tests/stage-layout-and-multiviewer.test.tsx`.

## 9.4 Editor polish [COMPLETED]
- **Element Rotation & Resize Handles**:
  - Added `rotation: Option<f64>` / `rotation?: number | null` to `SlideElement` in backend Rust (`layout.rs`) and frontend (`types/index.ts`). Validated in range `[-360.0, 360.0]` and clamped into `[-180.0, 180.0]`.
  - Added 8 interactive resize handles (`nw`, `n`, `ne`, `e`, `se`, `s`, `sw`, `w`) and top circular rotation handle (`rot`) with connecting stem in `SlideElements.tsx`.
  - Holding `Shift` during rotation snaps cleanly to 15-degree increments.
  - Added rotation number input, slider, and quick 0° reset & +90° rotation buttons in `ElementsEditor.tsx`.
- **Canvas Alignment Guides & Snapping**:
  - Implemented `snapElementPosition` in `slideElements.ts` to automatically snap dragged and resized elements against canvas boundaries (0%, 50% slide center, 100%) and neighbor elements' edges and centers.
  - Dynamically renders dashed cyan guide lines (`snap-guide-x`, `snap-guide-y`) while snapping is active.
- **Element Rendering on Stage Displays & Phone Remote**:
  - `StageCanvas.tsx`: Renders rich slide elements in `case 'current'` for confidence monitors.
  - `StageDisplayView.tsx`: Renders rich slide elements in the confidence current slide view.
  - `remote.rs`: Mobile phone remote preview (`get_remote_html`) now renders slide elements (`#live-elements`) dynamically over the live card.
- **"New Slide from Template" Button**:
  - Added `new-slide-from-template-btn` in `SlideGrid.tsx` with a template selection popover displaying all saved slide templates with color swatches and element counts.
  - Instantiates new slides with the template's background/foreground styling, font sizes, text alignments, and cloned elements via `cloneElements`.
- **Verification**: Verified with 290 passing backend Rust unit tests (`cargo test`) and 486 passing Vitest unit tests (`npm test`), including dedicated tests in `tests/editor-polish-and-templates.test.tsx`.

## 9.5 Scrolling text and messages
- Props gain a scroll mode (speed, direction); a message prop for lobby tickers.
- Cleared by Clear All and `clear_props`.

## Risks
- Splitting presentation state for the announcements layer touches the core of `presentation.rs`; write tests first and keep the single-layer path unchanged.
