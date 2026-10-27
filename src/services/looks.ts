import { Look, PresentationState } from '../types';

export const MAX_LOOK_NAME_CHARS = 60;
export const MAX_LOOK_PROPS = 20;

/** Same rules as the desktop backend, so the UI can explain problems before saving. */
export function validateLook(l: Partial<Look>): string | null {
  const name = (l.name || '').trim();
  if (!name) return 'Give the look a name.';
  if ([...name].length > MAX_LOOK_NAME_CHARS) return `Look name is too long (maximum ${MAX_LOOK_NAME_CHARS} characters).`;
  const ids = l.propIds || [];
  if (ids.length > MAX_LOOK_PROPS) return `A look can show at most ${MAX_LOOK_PROPS} props.`;
  if (ids.some((id) => !id.trim())) return 'A look contains a blank prop.';
  if (new Set(ids).size !== ids.length) return 'A look lists the same prop twice.';
  return null;
}

/** True when the screen already matches the look (same logo, blackout and set of props). */
export function lookMatches(look: Look, state: Pick<PresentationState, 'isLogo' | 'isBlackout' | 'activeProps'>): boolean {
  const active = (state.activeProps || []).map((p) => p.id);
  return (
    !!state.isLogo === look.logo &&
    !!state.isBlackout === look.blackout &&
    active.length === look.propIds.length &&
    look.propIds.every((id) => active.includes(id))
  );
}
