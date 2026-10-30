import { StagePanel, StagePanelKind } from '../types';

export const MAX_STAGE_PANELS = 8;
export const MAX_STAGE_FONT_PCT = 30;

export const STAGE_PANEL_KINDS: { kind: StagePanelKind; label: string; defaultFontPct: number; size: { w: number; h: number } }[] = [
  { kind: 'current', label: 'Current slide', defaultFontPct: 7, size: { w: 60, h: 60 } },
  { kind: 'next', label: 'Next slide', defaultFontPct: 4.5, size: { w: 36, h: 36 } },
  { kind: 'clock', label: 'Clock', defaultFontPct: 5, size: { w: 20, h: 10 } },
  { kind: 'timer', label: 'Timer', defaultFontPct: 5, size: { w: 24, h: 10 } },
  { kind: 'message', label: 'Stage message', defaultFontPct: 5, size: { w: 90, h: 12 } },
  { kind: 'status', label: 'Status', defaultFontPct: 3, size: { w: 30, h: 8 } },
  { kind: 'notes', label: 'Notes / cue', defaultFontPct: 3.2, size: { w: 90, h: 10 } },
  { kind: 'multiviewer', label: 'Multi-viewer preview', defaultFontPct: 4, size: { w: 36, h: 28 } },
];

export const kindLabel = (kind: StagePanelKind) => STAGE_PANEL_KINDS.find((k) => k.kind === kind)?.label ?? kind;
export const defaultFontPct = (kind: StagePanelKind) => STAGE_PANEL_KINDS.find((k) => k.kind === kind)?.defaultFontPct ?? 5;

const inRange = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Same rules as the desktop backend, so the editor can explain problems before saving. */
export function validatePanels(panels: StagePanel[] | null | undefined): string | null {
  const list = panels || [];
  if (list.length > MAX_STAGE_PANELS) return `A stage layout can have at most ${MAX_STAGE_PANELS} panels.`;
  const kinds = new Set<string>();
  const ids = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const ctx = (e: string) => `Panel ${i + 1}: ${e}`;
    if (!p.id || !p.id.trim() || p.id.length > 64) return ctx('it needs an id.');
    if (ids.has(p.id)) return ctx('duplicate id.');
    ids.add(p.id);
    if (!STAGE_PANEL_KINDS.some((k) => k.kind === p.kind)) return ctx(`unknown panel '${p.kind}'.`);
    if (kinds.has(p.kind)) return ctx(`the ${p.kind} panel is already in the layout.`);
    kinds.add(p.kind);
    if (!inRange(p.x, 0, 100) || !inRange(p.y, 0, 100)) return ctx('position must be between 0 and 100.');
    if (!inRange(p.w, 2, 100) || !inRange(p.h, 2, 100)) return ctx('size must be between 2 and 100.');
    if (p.x + p.w > 100 + 1e-6 || p.y + p.h > 100 + 1e-6) return ctx('it must stay inside the screen.');
    if (p.fontSizePct != null && !inRange(p.fontSizePct, 1, MAX_STAGE_FONT_PCT)) {
      return ctx(`text size must be between 1 and ${MAX_STAGE_FONT_PCT}.`);
    }
  }
  return null;
}

export const newPanelId = () => `sp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

/** Keeps a panel on the screen after a move or resize. */
export function clampPanel(p: StagePanel): StagePanel {
  const w = Math.min(Math.max(p.w, 2), 100);
  const h = Math.min(Math.max(p.h, 2), 100);
  return { ...p, w, h, x: Math.min(Math.max(p.x, 0), 100 - w), y: Math.min(Math.max(p.y, 0), 100 - h) };
}

/** A new panel of `kind`, placed in the first free spot it fits (or the top-left corner). */
export function createPanel(kind: StagePanelKind, existing: StagePanel[]): StagePanel {
  const size = STAGE_PANEL_KINDS.find((k) => k.kind === kind)?.size ?? { w: 30, h: 20 };
  const overlaps = (x: number, y: number) =>
    existing.some((p) => x < p.x + p.w && x + size.w > p.x && y < p.y + p.h && y + size.h > p.y);
  for (let y = 0; y + size.h <= 100; y += 5) {
    for (let x = 0; x + size.w <= 100; x += 5) {
      if (!overlaps(x, y)) return { id: newPanelId(), kind, x, y, w: size.w, h: size.h };
    }
  }
  return { id: newPanelId(), kind, x: 0, y: 0, w: size.w, h: size.h };
}

const panel = (kind: StagePanelKind, x: number, y: number, w: number, h: number, fontSizePct?: number): StagePanel => ({
  id: newPanelId(), kind, x, y, w, h, ...(fontSizePct ? { fontSizePct } : {}),
});

/** Ready-made layouts to start from. Each call returns fresh ids. */
export const STAGE_PRESETS: { key: string; label: string; build: () => StagePanel[] }[] = [
  {
    key: 'confidence',
    label: 'Confidence (current, next, clock, timer)',
    build: () => [
      panel('status', 2, 2, 30, 8),
      panel('timer', 40, 2, 28, 10),
      panel('clock', 78, 2, 20, 10),
      panel('message', 2, 13, 96, 10),
      panel('current', 2, 25, 62, 62),
      panel('next', 66, 25, 32, 40),
      panel('notes', 2, 89, 96, 9),
    ],
  },
  {
    key: 'lyrics',
    label: 'Lyrics only (large current slide)',
    build: () => [panel('current', 2, 2, 96, 80, 10), panel('clock', 80, 86, 18, 10), panel('message', 2, 86, 74, 10)],
  },
  {
    key: 'side-by-side',
    label: 'Current and next side by side',
    build: () => [panel('current', 2, 12, 58, 78), panel('next', 62, 12, 36, 78), panel('clock', 80, 1, 18, 9), panel('timer', 2, 1, 28, 9)],
  },
  {
    key: 'speaker',
    label: 'Speaker (timer and notes large)',
    build: () => [panel('timer', 2, 2, 46, 28, 14), panel('clock', 52, 2, 46, 28, 14), panel('message', 2, 33, 96, 14), panel('notes', 2, 50, 96, 20, 6), panel('current', 2, 73, 96, 25, 5)],
  },
];
