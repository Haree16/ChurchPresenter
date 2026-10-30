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

  if (l.screenConfigs) {
    const seenOutputs = new Set<string>();
    for (const sc of l.screenConfigs) {
      const outId = (sc.outputId || '').trim();
      if (!outId) return 'A screen configuration is missing an output target.';
      if (seenOutputs.has(outId)) return `Output "${outId}" is configured more than once in this look.`;
      seenOutputs.add(outId);
      const scIds = sc.propIds || [];
      if (scIds.length > MAX_LOOK_PROPS) return `A screen look can show at most ${MAX_LOOK_PROPS} props.`;
      if (scIds.some((id) => !id.trim())) return 'A screen configuration contains a blank prop.';
      if (new Set(scIds).size !== scIds.length) return 'A screen configuration lists the same prop twice.';
    }
  }

  return null;
}

/** True when the screen already matches the look (same logo, blackout and set of props).
 * If targetOutputId is provided, matches against that output's screenLayers (or falls back to global).
 * If the look specifies screenConfigs and no targetOutputId is given, checks if all configured screens match.
 */
export function lookMatches(
  look: Look,
  state: Pick<PresentationState, 'isLogo' | 'isBlackout' | 'activeProps' | 'screenLayers'>,
  targetOutputId?: string
): boolean {
  if (targetOutputId) {
    const sc = look.screenConfigs?.find((c) => c.outputId === targetOutputId);
    const screenLayer = state.screenLayers?.[targetOutputId];
    const effectiveLogo = screenLayer ? screenLayer.isLogo : !!state.isLogo;
    const effectiveBlackout = screenLayer ? screenLayer.isBlackout : !!state.isBlackout;
    const effectiveProps = (screenLayer ? screenLayer.activeProps : (state.activeProps || [])).map((p) => p.id);

    const expectedLogo = sc ? sc.logo : look.logo;
    const expectedBlackout = sc ? sc.blackout : look.blackout;
    const expectedProps = sc ? sc.propIds : look.propIds;

    return (
      effectiveLogo === expectedLogo &&
      effectiveBlackout === expectedBlackout &&
      effectiveProps.length === expectedProps.length &&
      expectedProps.every((id) => effectiveProps.includes(id))
    );
  }

  // If look has screenConfigs, check per-screen matching
  if (look.screenConfigs && look.screenConfigs.length > 0) {
    const screensMatch = look.screenConfigs.every((sc) => {
      const layer = state.screenLayers?.[sc.outputId];
      const logo = layer ? layer.isLogo : !!state.isLogo;
      const blackout = layer ? layer.isBlackout : !!state.isBlackout;
      const props = (layer ? layer.activeProps : (state.activeProps || [])).map((p) => p.id);
      return (
        logo === sc.logo &&
        blackout === sc.blackout &&
        props.length === sc.propIds.length &&
        sc.propIds.every((id) => props.includes(id))
      );
    });
    if (!screensMatch) return false;
  }

  const active = (state.activeProps || []).map((p) => p.id);
  return (
    !!state.isLogo === look.logo &&
    !!state.isBlackout === look.blackout &&
    active.length === look.propIds.length &&
    look.propIds.every((id) => active.includes(id))
  );
}
