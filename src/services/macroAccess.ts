import { Macro } from '../types';

/** Control paths (OSC, MIDI, phone remote) run a macro with this action name followed by the macro id. */
export const RUN_MACRO_PREFIX = 'run_macro:';
/** Allowlist entry that lets OSC run every macro. */
export const ALL_MACROS = `${RUN_MACRO_PREFIX}*`;

export const macroAction = (id: string): string => `${RUN_MACRO_PREFIX}${id}`;
export const macroOscPath = (id: string): string => `/macro/${id}`;

const entries = (allowlist: string): string[] =>
  allowlist
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/** True when OSC may run the macro: listed on its own, or all macros are allowed. */
export function isMacroAllowed(allowlist: string, id: string): boolean {
  const list = entries(allowlist);
  return list.includes(macroAction(id)) || list.includes(ALL_MACROS);
}

export function isAllMacrosAllowed(allowlist: string): boolean {
  return entries(allowlist).includes(ALL_MACROS);
}

/** Returns the allowlist with one macro added or removed. Other entries are kept as they are. */
export function setMacroAllowed(allowlist: string, id: string, allowed: boolean): string {
  const list = entries(allowlist).filter((e) => e !== macroAction(id));
  if (allowed) list.push(macroAction(id));
  return list.join(',');
}

/** Returns the allowlist with "all macros" turned on or off. Listing macros one by one is kept when turned off. */
export function setAllMacrosAllowed(allowlist: string, allowed: boolean): string {
  const list = entries(allowlist).filter((e) => e !== ALL_MACROS);
  if (allowed) list.push(ALL_MACROS);
  return list.join(',');
}

/** Removes entries for macros that no longer exist, so the allowlist does not collect stale ids. */
export function pruneMacroEntries(allowlist: string, macros: Pick<Macro, 'id'>[]): string {
  const ids = new Set(macros.map((m) => m.id));
  return entries(allowlist)
    .filter((e) => !e.startsWith(RUN_MACRO_PREFIX) || e === ALL_MACROS || ids.has(e.slice(RUN_MACRO_PREFIX.length)))
    .join(',');
}

/** A readable name for a MIDI mapping's action, including macros by name. */
export function midiActionLabel(action: string, macros: Pick<Macro, 'id' | 'name'>[], actions: { action: string; label: string }[]): string {
  if (action.startsWith(RUN_MACRO_PREFIX)) {
    const found = macros.find((m) => m.id === action.slice(RUN_MACRO_PREFIX.length));
    return found ? `Run macro: ${found.name}` : '(deleted macro)';
  }
  return actions.find((a) => a.action === action)?.label ?? action;
}
