import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { api } from '../src/services/api';
import {
  validatePanels, createPanel, clampPanel, STAGE_PRESETS, STAGE_PANEL_KINDS, MAX_STAGE_PANELS, kindLabel, defaultFontPct,
} from '../src/services/stageLayouts';
import { StageCanvas } from '../src/components/Stage/StageCanvas';
import { StageDisplayView } from '../src/components/Stage/StageDisplayView';
import { StageLayoutEditor } from '../src/components/Stage/StageLayoutEditor';
import { SettingsModal } from '../src/components/Settings/SettingsModal';
import { PresentationState, Slide, StagePanel, StagePanelKind } from '../src/types';

const panel = (kind: StagePanelKind, over: Partial<StagePanel> = {}): StagePanel => ({
  id: `id-${kind}`, kind, x: 0, y: 0, w: 50, h: 50, ...over,
});
const slide = (body: string, title = 'T'): Slide => ({
  id: body, presentationId: 'p', sortOrder: 0, title, body, backgroundColor: '#000', foregroundColor: '#fff',
  fontSize: 'large', textAlignment: 'center', createdAt: '', updatedAt: '',
});
const state = (over: Partial<PresentationState> = {}): PresentationState => ({
  currentPresentationId: 'p', currentSlideId: 'c', currentSlideIndex: 1, totalSlides: 5,
  currentSlide: slide('Amazing grace'), nextSlide: slide('How sweet the sound'), isBlackout: false, isLive: true, ...over,
});
const timer = { display: '4:32', isWarning: false, isExpired: false };

afterEach(async () => {
  await api.updateStageConfig({ ...(await api.getStageConfig()), panels: [] });
});

describe('layout rules', () => {
  it('lists the panel kinds with labels and default sizes', () => {
    expect(STAGE_PANEL_KINDS.map((k) => k.kind)).toEqual(['current', 'next', 'clock', 'timer', 'message', 'status', 'notes', 'multiviewer']);
    expect(kindLabel('current')).toBe('Current slide');
    expect(defaultFontPct('next')).toBeLessThan(defaultFontPct('current'));
  });

  it('accepts a full layout and an empty one (the classic layout)', () => {
    expect(validatePanels([])).toBeNull();
    expect(validatePanels(null)).toBeNull();
    expect(validatePanels(STAGE_PANEL_KINDS.map((k) => panel(k.kind)))).toBeNull();
  });

  it('rejects duplicates, unknown kinds, too many panels and off-screen geometry', () => {
    expect(validatePanels([panel('current'), panel('current', { id: 'b' })])).toMatch(/already in the layout/);
    expect(validatePanels([panel('current'), panel('next', { id: 'id-current' })])).toMatch(/duplicate id/);
    expect(validatePanels([panel('video' as any)])).toMatch(/unknown panel/);
    expect(validatePanels([panel('current', { id: ' ' })])).toMatch(/id/);
    expect(validatePanels([panel('current', { x: -1 })])).toMatch(/position/);
    expect(validatePanels([panel('current', { w: 1 })])).toMatch(/size/);
    expect(validatePanels([panel('current', { x: 60, w: 50 })])).toMatch(/inside the screen/);
    expect(validatePanels([panel('current', { y: 60, h: 50 })])).toMatch(/inside the screen/);
    expect(validatePanels([panel('current', { fontSizePct: 31 })])).toMatch(/text size/);
    expect(validatePanels([panel('current', { x: NaN })])).toMatch(/position/);
    expect(validatePanels([...STAGE_PANEL_KINDS.map((k) => panel(k.kind)), panel('current', { id: 'x' })])).toMatch(/at most/);
    expect(validatePanels([panel('current', { x: 0, y: 0, w: 100, h: 100, fontSizePct: 30 })])).toBeNull();
    expect(validatePanels([panel('current'), panel('next', { x: 200 })])).toMatch(/^Panel 2:/);
  });

  it('every preset is valid, uses each kind at most once and gets fresh ids each time', () => {
    for (const preset of STAGE_PRESETS) {
      const a = preset.build();
      const b = preset.build();
      expect(validatePanels(a)).toBeNull();
      expect(a.length).toBeGreaterThan(0);
      expect(a.length).toBeLessThanOrEqual(MAX_STAGE_PANELS);
      expect(a.some((p) => p.kind === 'current')).toBe(true);
      expect(a.map((p) => p.id).some((id) => b.map((q) => q.id).includes(id))).toBe(false);
    }
  });

  it('places a new panel in free space and keeps moved panels on screen', () => {
    const existing = [panel('current', { x: 0, y: 0, w: 60, h: 60 })];
    const added = createPanel('next', existing);
    const overlaps = added.x < 60 && added.x + added.w > 0 && added.y < 60 && added.y + added.h > 0;
    expect(overlaps).toBe(false);
    expect(validatePanels([...existing, added])).toBeNull();
    // a full screen leaves nowhere free: it still returns a valid, in-bounds panel
    const crowded = createPanel('clock', [panel('current', { w: 100, h: 100 })]);
    expect(validatePanels([crowded])).toBeNull();

    expect(clampPanel(panel('current', { x: 90, y: -5, w: 30, h: 20 }))).toMatchObject({ x: 70, y: 0 });
    expect(clampPanel(panel('current', { x: 0, y: 0, w: 500, h: 0 }))).toMatchObject({ w: 100, h: 2 });
  });
});

