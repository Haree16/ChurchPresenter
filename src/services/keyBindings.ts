import { KeyBinding, KeyBindingTargetType } from '../types';
import { MACRO_ACTIONS } from './macroSteps';

export const MAX_KEY_BINDINGS = 100;

/** Combos are written like `Ctrl+Shift+F5`: modifiers in the order Ctrl, Alt, Shift, Meta, then the key. */
const MODIFIER_ORDER: [keyof Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>, string][] = [
  ['ctrlKey', 'Ctrl'],
  ['altKey', 'Alt'],
  ['shiftKey', 'Shift'],
  ['metaKey', 'Meta'],
];

const PUNCTUATION: Record<string, string> = {
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

const NAMED_KEYS = new Set([
  'Home', 'End', 'Insert', 'Delete', 'Space', 'Enter', 'Escape', 'Backspace', 'Tab',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown',
]);

/** Navigation keys the operator window handles whatever modifier is held. */
const NAVIGATION_KEYS = new Set([
  'Space', 'Enter', 'Escape', 'Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'F12',
]);
/** Built-in letter shortcuts: taken with no modifier or Shift only. */
const BUILT_IN_LETTERS = new Set(['B', 'L', 'M', 'C']);
const SYSTEM_COMBOS = new Set(['F11', 'Ctrl+W', 'Ctrl+Q', 'Ctrl+R', 'Ctrl+Shift+R', 'Alt+F4']);
const EDITING_LETTERS = new Set(['A', 'C', 'V', 'X', 'Y', 'Z']);

/** The key part of a keyboard event, by physical key so Shift and keyboard layout do not change it. */
function keyName(e: Pick<KeyboardEvent, 'key' | 'code'>): string | null {
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  if (PUNCTUATION[code]) return PUNCTUATION[code];
  if (NAMED_KEYS.has(code)) return code;
  // No usable code (some virtual keyboards): fall back to the typed character.
  const k = e.key || '';
  if (k === ' ') return 'Space';
  if (k.length === 1 && /[a-z0-9]/i.test(k)) return k.toUpperCase();
  if (NAMED_KEYS.has(k)) return k;
  if (/^F([1-9]|1[0-2])$/.test(k)) return k;
  return null;
}

/** The canonical combo for a key press, or null for a modifier on its own or a key that cannot be bound. */
export function eventToCombo(e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>): string | null {
  const key = keyName(e);
  if (!key) return null;
  const mods = MODIFIER_ORDER.filter(([flag]) => e[flag]).map(([, name]) => name);
  return [...mods, key].join('+');
}

/** Why `combo` (canonical) cannot be used, if it cannot. Mirrors the backend, which has the final say. */
export function reservedReason(combo: string): string | null {
  const i = combo.lastIndexOf('+');
  const mods = i < 0 ? '' : combo.slice(0, i);
  const key = i < 0 ? combo : combo.slice(i + 1);
  if (NAVIGATION_KEYS.has(key)) return `${key} is used to move through slides and cannot be changed.`;
  if (BUILT_IN_LETTERS.has(key) && (mods === '' || mods === 'Shift')) return `${combo} is already used by the app and cannot be changed.`;
  if (SYSTEM_COMBOS.has(combo)) return `${combo} is already used by the app and cannot be changed.`;
  if (mods === '' && /^[0-9]$/.test(key)) return 'Number keys are used to jump to a slide.';
  if (mods === 'Ctrl' && EDITING_LETTERS.has(key)) return `${combo} is used for editing text.`;
  return null;
}

export function validateKeyBinding(b: Pick<KeyBinding, 'combo' | 'targetType' | 'targetId'>): string | null {
  if (!b.combo?.trim()) return 'Press the keys for the shortcut.';
  const reason = reservedReason(b.combo);
  if (reason) return reason;
  if (!(b.targetId || '').trim()) return 'Choose what the shortcut should do.';
  switch (b.targetType) {
    case 'action':
      return MACRO_ACTIONS.some((a) => a.action === b.targetId) ? null : 'That action cannot be bound to a key.';
    case 'prop':
    case 'macro':
    case 'look':
    case 'clearGroup':
      return null;
    default:
      return 'Choose an action, prop, macro, look or clear group.';
  }
}

export function bindingForEvent(
  bindings: KeyBinding[] | undefined,
  e: Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>
): KeyBinding | null {
  if (!bindings || bindings.length === 0) return null;
  const combo = eventToCombo(e);
  return combo ? bindings.find((b) => b.combo === combo) ?? null : null;
}

export const TARGET_TYPE_LABELS: Record<KeyBindingTargetType, string> = {
  action: 'Action',
  prop: 'Prop',
  macro: 'Macro',
  look: 'Look',
  clearGroup: 'Clear group',
};

/** What a binding does, in words. Targets that no longer exist come back with `missing: true`. */
export function describeBinding(
  b: KeyBinding,
  targets: {
    props: { id: string; name: string }[];
    macros: { id: string; name: string }[];
    looks: { id: string; name: string }[];
    clearGroups?: { id: string; name: string }[];
  }
): { label: string; missing: boolean } {
  if (b.targetType === 'action') {
    const found = MACRO_ACTIONS.find((a) => a.action === b.targetId);
    return found ? { label: found.label, missing: false } : { label: b.targetId, missing: true };
  }
  const list =
    b.targetType === 'prop' ? targets.props
    : b.targetType === 'macro' ? targets.macros
    : b.targetType === 'clearGroup' ? targets.clearGroups ?? []
    : targets.looks;
  const found = list.find((t) => t.id === b.targetId);
  const kind = TARGET_TYPE_LABELS[b.targetType].toLowerCase();
  const verb = b.targetType === 'prop' ? 'Toggle prop' : b.targetType === 'macro' ? 'Run macro' : b.targetType === 'clearGroup' ? 'Clear group' : 'Apply look';
  return found ? { label: `${verb}: ${found.name}`, missing: false } : { label: `(deleted ${kind})`, missing: true };
}
