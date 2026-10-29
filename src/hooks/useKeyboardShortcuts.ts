import { useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

interface UseKeyboardShortcutsOptions {
  onNext: () => void;
  onPrevious: () => void;
  onToggleBlackout: () => void;
  onToggleLogo?: () => void;
  onClearMedia?: () => void;
  onClearAll?: () => void;
  onEscape?: () => void;
  /** Called with a 1-based slide number after the user types digits and presses Enter. */
  onGoToSlide?: (slideNumber: number) => void;
  /** Ctrl+W: close the audience window. */
  onCloseAudience?: () => void;
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
  onGoToSlide,
  onCloseAudience,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  // Digits typed so far, cleared after a pause so a stray key never lingers.
  const numberBuffer = useRef('');
  const numberTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetNumber = () => {
    numberBuffer.current = '';
    if (numberTimer.current) clearTimeout(numberTimer.current);
    numberTimer.current = null;
  };

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

      if (onCloseAudience && (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        onCloseAudience();
        return;
      }

      if (onGoToSlide && !hasModifier) {
        if (/^[0-9]$/.test(e.key)) {
          e.preventDefault();
          numberBuffer.current = (numberBuffer.current + e.key).slice(0, 4);
          if (numberTimer.current) clearTimeout(numberTimer.current);
          numberTimer.current = setTimeout(resetNumber, 3000);
          return;
        }
        if (e.key === 'Enter' && numberBuffer.current) {
          e.preventDefault();
          const n = parseInt(numberBuffer.current, 10);
          resetNumber();
          onGoToSlide(n);
          return;
        }
        if (e.key === 'Escape' && numberBuffer.current) {
          e.preventDefault();
          resetNumber();
          return;
        }
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
    [enabled, onNext, onPrevious, onToggleBlackout, onToggleLogo, onClearMedia, onClearAll, onEscape, onGoToSlide, onCloseAudience]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
