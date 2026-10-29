import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { buildLayout, isEmptyLayout, validateLayout } from '../src/services/slideLayout';
import { SlideEditorModal } from '../src/components/SlideEditorModal';
import { SlideGrid } from '../src/components/SlideGrid';
import { Slide } from '../src/types';

afterEach(async () => {
  vi.useRealTimers();
  await api.clearAll();
});

/** Three slides; `times` are each slide's own auto-advance time, the first slide live. */
async function liveSlidesWithTimes(times: (number | undefined)[]) {
  const pres = await api.createPresentation('Timing', 'Worship');
  const slides: Slide[] = [];
  for (const [i, t] of times.entries()) {
    slides.push(await api.createSlide(pres.id, { title: `s${i}`, body: `s${i}`, layout: t != null ? { advanceSeconds: t } : undefined }));
  }
  await api.setLiveSlide(pres.id, slides[0].id);
  return slides;
}
const currentId = async () => (await api.getPresentationState()).currentSlideId;

describe('a slide time is part of the layout', () => {
  it('is checked as a whole number of seconds from 1 to 3600', () => {
    expect(validateLayout({ advanceSeconds: 20 })).toBeNull();
    expect(validateLayout({ advanceSeconds: 1 })).toBeNull();
    expect(validateLayout({ advanceSeconds: 3600 })).toBeNull();
    for (const bad of [0, 3601, 2.5, NaN, -1]) expect(validateLayout({ advanceSeconds: bad })).toMatch(/between 1 and 3600/);
  });

  it('makes a layout non-empty, and is kept when margin or outline is edited', () => {
    expect(isEmptyLayout({ advanceSeconds: 5 })).toBe(false);
    expect(isEmptyLayout({})).toBe(true);
    expect(buildLayout(0, 0, '#000000', [], 12)).toEqual({ advanceSeconds: 12 });
    expect(buildLayout(6, 0, '#000000', [], 12)).toEqual({ marginPct: 6, advanceSeconds: 12 });
    expect(buildLayout(0, 0, '#000000')).toEqual({}); // nothing set clears the layout
  });
});

describe('auto-advance uses each slide\'s own time (mock API)', () => {
  it('keeps a slide for its own time and falls back to the interval', async () => {
    vi.useFakeTimers();
    const slides = await liveSlidesWithTimes([6, 2, undefined]);
    await api.startAutoAdvance(3, false);

    await vi.advanceTimersByTimeAsync(5_500);
    expect(await currentId()).toBe(slides[0].id); // 6 s, not the run's 3 s
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await currentId()).toBe(slides[1].id);
    await vi.advanceTimersByTimeAsync(1_000); // 7.5 s in: 1.5 s on the second slide
    expect(await currentId()).toBe(slides[1].id); // its own 2 s, not the run's 3 s
    await vi.advanceTimersByTimeAsync(1_000); // 8.5 s in
    expect(await currentId()).toBe(slides[2].id);
  });

  it('starts the countdown again with the new slide\'s time when the operator moves by hand', async () => {
    vi.useFakeTimers();
    const slides = await liveSlidesWithTimes([undefined, 10, undefined]);
    await api.startAutoAdvance(3, false);

    await vi.advanceTimersByTimeAsync(2_000);
    await api.setLiveSlide(slides[1].presentationId, slides[1].id); // to the 10 s slide, 1 s before the old countdown ends
    await vi.advanceTimersByTimeAsync(9_000);
    expect(await currentId()).toBe(slides[1].id); // the old 3 s countdown did not fire
    await vi.advanceTimersByTimeAsync(2_000);
    expect(await currentId()).toBe(slides[2].id);
  });

  it('refuses an invalid time when saving a slide', async () => {
    const pres = await api.createPresentation('Bad', 'Worship');
    await expect(api.createSlide(pres.id, { title: 'x', body: 'x', layout: { advanceSeconds: 0 } })).rejects.toThrow(/between 1 and 3600/);
  });
});

const slide = (over: Partial<Slide> = {}): Slide => ({
  id: 's1', presentationId: 'p1', sortOrder: 0, title: 'One', body: 'Body', backgroundColor: '#0a0f1d',
  foregroundColor: '#ffffff', fontSize: 'large', textAlignment: 'center', createdAt: '', updatedAt: '', ...over,
} as Slide);

describe('slide editor', () => {
  const open = (s: Slide, onSave = vi.fn().mockResolvedValue(null)) => {
    render(<SlideEditorModal slide={s} isOpen onClose={vi.fn()} onSave={onSave} />);
    return onSave;
  };

  it('shows the slide\'s time, and saves a new one with the rest of the layout kept', async () => {
    const onSave = open(slide({ layout: { marginPct: 6, advanceSeconds: 15 } }));
    const input = screen.getByTestId('slide-advance-seconds') as HTMLInputElement;
    expect(input.value).toBe('15');
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1].layout).toMatchObject({ marginPct: 6, advanceSeconds: 40 });
  });

  it('clears the time when the field is emptied, and leaves other slides without one', async () => {
    const onSave = open(slide({ layout: { advanceSeconds: 15 } }));
    fireEvent.change(screen.getByTestId('slide-advance-seconds'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1].layout).toEqual({}); // an empty layout clears the stored one
  });

  it('does not save a time outside 1 to 3600', async () => {
    const onSave = open(slide());
    expect((screen.getByTestId('slide-advance-seconds') as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByTestId('slide-advance-seconds'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/between 1 and 3600/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('keeping the time does not require touching the field when only the text changes', async () => {
    const onSave = open(slide({ layout: { advanceSeconds: 8 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Slide' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1].layout).toEqual({ advanceSeconds: 8 });
  });
});

describe('slide card', () => {
  const state = { currentSlideId: null, isLive: false, isBlackout: false } as any;
  const grid = (slides: Slide[]) => (
    <SlideGrid
      presentation={{ id: 'p1', title: 'P', category: 'Worship', createdAt: '', updatedAt: '' } as any}
      slides={slides}
      presentationState={state}
      onGoLive={vi.fn()}
      onEditSlide={vi.fn()}
      onAddSlide={vi.fn()}
      onDuplicateSlide={vi.fn()}
      onDeleteSlide={vi.fn()}
      onReorderSlides={vi.fn()}
    />
  );

  it('shows the slide\'s own time, and nothing for slides without one', () => {
    const { rerender } = render(grid([slide({ layout: { advanceSeconds: 12 } })]));
    expect(screen.getByTestId('slide-time-badge').textContent).toContain('12 s');
    rerender(grid([slide()]));
    expect(screen.queryByTestId('slide-time-badge')).toBeNull();
  });
});
