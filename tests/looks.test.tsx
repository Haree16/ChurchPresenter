import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { validateLook, lookMatches, MAX_LOOK_PROPS } from '../src/services/looks';
import { validateStep, stepLabel, newStep } from '../src/services/macroSteps';
import { LooksControl } from '../src/components/LooksControl';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { Look, PresentationState, Prop } from '../src/types';

const look = (over: Partial<Look> = {}): Look => ({ id: '', name: 'Pre-service', logo: true, blackout: false, propIds: [], ...over });

const textProp = (name: string): Prop => ({
  id: '', name, kind: 'text', text: 'hi', imagePath: null, position: 'center', sizePct: 5, textColor: '#ffffff', backgroundColor: null,
});

afterEach(async () => {
  await api.stopMacro();
  await api.clearAll();
  for (const l of await api.listLooks()) await api.deleteLook(l.id);
  for (const m of await api.listMacros()) await api.deleteMacro(m.id);
  for (const p of await api.listProps()) await api.deleteProp(p.id);
});

const idle: PresentationState = {
  currentPresentationId: null, currentSlideId: null, currentSlideIndex: 0, totalSlides: 0,
  currentSlide: null, nextSlide: null, isBlackout: false, isLive: false,
};

describe('look rules', () => {
  it('validates name, prop count and duplicates', () => {
    expect(validateLook(look())).toBeNull();
    expect(validateLook(look({ name: ' ' }))).toMatch(/name/);
    expect(validateLook(look({ name: 'n'.repeat(61) }))).toMatch(/too long/);
    expect(validateLook(look({ propIds: [' '] }))).toMatch(/blank/);
    expect(validateLook(look({ propIds: ['a', 'a'] }))).toMatch(/twice/);
    const many = Array.from({ length: MAX_LOOK_PROPS + 1 }, (_, i) => `p${i}`);
    expect(validateLook(look({ propIds: many }))).toMatch(/at most/);
    expect(validateLook(look({ propIds: many.slice(0, MAX_LOOK_PROPS) }))).toBeNull();
  });

  it('knows when the screen already matches a look (set of props, not order)', () => {
    const l = look({ logo: true, blackout: false, propIds: ['a', 'b'] });
    const prop = (id: string) => ({ id } as Prop);
    expect(lookMatches(l, { isLogo: true, isBlackout: false, activeProps: [prop('b'), prop('a')] })).toBe(true);
    expect(lookMatches(l, { isLogo: true, isBlackout: false, activeProps: [prop('a')] })).toBe(false);
    expect(lookMatches(l, { isLogo: true, isBlackout: false, activeProps: [prop('a'), prop('b'), prop('c')] })).toBe(false);
    expect(lookMatches(l, { isLogo: false, isBlackout: false, activeProps: [prop('a'), prop('b')] })).toBe(false);
    expect(lookMatches(l, { isLogo: true, isBlackout: true, activeProps: [prop('a'), prop('b')] })).toBe(false);
    // missing fields count as off / none
    expect(lookMatches(look({ logo: false, propIds: [] }), { isBlackout: false })).toBe(true);
  });
});

