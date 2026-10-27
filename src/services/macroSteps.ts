import { Macro, MacroStep } from '../types';

export const MAX_MACRO_NAME_CHARS = 60;
export const MAX_MACRO_STEPS = 30;
export const MAX_WAIT_SECONDS = 600;
export const MAX_TOTAL_WAIT_SECONDS = 1800;
export const MAX_ALERT_CHARS = 200;
export const MIN_AUTO_ADVANCE_SECONDS = 1;
export const MAX_AUTO_ADVANCE_SECONDS = 3600;

/** Actions a macro step may run, with the label shown in the editor. Same list as the backend. */
export const MACRO_ACTIONS: { action: string; label: string }[] = [
  { action: 'next_slide', label: 'Next slide' },
  { action: 'prev_slide', label: 'Previous slide' },
  { action: 'next_item', label: 'Next service item' },
  { action: 'prev_item', label: 'Previous service item' },
  { action: 'toggle_blackout', label: 'Toggle blackout' },
  { action: 'toggle_logo', label: 'Toggle logo screen' },
  { action: 'toggle_live', label: 'Toggle live output' },
  { action: 'clear_screen', label: 'Clear slide' },
  { action: 'clear_media', label: 'Clear media' },
  { action: 'clear_all', label: 'Clear all (blank output)' },
  { action: 'clear_alert', label: 'Clear alert' },
  { action: 'clear_props', label: 'Clear props' },
  { action: 'start_timer', label: 'Start timer' },
  { action: 'stop_timer', label: 'Stop timer' },
  { action: 'reset_timer', label: 'Reset timer' },
  { action: 'stop_auto_advance', label: 'Stop auto-advance' },
  { action: 'clear_overlay', label: 'Clear livestream overlay' },
];

export function validateStep(step: MacroStep): string | null {
  switch (step.type) {
    case 'action':
      return MACRO_ACTIONS.some((a) => a.action === step.action) ? null : `'${step.action}' cannot be used in a macro.`;
    case 'alert': {
      const m = (step.message || '').trim();
      if (!m) return 'an alert needs a message.';
      if ([...m].length > MAX_ALERT_CHARS) return `the alert is too long (maximum ${MAX_ALERT_CHARS} characters).`;
      if (step.seconds != null && (step.seconds < 0 || step.seconds > 3600)) return 'an alert can last at most 3600 seconds.';
      return null;
    }
    case 'prop':
      if (!(step.propId || '').trim()) return 'choose a prop.';
      return ['show', 'hide', 'toggle'].includes(step.mode) ? null : `unknown prop mode '${step.mode}'.`;
    case 'wait':
      return Number.isInteger(step.seconds) && step.seconds >= 1 && step.seconds <= MAX_WAIT_SECONDS
        ? null
        : `a wait must be between 1 and ${MAX_WAIT_SECONDS} seconds.`;
    case 'autoAdvance':
      return Number.isInteger(step.intervalSeconds) &&
        step.intervalSeconds >= MIN_AUTO_ADVANCE_SECONDS &&
        step.intervalSeconds <= MAX_AUTO_ADVANCE_SECONDS
        ? null
        : `the auto-advance interval must be between ${MIN_AUTO_ADVANCE_SECONDS} and ${MAX_AUTO_ADVANCE_SECONDS} seconds.`;
    default:
      return `unknown step type '${(step as { type: string }).type}'.`;
  }
}

/** Same rules as the desktop backend, so the editor can explain problems before saving. */
export function validateMacro(m: Partial<Macro>): string | null {
  const name = (m.name || '').trim();
  if (!name) return 'Give the macro a name.';
  if ([...name].length > MAX_MACRO_NAME_CHARS) return `Macro name is too long (maximum ${MAX_MACRO_NAME_CHARS} characters).`;
  const steps = m.steps || [];
  if (steps.length === 0) return 'A macro needs at least one step.';
  if (steps.length > MAX_MACRO_STEPS) return `A macro can have at most ${MAX_MACRO_STEPS} steps.`;
  let totalWait = 0;
  for (let i = 0; i < steps.length; i++) {
    const problem = validateStep(steps[i]);
    if (problem) return `Step ${i + 1}: ${problem}`;
    if (steps[i].type === 'wait') totalWait += (steps[i] as { seconds: number }).seconds;
  }
  if (totalWait > MAX_TOTAL_WAIT_SECONDS) return `The waits add up to more than ${MAX_TOTAL_WAIT_SECONDS / 60} minutes.`;
  return null;
}

export function stepLabel(step: MacroStep, propName?: (id: string) => string | undefined): string {
  switch (step.type) {
    case 'action':
      return MACRO_ACTIONS.find((a) => a.action === step.action)?.label ?? step.action;
    case 'alert':
      return `Alert: ${step.message}`;
    case 'prop':
      return `${step.mode === 'show' ? 'Show' : step.mode === 'hide' ? 'Hide' : 'Toggle'} prop ${propName?.(step.propId) ?? ''}`.trim();
    case 'wait':
      return `Wait ${step.seconds} s`;
    case 'autoAdvance':
      return `Auto-advance every ${step.intervalSeconds} s${step.loopAtEnd ? ' (loop)' : ''}`;
  }
}

/** A starting point for a new step of the given type. */
export function newStep(type: MacroStep['type']): MacroStep {
  switch (type) {
    case 'action':
      return { type, action: 'clear_all' };
    case 'alert':
      return { type, message: '', seconds: 30 };
    case 'prop':
      return { type, propId: '', mode: 'show' };
    case 'wait':
      return { type, seconds: 5 };
    case 'autoAdvance':
      return { type, intervalSeconds: 8, loopAtEnd: false };
  }
}
