import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { useKeyboardShortcuts } from '../src/hooks/useKeyboardShortcuts';
import { eventToCombo, reservedReason, validateKeyBinding, describeBinding } from '../src/services/keyBindings';
import { runKeyBinding } from '../src/services/runKeyBinding';
import { KeyBindingsCard } from '../src/components/Settings/KeyBindingsCard';
import { KeyBinding, Prop } from '../src/types';

const binding = (over: Partial<KeyBinding> = {}): KeyBinding => ({
  id: '', combo: 'F5', targetType: 'action', targetId: 'toggle_logo', ...over,
});

const textProp = (name: string): Prop => ({
  id: '', name, kind: 'text', text: 'hi', imagePath: null, position: 'center', sizePct: 5, textColor: '#ffffff', backgroundColor: null,
});

afterEach(async () => {
  for (const b of await api.listKeyBindings()) await api.deleteKeyBinding(b.id);
  for (const p of await api.listProps()) await api.deleteProp(p.id);
  for (const l of await api.listLooks()) await api.deleteLook(l.id);
  await api.clearAll();
});

const press = (init: KeyboardEventInit) => ({ key: '', code: '', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...init });

describe('key combos', () => {
  it('reads the physical key, so Shift and layout do not change it', () => {
    expect(eventToCombo(press({ key: 'f', code: 'KeyF', ctrlKey: true }))).toBe('Ctrl+F');
    expect(eventToCombo(press({ key: '!', code: 'Digit1', shiftKey: true, altKey: true }))).toBe('Alt+Shift+1');
    expect(eventToCombo(press({ key: 'F5', code: 'F5', metaKey: true, ctrlKey: true, shiftKey: true, altKey: true }))).toBe('Ctrl+Alt+Shift+Meta+F5');
    expect(eventToCombo(press({ key: ',', code: 'Comma', altKey: true }))).toBe('Alt+,');
    expect(eventToCombo(press({ key: ' ', code: 'Space' }))).toBe('Space');
  });

  it('ignores a modifier pressed on its own and keys that cannot be bound', () => {
    expect(eventToCombo(press({ key: 'Control', code: 'ControlLeft', ctrlKey: true }))).toBeNull();
    expect(eventToCombo(press({ key: 'F13', code: 'F13' }))).toBeNull();
    expect(eventToCombo(press({ key: 'Dead', code: 'IntlBackslash' }))).toBeNull();
  });
});

describe('key binding rules (same as the backend)', () => {
  it('reserves navigation, built-in letters, system and editing keys', () => {
    for (const taken of ['Space', 'ArrowRight', 'Ctrl+ArrowRight', 'Alt+Space', 'PageDown', 'Escape', 'B', 'Shift+B', 'M', 'F12', 'F11', 'Ctrl+W', 'Ctrl+C', '5']) {
      expect(reservedReason(taken), taken).not.toBeNull();
    }
    for (const free of ['F5', 'Ctrl+B', 'Alt+1', 'Ctrl+Shift+B', 'K', 'Ctrl+Shift+F5', 'Home']) {
      expect(reservedReason(free), free).toBeNull();
    }
  });

  it('checks the target type and id', () => {
    expect(validateKeyBinding(binding())).toBeNull();
    expect(validateKeyBinding(binding({ combo: '' }))).toMatch(/Press/);
    expect(validateKeyBinding(binding({ combo: 'Space' }))).toMatch(/slides/);
    expect(validateKeyBinding(binding({ targetId: ' ' }))).toMatch(/Choose what/);
    expect(validateKeyBinding(binding({ targetId: 'delete_everything' }))).toMatch(/cannot be bound/);
    expect(validateKeyBinding(binding({ targetType: 'macro', targetId: 'abc' }))).toBeNull();
    expect(validateKeyBinding(binding({ targetType: 'teleport' as any }))).toMatch(/Choose an action/);
  });

  it('describes what a binding does and flags deleted targets', () => {
    const targets = { props: [{ id: 'p1', name: 'Welcome' }], macros: [{ id: 'm1', name: 'Start' }], looks: [] };
    expect(describeBinding(binding(), targets)).toEqual({ label: 'Toggle logo screen', missing: false });
    expect(describeBinding(binding({ targetType: 'prop', targetId: 'p1' }), targets).label).toBe('Toggle prop: Welcome');
    expect(describeBinding(binding({ targetType: 'macro', targetId: 'm1' }), targets).label).toBe('Run macro: Start');
    expect(describeBinding(binding({ targetType: 'look', targetId: 'gone' }), targets)).toEqual({ label: '(deleted look)', missing: true });
  });
});

describe('saved shortcuts (browser store)', () => {
  it('saves, lists, updates and deletes', async () => {
    const a = await api.createKeyBinding(binding());
    expect(a.id).toBeTruthy();
    expect((await api.listKeyBindings()).map((b) => b.combo)).toEqual(['F5']);
    const moved = await api.updateKeyBinding({ ...a, combo: 'F6' });
    expect(moved.combo).toBe('F6');
    await api.deleteKeyBinding(a.id);
    expect(await api.listKeyBindings()).toEqual([]);
  });

  it('refuses a reused combo, a reserved key and a target that no longer exists', async () => {
    await api.createKeyBinding(binding());
    await expect(api.createKeyBinding(binding({ targetId: 'clear_all' }))).rejects.toThrow(/already assigned/);
    await expect(api.createKeyBinding(binding({ combo: 'Space' }))).rejects.toThrow(/slides/);
    await expect(api.createKeyBinding(binding({ combo: 'F7', targetType: 'look', targetId: 'ghost' }))).rejects.toThrow(/no longer exists/);
    expect(await api.listKeyBindings()).toHaveLength(1);
  });
});