describe('looks (mock API)', () => {
  it('create, list, update and delete; invalid looks are rejected', async () => {
    await expect(api.createLook(look({ name: '' }))).rejects.toThrow(/name/);
    expect(await api.listLooks()).toHaveLength(0);
    const a = await api.createLook(look({ name: '  First ', propIds: ['x', 'y'] }));
    expect(a.name).toBe('First');
    expect((await api.listLooks())[0].propIds).toEqual(['x', 'y']); // order kept

    const u = await api.updateLook({ ...a, name: 'Renamed', logo: false });
    expect(u).toMatchObject({ name: 'Renamed', logo: false });
    await expect(api.updateLook({ ...a, id: 'ghost' })).rejects.toThrow(/no longer exists/);
    await expect(api.updateLook({ ...a, name: '' })).rejects.toThrow(/name/);

    await api.deleteLook(a.id);
    expect(await api.listLooks()).toHaveLength(0);
  });

  it('applying sets exactly the layers, turns the others off, and leaves the live slide alone', async () => {
    const pres = await api.createPresentation('L', 'Worship');
    const slide = await api.createSlide(pres.id, { title: 'a', body: 'a' });
    await api.setLiveSlide(pres.id, slide.id);
    const a = await api.createProp(textProp('A'));
    const b = await api.createProp(textProp('B'));
    await api.toggleProp(a.id); // A on before applying

    const saved = await api.createLook(look({ logo: true, blackout: false, propIds: [b.id] }));
    const st = await api.applyLook(saved.id);
    expect(st.isLogo).toBe(true);
    expect(st.isBlackout).toBe(false);
    expect(st.activeProps?.map((p) => p.id)).toEqual([b.id]); // A turned off
    expect(st.currentSlideId).toBe(slide.id);
    expect(st.isLive).toBe(true);

    const empty = await api.createLook(look({ name: 'Empty', logo: false }));
    const cleared = await api.applyLook(empty.id);
    expect(cleared.isLogo).toBe(false);
    expect(cleared.activeProps).toEqual([]);
    await expect(api.applyLook('ghost')).rejects.toThrow(/no longer exists/);
  });

  it('skips props that were deleted and keeps the order of the rest', async () => {
    const a = await api.createProp(textProp('A'));
    const b = await api.createProp(textProp('B'));
    const saved = await api.createLook(look({ logo: false, propIds: [b.id, 'deleted', a.id] }));
    const st = await api.applyLook(saved.id);
    expect(st.activeProps?.map((p) => p.name)).toEqual(['B', 'A']);
  });

  it('capturing saves the screen as it is and applying it later reproduces it', async () => {
    const a = await api.createProp(textProp('A'));
    await api.toggleLogo();
    await api.toggleProp(a.id);
    const captured = await api.captureLook('  Snapshot ');
    expect(captured).toMatchObject({ name: 'Snapshot', logo: true, blackout: false, propIds: [a.id] });

    await api.clearAll();
    expect((await api.getPresentationState()).isLogo).toBe(false);
    const st = await api.applyLook(captured.id);
    expect(st.isLogo).toBe(true);
    expect(st.activeProps).toHaveLength(1);
    await expect(api.captureLook('  ')).rejects.toThrow(/name/);
  });
});

describe('LooksControl', () => {
  it('says so when there are no looks', async () => {
    render(<LooksControl presentationState={idle} />);
    await waitFor(() => expect(screen.getByText(/No looks yet/)).toBeTruthy());
  });

  it('lists looks, applies one with a click and highlights the one that matches the screen', async () => {
    await api.createLook(look({ name: 'Pre-service', logo: true }));
    await api.createLook(look({ name: 'Blank', logo: false }));
    const spy = vi.spyOn(api, 'applyLook').mockResolvedValue(idle);
    const { rerender } = render(<LooksControl presentationState={{ ...idle, isLogo: true, activeProps: [] }} />);

    const buttons = await screen.findAllByTestId('look-apply');
    expect(buttons.map((b) => b.textContent)).toEqual(['Pre-service', 'Blank']);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true'); // logo on, no props: matches
    expect(buttons[1].getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(buttons[1]);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender(<LooksControl presentationState={{ ...idle, isLogo: false, activeProps: [] }} />);
    expect(screen.getAllByTestId('look-apply')[1].getAttribute('aria-pressed')).toBe('true');
    spy.mockRestore();
  });

  it('saves the current screen as a look and deletes looks', async () => {
    const spy = vi.spyOn(api, 'captureLook');
    render(<LooksControl presentationState={idle} />);
    const save = screen.getByTestId('look-save') as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('look-name'), { target: { value: 'Sermon' } });
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByTestId('look-message').textContent).toBe('Saved look "Sermon".'));
    expect(spy).toHaveBeenCalledWith('Sermon');
    expect((screen.getByTestId('look-name') as HTMLInputElement).value).toBe('');
    expect(await screen.findAllByTestId('look-apply')).toHaveLength(1);

    fireEvent.click(screen.getByTestId('look-delete'));
    await waitFor(() => expect(screen.queryAllByTestId('look-apply')).toHaveLength(0));
    spy.mockRestore();
  });

  it('shows why a look could not be applied or saved', async () => {
    await api.createLook(look({ name: 'Gone soon' }));
    const apply = vi.spyOn(api, 'applyLook').mockRejectedValue(new Error('That look no longer exists.'));
    render(<LooksControl presentationState={idle} />);
    fireEvent.click(await screen.findByTestId('look-apply'));
    await waitFor(() => expect(screen.getByTestId('look-error').textContent).toMatch(/no longer exists/));
    apply.mockRestore();

    const capture = vi.spyOn(api, 'captureLook').mockRejectedValue('You can keep at most 100 looks.');
    fireEvent.change(screen.getByTestId('look-name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('look-save'));
    await waitFor(() => expect(screen.getByTestId('look-error').textContent).toMatch(/at most 100/));
    capture.mockRestore();
  });
});

