import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { api } from '../src/services/api';
import {
  isSafeMediaPath, validateElement, validateElements, createElement, clampElement, cloneElements,
  MAX_ELEMENTS, MAX_ELEMENT_TEXT_CHARS,
} from '../src/services/slideElements';
import { validateLayout, isEmptyLayout, buildLayout } from '../src/services/slideLayout';
import { validateTemplate } from '../src/services/slideTemplates';
import { SlideElements } from '../src/components/SlideElements';
import { ElementsEditor } from '../src/components/ElementsEditor';
import { TemplatePanel } from '../src/components/TemplatePanel';
import { SlideEditorModal } from '../src/components/SlideEditorModal';
import { SlideCard } from '../src/components/SlideGrid';
import { AudienceView } from '../src/components/AudienceView';
import { SlideElement, Slide, SlideTemplate } from '../src/types';

const text = (over: Partial<SlideElement> = {}): SlideElement => ({
  id: 'a', kind: 'text', x: 10, y: 10, w: 40, h: 20, text: 'Welcome', fontSizePct: 8,
  color: '#ffffff', align: 'center', weight: 'bold', ...over,
});
const image = (over: Partial<SlideElement> = {}): SlideElement => ({
  id: 'i', kind: 'image', x: 5, y: 5, w: 20, h: 20, imagePath: 'media/logo.png', ...over,
});
const shape = (over: Partial<SlideElement> = {}): SlideElement => ({
  id: 's', kind: 'shape', x: 0, y: 80, w: 100, h: 20, shape: 'rect', fill: '#3b82f6', ...over,
});

const slide = (over: Partial<Slide> = {}): Slide => ({
  id: 'sl1', presentationId: 'p1', sortOrder: 0, title: 'T', body: 'Hello world',
  backgroundColor: '#000000', foregroundColor: '#ffffff', fontSize: 'large', textAlignment: 'center',
  createdAt: '', updatedAt: '', ...over,
});

