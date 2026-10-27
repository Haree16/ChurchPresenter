import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import {
  MACRO_ACTIONS, MAX_MACRO_STEPS, MAX_WAIT_SECONDS, MAX_TOTAL_WAIT_SECONDS,
  validateStep, validateMacro, stepLabel, newStep,
} from '../src/services/macroSteps';
import { AutoAdvanceControl } from '../src/components/AutoAdvanceControl';
import { MacroControl } from '../src/components/MacroControl';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { Macro, MacroStep, PresentationState } from '../src/types';

const action = (a: string): MacroStep => ({ type: 'action', action: a });

afterEach(async () => {
  vi.useRealTimers();
  await api.stopMacro();
  await api.clearAll();
  for (const m of await api.listMacros()) await api.deleteMacro(m.id);
  for (const p of await api.listProps()) await api.deleteProp(p.id);
});

/** A presentation with three slides, the first one live. */
async function liveThreeSlides() {
  const pres = await api.createPresentation('Auto', 'Worship');
  const slides = [];
  for (const n of ['one', 'two', 'three']) slides.push(await api.createSlide(pres.id, { title: n, body: n }));
  await api.setLiveSlide(pres.id, slides[0].id);
  return { pres, slides };
}
const currentId = async () => (await api.getPresentationState()).currentSlideId;

describe('macro step rules', () => {
  it('knows the same actions as the backend and rejects anything else', () => {
    expect(MACRO_ACTIONS).toHaveLength(17);
    for (const a of MACRO_ACTIONS) expect(validateStep(action(a.action))).toBeNull();
    for (const bad of ['', 'quit', 'delete_song', 'NEXT_SLIDE', 'run_macro']) {
      expect(validateStep(action(bad))).toMatch(/cannot be used/);
    }
  });

  it('checks alerts, props, waits and auto-advance', () => {
    expect(validateStep({ type: 'alert', message: ' ' })).toMatch(/message/);
    expect(validateStep({ type: 'alert', message: 'x'.repeat(201) })).toMatch(/too long/);
    expect(validateStep({ type: 'alert', message: 'x', seconds: 3601 })).toMatch(/3600/);
    expect(validateStep({ type: 'alert', message: 'x', seconds: 0 })).toBeNull();
    expect(validateStep({ type: 'prop', propId: ' ', mode: 'show' })).toMatch(/choose a prop/);
    expect(validateStep({ type: 'prop', propId: 'p', mode: 'flip' as any })).toMatch(/mode/);
    for (const s of [0, MAX_WAIT_SECONDS + 1, 1.5]) expect(validateStep({ type: 'wait', seconds: s })).not.toBeNull();
    expect(validateStep({ type: 'wait', seconds: MAX_WAIT_SECONDS })).toBeNull();
    for (const s of [0, 3601, 2.5]) expect(validateStep({ type: 'autoAdvance', intervalSeconds: s })).not.toBeNull();
    expect(validateStep({ type: 'shell', command: 'rm' } as any)).toMatch(/unknown step type/);
  });

  it('checks a whole macro: name, step count, total wait, and names the bad step', () => {
    const ok: Macro = { id: '', name: 'Start', steps: [action('clear_all')] };
    expect(validateMacro(ok)).toBeNull();
    expect(validateMacro({ ...ok, name: ' ' })).toMatch(/name/);
    expect(validateMacro({ ...ok, name: 'n'.repeat(61) })).toMatch(/too long/);
    expect(validateMacro({ ...ok, steps: [] })).toMatch(/at least one step/);
    expect(validateMacro({ ...ok, steps: Array.from({ length: MAX_MACRO_STEPS + 1 }, () => action('next_slide')) })).toMatch(/at most/);
    expect(validateMacro({ ...ok, steps: [action('clear_all'), action('nope')] })).toMatch(/^Step 2:/);
    const long = (n: number): MacroStep[] => Array.from({ length: n }, () => ({ type: 'wait', seconds: MAX_WAIT_SECONDS }));
    expect(validateMacro({ ...ok, steps: long(MAX_TOTAL_WAIT_SECONDS / MAX_WAIT_SECONDS + 1) })).toMatch(/add up/);
    expect(validateMacro({ ...ok, steps: long(MAX_TOTAL_WAIT_SECONDS / MAX_WAIT_SECONDS) })).toBeNull();
  });

  it('describes steps in plain words and starts new steps with sensible defaults', () => {
    expect(stepLabel(action('clear_all'))).toBe('Clear all (blank output)');
    expect(stepLabel({ type: 'wait', seconds: 5 })).toBe('Wait 5 s');
    expect(stepLabel({ type: 'autoAdvance', intervalSeconds: 8, loopAtEnd: true })).toBe('Auto-advance every 8 s (loop)');
    expect(stepLabel({ type: 'prop', propId: 'p', mode: 'hide' }, () => 'Logo bug')).toBe('Hide prop Logo bug');
    for (const t of ['action', 'wait', 'autoAdvance'] as const) expect(validateStep(newStep(t))).toBeNull();
    expect(validateStep(newStep('alert'))).not.toBeNull(); // needs a message
    expect(validateStep(newStep('prop'))).not.toBeNull(); // needs a prop
  });
});