describe('look steps in macros', () => {
  it('validate, describe and start empty', () => {
    expect(validateStep({ type: 'look', lookId: 'abc' })).toBeNull();
    expect(validateStep({ type: 'look', lookId: ' ' })).toMatch(/choose a look/);
    expect(stepLabel({ type: 'look', lookId: 'abc' }, undefined, () => 'Pre-service')).toBe('Apply look Pre-service');
    expect(validateStep(newStep('look'))).not.toBeNull(); // nothing chosen yet
  });

  it('a macro applies a look as one of its steps, and fails cleanly if the look was deleted', async () => {
    const saved = await api.createLook(look({ logo: true }));
    const m = await api.createMacro({ id: '', name: 'Open', steps: [{ type: 'look', lookId: saved.id }] });
    await api.runMacro(m.id);
    await waitFor(async () => expect((await api.getPresentationState()).isLogo).toBe(true));
    await waitFor(async () => expect((await api.getPresentationState()).runningMacro).toBeNull());

    await api.clearAll();
    await api.deleteLook(saved.id);
    await api.runMacro(m.id);
    await waitFor(async () => expect((await api.getPresentationState()).runningMacro).toBeNull());
    expect((await api.getPresentationState()).isLogo).toBeFalsy();
  });

  it('the macro editor offers saved looks for a look step', async () => {
    const saved = await api.createLook(look({ name: 'Pre-service' }));
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('macro-name'), { target: { value: 'With look' } });
    fireEvent.click(screen.getByTestId('add-step-look'));
    const select = screen.getByTestId('step-look-id') as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).some((o) => o.value === saved.id)).toBe(true));
    fireEvent.change(select, { target: { value: saved.id } });
    fireEvent.click(screen.getByTestId('macro-save'));
    await waitFor(async () => expect((await api.listMacros())[0]?.steps).toEqual([{ type: 'look', lookId: saved.id }]));
  });

  it('the macro editor will not save a look step with no look chosen', async () => {
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('macro-name'), { target: { value: 'Bad' } });
    fireEvent.click(screen.getByTestId('add-step-look'));
    fireEvent.click(screen.getByTestId('macro-save'));
    expect(screen.getByTestId('macro-form-error').textContent).toMatch(/Step 1: choose a look/);
    expect(await api.listMacros()).toHaveLength(0);
  });
});

