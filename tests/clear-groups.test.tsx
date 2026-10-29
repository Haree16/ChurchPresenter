import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { validateClearGroup, describeLayers, CLEAR_LAYERS, MAX_CLEAR_GROUPS } from '../src/services/clearGroups';
import { validateStep, stepLabel, newStep } from '../src/services/macroSteps';
import { describeBinding } from '../src/services/keyBindings';
import { runKeyBinding } from '../src/services/runKeyBinding';
import { ClearGroupsControl } from '../src/components/ClearGroupsControl';
import { MacroManagerModal } from '../src/components/MacroManagerModal';
import { ClearGroup, Prop } from '../src/types';

const group = (over: Partial<ClearGroup> = {}): ClearGroup => ({ id: '', name: 'Lyrics only', layers: ['slide', 'media'], ...over });

const textProp = (name: string): Prop => ({
  id: '', name, kind: 'text', text: 'hi', imagePath: null, position: 'center', sizePct: 5, textColor: '#ffffff', backgroundColor: null,
});

afterEach(async () => {
  await api.stopMacro();
  await api.clearAll();
  for (const g of await api.listClearGroups()) await api.deleteClearGroup(g.id);
  for (const b of await api.listKeyBindings()) await api.deleteKeyBinding(b.id);
  for (const m of await api.listMacros()) await api.deleteMacro(m.id);
  for (const p of await api.listProps()) await api.deleteProp(p.id);
});

describe('clear group rules', () => {
  it('validates name and layers', () => {
    expect(validateClearGroup(group())).toBeNull();
    expect(validateClearGroup(group({ name: ' ' }))).toMatch(/name/);
    expect(validateClearGroup(group({ name: 'n'.repeat(61) }))).toMatch(/too long/);
    expect(validateClearGroup(group({ layers: [] }))).toMatch(/at least one/);
    expect(validateClearGroup(group({ layers: ['slide', 'teleport' as any] }))).toMatch(/not a layer/);
    expect(validateClearGroup(group({ layers: ['slide', 'slide'] }))).toMatch(/twice/);
    expect(validateClearGroup(group({ layers: CLEAR_LAYERS.map((c) => c.layer) }))).toBeNull();
  });

  it('describes the layers in display order', () => {
    expect(describeLayers(['props', 'slide', 'media'])).toBe('Slide, Media, Props');
  });
});

describe('clear groups (mock API)', () => {
  it('create, list, update and delete; invalid groups are rejected', async () => {
    await expect(api.createClearGroup(group({ name: '' }))).rejects.toThrow(/name/);
    expect(await api.listClearGroups()).toHaveLength(0);
    const a = await api.createClearGroup(group({ name: '  First ', layers: ['props', 'alert'] }));
    expect(a.name).toBe('First');
    expect((await api.listClearGroups())[0].layers).toEqual(['props', 'alert']);
    const u = await api.updateClearGroup({ ...a, name: 'Renamed', layers: ['logo'] });
    expect(u).toMatchObject({ name: 'Renamed', layers: ['logo'] });
    await expect(api.updateClearGroup({ ...a, id: 'ghost' })).rejects.toThrow(/no longer exists/);
    await expect(api.updateClearGroup({ ...a, layers: [] })).rejects.toThrow(/at least one/);
    await api.deleteClearGroup(a.id);
    expect(await api.listClearGroups()).toHaveLength(0);
  });

  it('the number of groups is capped', async () => {
    for (let i = 0; i < MAX_CLEAR_GROUPS; i++) await api.createClearGroup(group({ name: `G${i}` }));
    await expect(api.createClearGroup(group({ name: 'one more' }))).rejects.toThrow(/at most/);
  });

  it('running a group clears only its layers', async () => {
    const pres = await api.createPresentation('C', 'Worship');
    const slide = await api.createSlide(pres.id, { title: 'a', body: 'a' });
    await api.setLiveSlide(pres.id, slide.id);
    const p = await api.createProp(textProp('A'));
    await api.toggleProp(p.id);
    await api.toggleLogo();
    await api.sendAlert('Nursery', 30);

    const g = await api.createClearGroup(group({ layers: ['props', 'alert'] }));
    const st = await api.runClearGroup(g.id);
    expect(st.activeProps).toEqual([]);
    expect(st.alert).toBeNull();
    expect(st.isLive).toBe(true); // untouched
    expect(st.isLogo).toBe(true);

    const g2 = await api.createClearGroup(group({ name: 'Rest', layers: ['slide', 'logo'] }));
    const st2 = await api.runClearGroup(g2.id);
    expect(st2.isLive).toBe(false);
    expect(st2.isLogo).toBe(false);
    await expect(api.runClearGroup('ghost')).rejects.toThrow(/no longer exists/);
  });
});