describe('element rules', () => {
  it('accepts valid elements of every kind, including the edges', () => {
    for (const el of [text(), image(), shape(), text({ x: 0, y: 0, w: 100, h: 100, opacity: 0 })]) {
      expect(validateElement(el)).toBeNull();
    }
  });

  it('keeps boxes inside the slide with a visible size', () => {
    expect(validateElement(text({ x: -1 }))).toMatch(/position/);
    expect(validateElement(text({ y: 100.5 }))).toMatch(/position/);
    expect(validateElement(text({ w: 0.5 }))).toMatch(/size/);
    expect(validateElement(text({ x: 70, w: 40 }))).toMatch(/inside the slide/);
    expect(validateElement(text({ y: 95, h: 10 }))).toMatch(/inside the slide/);
    expect(validateElement(text({ x: NaN }))).toMatch(/position/);
    expect(validateElement(text({ opacity: 1.1 }))).toMatch(/opacity/);
  });

  it('checks each kind', () => {
    expect(validateElement(text({ text: '  ' }))).toMatch(/needs some text/);
    expect(validateElement(text({ text: 'x'.repeat(MAX_ELEMENT_TEXT_CHARS + 1) }))).toMatch(/too long/);
    expect(validateElement(text({ fontSizePct: 31 }))).toMatch(/text size/);
    expect(validateElement(text({ align: 'justify' as any }))).toMatch(/alignment/);
    expect(validateElement(text({ weight: '900' as any }))).toMatch(/weight/);
    expect(validateElement(text({ color: 'red' }))).toMatch(/colour/);
    expect(validateElement(image({ imagePath: '' }))).toMatch(/needs an image/);
    expect(validateElement(shape({ shape: 'star' as any }))).toMatch(/unknown shape/);
    expect(validateElement(shape({ shape: null }))).toMatch(/shape type/);
    expect(validateElement(shape({ fill: null }))).toMatch(/fill colour/);
    expect(validateElement({ ...text(), kind: 'video' as any })).toMatch(/unknown type/);
    expect(validateElement(text({ id: ' ' }))).toMatch(/id/);
  });

  it('only allows images from the media library', () => {
    for (const ok of ['media/logo.png', 'media/themes/a.png']) expect(isSafeMediaPath(ok)).toBe(true);
    for (const bad of [
      '', '  ', 'logo.png', '/etc/passwd', '../media/x.png', 'media/../../x', 'http://evil/x.png',
      'data:image/png;base64,AA', 'javascript:alert(1)', 'file:///x', 'C:\\x.png', 'media\\x.png', 'media/x\n.png',
    ]) {
      expect(isSafeMediaPath(bad)).toBe(false);
      expect(validateElement(image({ imagePath: bad }))).not.toBeNull();
    }
  });

  it('validates lists: limit, duplicate ids, and says which element is wrong', () => {
    expect(validateElements([])).toBeNull();
    expect(validateElements(null)).toBeNull();
    expect(validateElements([text({ id: 'a' }), text({ id: 'a' })])).toMatch(/Element 2: duplicate id/);
    expect(validateElements([text(), text({ id: 'b', x: 99 })])).toMatch(/^Element 2:/);
    const many = Array.from({ length: MAX_ELEMENTS + 1 }, (_, i) => text({ id: `e${i}` }));
    expect(validateElements(many)).toMatch(/at most/);
    expect(validateElements(many.slice(0, MAX_ELEMENTS))).toBeNull();
  });

  it('new elements are valid, unique and start inside the slide', () => {
    const made = [createElement('text'), createElement('shape'), createElement('image', 'media/a.png')];
    for (const el of made) expect(validateElement(el)).toBeNull();
    expect(new Set(made.map((m) => m.id)).size).toBe(3);
    // an image with nothing chosen yet is not valid until one is picked
    expect(validateElement(createElement('image'))).toMatch(/needs an image/);
  });

  it('clamps moves and resizes back inside the slide, and clones with fresh ids', () => {
    expect(clampElement(text({ x: 90, y: -5, w: 40, h: 20 }))).toMatchObject({ x: 60, y: 0 });
    expect(clampElement(text({ x: 0, y: 0, w: 300, h: 0 }))).toMatchObject({ w: 100, h: 1 });
    const originals = [text({ id: 'a' }), shape({ id: 'b' })];
    const copies = cloneElements(originals);
    expect(copies.map((c) => c.kind)).toEqual(['text', 'shape']);
    expect(copies.every((c, i) => c.id !== originals[i].id)).toBe(true);
    expect(cloneElements(null)).toEqual([]);
  });
});

describe('layout with elements', () => {
  it('validates elements as part of the layout and counts them as content', () => {
    expect(validateLayout({ elements: [text()] })).toBeNull();
    expect(validateLayout({ elements: [text({ x: 99 })] })).toMatch(/Element 1/);
    expect(isEmptyLayout({ elements: [] })).toBe(true);
    expect(isEmptyLayout({ elements: [text()] })).toBe(false);
  });

  it('buildLayout keeps elements, so changing margin or outline never drops them', () => {
    const els = [text(), shape()];
    expect(buildLayout(5, 0, '#000000', els)).toEqual({ marginPct: 5, elements: els });
    expect(buildLayout(0, 0, '#000000', els)).toEqual({ elements: els });
    expect(buildLayout(0, 0, '#000000')).toEqual({});
    expect(buildLayout(0, 0, '#000000', [])).toEqual({});
  });
});

