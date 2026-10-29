import { ClearGroup, ClearLayer } from '../types';

export const MAX_CLEAR_GROUP_NAME_CHARS = 60;
export const MAX_CLEAR_GROUPS = 50;

/** Layers a clear group may clear, in the order shown. Same list as the backend. `media` covers video and audio. */
export const CLEAR_LAYERS: { layer: ClearLayer; label: string }[] = [
  { layer: 'slide', label: 'Slide' },
  { layer: 'media', label: 'Media (video and audio)' },
  { layer: 'logo', label: 'Logo screen' },
  { layer: 'blackout', label: 'Blackout' },
  { layer: 'alert', label: 'Alert banner' },
  { layer: 'props', label: 'Props' },
  { layer: 'autoAdvance', label: 'Auto-advance' },
];

/** Same rules as the desktop backend, so the UI can explain problems before saving. */
export function validateClearGroup(g: Partial<ClearGroup>): string | null {
  const name = (g.name || '').trim();
  if (!name) return 'Give the clear group a name.';
  if ([...name].length > MAX_CLEAR_GROUP_NAME_CHARS) return `Clear group name is too long (maximum ${MAX_CLEAR_GROUP_NAME_CHARS} characters).`;
  const layers = g.layers || [];
  if (layers.length === 0) return 'Choose at least one layer to clear.';
  for (const l of layers) {
    if (!CLEAR_LAYERS.some((c) => c.layer === l)) return `'${l}' is not a layer that can be cleared.`;
  }
  if (new Set(layers).size !== layers.length) return 'A clear group lists the same layer twice.';
  return null;
}

/** Short description such as "Slide, Props", in display order. */
export function describeLayers(layers: ClearLayer[]): string {
  return CLEAR_LAYERS.filter((c) => layers.includes(c.layer)).map((c) => c.label.replace(/ \(.*\)$/, '')).join(', ');
}
