import { useEffect, useCallback } from 'react';
import { api } from '../services/api';

interface UseKeyboardShortcutsOptions {
  onNext: () => void;
  onPrevious: () => void;
  onToggleBlackout: () => void;
  onToggleLogo?: () => void;
  onClearMedia?: () => void;
  onClearAll?: () => void;
  onEscape?: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onNext,
  onPrevious,
  onToggleBlackout,
  onToggleLogo,
  onClearMedia,
  onClearAll,
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

      // Letter shortcuts must not fire for Ctrl/Cmd/Alt combos such as Ctrl+C (copy)
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;

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
          if (hasModifier) break;
          e.preventDefault();
          onToggleBlackout();
          break;

        case 'l':
        case 'L':
          if (onToggleLogo && !hasModifier) {
            e.preventDefault();
            onToggleLogo();
          }
          break;

        case 'm':
        case 'M':
          if (onClearMedia && !hasModifier) {
            e.preventDefault();
            onClearMedia();
          }
          break;

        case 'c':
        case 'C':
          if (onClearAll && !hasModifier) {
            e.preventDefault();
            onClearAll();
          }
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
    [enabled, onNext, onPrevious, onToggleBlackout, onToggleLogo, onClearMedia, onClearAll, onEscape]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