describe('auto-advance (mock API)', () => {
  it('needs a live slide and a sensible interval', async () => {
    await api.clearAll();
    await expect(api.startAutoAdvance(5, false)).rejects.toThrow(/live/);
    await liveThreeSlides();
    for (const bad of [0, 3601, 2.5, NaN]) await expect(api.startAutoAdvance(bad, false)).rejects.toThrow(/between/);
    const st = await api.startAutoAdvance(5, true);
    expect(st.autoAdvance).toMatchObject({ intervalSeconds: 5, loopAtEnd: true });
  });

  it('advances one slide per interval and stops after the last slide', async () => {
    vi.useFakeTimers();
    const { slides } = await liveThreeSlides();
    await api.startAutoAdvance(2, false);

    await vi.advanceTimersByTimeAsync(1_750);
    expect(await currentId()).toBe(slides[0].id); // not yet
    await vi.advanceTimersByTimeAsync(500);
    expect(await currentId()).toBe(slides[1].id);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await currentId()).toBe(slides[2].id);

    await vi.advanceTimersByTimeAsync(2_000); // nothing further: stops, stays on the last slide
    const st = await api.getPresentationState();
    expect(st.currentSlideId).toBe(slides[2].id);
    expect(st.isLive).toBe(true);
    expect(st.autoAdvance).toBeNull();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await currentId()).toBe(slides[2].id);
  });

  it('loops back to the first slide', async () => {
    vi.useFakeTimers();
    const { slides } = await liveThreeSlides();
    await api.startAutoAdvance(1, true);
    await vi.advanceTimersByTimeAsync(3_100); // 1 -> 2 -> 3 -> back to 1
    expect(await currentId()).toBe(slides[0].id);
    expect((await api.getPresentationState()).autoAdvance).not.toBeNull();
  });

  it('pauses while blacked out and carries on afterwards', async () => {
    vi.useFakeTimers();
    const { slides } = await liveThreeSlides();
    await api.startAutoAdvance(2, false);
    await api.toggleBlackout();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(await currentId()).toBe(slides[0].id); // did not move behind the blackout

    await api.toggleBlackout();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(await currentId()).toBe(slides[1].id);
  });

  it('Clear All, the stop action and stopAutoAdvance all end it', async () => {
    vi.useFakeTimers();
    const { slides } = await liveThreeSlides();
    await api.startAutoAdvance(1, true);
    await api.clearAll();
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await api.getPresentationState()).autoAdvance).toBeNull();

    await api.setLiveSlide(slides[0].presentationId, slides[0].id);
    await api.startAutoAdvance(1, true);
    expect((await api.dispatchAction('stop_auto_advance')).autoAdvance).toBeNull();

    await api.startAutoAdvance(1, true);
    expect((await api.stopAutoAdvance()).autoAdvance).toBeNull();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await currentId()).toBe(slides[0].id);
  });

  it('starting again replaces the old run instead of running two', async () => {
    vi.useFakeTimers();
    const { slides } = await liveThreeSlides();
    await api.startAutoAdvance(1, true);
    await vi.advanceTimersByTimeAsync(500);
    await api.startAutoAdvance(4, true);
    await vi.advanceTimersByTimeAsync(3_900);
    expect(await currentId()).toBe(slides[0].id); // the 1 s run is gone
    await vi.advanceTimersByTimeAsync(300);
    expect(await currentId()).toBe(slides[1].id);
  });
});

