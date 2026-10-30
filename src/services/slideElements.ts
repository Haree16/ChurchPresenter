import { SlideElement } from '../types';

export const MAX_ELEMENTS = 20;
export const MAX_ELEMENT_TEXT_CHARS = 500;
export const MAX_ELEMENT_FONT_PCT = 30;

const HEX = /^#[0-9a-fA-F]{6}$/;

const inRange = (v: unknown, lo: number, hi: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** Media-library paths only: relative, under `media/`, no `..`, no URL schemes. */
export function isSafeMediaPath(p: string | null | undefined): boolean {
  const s = (p || '').trim();
  return (
    s.length > 0 &&
    s.length <= 300 &&
    s.startsWith('media/') &&
    !s.includes('..') &&
    !s.includes('\\') &&
    !s.includes(':') &&
    !/[\u0000-\u001f\u007f]/.test(s)
  );
}

/** Same rules as the desktop backend, so editors can explain problems before saving. */
export function validateElement(el: SlideElement): string | null {
  if (!el.id || !el.id.trim() || el.id.length > 64) return 'it needs an id.';
  if (!inRange(el.x, 0, 100) || !inRange(el.y, 0, 100)) return 'position must be between 0 and 100.';
  if (!inRange(el.w, 1, 100) || !inRange(el.h, 1, 100)) return 'size must be between 1 and 100.';
  if (el.x + el.w > 100 + 1e-6 || el.y + el.h > 100 + 1e-6) return 'it must stay inside the slide.';
  if (el.opacity != null && !inRange(el.opacity, 0, 1)) return 'opacity must be between 0 and 1.';
  if (el.rotation != null && !inRange(el.rotation, -360, 360)) return 'rotation must be between -360 and 360 degrees.';
  if (el.color != null && !HEX.test(el.color)) return 'colour must look like #ffffff.';
  if (el.fill != null && !HEX.test(el.fill)) return 'fill must look like #ffffff.';

  switch (el.kind) {
    case 'text': {
      const text = el.text || '';
      if (!text.trim()) return 'a text box needs some text.';
      if ([...text].length > MAX_ELEMENT_TEXT_CHARS) return `text is too long (maximum ${MAX_ELEMENT_TEXT_CHARS} characters).`;
      if (el.fontSizePct != null && !inRange(el.fontSizePct, 1, MAX_ELEMENT_FONT_PCT)) {
        return `text size must be between 1 and ${MAX_ELEMENT_FONT_PCT}.`;
      }
      if (el.align != null && !['left', 'center', 'right'].includes(el.align)) return `unknown alignment '${el.align}'.`;
      if (el.weight != null && !['normal', 'bold'].includes(el.weight)) return `unknown weight '${el.weight}'.`;
      return null;
    }
    case 'image':
      if (!(el.imagePath || '').trim()) return 'an image needs an image.';
      if (!isSafeMediaPath(el.imagePath)) return 'the image must come from the media library.';
      return null;
    case 'shape':
      if (el.shape !== 'rect' && el.shape !== 'ellipse') {
        return el.shape ? `unknown shape '${el.shape}'.` : 'a shape needs a shape type.';
      }
      if (!el.fill) return 'a shape needs a fill colour.';
      return null;
    default:
      return `unknown type '${(el as SlideElement).kind}'.`;
  }
}

/** Validates the whole list; the message names the element, like the backend does. */
export function validateElements(elements: SlideElement[] | null | undefined): string | null {
  const list = elements || [];
  if (list.length > MAX_ELEMENTS) return `A slide can have at most ${MAX_ELEMENTS} extra elements.`;
  const ids = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const problem = validateElement(list[i]);
    if (problem) return `Element ${i + 1}: ${problem}`;
    if (ids.has(list[i].id)) return `Element ${i + 1}: duplicate id.`;
    ids.add(list[i].id);
  }
  return null;
}

