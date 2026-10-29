import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import {
  ALL_MACROS, isAllMacrosAllowed, isMacroAllowed, macroAction, macroOscPath, midiActionLabel,
  pruneMacroEntries, setAllMacrosAllowed, setMacroAllowed,
} from '../src/services/macroAccess';
import { MACRO_ACTIONS } from '../src/services/macroSteps';
import { OscMacroAccess } from '../src/components/Production/OscMacroAccess';
import { ProductionIntegrationsModal } from '../src/components/Production/ProductionIntegrationsModal';

const DEFAULT = 'next_slide,prev_slide,toggle_blackout';

afterEach(async () => {
  for (const m of await api.listMacros()) await api.deleteMacro(m.id);
  for (const mm of await api.listMidiMappings()) {
    if (mm.name.startsWith('Test ')) await api.deleteMidiMapping(mm.id);
  }
  const cfg = await api.getOscConfig();
  await api.updateOscConfig({ ...cfg, allowlistActions: DEFAULT });
});

const makeMacro = (name: string) =>
  api.createMacro({ id: '', name, steps: [{ type: 'action', action: 'clear_all' }] });

describe('macro access list', () => {
  it('names the action and the OSC address after the macro id', () => {
    expect(macroAction('abc')).toBe('run_macro:abc');
    expect(macroOscPath('abc')).toBe('/macro/abc');
  });

  it('allows a macro on its own or all at once, and nothing by default', () => {
    expect(isMacroAllowed(DEFAULT, 'abc')).toBe(false);
    expect(isMacroAllowed(`${DEFAULT},run_macro:abc`, 'abc')).toBe(true);
    expect(isMacroAllowed(`${DEFAULT},run_macro:abc`, 'other')).toBe(false);
    expect(isMacroAllowed(`${DEFAULT},${ALL_MACROS}`, 'anything')).toBe(true);
    expect(isAllMacrosAllowed(`${DEFAULT},${ALL_MACROS}`)).toBe(true);
    expect(isAllMacrosAllowed(DEFAULT)).toBe(false);
  });

  it('adds and removes entries without disturbing the others', () => {
    const on = setMacroAllowed(DEFAULT, 'abc', true);
    expect(on).toBe(`${DEFAULT},run_macro:abc`);
    expect(setMacroAllowed(on, 'abc', true)).toBe(on); // no duplicate
    expect(setMacroAllowed(on, 'abc', false)).toBe(DEFAULT);
    expect(setAllMacrosAllowed(on, true)).toBe(`${on},${ALL_MACROS}`);
    expect(setAllMacrosAllowed(`${on},${ALL_MACROS}`, false)).toBe(on); // single entries are kept
    expect(setMacroAllowed('', 'abc', true)).toBe('run_macro:abc');
  });

  it('drops entries for macros that were deleted but keeps the wildcard and other actions', () => {
    const list = `${DEFAULT},run_macro:keep,run_macro:gone,${ALL_MACROS}`;
    expect(pruneMacroEntries(list, [{ id: 'keep' }])).toBe(`${DEFAULT},run_macro:keep,${ALL_MACROS}`);
  });

  it('labels MIDI actions, including macros by name', () => {
    const macros = [{ id: 'm1', name: 'Start service' }];
    expect(midiActionLabel('run_macro:m1', macros, MACRO_ACTIONS)).toBe('Run macro: Start service');
    expect(midiActionLabel('run_macro:gone', macros, MACRO_ACTIONS)).toBe('(deleted macro)');
    expect(midiActionLabel('next_slide', macros, MACRO_ACTIONS)).toBe('Next slide');
    expect(midiActionLabel('weird_old_value', macros, MACRO_ACTIONS)).toBe('weird_old_value');
  });
});

describe('OscMacroAccess', () => {
  it('shows each macro with its address and allows it one by one', async () => {
    const m = await makeMacro('Start service');
    const onChange = vi.fn();
    render(<OscMacroAccess allowlist={DEFAULT} onChange={onChange} />);
    const row = await screen.findByTestId('osc-macro-row');
    expect(row.textContent).toContain('Start service');
    expect(row.textContent).toContain(`/macro/${m.id}`);

    fireEvent.click(screen.getByLabelText('Allow Start service'));
    expect(onChange).toHaveBeenCalledWith(`${DEFAULT},run_macro:${m.id}`);
  });

  it('shows an allowed macro as ticked, and "allow every macro" disables the single ones', async () => {
    const m = await makeMacro('Go');
    const { rerender } = render(<OscMacroAccess allowlist={`${DEFAULT},run_macro:${m.id}`} onChange={vi.fn()} />);
    const box = (await screen.findByLabelText('Allow Go')) as HTMLInputElement;
    expect(box.checked).toBe(true);

    const onChange = vi.fn();
    rerender(<OscMacroAccess allowlist={`${DEFAULT},${ALL_MACROS}`} onChange={onChange} />);
    expect((screen.getByLabelText('Allow Go') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId('osc-allow-all-macros'));
    expect(onChange).toHaveBeenCalledWith(DEFAULT);
  });

  it('says so when there are no macros', async () => {
    render(<OscMacroAccess allowlist={DEFAULT} onChange={vi.fn()} />);
    expect(await screen.findByText(/No macros saved yet/)).toBeTruthy();
  });
});

describe('Integrations screen', () => {
  it('saves the OSC allowlist when a macro is allowed', async () => {
    const m = await makeMacro('Start service');
    render(<ProductionIntegrationsModal isOpen onClose={vi.fn()} initialTab="osc" />);
    fireEvent.click(await screen.findByLabelText('Allow Start service'));
    await waitFor(async () => expect((await api.getOscConfig()).allowlistActions).toContain(`run_macro:${m.id}`));
  });

  it('offers saved macros, and only real actions, in the MIDI action list', async () => {
    const m = await makeMacro('Start service');
    render(<ProductionIntegrationsModal isOpen onClose={vi.fn()} initialTab="midi" />);
    fireEvent.click(await screen.findByText('+ Add MIDI Trigger'));
    const option = (await screen.findByRole('option', { name: 'Start service' })) as HTMLOptionElement;
    expect(option.value).toBe(`run_macro:${m.id}`);
    // the old list offered names the app could not run
    for (const bad of ['previous_slide', 'toggle_clear', 'go_live', 'toggle_timer']) {
      expect(document.querySelector(`option[value="${bad}"]`)).toBeNull();
    }
    expect(document.querySelector('option[value="prev_slide"]')).not.toBeNull();
    expect(MACRO_ACTIONS.every((a) => document.querySelector(`option[value="${a.action}"]`))).toBe(true);
  });

  it('lets the operator allow a paired phone to run macros', async () => {
    render(<ProductionIntegrationsModal isOpen onClose={vi.fn()} initialTab="remote" />);
    const box = (await screen.findByTestId('remote-can-run-macros')) as HTMLInputElement;
    expect(box.checked).toBe(false); // off by default
    fireEvent.click(box);
    await waitFor(async () => expect((await api.listRemoteDevices())[0].canRunMacros).toBe(true));
    await api.updateRemoteDevicePermissions((await api.listRemoteDevices())[0].id, true, true, false, true, false);
  });
});
