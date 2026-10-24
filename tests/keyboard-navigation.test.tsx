import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { useKeyboardShortcuts } from '../src/hooks/useKeyboardShortcuts';

function TestShortcutComponent({
  onNext,
  onPrevious,
  onToggleBlackout,
  onEscape,
}: {
  onNext: () => void;
  onPrevious: () => void;
  onToggleBlackout: () => void;
  onEscape?: () => void;
}) {
  useKeyboardShortcuts({
    onNext,
    onPrevious,
    onToggleBlackout,
    onEscape,
  });

  return (
    <div>
      <input data-testid="test-input" type="text" />
      <textarea data-testid="test-textarea" />
      <button data-testid="test-button">Click me</button>
    </div>
  );
}

describe('Keyboard Navigation & Shortcut Handling', () => {
  it('triggers onNext when pressing Right Arrow, Down Arrow, Page Down, or Spacebar', () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const onToggleBlackout = vi.fn();

    render(
      <TestShortcutComponent
        onNext={onNext}
        onPrevious={onPrevious}
        onToggleBlackout={onToggleBlackout}
      />
    );

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onNext).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(onNext).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'PageDown' });
    expect(onNext).toHaveBeenCalledTimes(3);

    fireEvent.keyDown(window, { key: ' ' });
    expect(onNext).toHaveBeenCalledTimes(4);
  });

  it('triggers onPrevious when pressing Left Arrow, Up Arrow, Page Up, or Backspace', () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const onToggleBlackout = vi.fn();

    render(
      <TestShortcutComponent
        onNext={onNext}
        onPrevious={onPrevious}
        onToggleBlackout={onToggleBlackout}
      />
    );

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(onPrevious).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(onPrevious).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'PageUp' });
    expect(onPrevious).toHaveBeenCalledTimes(3);

    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(onPrevious).toHaveBeenCalledTimes(4);
  });

  it('triggers blackout on key B', () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const onToggleBlackout = vi.fn();

    render(
      <TestShortcutComponent
        onNext={onNext}
        onPrevious={onPrevious}
        onToggleBlackout={onToggleBlackout}
      />
    );

    fireEvent.keyDown(window, { key: 'b' });
    expect(onToggleBlackout).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'B' });
    expect(onToggleBlackout).toHaveBeenCalledTimes(2);
  });

  it('suppresses keyboard navigation when focused in text input or textarea', () => {
    const onNext = vi.fn();
    const onPrevious = vi.fn();
    const onToggleBlackout = vi.fn();

    const { getByTestId } = render(
      <TestShortcutComponent
        onNext={onNext}
        onPrevious={onPrevious}
        onToggleBlackout={onToggleBlackout}
      />
    );

    const input = getByTestId('test-input');
    const textarea = getByTestId('test-textarea');

    // Key event fired from input
    fireEvent.keyDown(input, { key: 'ArrowRight' });
    fireEvent.keyDown(input, { key: ' ' });
    fireEvent.keyDown(input, { key: 'b' });
    expect(onNext).not.toHaveBeenCalled();
    expect(onToggleBlackout).not.toHaveBeenCalled();

    // Key event fired from textarea
    fireEvent.keyDown(textarea, { key: 'ArrowDown' });
    fireEvent.keyDown(textarea, { key: 'Backspace' });
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrevious).not.toHaveBeenCalled();
  });

  it('calls onEscape when Escape key is pressed', () => {
    const onEscape = vi.fn();
    render(
      <TestShortcutComponent
        onNext={vi.fn()}
        onPrevious={vi.fn()}
        onToggleBlackout={vi.fn()}
        onEscape={onEscape}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});
