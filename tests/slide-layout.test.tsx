import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import {
  validateLayout, isEmptyLayout, buildLayout, layoutPadding, layoutPaddingPercent,
  outlineTextShadow, composeTextShadow,
} from '../src/services/slideLayout';
import { LayoutControls, layoutValuesFrom } from '../src/components/LayoutControls';
import { SlideEditorModal } from '../src/components/SlideEditorModal';
import { SlideCard } from '../src/components/SlideGrid';
import { AudienceView } from '../src/components/AudienceView';
import { PreviewPanel } from '../src/components/PreviewPanel';
import { ThemeManagerModal } from '../src/components/Themes/ThemeManagerModal';
import { Slide } from '../src/types';

const slide = (over: Partial<Slide> = {}): Slide => ({
  id: 's1', presentationId: 'p1', sortOrder: 0, title: 'T', body: 'Hello world',
  backgroundColor: '#000000', foregroundColor: '#ffffff', fontSize: 'large', textAlignment: 'center',
  createdAt: '', updatedAt: '', ...over,
});

describe('layout helpers', () => {
  it('validates limits, edges and non-finite numbers', () => {
    expect(validateLayout(null)).toBeNull();
    expect(validateLayout({})).toBeNull();
    expect(validateLayout({ marginPct: 0, outlineWidth: 0, outlineColor: '#000000' })).toBeNull();
    expect(validateLayout({ marginPct: 25, outlineWidth: 20 })).toBeNull();
    for (const m of [-1, 25.1, NaN, Infinity]) expect(validateLayout({ marginPct: m })).toMatch(/margin/);
    for (const w of [-1, 20.1, NaN]) expect(validateLayout({ outlineWidth: w })).toMatch(/Outline width/);
    for (const c of ['red', '#fff', '#12345g', '#000000;x', 'url(x)']) {
      expect(validateLayout({ outlineColor: c })).toMatch(/Outline colour/);
    }
  });

  it('treats missing or all-empty layouts as empty', () => {
    expect(isEmptyLayout(null)).toBe(true);
    expect(isEmptyLayout({})).toBe(true);
    expect(isEmptyLayout({ marginPct: 0 })).toBe(false);
    expect(isEmptyLayout({ outlineColor: '#000000' })).toBe(false);
  });

  it('builds a layout from editor values, dropping defaults', () => {
    expect(buildLayout(0, 0, '#ff0000')).toEqual({});
    expect(buildLayout(5, 0, '#ff0000')).toEqual({ marginPct: 5 });
    expect(buildLayout(0, 3, '#ff0000')).toEqual({ outlineWidth: 3, outlineColor: '#ff0000' });
    expect(buildLayout(5, 3, '#00ff00')).toEqual({ marginPct: 5, outlineWidth: 3, outlineColor: '#00ff00' });
  });

  it('padding keeps the default unless a margin is set, and never exceeds the maximum', () => {
    expect(layoutPadding(null)).toBeNull();
    expect(layoutPadding({ marginPct: 0 })).toBeNull();
    expect(layoutPadding({ marginPct: 6 })).toBe('6vh 6vw');
    expect(layoutPadding({ marginPct: 99 })).toBe('25vh 25vw');
    expect(layoutPaddingPercent({ marginPct: 6 })).toBe('6%');
    expect(layoutPaddingPercent({})).toBeNull();
  });

  it('draws the outline as a ring of shadows in the chosen colour, thicker = more steps', () => {
    expect(outlineTextShadow(null)).toBeNull();
    expect(outlineTextShadow({ outlineWidth: 0 })).toBeNull();
    const thin = outlineTextShadow({ outlineWidth: 2, outlineColor: '#112233' })!;
    expect(thin.split(', ').filter((p) => p.endsWith('#112233'))).toHaveLength(8);
    const thick = outlineTextShadow({ outlineWidth: 12, outlineColor: '#112233' })!;
    expect(thick.split(', ').filter((p) => p.endsWith('#112233'))).toHaveLength(16);
    // radius scales with width, in em
    expect(thin).toContain('0.050em 0.000em 0 #112233');
  });

  it('falls back to black for a bad outline colour instead of passing text into CSS', () => {
    const s = outlineTextShadow({ outlineWidth: 3, outlineColor: 'red; position:fixed' })!;
    expect(s).not.toMatch(/position/);
    expect(s).toContain('#000000');
  });

  it('puts the outline on top of the slide shadow, and returns nothing when there is neither', () => {
    expect(composeTextShadow(null, null)).toBeUndefined();
    expect(composeTextShadow(null, 'none')).toBeUndefined();
    expect(composeTextShadow(null, '0 2px 8px #000')).toBe('0 2px 8px #000');
    const both = composeTextShadow({ outlineWidth: 2, outlineColor: '#ffffff' }, '0 2px 8px #000')!;
    expect(both.endsWith(', 0 2px 8px #000')).toBe(true);
    expect(both.startsWith('0.050em')).toBe(true);
  });
});

