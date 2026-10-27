/** Font names (not generic families) asked for by a CSS font-family list. */
export function namedFonts(fontFamily: string): string[] {
  const generic = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif',
    'ui-monospace', 'ui-rounded', 'math', 'emoji', 'fangsong', '-apple-system', 'blinkmacsystemfont',
  ]);
  return fontFamily
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, '').trim())
    .filter((f) => f && !generic.has(f.toLowerCase()));
}

type Measure = (font: string) => number | null;

const SAMPLE = 'mmmmmmmmmmlliWÀ௧க';

function canvasMeasure(): Measure | null {
  if (typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext?.('2d');
  if (!ctx) return null;
  return (font: string) => {
    ctx.font = font;
    return ctx.measureText(SAMPLE).width;
  };
}

/**
 * Whether a font is installed. Browsers cannot list system fonts, so this draws sample text in
 * the font and in two fallbacks: if the width differs from both, the font is really there.
 * When it cannot tell (no canvas), it says yes, so nobody gets a false warning.
 */
export function isFontAvailable(name: string, measure: Measure | null = canvasMeasure()): boolean {
  if (!measure) return true;
  const quoted = `"${name.replace(/"/g, '')}"`;
  const mono = measure('72px monospace');
  const serif = measure('72px serif');
  const monoTry = measure(`72px ${quoted}, monospace`);
  const serifTry = measure(`72px ${quoted}, serif`);
  if (mono == null || serif == null || monoTry == null || serifTry == null) return true;
  return monoTry !== mono || serifTry !== serif;
}

/** The named fonts from `families` that are not installed on this computer. */
export function missingFonts(families: string[], isAvailable: (f: string) => boolean = isFontAvailable): string[] {
  return families.filter((f) => !isAvailable(f));
}
