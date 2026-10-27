import { Prop } from '../types';

export const PROP_POSITIONS: { value: Prop['position']; label: string }[] = [
  { value: 'lower-third', label: 'Lower third' },
  { value: 'top-bar', label: 'Top bar' },
  { value: 'top-left', label: 'Top left' },
  { value: 'top-right', label: 'Top right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-bar', label: 'Bottom bar' },
  { value: 'center', label: 'Center' },
];

export const MAX_PROP_TEXT_CHARS = 200;
export const MAX_PROP_NAME_CHARS = 60;

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Same rules as the desktop backend, so the form can explain problems before saving. */
export function validateProp(p: Partial<Prop>): string | null {
  const name = (p.name || '').trim();
  if (!name) return 'Give the prop a name.';
  if ([...name].length > MAX_PROP_NAME_CHARS) return `Prop name is too long (maximum ${MAX_PROP_NAME_CHARS} characters).`;
  if (p.kind === 'text') {
    const text = (p.text || '').trim();
    if (!text) return 'A text prop needs some text.';
    if ([...text].length > MAX_PROP_TEXT_CHARS) return `Prop text is too long (maximum ${MAX_PROP_TEXT_CHARS} characters).`;
  } else if (p.kind === 'image') {
    if (!(p.imagePath || '').trim()) return 'An image prop needs an image.';
  } else {
    return `Unknown prop type '${p.kind}'. Use 'text' or 'image'.`;
  }
  if (!PROP_POSITIONS.some((x) => x.value === p.position)) return `Unknown position '${p.position}'.`;
  if (!Number.isInteger(p.sizePct) || (p.sizePct as number) < 1 || (p.sizePct as number) > 100) {
    return 'Size must be between 1 and 100.';
  }
  if (!HEX.test(p.textColor || '')) return 'Text colour must look like #ffffff.';
  if (p.backgroundColor != null && p.backgroundColor !== '' && !HEX.test(p.backgroundColor)) {
    return 'Background colour must look like #000000.';
  }
  return null;
}

/** CSS placement for each preset position (percent units keep it identical on any screen). */
export function propPlacement(position: Prop['position']): React.CSSProperties {
  switch (position) {
    case 'lower-third':
      return { left: '4vw', bottom: '9vh', maxWidth: '70vw' };
    case 'top-bar':
      return { left: 0, right: 0, top: 0, textAlign: 'center' };
    case 'bottom-bar':
      return { left: 0, right: 0, bottom: 0, textAlign: 'center' };
    case 'top-left':
      return { left: '3vw', top: '4vh' };
    case 'top-right':
      return { right: '3vw', top: '4vh' };
    case 'bottom-left':
      return { left: '3vw', bottom: '4vh' };
    case 'bottom-right':
      return { right: '3vw', bottom: '4vh' };
    case 'center':
    default:
      return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' };
  }
}