describe('StageCanvas', () => {
  const draw = (panels: StagePanel[], s = state(), extra: Partial<React.ComponentProps<typeof StageCanvas>> = {}) =>
    render(<StageCanvas panels={panels} state={s} clock="10:42:07" timer={timer} highContrast heightPx={1000} {...extra} />);

  it('positions panels in percent and sizes text from the canvas height', () => {
    draw([panel('current', { x: 5, y: 10, w: 60, h: 70, fontSizePct: 8 }), panel('clock', { id: 'c', x: 70, w: 20, h: 10 })]);
    const cur = screen.getByTestId('stage-panel-current');
    expect([cur.style.left, cur.style.top, cur.style.width, cur.style.height]).toEqual(['5%', '10%', '60%', '70%']);
    expect(cur.style.fontSize).toBe('80px'); // 8% of 1000px
    expect(screen.getByTestId('stage-panel-clock').style.fontSize).toBe('50px'); // the clock's default is 5%
  });

  it('shows the live slide, or the blackout / nothing-live messages', () => {
    const { rerender } = draw([panel('current')]);
    expect(screen.getByTestId('stage-panel-current').textContent).toContain('Amazing grace');

    const again = (s: PresentationState) =>
      rerender(<StageCanvas panels={[panel('current')]} state={s} clock="" timer={timer} highContrast heightPx={1000} />);
    again(state({ isBlackout: true }));
    expect(screen.getByTestId('stage-panel-current').textContent).toContain('SCREEN BLACKOUT');
    again(state({ isLive: false }));
    expect(screen.getByTestId('stage-panel-current').textContent).toContain('NO LIVE SLIDE');
  });

  it('shows the next slide, or a message at the end', () => {
    const { rerender } = draw([panel('next')]);
    expect(screen.getByTestId('stage-panel-next').textContent).toContain('How sweet the sound');
    rerender(<StageCanvas panels={[panel('next')]} state={state({ nextSlide: null })} clock="" timer={timer} highContrast heightPx={1000} />);
    expect(screen.getByTestId('stage-panel-next').textContent).toContain('End of Presentation');
  });

  it('shows the clock, the timer (or a placeholder) and its time-up state', () => {
    const { rerender } = draw([panel('clock'), panel('timer', { id: 't' })]);
    expect(screen.getByTestId('stage-panel-clock-text').textContent).toBe('10:42:07');
    expect(screen.getByTestId('stage-panel-timer').textContent).toBe('--:--'); // no timer running

    const withTimer = state({ timerState: { name: 'Sermon', timerType: 'countdown' } as any });
    rerender(<StageCanvas panels={[panel('timer')]} state={withTimer} clock="" timer={timer} highContrast heightPx={1000} />);
    expect(screen.getByTestId('stage-panel-timer').textContent).toContain('4:32');
    expect(screen.getByTestId('stage-panel-timer').textContent).toContain('Sermon');
    rerender(<StageCanvas panels={[panel('timer')]} state={withTimer} clock="" timer={{ ...timer, display: '0:00', isExpired: true }} highContrast heightPx={1000} />);
    expect(screen.getByTestId('stage-panel-timer').textContent).toContain('TIME UP');
  });

  it('shows the stage message only while there is one, as plain text', () => {
    const { rerender } = draw([panel('message')]);
    expect(screen.getByTestId('stage-panel-message').textContent).toBe('');
    rerender(<StageCanvas panels={[panel('message')]} state={state({ stageMessage: '<img src=x onerror=1> Wrap up' })} clock="" timer={timer} highContrast heightPx={1000} />);
    const msg = screen.getByTestId('stage-panel-message');
    expect(msg.textContent).toBe('<img src=x onerror=1> Wrap up');
    expect(msg.querySelector('img')).toBeNull();
  });

  it('shows status (live / blackout / standby with slide count) and the cue notes', () => {
    const { rerender } = draw([panel('status'), panel('notes', { id: 'n' })]);
    expect(screen.getByTestId('stage-panel-status').textContent).toContain('LIVE');
    expect(screen.getByTestId('stage-panel-status').textContent).toContain('2/5');
    expect(screen.getByTestId('stage-panel-notes').textContent).toContain('Section: T');

    rerender(<StageCanvas panels={[panel('status')]} state={state({ isBlackout: true })} clock="" timer={timer} highContrast heightPx={1000} />);
    expect(screen.getByTestId('stage-panel-status').textContent).toContain('BLACKOUT');
    rerender(<StageCanvas panels={[panel('status')]} state={state({ isLive: false, currentSlide: null })} clock="" timer={timer} highContrast heightPx={1000} />);
    expect(screen.getByTestId('stage-panel-status').textContent).toContain('STANDBY');
  });

  it('slide text is shown as plain text', () => {
    draw([panel('current')], state({ currentSlide: slide('<b onclick=x>Hi</b>') }));
    const cur = screen.getByTestId('stage-panel-current');
    expect(cur.querySelector('b')).toBeNull();
    expect(cur.textContent).toContain('<b onclick=x>Hi</b>');
  });

  it('is not interactive by default, and reports selection and drags when editing', () => {
    const { unmount } = draw([panel('current')]);
    expect(screen.getByTestId('stage-panel-current').style.cursor).toBe('');
    unmount();

    const onSelect = vi.fn();
    const onDown = vi.fn();
    draw([panel('current')], state(), { interactive: true, selectedId: 'id-current', onSelect, onPanelPointerDown: onDown });
    const el = screen.getByTestId('stage-panel-current');
    expect(el.style.cursor).toBe('move');
    expect(el.style.border).toContain('rgb(56, 189, 248)'); // the selected panel is outlined in sky blue
    fireEvent(el, new MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
    expect(onSelect).toHaveBeenCalledWith('id-current');
    expect(onDown).toHaveBeenCalledWith('id-current', expect.anything());
  });
});

describe('the stage window', () => {
  it('uses the classic layout when no panels are designed', async () => {
    render(<StageDisplayView previewMode />);
    await waitFor(() => expect(screen.getByTestId('stage-status-bar')).toBeTruthy());
    expect(screen.getByTestId('stage-display-view').getAttribute('data-layout')).toBeNull();
    expect(screen.queryByTestId('stage-canvas')).toBeNull();
  });

  it('draws a designed layout, and switches live when the layout is saved', async () => {
    render(<StageDisplayView previewMode />);
    await waitFor(() => expect(screen.getByTestId('stage-status-bar')).toBeTruthy());

    await act(async () => {
      await api.updateStageConfig({ ...(await api.getStageConfig()), panels: [panel('current'), panel('clock', { id: 'c', x: 60, w: 30, h: 10 })] });
    });
    await waitFor(() => expect(screen.getByTestId('stage-display-view').getAttribute('data-layout')).toBe('custom'));
    expect(screen.getAllByTestId(/^stage-panel-/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByTestId('stage-status-bar')).toBeNull(); // the classic bar is gone

    await act(async () => {
      await api.updateStageConfig({ ...(await api.getStageConfig()), panels: [] });
    });
    await waitFor(() => expect(screen.getByTestId('stage-status-bar')).toBeTruthy());
  });

  it('a window opened after the layout was saved starts with it', async () => {
    await api.updateStageConfig({ ...(await api.getStageConfig()), panels: [panel('next')] });
    render(<StageDisplayView previewMode />);
    await waitFor(() => expect(screen.getByTestId('stage-panel-next')).toBeTruthy());
  });

  it('the API rejects an invalid layout and keeps the old one', async () => {
    await api.updateStageConfig({ ...(await api.getStageConfig()), panels: [panel('current')] });
    await expect(api.updateStageConfig({ ...(await api.getStageConfig()), panels: [panel('current'), panel('current', { id: 'b' })] })).rejects.toThrow(/already in the layout/);
    expect((await api.getStageConfig()).panels).toHaveLength(1);
  });
});

describe('StageLayoutEditor', () => {
  const open = (onSaved = vi.fn()) => {
    render(<StageLayoutEditor isOpen onClose={vi.fn()} onSaved={onSaved} />);
    return onSaved;
  };

  it('starts empty (classic layout) and says so', async () => {
    open();
    await waitFor(() => expect(screen.getByText(/No panels: the stage display uses the classic layout/)).toBeTruthy());
    expect(screen.queryAllByTestId('panel-row')).toHaveLength(0);
  });

  it('adds each panel once and cannot add more than there are kinds', async () => {
    open();
    await screen.findByTestId('add-panel-current');
    fireEvent.click(screen.getByTestId('add-panel-current'));
    expect((screen.getByTestId('add-panel-current') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('add-panel-next'));
    expect(screen.getAllByTestId('panel-row').map((r) => r.textContent)).toEqual(['Current slide', 'Next slide']);
    for (const k of ['clock', 'timer', 'message', 'status', 'notes', 'multiviewer']) fireEvent.click(screen.getByTestId(`add-panel-${k}`));
    expect(screen.getAllByTestId('panel-row')).toHaveLength(MAX_STAGE_PANELS);
  });

  it('a preset fills the canvas, and the classic button clears it', async () => {
    open();
    const select = (await screen.findByTestId('stage-preset')) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'lyrics' } });
    expect(screen.getAllByTestId('panel-row').length).toBeGreaterThan(1);
    expect(screen.getByTestId('stage-panel-current')).toBeTruthy();
    fireEvent.click(screen.getByTestId('stage-use-classic'));
    expect(screen.queryAllByTestId('panel-row')).toHaveLength(0);
  });

  it('edits the selected panel and keeps it on screen', async () => {
    open();
    fireEvent.click(await screen.findByTestId('add-panel-current'));
    fireEvent.change(screen.getByTestId('panel-x'), { target: { value: '90' } }); // would overflow
    const x = Number((screen.getByTestId('panel-x') as HTMLInputElement).value);
    const w = Number((screen.getByTestId('panel-w') as HTMLInputElement).value);
    expect(x + w).toBeLessThanOrEqual(100);
    fireEvent.change(screen.getByTestId('panel-font'), { target: { value: '12' } });
    expect((screen.getByTestId('panel-font') as HTMLInputElement).value).toBe('12');
  });

  it('dragging moves a panel by the same percentage of the canvas and stops on release', async () => {
    open();
    fireEvent.click(await screen.findByTestId('add-panel-current'));
    const canvas = screen.getByTestId('stage-canvas');
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, toJSON: () => ({}) });
    const start = Number((screen.getByTestId('panel-x') as HTMLInputElement).value);

    fireEvent(screen.getByTestId('stage-panel-current'), new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }));
    act(() => {
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 120, clientY: 100 })); // +5% of 400px
    });
    expect(Number((screen.getByTestId('panel-x') as HTMLInputElement).value)).toBeCloseTo(start + 5, 1);
    act(() => {
      window.dispatchEvent(new MouseEvent('pointerup'));
      window.dispatchEvent(new MouseEvent('pointermove', { clientX: 300, clientY: 100 }));
    });
    expect(Number((screen.getByTestId('panel-x') as HTMLInputElement).value)).toBeCloseTo(start + 5, 1); // no more movement
  });

  it('removes the selected panel', async () => {
    open();
    fireEvent.click(await screen.findByTestId('add-panel-clock'));
    fireEvent.click(screen.getByTestId('panel-delete'));
    expect(screen.queryAllByTestId('panel-row')).toHaveLength(0);
    expect(screen.queryByTestId('panel-x')).toBeNull();
  });

  it('saves the layout and contrast setting through the API and tells the caller', async () => {
    const spy = vi.spyOn(api, 'updateStageConfig');
    const onSaved = open();
    fireEvent.change(await screen.findByTestId('stage-preset'), { target: { value: 'side-by-side' } });
    fireEvent.click(screen.getByTestId('stage-high-contrast'));
    fireEvent.click(screen.getByTestId('stage-layout-save'));

    await waitFor(() => expect(screen.getByTestId('stage-layout-message').textContent).toBe('Layout saved.'));
    const sent = spy.mock.calls[0][0];
    expect(validatePanels(sent.panels)).toBeNull();
    expect(sent.panels!.map((p) => p.kind)).toContain('current');
    expect(sent.highContrast).toBe(false);
    expect(onSaved).toHaveBeenCalled();
    expect((await api.getStageConfig()).panels).toHaveLength(sent.panels!.length);
    spy.mockRestore();
  });

  it('saving with no panels returns to the classic layout and says so', async () => {
    await api.updateStageConfig({ ...(await api.getStageConfig()), panels: [panel('current')] });
    open();
    await waitFor(() => expect(screen.getAllByTestId('panel-row')).toHaveLength(1));
    fireEvent.click(screen.getByTestId('stage-use-classic'));
    fireEvent.click(screen.getByTestId('stage-layout-save'));
    await waitFor(() => expect(screen.getByTestId('stage-layout-message').textContent).toMatch(/classic layout/));
    expect((await api.getStageConfig()).panels).toEqual([]);
  });

  it('shows why a save failed', async () => {
    const spy = vi.spyOn(api, 'updateStageConfig').mockRejectedValue('Panel 1: the current panel is already in the layout.');
    open();
    fireEvent.click(await screen.findByTestId('add-panel-current'));
    fireEvent.click(screen.getByTestId('stage-layout-save'));
    await waitFor(() => expect(screen.getByTestId('stage-layout-error').textContent).toMatch(/already in the layout/));
    spy.mockRestore();
  });

  it('opens from the Settings screen', async () => {
    render(<SettingsModal isOpen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('open-stage-layout'));
    expect(await screen.findByTestId('stage-layout-editor')).toBeTruthy();
  });
});
