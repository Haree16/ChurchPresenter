import { useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface UseKeyboardShortcutsOptions {
  onNext: () => void;
  onPrevious: () => void;
  onToggleBlackout: () => void;
  onEscape?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onNext,
  onPrevious,
  onToggleBlackout,
  onEscape,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore keyboard shortcuts if the user is typing in an input or textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      // Check key codes
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault();
          onNext();
          break;

        case ' ': // Spacebar
          e.preventDefault();
          onNext();
          break;

        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
        case 'Backspace':
          e.preventDefault();
          onPrevious();
          break;

        case 'b':
        case 'B':
          e.preventDefault();
          onToggleBlackout();
          break;

        case 'Escape':
          if (onEscape) {
            e.preventDefault();
            onEscape();
          }
          break;

        case 'F12':
          e.preventDefault();
          api.openDevtools();
          break;

        default:
          break;
      }
    },
    [enabled, onNext, onPrevious, onToggleBlackout, onEscape]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