describe('macros (mock API)', () => {
  it('create, list, update and delete; invalid macros are rejected', async () => {
    await expect(api.createMacro({ id: '', name: '', steps: [action('clear_all')] })).rejects.toThrow(/name/);
    await expect(api.createMacro({ id: '', name: 'X', steps: [action('shutdown')] })).rejects.toThrow(/Step 1/);
    expect(await api.listMacros()).toHaveLength(0);

    const a = await api.createMacro({ id: '', name: '  Start  ', steps: [action('clear_all'), { type: 'wait', seconds: 2 }, action('toggle_logo')] });
    expect(a.name).toBe('Start');
    expect((await api.listMacros())[0].steps.map((s) => s.type)).toEqual(['action', 'wait', 'action']); // order kept

    const u = await api.updateMacro({ ...a, name: 'Renamed', steps: [action('next_slide')] });
    expect(u).toMatchObject({ name: 'Renamed' });
    expect(u.steps).toHaveLength(1);
    await expect(api.updateMacro({ ...a, id: 'ghost' })).rejects.toThrow(/no longer exists/);
    await expect(api.updateMacro({ ...a, steps: [] })).rejects.toThrow(/at least one step/);

    await api.deleteMacro(a.id);
    expect(await api.listMacros()).toHaveLength(0);
  });

  it('runs its steps in order, shows progress, and waits between them', async () => {
    vi.useFakeTimers();
    await liveThreeSlides();
    const m = await api.createMacro({
      id: '', name: 'Start service',
      steps: [action('clear_all'), { type: 'alert', message: 'Welcome', seconds: 0 }, { type: 'wait', seconds: 3 }, action('toggle_logo')],
    });
    await api.runMacro(m.id);

    await vi.advanceTimersByTimeAsync(50);
    let st = await api.getPresentationState();
    expect(st.alert?.message).toBe('Welcome');
    expect(st.runningMacro).toMatchObject({ name: 'Start service', total: 4 });
    expect(st.runningMacro!.step).toBeGreaterThanOrEqual(2);
    expect(st.isLogo).toBeFalsy(); // the logo step has not run yet: it comes after the wait

    await vi.advanceTimersByTimeAsync(3_200);
    st = await api.getPresentationState();
    expect(st.isLogo).toBe(true);
    expect(st.isLive).toBe(false); // clear_all ran first
    expect(st.runningMacro).toBeNull();
  });

  it('only one macro runs at a time, and Stop cancels the rest', async () => {
    vi.useFakeTimers();
    const m = await api.createMacro({ id: '', name: 'Slow', steps: [{ type: 'wait', seconds: 60 }, action('toggle_logo')] });
    await api.runMacro(m.id);
    await vi.advanceTimersByTimeAsync(100);
    await expect(api.runMacro(m.id)).rejects.toThrow(/already running/);

    const stopped = await api.stopMacro();
    expect(stopped.runningMacro).toBeNull();
    await vi.advanceTimersByTimeAsync(70_000);
    expect((await api.getPresentationState()).isLogo).toBeFalsy(); // the step after the wait never ran

    await expect(api.runMacro(m.id)).resolves.toBeUndefined(); // free again
    await api.stopMacro();
  });

  it('a failing step ends the macro without running the rest', async () => {
    vi.useFakeTimers();
    await api.clearAll();
    const m = await api.createMacro({
      id: '', name: 'Bad prop',
      steps: [{ type: 'prop', propId: 'ghost', mode: 'show' }, action('toggle_logo')],
    });
    await api.runMacro(m.id);
    await vi.advanceTimersByTimeAsync(500);
    const st = await api.getPresentationState();
    expect(st.isLogo).toBeFalsy();
    expect(st.runningMacro).toBeNull();
  });

  it('prop steps show, hide and toggle without flip-flopping, and auto-advance steps start a run', async () => {
    vi.useFakeTimers();
    await liveThreeSlides();
    const prop = await api.createProp({
      id: '', name: 'Bug', kind: 'text', text: 'hi', imagePath: null, position: 'center', sizePct: 5, textColor: '#ffffff', backgroundColor: null,
    });
    const m = await api.createMacro({
      id: '', name: 'Props',
      steps: [
        { type: 'prop', propId: prop.id, mode: 'show' },
        { type: 'prop', propId: prop.id, mode: 'show' }, // already showing: stays showing
        { type: 'prop', propId: prop.id, mode: 'toggle' }, // off
        { type: 'prop', propId: prop.id, mode: 'hide' }, // already hidden: stays hidden
        { type: 'prop', propId: prop.id, mode: 'toggle' }, // on
        { type: 'autoAdvance', intervalSeconds: 5, loopAtEnd: true },
      ],
    });
    await api.runMacro(m.id);
    await vi.advanceTimersByTimeAsync(100);
    const st = await api.getPresentationState();
    expect(st.activeProps?.map((p) => p.id)).toEqual([prop.id]);
    expect(st.autoAdvance).toMatchObject({ intervalSeconds: 5, loopAtEnd: true });
  });
});