describe('LayoutControls', () => {
  it('reports slider and colour changes and resets to default', () => {
    const onChange = vi.fn();
    const values = { marginPct: 4, outlineWidth: 2, outlineColor: '#000000' };
    render(<LayoutControls values={values} onChange={onChange} />);
    expect(screen.getByTestId('layout-margin-value').textContent).toBe('4%');
    expect(screen.getByTestId('layout-outline-value').textContent).toBe('2 pt');

    fireEvent.change(screen.getByTestId('layout-margin'), { target: { value: '10' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...values, marginPct: 10 });
    fireEvent.change(screen.getByTestId('layout-outline-width'), { target: { value: '7' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...values, outlineWidth: 7 });
    fireEvent.change(screen.getByTestId('layout-outline-color'), { target: { value: '#ff0000' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...values, outlineColor: '#ff0000' });
    fireEvent.click(screen.getByTestId('layout-reset'));
    expect(onChange).toHaveBeenLastCalledWith({ ...values, marginPct: 0, outlineWidth: 0 });
  });

  it('shows Default/None, disables reset and the colour when nothing is set', () => {
    render(<LayoutControls values={layoutValuesFrom(null)} onChange={vi.fn()} />);
    expect(screen.getByTestId('layout-margin-value').textContent).toBe('Default');
    expect(screen.getByTestId('layout-outline-value').textContent).toBe('None');
    expect((screen.getByTestId('layout-reset') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId('layout-outline-color') as HTMLInputElement).disabled).toBe(true);
  });
});

describe('where the layout is drawn', () => {
  it('slide cards add margin and outline only when the slide has a layout', () => {
    const props = {
      index: 0, totalSlides: 1, isLive: false, isNext: false, isConfirmingDelete: false,
      onGoLive: vi.fn(), onEditSlide: vi.fn(), onDuplicateSlide: vi.fn(), onRequestDelete: vi.fn(),
      onCancelDelete: vi.fn(), onConfirmDelete: vi.fn(), onMoveUp: vi.fn(), onMoveDown: vi.fn(),
    };
    const { container, rerender } = render(<SlideCard slide={slide()} {...props} />);
    const textEl = () => container.querySelector('.multilingual-text') as HTMLElement;
    expect(textEl().style.textShadow).toBe('');

    rerender(<SlideCard slide={slide({ layout: { marginPct: 8, outlineWidth: 3, outlineColor: '#ff0000' } })} {...props} />);
    expect(textEl().style.textShadow).toContain('#ff0000');
    expect((textEl().parentElement as HTMLElement).style.padding).toBe('8%');
  });

  it('audience screen uses the slide margin and outline, and the old look without them', async () => {
    await api.clearAll();
    const pres = await api.createPresentation('Layout', 'Worship');
    const plain = await api.createSlide(pres.id, { title: 'a', body: 'Plain' });
    const styled = await api.createSlide(pres.id, {
      title: 'b', body: 'Styled', layout: { marginPct: 9, outlineWidth: 4, outlineColor: '#00ff00' },
    });

    await api.setLiveSlide(pres.id, plain.id);
    const { unmount } = render(<AudienceView />);
    await waitFor(() => expect(screen.getByTestId('audience-slide-body').textContent).toBe('Plain'));
    expect((screen.getByTestId('audience-display') as HTMLElement).style.padding).toBe('5vw 6vw');
    expect((screen.getByTestId('audience-slide-body') as HTMLElement).style.textShadow).not.toContain('#00ff00');
    unmount();

    await api.setLiveSlide(pres.id, styled.id);
    render(<AudienceView />);
    await waitFor(() => expect(screen.getByTestId('audience-slide-body').textContent).toBe('Styled'));
    expect((screen.getByTestId('audience-display') as HTMLElement).style.padding).toBe('9vh 9vw');
    const shadow = (screen.getByTestId('audience-slide-body') as HTMLElement).style.textShadow;
    expect(shadow).toContain('#00ff00');
    expect(shadow).toContain('rgba(0, 0, 0, 0.85)'); // the default shadow is still there
    await api.clearAll();
  });

  it('operator preview shows the live slide with its layout', () => {
    render(
      <PreviewPanel
        presentationState={{
          currentPresentationId: 'p', currentSlideId: 's', currentSlideIndex: 0, totalSlides: 1,
          currentSlide: slide({ layout: { marginPct: 7, outlineWidth: 2, outlineColor: '#123456' } }),
          nextSlide: null, isBlackout: false, isLive: true,
        }}
        audienceStatus={{ isOpen: false } as any}
        onNext={vi.fn()} onPrevious={vi.fn()} onToggleBlackout={vi.fn()} onToggleAudienceWindow={vi.fn()}
      />
    );
    const body = screen.getByText('Hello world');
    expect(body.style.textShadow).toContain('#123456');
    expect((body.parentElement as HTMLElement).style.padding).toBe('7%');
  });
});

describe('SlideEditorModal', () => {
  const full = slide({
    backgroundImage: 'media/bg.jpg', overlayColor: 'rgba(0,0,0,0.4)', lineSpacing: 1.5,
    textShadow: '0 1px 2px #000', verticalAlignment: 'top', fontFamily: 'Noto Sans Tamil',
    fontWeight: 'bold', themeOverride: 'theme-x', layout: { marginPct: 6 },
  });

  it('shows the slide layout and updates the preview as sliders move', () => {
    render(<SlideEditorModal slide={full} isOpen onClose={vi.fn()} onSave={vi.fn()} />);
    expect((screen.getByTestId('layout-margin') as HTMLInputElement).value).toBe('6');
    fireEvent.change(screen.getByTestId('layout-outline-width'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('layout-outline-color'), { target: { value: '#ff00ff' } });
    const preview = screen.getAllByText('Hello world').pop() as HTMLElement;
    expect(preview.style.textShadow).toContain('#ff00ff');
  });

  it('saves the whole slide plus the new layout, so style fields are not reset', async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<SlideEditorModal slide={full} isOpen onClose={vi.fn()} onSave={onSave} />);
    fireEvent.change(screen.getByTestId('layout-outline-width'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());

    const [id, payload] = onSave.mock.calls[0];
    expect(id).toBe('s1');
    expect(payload).toMatchObject({
      backgroundImage: 'media/bg.jpg', overlayColor: 'rgba(0,0,0,0.4)', lineSpacing: 1.5,
      textShadow: '0 1px 2px #000', verticalAlignment: 'top', fontFamily: 'Noto Sans Tamil',
      fontWeight: 'bold', themeOverride: 'theme-x',
      layout: { marginPct: 6, outlineWidth: 3, outlineColor: '#000000' },
    });
  });

  it('sends an empty layout (which clears it) when everything is reset', async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<SlideEditorModal slide={full} isOpen onClose={vi.fn()} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('layout-reset'));
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1].layout).toEqual({});
  });
});

