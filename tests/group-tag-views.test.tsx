import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { GroupTag } from '../src/components/GroupTag';
import { PreviewPanel } from '../src/components/PreviewPanel';
import { StageDisplayView } from '../src/components/Stage/StageDisplayView';
import { PresentationState, Slide } from '../src/types';

const slide = (over: Partial<Slide> = {}): Slide => ({
  id: 's1', presentationId: 'p1', sortOrder: 0, title: 'Song - Chorus', body: 'Sing out',
  backgroundColor: '#000000', foregroundColor: '#ffffff', fontSize: 'large', textAlignment: 'center',
  createdAt: '', updatedAt: '', ...over,
});

describe('GroupTag', () => {
  it('renders the label on the group colour with readable text', () => {
    render(<GroupTag slide={slide({ groupLabel: 'Chorus', groupColor: '#facc15' })} />);
    const tag = screen.getByTestId('group-tag');
    expect(tag.textContent).toBe('Chorus');
    expect(tag.style.backgroundColor).toBe('rgb(250, 204, 21)');
    expect(tag.style.color).toBe('rgb(11, 16, 32)'); // dark text on yellow
  });

  it('renders nothing for ungrouped, half-grouped or missing slides', () => {
    const { container, rerender } = render(<GroupTag slide={slide()} />);
    expect(container.firstChild).toBeNull();
    rerender(<GroupTag slide={slide({ groupLabel: 'Chorus' })} />);
    expect(container.firstChild).toBeNull();
    rerender(<GroupTag slide={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not use arbitrary text from imported files as a CSS colour', () => {
    render(<GroupTag slide={slide({ groupLabel: 'X', groupColor: 'red; background:url(http://evil)' })} />);
    expect(screen.getByTestId('group-tag').style.backgroundColor).toBe('rgb(100, 116, 139)');
  });

  it('is larger for the stage display', () => {
    const { rerender } = render(<GroupTag slide={slide({ groupLabel: 'V1', groupColor: '#3b82f6' })} size="sm" />);
    const small = screen.getByTestId('group-tag').style.fontSize;
    rerender(<GroupTag slide={slide({ groupLabel: 'V1', groupColor: '#3b82f6' })} size="lg" />);
    expect(screen.getByTestId('group-tag').style.fontSize).not.toBe(small);
  });
});

describe('Group tag in the preview panel and stage view', () => {
  const state = (current: Slide | null, next: Slide | null): PresentationState => ({
    currentPresentationId: 'p1', currentSlideId: current?.id ?? null, currentSlideIndex: 0, totalSlides: 3,
    currentSlide: current, nextSlide: next, isBlackout: false, isLive: true,
  });

  it('preview panel shows the live slide group next to the slide counter', () => {
    render(
      <PreviewPanel
        presentationState={state(slide({ groupLabel: 'Chorus', groupColor: '#f59e0b' }), null)}
        audienceStatus={{ isOpen: false } as any}
        onNext={vi.fn()} onPrevious={vi.fn()} onToggleBlackout={vi.fn()} onToggleAudienceWindow={vi.fn()}
      />
    );
    expect(screen.getByTestId('group-tag').textContent).toBe('Chorus');
  });

  it('preview panel shows no tag for an ordinary slide', () => {
    render(
      <PreviewPanel
        presentationState={state(slide(), null)}
        audienceStatus={{ isOpen: false } as any}
        onNext={vi.fn()} onPrevious={vi.fn()} onToggleBlackout={vi.fn()} onToggleAudienceWindow={vi.fn()}
      />
    );
    expect(screen.queryByTestId('group-tag')).toBeNull();
  });

  it('stage display shows the group of the current and the next slide', async () => {
    const res = await api.generateSlidesFromSong({
      songId: 'song-amazing-grace', sectionIds: [], createNewPresentation: true, newPresentationTitle: 'Stage',
    });
    await api.setLiveSlide(res.presentationId, res.slides[0].id);

    render(<StageDisplayView previewMode />);
    await waitFor(() => expect(screen.getAllByTestId('group-tag').length).toBeGreaterThanOrEqual(2));
    const labels = screen.getAllByTestId('group-tag').map((t) => t.textContent);
    expect(labels).toContain(res.slides[0].groupLabel);
  });
});
