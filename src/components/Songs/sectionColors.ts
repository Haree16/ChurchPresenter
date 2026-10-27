import { SectionType, SongSection } from '../../types';

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