describe('Layout through the API (mock)', () => {
  it('keeps the stored layout when an update sends none, replaces it, clears it with {}, and rejects bad values', async () => {
    const pres = await api.createPresentation('L2', 'Worship');
    const s = await api.createSlide(pres.id, { title: 'x', body: 'y', layout: { marginPct: 4 } });
    expect(s.layout).toEqual({ marginPct: 4 });

    const renamed = await api.updateSlide(s.id, { title: 'renamed' });
    expect(renamed.layout).toEqual({ marginPct: 4 });

    const replaced = await api.updateSlide(s.id, { layout: { outlineWidth: 2, outlineColor: '#ffffff' } });
    expect(replaced.layout).toEqual({ outlineWidth: 2, outlineColor: '#ffffff' });

    expect((await api.updateSlide(s.id, { layout: {} })).layout).toBeNull();

    await expect(api.updateSlide(s.id, { layout: { marginPct: 80 } })).rejects.toThrow(/margin/);
    await expect(api.createSlide(pres.id, { layout: { outlineColor: 'red' } })).rejects.toThrow(/Outline colour/);
  });

  it('slides made from a theme inherit its layout; themes without one change nothing', async () => {
    const theme = await api.createTheme({ name: 'Outlined', layout: { marginPct: 6, outlineWidth: 3, outlineColor: '#101010' } });
    await expect(api.createTheme({ name: 'Bad', layout: { marginPct: 500 } })).rejects.toThrow(/margin/);

    const service = await api.createService({ title: 'Layout service' });
    const item = await api.addSongToService(service.id, 'song-amazing-grace', theme.id, 2);
    const slides = await api.getServiceItemSlides(item.id);
    expect(slides.length).toBeGreaterThan(0);
    expect(slides.every((x) => x.layout?.marginPct === 6 && x.layout?.outlineWidth === 3)).toBe(true);

    const generated = await api.generateSlidesFromSong({
      songId: 'song-amazing-grace', sectionIds: [], themeId: theme.id, createNewPresentation: true, newPresentationTitle: 'G',
    });
    expect(generated.slides.every((x) => x.layout?.outlineColor === '#101010')).toBe(true);

    const plain = await api.addSongToService(service.id, 'song-amazing-grace', undefined, 2);
    expect((await api.getServiceItemSlides(plain.id)).every((x) => !x.layout)).toBe(true);

    const updated = await api.updateTheme({ ...theme, layout: {} });
    expect(updated.layout).toBeNull();
  });
});