describe('AutoAdvanceControl', () => {
  const state = (over: Partial<PresentationState> = {}): PresentationState => ({
    currentPresentationId: 'p', currentSlideId: 's1', currentSlideIndex: 0, totalSlides: 3,
    currentSlide: null, nextSlide: null, isBlackout: false, isLive: true, ...over,
  });

  it('cannot start until a slide is live, and says so', () => {
    render(<AutoAdvanceControl presentationState={state({ isLive: false })} />);
    expect((screen.getByTestId('auto-advance-start') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Take a slide live first/)).toBeTruthy();
  });

  it('starts with the chosen interval and loop option', async () => {
    const spy = vi.spyOn(api, 'startAutoAdvance').mockResolvedValue(state());
    render(<AutoAdvanceControl presentationState={state()} />);
    fireEvent.click(screen.getAllByTestId('auto-advance-preset').find((b) => b.textContent === '15s')!);
    expect((screen.getByTestId('auto-advance-interval') as HTMLInputElement).value).toBe('15');
    fireEvent.click(screen.getByTestId('auto-advance-loop'));
    fireEvent.click(screen.getByTestId('auto-advance-start'));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(15, true));
    spy.mockRestore();
  });

  it('blocks an invalid interval', () => {
    render(<AutoAdvanceControl presentationState={state()} />);
    fireEvent.change(screen.getByTestId('auto-advance-interval'), { target: { value: '0' } });
    expect((screen.getByTestId('auto-advance-start') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/whole number of seconds/)).toBeTruthy();
    fireEvent.change(screen.getByTestId('auto-advance-interval'), { target: { value: '3601' } });
    expect((screen.getByTestId('auto-advance-start') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId('auto-advance-interval'), { target: { value: '5' } });
    expect((screen.getByTestId('auto-advance-start') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the countdown while running, a paused label when blacked out, and Stop', async () => {
    const run = { id: 'r', intervalSeconds: 8, loopAtEnd: true, nextAtMs: Date.now() + 5_000 };
    const spy = vi.spyOn(api, 'stopAutoAdvance').mockResolvedValue(state());
    const { rerender } = render(<AutoAdvanceControl presentationState={state({ autoAdvance: run })} />);
    expect(screen.getByTestId('auto-advance-status').textContent).toMatch(/^NEXT IN [45]s$/);
    expect(screen.getByText(/Every 8 s, looping/)).toBeTruthy();

    rerender(<AutoAdvanceControl presentationState={state({ autoAdvance: run, isBlackout: true })} />);
    expect(screen.getByTestId('auto-advance-status').textContent).toBe('PAUSED');

    fireEvent.click(screen.getByTestId('auto-advance-stop'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });

  it('shows the reason when starting fails', async () => {
    const spy = vi.spyOn(api, 'startAutoAdvance').mockRejectedValue(new Error('Take a slide live first.'));
    render(<AutoAdvanceControl presentationState={state()} />);
    fireEvent.click(screen.getByTestId('auto-advance-start'));
    await waitFor(() => expect(screen.getByTestId('auto-advance-error').textContent).toMatch(/live first/));
    spy.mockRestore();
  });
});

describe('MacroControl', () => {
  const idle: PresentationState = {
    currentPresentationId: null, currentSlideId: null, currentSlideIndex: 0, totalSlides: 0,
    currentSlide: null, nextSlide: null, isBlackout: false, isLive: false,
  };

  it('says so when there are no macros', async () => {
    render(<MacroControl presentationState={idle} />);
    await waitFor(() => expect(screen.getByText(/No macros yet/)).toBeTruthy());
  });

  it('lists macros and runs one with a click', async () => {
    await api.createMacro({ id: '', name: 'Start service', steps: [action('clear_all')] });
    const spy = vi.spyOn(api, 'runMacro').mockResolvedValue();
    render(<MacroControl presentationState={idle} />);
    const btn = await screen.findByTestId('macro-run');
    expect(btn.textContent).toContain('Start service');
    fireEvent.click(btn);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });

  it('shows progress while running, disables the other macros, and can stop', async () => {
    await api.createMacro({ id: '', name: 'A', steps: [action('clear_all')] });
    const spy = vi.spyOn(api, 'stopMacro').mockResolvedValue(idle);
    render(<MacroControl presentationState={{ ...idle, runningMacro: { id: 'm', name: 'Start service', step: 2, total: 4 } }} />);
    expect(screen.getByTestId('macro-running').textContent).toBe('Running “Start service” (step 2 of 4)');
    expect(((await screen.findByTestId('macro-run')) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('macro-stop'));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });

  it('shows why a macro could not run', async () => {
    await api.createMacro({ id: '', name: 'A', steps: [action('clear_all')] });
    const spy = vi.spyOn(api, 'runMacro').mockRejectedValue(new Error('A macro is already running. Stop it first.'));
    render(<MacroControl presentationState={idle} />);
    fireEvent.click(await screen.findByTestId('macro-run'));
    await waitFor(() => expect(screen.getByTestId('macro-error').textContent).toMatch(/already running/));
    spy.mockRestore();
  });
});

describe('MacroManagerModal', () => {
  it('builds a macro step by step, saves it and lists it', async () => {
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('macro-name'), { target: { value: 'Start service' } });

    fireEvent.click(screen.getByTestId('add-step-action'));
    fireEvent.change(screen.getByTestId('step-action'), { target: { value: 'toggle_logo' } });
    fireEvent.click(screen.getByTestId('add-step-wait'));
    fireEvent.change(screen.getByTestId('step-wait-seconds'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('add-step-alert'));
    fireEvent.change(screen.getByTestId('step-alert-message'), { target: { value: 'Welcome' } });
    fireEvent.change(screen.getByTestId('step-alert-seconds'), { target: { value: '0' } });
    fireEvent.click(screen.getByTestId('add-step-autoAdvance'));
    fireEvent.change(screen.getByTestId('step-aa-interval'), { target: { value: '12' } });
    fireEvent.click(screen.getByTestId('step-aa-loop'));
    fireEvent.click(screen.getByTestId('macro-save'));

    await waitFor(() => expect(screen.getAllByTestId('macro-row')).toHaveLength(1));
    expect((await api.listMacros())[0].steps).toEqual([
      { type: 'action', action: 'toggle_logo' },
      { type: 'wait', seconds: 10 },
      { type: 'alert', message: 'Welcome', seconds: 0 },
      { type: 'autoAdvance', intervalSeconds: 12, loopAtEnd: true },
    ]);
  });

  it('reorders and deletes steps, then saves the changes to an existing macro', async () => {
    const m = await api.createMacro({ id: '', name: 'M', steps: [action('next_slide'), action('clear_all'), action('toggle_logo')] });
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('macro-edit'));
    expect(screen.getAllByTestId('step-row')).toHaveLength(3);

    fireEvent.click(screen.getAllByTestId('step-down')[0]); // next_slide moves after clear_all
    fireEvent.click(screen.getAllByTestId('step-delete')[2]); // drop toggle_logo
    fireEvent.click(screen.getByTestId('macro-save'));

    await waitFor(async () => expect((await api.listMacros())[0].steps).toEqual([action('clear_all'), action('next_slide')]));
    expect((await api.listMacros())[0].id).toBe(m.id); // updated in place, not duplicated
    expect(await api.listMacros()).toHaveLength(1);
  });

  it('end steps cannot move past the ends, and the last is deleted cleanly', async () => {
    await api.createMacro({ id: '', name: 'M', steps: [action('next_slide'), action('clear_all')] });
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('macro-edit'));
    expect((screen.getAllByTestId('step-up')[0] as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByTestId('step-down')[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('explains what is wrong instead of saving', async () => {
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('macro-save'));
    expect(screen.getByTestId('macro-form-error').textContent).toMatch(/name/);

    fireEvent.change(screen.getByTestId('macro-name'), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('macro-save'));
    expect(screen.getByTestId('macro-form-error').textContent).toMatch(/at least one step/);

    fireEvent.click(screen.getByTestId('add-step-alert')); // empty message
    fireEvent.click(screen.getByTestId('macro-save'));
    expect(screen.getByTestId('macro-form-error').textContent).toMatch(/Step 1: an alert needs a message/);
    expect(await api.listMacros()).toHaveLength(0);
  });

  it('prop steps offer the saved props', async () => {
    const prop = await api.createProp({
      id: '', name: 'Lower third', kind: 'text', text: 'hi', imagePath: null, position: 'lower-third', sizePct: 5, textColor: '#ffffff', backgroundColor: null,
    });
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.change(screen.getByTestId('macro-name'), { target: { value: 'With prop' } });
    fireEvent.click(screen.getByTestId('add-step-prop'));
    await waitFor(() => expect(Array.from((screen.getByTestId('step-prop-id') as HTMLSelectElement).options).some((o) => o.value === prop.id)).toBe(true));
    fireEvent.change(screen.getByTestId('step-prop-id'), { target: { value: prop.id } });
    fireEvent.change(screen.getByTestId('step-prop-mode'), { target: { value: 'toggle' } });
    fireEvent.click(screen.getByTestId('macro-save'));
    await waitFor(async () => expect((await api.listMacros())[0]?.steps).toEqual([{ type: 'prop', propId: prop.id, mode: 'toggle' }]));
  });

  it('deletes a macro', async () => {
    await api.createMacro({ id: '', name: 'Gone', steps: [action('clear_all')] });
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('macro-delete'));
    await waitFor(() => expect(screen.queryAllByTestId('macro-row')).toHaveLength(0));
    expect(await api.listMacros()).toHaveLength(0);
  });

  it('stops offering new steps at the maximum', async () => {
    await api.createMacro({ id: '', name: 'Full', steps: Array.from({ length: MAX_MACRO_STEPS }, () => action('next_slide')) });
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('macro-edit'));
    expect((screen.getByTestId('add-step-action') as HTMLButtonElement).disabled).toBe(true);
  });
});