export const newElementId = () => `el-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;

/** A sensible new element of the given kind, centred on the slide. */
export function createElement(kind: SlideElement['kind'], imagePath?: string): SlideElement {
  const base = { id: newElementId(), x: 25, y: 35, w: 50, h: 30 };
  switch (kind) {
    case 'text':
      return { ...base, kind, text: 'New text', fontSizePct: 8, color: '#ffffff', align: 'center', weight: 'bold' };
    case 'image':
      return { ...base, kind, w: 30, h: 30, x: 35, imagePath: imagePath ?? '' };
    case 'shape':
      return { ...base, kind, shape: 'rect', fill: '#3b82f6', opacity: 0.8 };
  }
}

/** Keeps a box inside the slide after a move or resize. */
export function clampElement(el: SlideElement): SlideElement {
  const w = Math.min(Math.max(el.w, 1), 100);
  const h = Math.min(Math.max(el.h, 1), 100);
  let rot = el.rotation != null ? Math.round(el.rotation * 10) / 10 : undefined;
  if (rot != null) {
    while (rot > 180) rot -= 360;
    while (rot < -180) rot += 360;
  }
  return {
    ...el,
    w,
    h,
    x: Math.min(Math.max(el.x, 0), 100 - w),
    y: Math.min(Math.max(el.y, 0), 100 - h),
    rotation: rot,
  };
}

export interface SnapGuide {
  type: 'x' | 'y';
  position: number; // percentage (0-100)
}

export interface SnapResult {
  x: number;
  y: number;
  guides: SnapGuide[];
}

/**
 * Snaps position (x, y) with dimensions (w, h) against slide bounds (0%, 50%, 100%)
 * and other elements' edges and centers.
 * snapThreshold is in percentage (default 1.5%).
 */
export function snapElementPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  otherElements: SlideElement[],
  snapThreshold: number = 1.5
): SnapResult {
  let snappedX = x;
  let snappedY = y;
  const guides: SnapGuide[] = [];

  // Horizontal target points for the dragged box: left, center, right
  const xTargets = [
    { offset: 0, val: x },
    { offset: w / 2, val: x + w / 2 },
    { offset: w, val: x + w },
  ];

  // Vertical target points for the dragged box: top, middle, bottom
  const yTargets = [
    { offset: 0, val: y },
    { offset: h / 2, val: y + h / 2 },
    { offset: h, val: y + h },
  ];

  // Candidates for X snapping: slide center (50%), slide edges (0%, 100%)
  const xCandidates = [0, 50, 100];
  // Candidates for Y snapping: slide middle (50%), slide edges (0%, 100%)
  const yCandidates = [0, 50, 100];

  for (const other of otherElements) {
    xCandidates.push(other.x, other.x + other.w / 2, other.x + other.w);
    yCandidates.push(other.y, other.y + other.h / 2, other.y + other.h);
  }

  // Find closest X snap
  let minDiffX = snapThreshold;
  let matchedXGuide: number | null = null;
  for (const t of xTargets) {
    for (const c of xCandidates) {
      const diff = Math.abs(t.val - c);
      if (diff < minDiffX) {
        minDiffX = diff;
        snappedX = c - t.offset;
        matchedXGuide = c;
      }
    }
  }
  if (matchedXGuide !== null) {
    guides.push({ type: 'x', position: matchedXGuide });
  }

  // Find closest Y snap
  let minDiffY = snapThreshold;
  let matchedYGuide: number | null = null;
  for (const t of yTargets) {
    for (const c of yCandidates) {
      const diff = Math.abs(t.val - c);
      if (diff < minDiffY) {
        minDiffY = diff;
        snappedY = c - t.offset;
        matchedYGuide = c;
      }
    }
  }
  if (matchedYGuide !== null) {
    guides.push({ type: 'y', position: matchedYGuide });
  }

  return { x: snappedX, y: snappedY, guides };
}

/** Copies of `elements` with fresh ids, for applying a template to a slide. */
export function cloneElements(elements: SlideElement[] | null | undefined): SlideElement[] {
  return (elements || []).map((e) => ({ ...e, id: newElementId() }));
}
