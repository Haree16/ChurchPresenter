import { SlideElement, SlideLayout } from '../types';
import { validateElements } from './slideElements';

export const MAX_MARGIN_PCT = 25;
export const MAX_OUTLINE_WIDTH = 20;

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Same rules as the desktop backend, so editors can explain problems before saving. */
export function validateLayout(l: SlideLayout | null | undefined): string | null {
  if (!l) return null;
  if (l.marginPct != null && (!Number.isFinite(l.marginPct) || l.marginPct < 0 || l.marginPct > MAX_MARGIN_PCT)) {
    return `Safe margin must be between 0 and ${MAX_MARGIN_PCT}%.`;
  }
  if (l.outlineWidth != null && (!Number.isFinite(l.outlineWidth) || l.outlineWidth < 0 || l.outlineWidth > MAX_OUTLINE_WIDTH)) {
    return `Outline width must be between 0 and ${MAX_OUTLINE_WIDTH}.`;
  }
  if (l.outlineColor != null && !HEX.test(l.outlineColor)) {
    return 'Outline colour must look like #000000.';
  }
  return validateElements(l.elements);
}

/** True when nothing in the layout would change how a slide looks. */
export function isEmptyLayout(l: SlideLayout | null | undefined): boolean {
  return (
    !l ||
    (l.marginPct == null && l.outlineWidth == null && l.outlineColor == null && (l.elements?.length ?? 0) === 0)
  );
}

/**
 * Builds a layout from editor values; returns `{}` (which clears a stored layout) when all are default.
 * Pass the slide's existing `elements` so editing margin or outline never drops them.
 */
export function buildLayout(
  marginPct: number,
  outlineWidth: number,
  outlineColor: string,
  elements: SlideElement[] = []
): SlideLayout {
  const layout: SlideLayout = {};
  if (marginPct > 0) layout.marginPct = marginPct;
  if (outlineWidth > 0) {
    layout.outlineWidth = outlineWidth;
    layout.outlineColor = outlineColor;
  }
  if (elements.length > 0) layout.elements = elements;
  return layout;
}

/** Padding that keeps text inside the safe margin; null keeps the view's own default padding. */
export function layoutPadding(l: SlideLayout | null | undefined): string | null {
  const m = l?.marginPct;
  if (m == null || !Number.isFinite(m) || m <= 0) return null;
  const clamped = Math.min(m, MAX_MARGIN_PCT);
  return `${clamped}vh ${clamped}vw`;
}

/**
 * Text outline drawn as a ring of shadows, which every browser engine renders the same way.
 * The radius is in `em`, so the outline stays in proportion to the text in previews and thumbnails.
 */
export function outlineTextShadow(l: SlideLayout | null | undefined): string | null {
  const w = l?.outlineWidth;
  if (w == null || !Number.isFinite(w) || w <= 0) return null;
  const color = l?.outlineColor && HEX.test(l.outlineColor) ? l.outlineColor : '#000000';
  const radius = Math.min(w, MAX_OUTLINE_WIDTH) / 40;
  const steps = w > 6 ? 16 : 8;
  const shadows: string[] = [];
  for (let i = 0; i < steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const x = (Math.cos(angle) * radius).toFixed(3);
    const y = (Math.sin(angle) * radius).toFixed(3);
    shadows.push(`${x}em ${y}em 0 ${color}`);
  }
  return shadows.join(', ');
}

/** The slide's own text shadow with the outline ring layered on top; null when there is neither. */
export function composeTextShadow(
  l: SlideLayout | null | undefined,
  baseShadow: string | null | undefined
): string | undefined {
  const ring = outlineTextShadow(l);
  const base = baseShadow && baseShadow !== 'none' ? baseShadow : null;
  const parts = [ring, base].filter((p): p is string => !!p);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Percent-based padding for small previews and thumbnails; null keeps the view's default. */
export function layoutPaddingPercent(l: SlideLayout | null | undefined): string | null {
  const m = l?.marginPct;
  if (m == null || !Number.isFinite(m) || m <= 0) return null;
  return `${Math.min(m, MAX_MARGIN_PCT)}%`;
}