describe('running a binding', () => {
  it('toggles a prop, applies a look and runs an action', async () => {
    const prop = await api.createProp(textProp('Welcome'));
    await runKeyBinding(binding({ combo: 'F6', targetType: 'prop', targetId: prop.id }));
    expect((await api.getPresentationState()).activeProps?.map((p) => p.id)).toEqual([prop.id]);

    const look = await api.createLook({ id: '', name: 'Logo', logo: true, blackout: false, propIds: [] });
    await runKeyBinding(binding({ combo: 'F7', targetType: 'look', targetId: look.id }));
    const st = await api.getPresentationState();
    expect(st.isLogo).toBe(true);
    expect(st.activeProps ?? []).toHaveLength(0);

    await runKeyBinding(binding({ combo: 'F8', targetId: 'toggle_logo' }));
    expect((await api.getPresentationState()).isLogo).toBe(false);
  });

  it('reports a look that has been deleted', async () => {
    await expect(runKeyBinding(binding({ targetType: 'look', targetId: 'ghost' }))).rejects.toThrow(/no longer exists/);
  });
});

describe('keyboard hook with custom shortcuts', () => {
  function Harness({ bindings, onBinding }: { bindings: KeyBinding[]; onBinding: (b: KeyBinding) => void }) {
    useKeyboardShortcuts({ onNext: vi.fn(), onPrevious: vi.fn(), onToggleBlackout: vi.fn(), bindings, onBinding });
    return <input data-testid="field" />;
  }
  const f5 = binding({ id: 'k1' });

  it('runs the matching binding and nothing else', () => {
    const onBinding = vi.fn();
    render(<Harness bindings={[f5, binding({ id: 'k2', combo: 'Ctrl+Shift+K', targetId: 'clear_all' })]} onBinding={onBinding} />);
    fireEvent.keyDown(window, { key: 'F5', code: 'F5' });
    expect(onBinding).toHaveBeenCalledTimes(1);
    expect(onBinding).toHaveBeenCalledWith(f5);
    fireEvent.keyDown(window, { key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true });
    expect(onBinding).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'k2' }));
    fireEvent.keyDown(window, { key: 'F6', code: 'F6' });
    expect(onBinding).toHaveBeenCalledTimes(2);
  });

  it('does not fire while typing in a field or when a key is held down', () => {
    const onBinding = vi.fn();
    render(<Harness bindings={[f5]} onBinding={onBinding} />);
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'F5', code: 'F5' });
    fireEvent.keyDown(window, { key: 'F5', code: 'F5', repeat: true });
    expect(onBinding).not.toHaveBeenCalled();
  });

  it('leaves the built-in keys alone', () => {
    const onBinding = vi.fn();
    render(<Harness bindings={[f5]} onBinding={onBinding} />);
    fireEvent.keyDown(window, { key: 'b', code: 'KeyB' });
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(onBinding).not.toHaveBeenCalled();
  });
});

describe('KeyBindingsCard', () => {
  it('adds a shortcut by pressing keys and removes it again', async () => {
    render(<KeyBindingsCard />);
    await screen.findByTestId('key-bindings-empty');

    fireEvent.click(screen.getByTestId('key-capture'));
    fireEvent.keyDown(screen.getByTestId('key-capture'), { key: 'F9', code: 'F9' });
    fireEvent.change(screen.getByTestId('key-target'), { target: { value: 'clear_all' } });
    fireEvent.click(screen.getByTestId('key-add'));

    const row = await screen.findByTestId('key-binding-row');
    expect(row.textContent).toContain('F9');
    expect(row.textContent).toContain('Clear all (blank output)');

    fireEvent.click(screen.getByLabelText('Remove shortcut F9'));
    await screen.findByTestId('key-bindings-empty');
  });

  it('explains why a reserved or taken key cannot be added', async () => {
    await api.createKeyBinding(binding());
    render(<KeyBindingsCard />);
    await screen.findByTestId('key-binding-row');

    fireEvent.click(screen.getByTestId('key-capture'));
    fireEvent.keyDown(screen.getByTestId('key-capture'), { key: ' ', code: 'Space' });
    fireEvent.change(screen.getByTestId('key-target'), { target: { value: 'clear_all' } });
    expect(screen.getByTestId('key-binding-error').textContent).toMatch(/slides/);
    expect((screen.getByTestId('key-add') as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('key-capture'));
    fireEvent.keyDown(screen.getByTestId('key-capture'), { key: 'F5', code: 'F5' });
    expect(screen.getByTestId('key-binding-error').textContent).toMatch(/already assigned/);
    expect((screen.getByTestId('key-add') as HTMLButtonElement).disabled).toBe(true);
  });

  it('lists props, and marks a shortcut whose target was deleted', async () => {
    const prop = await api.createProp(textProp('Welcome'));
    await api.createKeyBinding(binding({ combo: 'F6', targetType: 'prop', targetId: prop.id }));
    render(<KeyBindingsCard />);
    await waitFor(() => expect(screen.getByTestId('key-binding-row').textContent).toContain('Toggle prop: Welcome'));
    await api.deleteProp(prop.id);
    render(<KeyBindingsCard />);
    await waitFor(() => expect(screen.getAllByTestId('key-binding-row').some((r) => r.textContent?.includes('(deleted prop)'))).toBe(true));
  });
});
