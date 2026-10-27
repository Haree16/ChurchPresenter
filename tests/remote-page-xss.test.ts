import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REMOTE_RS = resolve(__dirname, '../src-tauri/src/remote.rs');

/** Pulls the playlist-row rendering loop out of the phone remote page source. */
function extractRowLoop(source: string): string {
  const start = source.indexOf('items.forEach((item, idx) => {');
  const endMarker = 'container.appendChild(row);';
  const end = source.indexOf(endMarker, start);
  if (start < 0 || end < 0) {
    throw new Error('Playlist rendering code moved in remote.rs: update the markers in this test.');
  }
  return source.slice(start, end + endMarker.length) + '\n});';
}

function render(loopCode: string, items: Array<Record<string, unknown>>) {
  document.body.innerHTML = '<div id="c"></div>';
  const container = document.getElementById('c') as HTMLElement;
  const jumped: number[] = [];
  const fn = new Function('items', 'container', 'jumpToSlide', 'document', loopCode);
  fn(items, container, (i: number) => jumped.push(i), document);
  return { container, jumped };
}

const HOSTILE = [
  '<img src=x onerror="window.__pwned = 1">',
  '<script>window.__pwned = 1</script>',
  '"><svg onload="window.__pwned = 1">',
  '<b>bold</b>',
];

describe('phone remote playlist rendering', () => {
  const code = extractRowLoop(readFileSync(REMOTE_RS, 'utf8'));

  it('shows item titles as plain text, never as HTML', () => {
    const { container } = render(code, HOSTILE.map((title) => ({ title })));
    expect(container.querySelectorAll('img, script, svg, b')).toHaveLength(0);
    const spans = Array.from(container.querySelectorAll('span')).map((s) => s.textContent);
    HOSTILE.forEach((title, i) => expect(spans[i]).toBe(`${i + 1}. ${title}`));
    expect((window as any).__pwned).toBeUndefined();
  });

  it('also treats the fallback "name" field as text', () => {
    const { container } = render(code, [{ name: '<img src=x onerror=1>' }]);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=1>');
  });

  it('uses a numbered fallback label when an item has no title', () => {
    const { container } = render(code, [{}, {}]);
    expect(container.textContent).toContain('1. Slide 1');
    expect(container.textContent).toContain('2. Slide 2');
  });

  it('still renders a Jump button per row and jumping works', () => {
    const { container, jumped } = render(code, [{ title: 'A' }, { title: 'B' }]);
    const rows = Array.from(container.children) as HTMLElement[];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.querySelector('button')?.textContent)).toEqual(['Jump', 'Jump']);
    rows[1].click();
    expect(jumped).toEqual([1]);
  });

  it('the previous implementation was vulnerable (guards this test against going vacuous)', () => {
    // the row-building code as it was before the fix, kept verbatim as a fixture
    const oldCode = `
      items.forEach((item, idx) => {
        const row = document.createElement('div');
        const label = item.title || item.name || ('Slide ' + (idx + 1));
        row.innerHTML = \`<span>\${idx + 1}. \${label}</span><button class="btn-sec">Jump</button>\`;
        row.onclick = () => jumpToSlide(idx);
        container.appendChild(row);
      });`;
    const { container } = render(oldCode, [{ title: '<img src=x>' }]);
    expect(container.querySelector('img')).not.toBeNull(); // old code turned the title into an element
  });
});