describe('clear groups in macros and shortcuts', () => {
  it('has a macro step that validates, labels and runs', async () => {
    expect(validateStep({ type: 'clearGroup', groupId: 'abc' })).toBeNull();
    expect(validateStep({ type: 'clearGroup', groupId: ' ' })).toMatch(/choose a clear group/);
    expect(stepLabel({ type: 'clearGroup', groupId: 'abc' }, undefined, undefined, () => 'Lyrics only')).toBe('Clear group Lyrics only');
    expect(validateStep(newStep('clearGroup'))).not.toBeNull();

    await api.toggleLogo();
    const g = await api.createClearGroup(group({ layers: ['logo'] }));
    const m = await api.createMacro({ id: '', name: 'Go', steps: [{ type: 'clearGroup', groupId: g.id }] });
    await api.runMacro(m.id);
    await waitFor(async () => expect((await api.getPresentationState()).isLogo).toBe(false));
  });

  it('the macro editor offers saved clear groups', async () => {
    const g = await api.createClearGroup(group({ name: 'Lyrics only' }));
    render(<MacroManagerModal isOpen onClose={vi.fn()} />);
    fireEvent.click(await screen.findByTestId('add-step-clearGroup'));
    const select = (await screen.findByTestId('step-clear-group-id')) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).some((o) => o.value === g.id)).toBe(true));
  });

  it('a shortcut can run a clear group, and shows when the group is gone', async () => {
    await api.toggleLogo();
    const g = await api.createClearGroup(group({ layers: ['logo'] }));
    const saved = await api.createKeyBinding({ id: '', combo: 'F9', targetType: 'clearGroup', targetId: g.id });
    await runKeyBinding(saved);
    expect((await api.getPresentationState()).isLogo).toBe(false);

    expect(describeBinding(saved, { props: [], macros: [], looks: [], clearGroups: [g] }).label).toBe('Clear group: Lyrics only');
    await expect(api.createKeyBinding({ id: '', combo: 'F10', targetType: 'clearGroup', targetId: 'ghost' })).rejects.toThrow(/no longer exists/);
    await api.deleteClearGroup(g.id);
    expect(describeBinding(saved, { props: [], macros: [], looks: [], clearGroups: [] })).toEqual({ label: '(deleted clear group)', missing: true });
  });
});

describe('ClearGroupsControl', () => {
  it('says so when there are no groups', async () => {
    render(<ClearGroupsControl />);
    expect(await screen.findByText(/No clear groups yet/)).toBeTruthy();
  });

  it('saves a group from ticked layers, runs it, and deletes it', async () => {
    await api.toggleLogo();
    render(<ClearGroupsControl />);
    await screen.findByText(/No clear groups yet/);
    expect((screen.getByTestId('clear-group-save') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByTestId('clear-group-name'), { target: { value: 'Logo off' } });
    expect((screen.getByTestId('clear-group-save') as HTMLButtonElement).disabled).toBe(true); // no layer yet
    fireEvent.click(screen.getByTestId('clear-layer-logo'));
    fireEvent.click(screen.getByTestId('clear-group-save'));

    const run = await screen.findByTestId('clear-group-run');
    expect(run.textContent).toBe('Logo off');
    expect(run.getAttribute('title')).toContain('Logo screen');
    fireEvent.click(run);
    await waitFor(async () => expect((await api.getPresentationState()).isLogo).toBe(false));

    fireEvent.click(screen.getByLabelText('Delete Logo off'));
    await screen.findByText(/No clear groups yet/);
  });

  it('shows a deleted group as an error when it is run', async () => {
    const g = await api.createClearGroup(group());
    render(<ClearGroupsControl />);
    await screen.findByTestId('clear-group-run');
    await api.deleteClearGroup(g.id);
    fireEvent.click(screen.getByTestId('clear-group-run'));
    expect((await screen.findByTestId('clear-group-error')).textContent).toMatch(/no longer exists/);
  });
});
