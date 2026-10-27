import { SectionType, SongSection } from '../types';

/** Default group colour per section type, used when a section has no custom colour. */
export const DEFAULT_SECTION_COLORS: Record<SectionType, string> = {
  verse: '#3b82f6',
  chorus: '#f59e0b',
  bridge: '#a855f7',
  pre_chorus: '#38bdf8',
  intro: '#34d399',
  outro: '#fb7185',
  refrain: '#facc15',
  custom: '#64748b',
};

export function sectionColor(section: Pick<SongSection, 'sectionType' | 'color'>): string {
  return section.color || DEFAULT_SECTION_COLORS[section.sectionType] || DEFAULT_SECTION_COLORS.custom;
}

/** Black or white text, whichever reads better on the given hex background. */
export function readableTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  // perceived luminance (ITU-R BT.601)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#0b1020' : '#ffffff';
}
