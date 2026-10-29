export const MAX_TEMPLATE_NAME_CHARS = 60;
export const MAX_TEMPLATES = 50;
export const MAX_TEMPLATE_ITEMS = 100;
export const MAX_SERVICE_TITLE_CHARS = 100;

/** Songs and scripture are the items a template can leave as empty slots. */
export const isSlot = (itemType: string): boolean => itemType === 'song' || itemType === 'bible';

/** The title of the placeholder that stands in for a song or scripture item. */
export const slotTitle = (itemType: string): string => (itemType === 'bible' ? 'Scripture reading' : 'Worship song');

/** Same rules as the desktop backend, so the screens can explain problems before saving. */
export function validateTemplateName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Give the template a name.';
  if ([...n].length > MAX_TEMPLATE_NAME_CHARS) return `Template name is too long (maximum ${MAX_TEMPLATE_NAME_CHARS} characters).`;
  return null;
}

export function validateServiceTitle(title: string): string | null {
  const t = title.trim();
  if (!t) return 'Give the service a title.';
  if ([...t].length > MAX_SERVICE_TITLE_CHARS) return `Service title is too long (maximum ${MAX_SERVICE_TITLE_CHARS} characters).`;
  return null;
}

/** A default title for a service made from a template: the template's name and the date, when there is one. */
export function defaultServiceTitle(templateName: string, date: string): string {
  return date ? `${templateName} ${date}` : templateName;
}