describe('SlideElements', () => {
  it('draws nothing without elements', () => {
    const { container } = render(<SlideElements elements={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('positions every kind in percent and sizes text from the slide height', () => {
    render(<SlideElements heightPx={500} elements={[text({ opacity: 0.5, fontSizePct: 10 }), shape({ shape: 'ellipse' }), image()]} />);
    const items = screen.getAllByTestId('slide-element');
    expect(items.map((i) => i.getAttribute('data-kind'))).toEqual(['text', 'shape', 'image']);

    const [t, s, img] = items;
    expect(t.style.left).toBe('10%');
    expect(t.style.top).toBe('10%');
    expect(t.style.width).toBe('40%');
    expect(t.style.height).toBe('20%');
    expect(t.style.opacity).toBe('0.5');
    expect(t.style.fontSize).toBe('50px'); // 10% of 500px
    expect(t.textContent).toBe('Welcome');
    expect(s.style.borderRadius).toBe('50%');
    expect(s.style.backgroundColor).toBe('rgb(59, 130, 246)');
    expect(img.querySelector('img')).toBeTruthy();
  });

  it('draws later elements on top of earlier ones (DOM order is stacking order)', () => {
    render(<SlideElements heightPx={100} elements={[text({ id: 'first', text: 'first' }), text({ id: 'second', text: 'second' })]} />);
    expect(screen.getAllByTestId('slide-element').map((e) => e.textContent)).toEqual(['first', 'second']);
  });

  it('shows text as plain text and ignores colours that are not hex', () => {
    render(<SlideElements heightPx={100} elements={[text({ text: '<img src=x onerror=1>', color: 'red;position:fixed', fill: 'url(x)' })]} />);
    const el = screen.getByTestId('slide-element');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=1>');
    expect(el.style.color).toBe('rgb(255, 255, 255)');
    expect(el.style.backgroundColor).toBe('');
  });

  it('skips images that are not from the media library', () => {
    const { container } = render(
      <SlideElements heightPx={100} elements={[image({ id: 'bad', imagePath: 'http://evil/x.png' }), image({ id: 'ok' })]} />
    );
    expect(screen.getAllByTestId('slide-element')).toHaveLength(1);
    // (an <img alt=""> has no accessible role, so query it directly)
    const imgs = container.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).not.toContain('evil');
  });

  it('does not intercept clicks unless editing, and then only on the elements', () => {
    const { rerender } = render(<SlideElements heightPx={100} elements={[text()]} />);
    expect((screen.getByTestId('slide-elements') as HTMLElement).style.pointerEvents).toBe('none');
    expect((screen.getByTestId('slide-element') as HTMLElement).style.pointerEvents).toBe('');

    const onSelect = vi.fn();
    const onDown = vi.fn();
    rerender(<SlideElements heightPx={100} interactive selectedId="a" onSelect={onSelect} onElementPointerDown={onDown} elements={[text()]} />);
    expect((screen.getByTestId('slide-elements') as HTMLElement).style.pointerEvents).toBe('none');
    const el = screen.getByTestId('slide-element') as HTMLElement;
    expect(el.style.pointerEvents).toBe('auto');
    fireEvent.pointerDown(el);
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(onDown).toHaveBeenCalledWith('a', expect.anything());
    expect(el.style.outline).toContain('#38bdf8');
  });
});

describe('where elements are drawn', () => {
  const withEls = slide({ layout: { elements: [text({ text: 'Church name' }), shape()] } });

  it('slide cards', () => {
    render(
      <SlideCard
        slide={withEls} index={0} totalSlides={1} isLive={false} isNext={false} isConfirmingDelete={false}
        onGoLive={vi.fn()} onEditSlide={vi.fn()} onDuplicateSlide={vi.fn()} onRequestDelete={vi.fn()}
        onCancelDelete={vi.fn()} onConfirmDelete={vi.fn()} onMoveUp={vi.fn()} onMoveDown={vi.fn()}
      />
    );
    expect(screen.getAllByTestId('slide-element')).toHaveLength(2);
  });

  it('the audience screen, above the slide text', async () => {
    await api.clearAll();
    const pres = await api.createPresentation('Els', 'Worship');
    const s = await api.createSlide(pres.id, { title: 'x', body: 'Main text', layout: { elements: [text({ text: 'Header' })] } });
    await api.setLiveSlide(pres.id, s.id);
    render(<AudienceView />);
    await waitFor(() => expect(screen.getByTestId('audience-slide-body').textContent).toBe('Main text'));
    expect(screen.getByTestId('slide-element').textContent).toBe('Header');
    const display = screen.getByTestId('audience-display');
    const pos = (el: Element) => Array.from(display.querySelectorAll('*')).indexOf(el);
    expect(pos(screen.getByTestId('slide-element'))).toBeGreaterThan(pos(screen.getByTestId('audience-slide-body')));
    await api.clearAll();
  });
});

describe('Elements through the API (mock)', () => {
  it('stores elements with a slide, keeps them across edits that send no layout, and rejects bad ones', async () => {
    const pres = await api.createPresentation('Api', 'Worship');
    const s = await api.createSlide(pres.id, { title: 'x', body: 'y', layout: { elements: [text()] } });
    expect(s.layout?.elements).toHaveLength(1);

    expect((await api.updateSlide(s.id, { title: 'renamed' })).layout?.elements).toHaveLength(1);
    expect((await api.updateSlide(s.id, { layout: { elements: [text(), shape()] } })).layout?.elements).toHaveLength(2);
    expect((await api.updateSlide(s.id, { layout: {} })).layout).toBeNull();

    await expect(api.updateSlide(s.id, { layout: { elements: [text({ x: 99 })] } })).rejects.toThrow(/Element 1/);
    await expect(api.createSlide(pres.id, { layout: { elements: [image({ imagePath: 'http://x/y.png' })] } })).rejects.toThrow(/media library/);
  });
});

describe('ElementsEditor', () => {
  const Harness = ({ initial = [] as SlideElement[] }) => {
    const [els, setEls] = useState<SlideElement[]>(initial);
    const [sel, setSel] = useState<string | null>(null);
    return (
      <>
        <ElementsEditor elements={els} onChange={setEls} selectedId={sel} onSelect={setSel} />
        <output data-testid="json">{JSON.stringify(els)}</output>
      </>
    );
  };
  const state = () => JSON.parse(screen.getByTestId('json').textContent || '[]') as SlideElement[];

  it('adds text, shape and image elements and selects the new one', async () => {
    await api.importMediaAsset('/m/logo.png');
    render(<Harness />);
    await waitFor(() => expect(screen.getByTestId('add-image-element')).toBeTruthy());
    await waitFor(async () => expect((await api.listMediaAssets()).length).toBeGreaterThan(0));

    fireEvent.click(screen.getByTestId('add-text-element'));
    fireEvent.click(screen.getByTestId('add-shape-element'));
    fireEvent.click(screen.getByTestId('add-image-element'));
    expect(state().map((e) => e.kind)).toEqual(['text', 'shape', 'image']);
    expect(screen.getAllByTestId('element-row')).toHaveLength(3);
    expect(screen.getAllByTestId('element-row')[2].getAttribute('aria-pressed')).toBe('true');
  });

  it('edits text, position, size and style of the selected element and keeps it inside the slide', () => {
    render(<Harness initial={[text({ id: 'a' })]} />);
    fireEvent.click(screen.getByTestId('element-row'));

    fireEvent.change(screen.getByTestId('element-text'), { target: { value: 'Hello' } });
    fireEvent.change(screen.getByTestId('element-font-size'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('element-align'), { target: { value: 'left' } });
    fireEvent.change(screen.getByTestId('element-weight'), { target: { value: 'normal' } });
    fireEvent.change(screen.getByTestId('element-color'), { target: { value: '#ff0000' } });
    fireEvent.change(screen.getByTestId('element-opacity'), { target: { value: '40' } });
    fireEvent.change(screen.getByTestId('element-x'), { target: { value: '90' } }); // would overflow: w is 40
    expect(state()[0]).toMatchObject({ text: 'Hello', fontSizePct: 12, align: 'left', weight: 'normal', color: '#ff0000', opacity: 0.4, x: 60 });

    fireEvent.click(screen.getByTestId('element-backing'));
    expect(state()[0].fill).toBe('#000000');
    fireEvent.click(screen.getByTestId('element-backing'));
    expect(state()[0].fill).toBeNull();
  });

  it('edits shapes', () => {
    render(<Harness initial={[shape({ id: 's' })]} />);
    fireEvent.click(screen.getByTestId('element-row'));
    fireEvent.change(screen.getByTestId('element-shape'), { target: { value: 'ellipse' } });
    fireEvent.change(screen.getByTestId('element-fill'), { target: { value: '#00ff00' } });
    expect(state()[0]).toMatchObject({ shape: 'ellipse', fill: '#00ff00' });
  });

  it('reorders (stacking order) and deletes', () => {
    render(<Harness initial={[text({ id: 'a', text: 'A' }), text({ id: 'b', text: 'B' }), text({ id: 'c', text: 'C' })]} />);
    fireEvent.click(screen.getAllByTestId('element-row')[0]);
    expect((screen.getByTestId('element-back') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('element-forward'));
    expect(state().map((e) => e.id)).toEqual(['b', 'a', 'c']);
    fireEvent.click(screen.getByTestId('element-forward'));
    expect((screen.getByTestId('element-forward') as HTMLButtonElement).disabled).toBe(true);
    expect(state().map((e) => e.id)).toEqual(['b', 'c', 'a']);

    fireEvent.click(screen.getByTestId('element-delete'));
    expect(state().map((e) => e.id)).toEqual(['b', 'c']);
    expect(screen.queryByTestId('element-text')).toBeNull(); // nothing selected any more
  });

  it('stops adding at the maximum', () => {
    const full = Array.from({ length: MAX_ELEMENTS }, (_, i) => text({ id: `e${i}` }));
    render(<Harness initial={full} />);
    for (const id of ['add-text-element', 'add-image-element', 'add-shape-element']) {
      expect((screen.getByTestId(id) as HTMLButtonElement).disabled).toBe(true);
    }
  });
});

describe('Slide editor with elements', () => {
  const open = (s: Slide, onSave = vi.fn().mockResolvedValue(null)) => {
    render(<SlideEditorModal slide={s} isOpen onClose={vi.fn()} onSave={onSave} />);
    return onSave;
  };

  it('saves added elements in the layout, with margin and outline kept', async () => {
    const onSave = open(slide({ layout: { marginPct: 6 } }));
    fireEvent.click(screen.getByTestId('add-text-element'));
    fireEvent.change(screen.getByTestId('element-text'), { target: { value: 'Welcome!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const layout = onSave.mock.calls[0][1].layout;
    expect(layout.marginPct).toBe(6);
    expect(layout.elements).toHaveLength(1);
    expect(layout.elements[0]).toMatchObject({ kind: 'text', text: 'Welcome!' });
  });

  it('changing the safe margin never drops existing elements', async () => {
    const onSave = open(slide({ layout: { elements: [text({ id: 'keep' })] } }));
    fireEvent.change(screen.getByTestId('layout-margin'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1].layout).toMatchObject({ marginPct: 9, elements: [{ id: 'keep' }] });
  });

  it('refuses to save an invalid element and says why', async () => {
    const onSave = open(slide());
    fireEvent.click(screen.getByTestId('add-text-element'));
    fireEvent.change(screen.getByTestId('element-text'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    await waitFor(() => expect(screen.getByTestId('editor-save-error').textContent).toMatch(/Element 1: a text box needs some text/));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a save failure from the backend instead of closing', async () => {
    const onSave = vi.fn().mockRejectedValue('Slide 1: boom');
    open(slide(), onSave);
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    await waitFor(() => expect(screen.getByTestId('editor-save-error').textContent).toBe('Slide 1: boom'));
  });

  it('dragging an element in the preview moves it by the same percentage of the preview size', () => {
    open(slide({ layout: { elements: [text({ id: 'drag', x: 10, y: 10, w: 20, h: 10 })] } }));
    const preview = screen.getByTestId('editor-preview');
    preview.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, toJSON: () => ({}) });

    const el = screen.getByTestId('slide-element');
    // a MouseEvent with the pointerdown type carries clientX/clientY in every jsdom version
    fireEvent(el, new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }));
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 140, clientY: 120 })); // +10% x, +10% y
    });
    fireEvent.click(screen.getByTestId('element-row'));
    expect((screen.getByTestId('element-x') as HTMLInputElement).value).toBe('20');
    expect((screen.getByTestId('element-y') as HTMLInputElement).value).toBe('20');

    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 9999, clientY: 9999 })); // far outside
      window.dispatchEvent(new MouseEvent('pointerup'));
    });
    // clamped inside the slide: x + w <= 100, y + h <= 100
    expect((screen.getByTestId('element-x') as HTMLInputElement).value).toBe('80');
    expect((screen.getByTestId('element-y') as HTMLInputElement).value).toBe('90');

    // after release further movement does nothing
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: 0 }));
    });
    expect((screen.getByTestId('element-x') as HTMLInputElement).value).toBe('80');
  });

  it('clicking empty preview space deselects the element', () => {
    open(slide({ layout: { elements: [text({ id: 'a' })] } }));
    fireEvent.click(screen.getByTestId('element-row'));
    expect(screen.getByTestId('element-text')).toBeTruthy();
    fireEvent.pointerDown(screen.getByTestId('editor-preview'));
    expect(screen.queryByTestId('element-text')).toBeNull();
  });
});