describe('Phase 9.1: per-screen looks', () => {
  it('validates screen configs for empty outputs, duplicate outputs and props rules', () => {
    expect(
      validateLook(
        look({
          screenConfigs: [
            { outputId: 'out-1', logo: true, blackout: false, propIds: [] },
            { outputId: 'out-2', logo: false, blackout: true, propIds: [] },
          ],
        })
      )
    ).toBeNull();

    // blank output
    expect(
      validateLook(
        look({
          screenConfigs: [{ outputId: '  ', logo: true, blackout: false, propIds: [] }],
        })
      )
    ).toMatch(/missing an output target/);

    // duplicate output target
    expect(
      validateLook(
        look({
          screenConfigs: [
            { outputId: 'screen-1', logo: true, blackout: false, propIds: [] },
            { outputId: 'screen-1', logo: false, blackout: false, propIds: [] },
          ],
        })
      )
    ).toMatch(/more than once/);

    // blank prop in screen config
    expect(
      validateLook(
        look({
          screenConfigs: [{ outputId: 'screen-1', logo: true, blackout: false, propIds: ['valid', ' '] }],
        })
      )
    ).toMatch(/blank prop/);

    // duplicate prop in screen config
    expect(
      validateLook(
        look({
          screenConfigs: [{ outputId: 'screen-1', logo: true, blackout: false, propIds: ['p1', 'p1'] }],
        })
      )
    ).toMatch(/same prop twice/);

    // max props in screen config
    const manyProps = Array.from({ length: MAX_LOOK_PROPS + 1 }, (_, i) => `p${i}`);
    expect(
      validateLook(
        look({
          screenConfigs: [{ outputId: 'screen-1', logo: true, blackout: false, propIds: manyProps }],
        })
      )
    ).toMatch(/at most/);
  });

  it('lookMatches supports per-screen matching and targetOutputId', () => {
    const l = look({
      logo: false,
      blackout: false,
      propIds: [],
      screenConfigs: [
        { outputId: 'out-audience', logo: true, blackout: false, propIds: [] },
        { outputId: 'out-stage', logo: false, blackout: true, propIds: [] },
      ],
    });

    const stateWithScreens: Pick<PresentationState, 'isLogo' | 'isBlackout' | 'activeProps' | 'screenLayers'> = {
      isLogo: false,
      isBlackout: false,
      activeProps: [],
      screenLayers: {
        'out-audience': { isLogo: true, isBlackout: false, activeProps: [] },
        'out-stage': { isLogo: false, isBlackout: true, activeProps: [] },
      },
    };

    expect(lookMatches(l, stateWithScreens)).toBe(true);

    // Match a specific target output
    expect(lookMatches(l, stateWithScreens, 'out-audience')).toBe(true);
    expect(lookMatches(l, stateWithScreens, 'out-stage')).toBe(true);

    // Mismatched screen
    const mismatchState = {
      ...stateWithScreens,
      screenLayers: {
        'out-audience': { isLogo: false, isBlackout: false, activeProps: [] },
        'out-stage': { isLogo: false, isBlackout: true, activeProps: [] },
      },
    };
    expect(lookMatches(l, mismatchState)).toBe(false);
    expect(lookMatches(l, mismatchState, 'out-audience')).toBe(false);
    expect(lookMatches(l, mismatchState, 'out-stage')).toBe(true);
  });

  it('applying look to a specific output target isolates that output without changing others', async () => {
    const p1 = await api.createProp(textProp('Prop 1'));
    const savedLook = await api.createLook(
      look({
        name: 'Mixed Look',
        logo: false,
        blackout: false,
        propIds: [],
        screenConfigs: [
          { outputId: 'output-stage', logo: false, blackout: true, propIds: [] },
          { outputId: 'output-audience', logo: true, blackout: false, propIds: [p1.id] },
        ],
      })
    );

    // Initial state: global layers clean
    await api.clearAll();

    // Apply look to stage output only
    const state = await api.applyLook(savedLook.id, 'output-stage');
    expect(state.screenLayers).toBeDefined();
    expect(state.screenLayers?.['output-stage']).toEqual({
      isLogo: false,
      isBlackout: true,
      activeProps: [],
      themeId: null,
    });
    // Global state and audience screen remain untouched
    expect(state.isLogo).toBe(false);
    expect(state.isBlackout).toBe(false);
    expect(state.screenLayers?.['output-audience']).toBeUndefined();

    // Apply look to audience output
    const state2 = await api.applyLook(savedLook.id, 'output-audience');
    expect(state2.screenLayers?.['output-audience']?.isLogo).toBe(true);
    expect(state2.screenLayers?.['output-audience']?.activeProps[0]?.id).toBe(p1.id);
    // Stage still has its previous state
    expect(state2.screenLayers?.['output-stage']?.isBlackout).toBe(true);
  });

  it('applying look globally applies all per-screen configs to their respective outputs', async () => {
    const savedLook = await api.createLook(
      look({
        name: 'Global Multi-Screen',
        logo: true,
        blackout: false,
        propIds: [],
        screenConfigs: [
          { outputId: 'output-stage', logo: false, blackout: true, propIds: [] },
          { outputId: 'output-audience', logo: false, blackout: false, propIds: [] },
        ],
      })
    );

    const state = await api.applyLook(savedLook.id);
    // Global defaults
    expect(state.isLogo).toBe(true);
    expect(state.isBlackout).toBe(false);

    // Per-screen overrides
    expect(state.screenLayers?.['output-stage']?.isBlackout).toBe(true);
    expect(state.screenLayers?.['output-stage']?.isLogo).toBe(false);
    expect(state.screenLayers?.['output-audience']?.isBlackout).toBe(false);
    expect(state.screenLayers?.['output-audience']?.isLogo).toBe(false);
  });

  it('LooksControl UI allows configuring per-screen overrides and applying to specific screen targets', async () => {
    const savedLook = await api.createLook(look({ name: 'Sunday Service', logo: false }));
    const spy = vi.spyOn(api, 'applyLook');

    render(<LooksControl presentationState={idle} />);
    await waitFor(() => expect(screen.getByTestId('look-apply')).toBeTruthy());

    // Test Target selector
    const targetSelect = screen.getByTestId('look-target-screen') as HTMLSelectElement;
    expect(targetSelect).toBeTruthy();
    fireEvent.change(targetSelect, { target: { value: 'output-stage' } });

    // Click apply -> calls applyLook with 'output-stage'
    fireEvent.click(screen.getByTestId('look-apply'));
    expect(spy).toHaveBeenCalledWith(savedLook.id, 'output-stage');

    // Click Configure Per-Screen (Edit)
    fireEvent.click(screen.getByTestId('look-edit'));
    expect(await screen.findByTestId('look-modal')).toBeTruthy();
    expect(screen.getByText(/Configure Look: Sunday Service/)).toBeTruthy();

    // Toggle override for output-stage
    const overrideToggle = screen.getByTestId('look-screen-override-output-stage');
    fireEvent.click(overrideToggle);

    // Check blackout for output-stage
    const blackoutCheckbox = await screen.findByTestId('look-screen-blackout-output-stage');
    fireEvent.click(blackoutCheckbox);

    // Apply to screen directly from modal
    const screenApplyBtn = screen.getByTestId('look-screen-apply-output-stage');
    fireEvent.click(screenApplyBtn);
    expect(spy).toHaveBeenCalledWith(savedLook.id, 'output-stage');

    // Save Changes in modal
    fireEvent.click(screen.getByTestId('look-modal-save'));
    await waitFor(() => expect(screen.queryByTestId('look-modal')).toBeNull());

    // Verify look updated in backend/mock
    const updated = (await api.listLooks()).find((l) => l.id === savedLook.id);
    expect(updated?.screenConfigs?.find((c) => c.outputId === 'output-stage')?.blackout).toBe(true);

    spy.mockRestore();
  });
});