describe('ThemeManagerModal layout controls', () => {
  it('edits and saves a custom theme layout; built-in themes are read-only', async () => {
    const theme = await api.createTheme({ name: 'Mine' });
    const spy = vi.spyOn(api, 'updateTheme');
    render(<ThemeManagerModal isOpen onClose={vi.fn()} />);

    fireEvent.click(await screen.findByText('Mine'));
    fireEvent.change(screen.getByTestId('layout-margin'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('layout-outline-width'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save theme/i }));

    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(spy.mock.calls[0][0].layout).toEqual({ marginPct: 12, outlineWidth: 4, outlineColor: '#000000' });
    expect((await api.getTheme(theme.id))!.layout?.marginPct).toBe(12);
    spy.mockRestore();
  });

  it('built-in themes cannot be given a layout (the controls are inert)', async () => {
    const builtIn = (await api.listThemes()).find((t) => t.isBuiltIn)!;
    render(<ThemeManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByText(builtIn.name));
    const wrapper = screen.getByTestId('layout-controls').parentElement as HTMLElement;
    expect(wrapper.style.pointerEvents).toBe('none');

    // and the custom one from the previous test is editable
    fireEvent.click(await screen.findByText('Mine'));
    expect((screen.getByTestId('layout-controls').parentElement as HTMLElement).style.pointerEvents).toBe('auto');
  });
});