describe('Templates', () => {
  const look = (over: Partial<Omit<SlideTemplate, 'id' | 'name'>> = {}) => ({
    backgroundColor: '#0a0f1d', foregroundColor: '#ffffff', fontSize: 'large' as const, textAlignment: 'center' as const,
    backgroundImage: null, layout: { marginPct: 6, elements: [text({ id: 'h' })] }, ...over,
  });

  it('template rules', () => {
    const ok = { name: 'T', ...look() };
    expect(validateTemplate(ok)).toBeNull();
    expect(validateTemplate({ ...ok, name: ' ' })).toMatch(/name/);
    expect(validateTemplate({ ...ok, name: 'n'.repeat(61) })).toMatch(/too long/);
    expect(validateTemplate({ ...ok, backgroundColor: 'red' })).toMatch(/Background colour/);
    expect(validateTemplate({ ...ok, foregroundColor: 'url(x)' })).toMatch(/Text colour/);
    expect(validateTemplate({ ...ok, fontSize: 'huge' as any })).toMatch(/font size/);
    expect(validateTemplate({ ...ok, textAlignment: 'justify' as any })).toMatch(/alignment/);
    expect(validateTemplate({ ...ok, backgroundImage: 'http://evil/x.png' })).toMatch(/media library/);
    expect(validateTemplate({ ...ok, layout: { marginPct: 99 } })).toMatch(/margin/);
    expect(validateTemplate({ ...ok, layout: { elements: [text({ x: 99 })] } })).toMatch(/Element 1/);
  });

  it('API: create, list, update and delete; invalid ones are rejected', async () => {
    await expect(api.createSlideTemplate({ id: '', name: '', ...look() } as SlideTemplate)).rejects.toThrow(/name/);
    const a = await api.createSlideTemplate({ id: '', name: '  Announcement  ', ...look() } as SlideTemplate);
    expect(a.name).toBe('Announcement');
    expect((await api.listSlideTemplates()).some((t) => t.id === a.id)).toBe(true);

    const updated = await api.updateSlideTemplate({ ...a, fontSize: 'xlarge', layout: null });
    expect(updated.fontSize).toBe('xlarge');
    expect(updated.layout).toBeNull();
    await expect(api.updateSlideTemplate({ ...a, id: 'ghost' })).rejects.toThrow(/no longer exists/);
    await expect(api.updateSlideTemplate({ ...a, fontSize: 'x' as any })).rejects.toThrow(/font size/);

    await api.deleteSlideTemplate(a.id);
    expect((await api.listSlideTemplates()).some((t) => t.id === a.id)).toBe(false);
  });

  it('TemplatePanel saves the current look, lists it and applies or deletes it', async () => {
    const onApply = vi.fn();
    render(<TemplatePanel current={look({ backgroundColor: '#123456' })} onApply={onApply} />);

    expect((screen.getByTestId('template-save') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('template-name'), { target: { value: 'Sermon title' } });
    fireEvent.click(screen.getByTestId('template-save'));
    await waitFor(() => expect(screen.getByTestId('template-message').textContent).toBe('Saved template "Sermon title".'));

    const select = screen.getByTestId('template-select') as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).some((o) => o.text === 'Sermon title')).toBe(true));
    expect(select.options[select.selectedIndex].text).toBe('Sermon title'); // the new one is selected

    fireEvent.click(screen.getByTestId('template-apply'));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sermon title', backgroundColor: '#123456' }));

    fireEvent.click(screen.getByTestId('template-delete'));
    await waitFor(() => expect(screen.getByTestId('template-message').textContent).toBe('Deleted "Sermon title".'));
    expect(Array.from(select.options).some((o) => o.text === 'Sermon title')).toBe(false);
  });

  it('TemplatePanel shows why a template could not be saved', async () => {
    render(<TemplatePanel current={look({ backgroundImage: 'http://evil/x.png' })} onApply={vi.fn()} />);
    fireEvent.change(screen.getByTestId('template-name'), { target: { value: 'Bad' } });
    fireEvent.click(screen.getByTestId('template-save'));
    await waitFor(() => expect(screen.getByTestId('template-error').textContent).toMatch(/media library/));
  });

  it('applying a template replaces the look but keeps the text, with fresh element ids', async () => {
    const tpl = await api.createSlideTemplate({
      id: '', name: 'Lower third', backgroundColor: '#112233', foregroundColor: '#fef08a', fontSize: 'xlarge',
      textAlignment: 'left', backgroundImage: null,
      layout: { marginPct: 8, outlineWidth: 2, outlineColor: '#000000', elements: [shape({ id: 'bar' })] },
    } as SlideTemplate);
    const onSave = vi.fn().mockResolvedValue(null);
    const s = slide({ body: 'Keep this text', backgroundImage: 'media/old.png', layout: { elements: [text({ id: 'old' })] } });
    render(<SlideEditorModal slide={s} isOpen onClose={vi.fn()} onSave={onSave} />);

    const select = screen.getByTestId('template-select') as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).some((o) => o.value === tpl.id)).toBe(true));
    fireEvent.change(select, { target: { value: tpl.id } });
    fireEvent.click(screen.getByTestId('template-apply'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0][1];
    expect(saved).toMatchObject({
      body: 'Keep this text', backgroundColor: '#112233', foregroundColor: '#fef08a', fontSize: 'xlarge',
      textAlignment: 'left', backgroundImage: null,
    });
    expect(saved.layout).toMatchObject({ marginPct: 8, outlineWidth: 2 });
    expect(saved.layout.elements).toHaveLength(1);
    expect(saved.layout.elements[0]).toMatchObject({ kind: 'shape', fill: '#3b82f6' });
    expect(saved.layout.elements[0].id).not.toBe('bar'); // never shared between slides
    expect(saved.layout.elements.some((e: SlideElement) => e.id === 'old')).toBe(false); // old ones replaced
  });
});
