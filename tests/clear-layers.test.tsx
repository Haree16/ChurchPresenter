import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { api } from '../src/services/api';
import { useKeyboardShortcuts } from '../src/hooks/useKeyboardShortcuts';
import { Header } from '../src/components/Header';
import { PresentationState } from '../src/types';

function Harness(props: {
  onClearMedia: () => void;
  onClearAll: () => void;
  onToggleLogo: () => void;
  onToggleBlackout: () => void;
}) {
  useKeyboardShortcuts({ onNext: vi.fn(), onPrevious: vi.fn(), ...props });
  return (
    <div>
      <input data-testid="field" />
    </div>
  );
}

const handlers = () => ({
  onClearMedia: vi.fn(),
  onClearAll: vi.fn(),
  onToggleLogo: vi.fn(),
  onToggleBlackout: vi.fn(),
});

describe('Clear layers', () => {
  it('M clears media, C clears all, L toggles logo, B toggles blackout', () => {
    const h = handlers();
    render(<Harness {...h} />);
    fireEvent.keyDown(window, { key: 'm' });
    fireEvent.keyDown(window, { key: 'C' });
    fireEvent.keyDown(window, { key: 'l' });
    fireEvent.keyDown(window, { key: 'b' });
    expect(h.onClearMedia).toHaveBeenCalledTimes(1);
    expect(h.onClearAll).toHaveBeenCalledTimes(1);
    expect(h.onToggleLogo).toHaveBeenCalledTimes(1);
    expect(h.onToggleBlackout).toHaveBeenCalledTimes(1);
  });

  it('does not fire on Ctrl/Cmd/Alt combos, so Ctrl+C (copy) never blanks the output', () => {
    const h = handlers();
    render(<Harness {...h} />);
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      for (const key of ['c', 'm', 'l', 'b']) {
        fireEvent.keyDown(window, { key, ...mod });
      }
    }
    expect(h.onClearAll).not.toHaveBeenCalled();
    expect(h.onClearMedia).not.toHaveBeenCalled();
    expect(h.onToggleLogo).not.toHaveBeenCalled();
    expect(h.onToggleBlackout).not.toHaveBeenCalled();
  });

  it('ignores the shortcuts while typing in a text field', () => {
    const h = handlers();
    render(<Harness {...h} />);
    fireEvent.keyDown(screen.getByTestId('field'), { key: 'c' });
    expect(h.onClearAll).not.toHaveBeenCalled();
  });

  it('clearMedia stops media only; clearAll blanks slide, media, logo and blackout', async () => {
    await api.nextSlide();
    await api.toggleLogo();
    await api.toggleBlackout();
    const before = await api.getPresentationState();
    expect(before.isLive && before.isLogo && before.isBlackout).toBe(true);

    await api.setMediaPlayback({
      mediaId: 'm1', mediaUrl: 'file:///a.mp4', mediaType: 'video', isPlaying: true,
      isMuted: false, volume: 1, isLooping: false, currentTime: 0, duration: 10, fitMode: 'cover',
    } as any);
    const cleared = await api.clearMedia();
    expect(cleared.mediaPlayback).toBeNull();
    expect(cleared.isLive && cleared.isLogo && cleared.isBlackout).toBe(true);

    const slideId = (await api.getPresentationState()).currentSlideId;
    const all = await api.clearAll();
    expect(all.isLive || all.isLogo || all.isBlackout).toBe(false);
    expect(all.mediaPlayback).toBeNull();
    expect(all.currentSlideId).toBe(slideId);
  });

  it('dispatches clear_media and clear_all as actions', async () => {
    await api.nextSlide();
    await api.toggleLogo();
    const s = await api.dispatchAction('clear_all');
    expect(s.isLive).toBe(false);
    expect(s.isLogo).toBe(false);
    const m = await api.dispatchAction('clear_media');
    expect(m.mediaPlayback).toBeNull();
  });

  describe('Header buttons', () => {
    const baseState: PresentationState = {
      currentPresentationId: null, currentSlideId: null, currentSlideIndex: 0, totalSlides: 0,
      currentSlide: null, nextSlide: null, isBlackout: false, isLive: true,
    };
    const renderHeader = (state: PresentationState, onClearMedia = vi.fn(), onClearAll = vi.fn()) => {
      const props: any = {
        presentationState: state,
        audienceStatus: { isOpen: false },
        onToggleBlackout: vi.fn(),
        onClearMedia,
        onClearAll,
      };
      return { ...render(<Header {...props} />), onClearMedia, onClearAll };
    };

    it('clear all always works; clear media is disabled when no media plays', () => {
      const { onClearAll, onClearMedia } = renderHeader(baseState);
      fireEvent.click(screen.getByTestId('clear-all-btn'));
      expect(onClearAll).toHaveBeenCalledTimes(1);
      expect((screen.getByTestId('clear-media-btn') as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(screen.getByTestId('clear-media-btn'));
      expect(onClearMedia).not.toHaveBeenCalled();
    });

    it('enables clear media while media is playing', () => {
      const playing = { ...baseState, mediaPlayback: { mediaUrl: 'x', isPlaying: true } as any };
      const { onClearMedia } = renderHeader(playing);
      const btn = screen.getByTestId('clear-media-btn') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
      fireEvent.click(btn);
      expect(onClearMedia).toHaveBeenCalledTimes(1);
    });
  });
});
