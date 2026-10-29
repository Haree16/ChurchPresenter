import { api } from './api';
import { KeyBinding } from '../types';

/** Does what a key binding says. Rejects with the reason when the target is gone or fails. */
export async function runKeyBinding(b: KeyBinding): Promise<void> {
  switch (b.targetType) {
    case 'action':
      await api.dispatchAction(b.targetId);
      return;
    case 'prop':
      await api.toggleProp(b.targetId);
      return;
    case 'macro':
      await api.runMacro(b.targetId);
      return;
    case 'look':
      await api.applyLook(b.targetId);
      return;
    case 'clearGroup':
      await api.runClearGroup(b.targetId);
      return;
  }
}
