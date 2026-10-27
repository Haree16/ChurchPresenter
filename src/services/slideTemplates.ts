import { SlideTemplate } from '../types';
import { isSafeMediaPath } from './slideElements';
import { validateLayout } from './slideLayout';

export const MAX_TEMPLATE_NAME_CHARS = 60;
export const MAX_TEMPLATES = 200;

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Same rules as the desktop backend (it also accepts rgb()/rgba() colours; editors only make hex). */
export function validateTemplate(t: Partial<SlideTemplate>): string | null {
  const name = (t.name || '').trim();
  if (!name) return 'Give the template a name.';
  if ([...name].length > MAX_TEMPLATE_NAME_CHARS) return `Template name is too long (maximum ${MAX_TEMPLATE_NAME_CHARS} characters).`;
  if (!HEX.test(t.backgroundColor || '')) return 'Background colour is not a valid colour.';
  if (!HEX.test(t.foregroundColor || '')) return 'Text colour is not a valid colour.';
  if (!['small', 'medium', 'large', 'xlarge'].includes(t.fontSize || '')) return `Unknown font size '${t.fontSize}'.`;
  if (!['left', 'center', 'right'].includes(t.textAlignment || '')) return `Unknown alignment '${t.textAlignment}'.`;
  if (t.backgroundImage && t.backgroundImage.trim() && !isSafeMediaPath(t.backgroundImage)) {
    return 'The background image must come from the media library.';
  }
  return validateLayout(t.layout);
}
