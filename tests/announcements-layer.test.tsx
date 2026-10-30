import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { AnnouncementsControl } from '../src/components/AnnouncementsControl';
import { AudienceView } from '../src/components/AudienceView';
import { PresentationState } from '../src/types';

afterEach(async () => {
  await api.clearAll();
  await api.clearAnnouncements();
});

const idle: PresentationState = {
  currentPresentationId: null,
  currentSlideId: null,
  currentSlideIndex: 0,
  totalSlides: 0,
  currentSlide: null,
  nextSlide: null,
  isBlackout: false,
  isLive: false,
};

describe('Phase 9.2: Announcements Layer', () => {
  it('starts announcements loop, navigates independently and loops back at end', async () => {
    // Setup 2 presentations: Sunday Service & Foyer Loop
    const mainPres = await api.createPresentation('Sunday Service', 'Worship');
    const mainS1 = await api.createSlide(mainPres.id, { title: 'Main 1', body: 'Main Slide 1' });
    const mainS2 = await api.createSlide(mainPres.id, { title: 'Main 2', body: 'Main Slide 2' });

    const foyerPres = await api.createPresentation('Lobby Announcements', 'Announcements');
    const foyerS1 = await api.createSlide(foyerPres.id, { title: 'Welcome', body: 'Welcome to Church' });
    const foyerS2 = await api.createSlide(foyerPres.id, { title: 'Youth', body: 'Youth Friday 7pm' });

    // Set main presentation live
    await api.setLiveSlide(mainPres.id, mainS1.id);
    let state = await api.getPresentationState();
    expect(state.currentSlideId).toBe(mainS1.id);
    expect(state.announcements).toBeUndefined();

    // Start announcements on foyer output
    state = await api.setAnnouncementsPresentation(
      foyerPres.id,
      ['output-foyer'],
      10,
      true
    );

    expect(state.announcements).toBeDefined();
    expect(state.announcements?.presentationId).toBe(foyerPres.id);
    expect(state.announcements?.slideId).toBe(foyerS1.id);
    expect(state.announcements?.currentSlide?.body).toBe('Welcome to Church');
    expect(state.announcements?.nextSlide?.body).toBe('Youth Friday 7pm');
    expect(state.announcements?.targetOutputIds).toEqual(['output-foyer']);

    // Advance main presentation -> announcements layer remains untouched
    await api.setLiveSlide(mainPres.id, mainS2.id);
    state = await api.getPresentationState();
    expect(state.currentSlideId).toBe(mainS2.id);
    expect(state.announcements?.slideId).toBe(foyerS1.id);

    // Advance announcements layer -> main slide remains untouched
    state = await api.nextAnnouncementsSlide();
    expect(state.announcements?.slideId).toBe(foyerS2.id);
    expect(state.announcements?.currentSlide?.body).toBe('Youth Friday 7pm');
    expect(state.currentSlideId).toBe(mainS2.id);

    // Advance announcements again -> loops back to first slide (foyerS1)
    state = await api.nextAnnouncementsSlide();
    expect(state.announcements?.slideId).toBe(foyerS1.id);
    expect(state.announcements?.slideIndex).toBe(0);

    // Step back -> wraps to last slide (foyerS2)
    state = await api.previousAnnouncementsSlide();
    expect(state.announcements?.slideId).toBe(foyerS2.id);
    expect(state.announcements?.slideIndex).toBe(1);
  });

  it('clearAnnouncements clears only announcements while clearAll clears both', async () => {
    const mainPres = await api.createPresentation('Service Deck', 'Other');
    const mainSlide = await api.createSlide(mainPres.id, { title: 'Live S1', body: 'Live Body' });
    await api.setLiveSlide(mainPres.id, mainSlide.id);

    const foyerPres = await api.createPresentation('Loop Deck', 'Announcements');
    await api.createSlide(foyerPres.id, { title: 'Foyer S1', body: 'Loop Body' });

    await api.setAnnouncementsPresentation(foyerPres.id, ['output-foyer']);
    let state = await api.getPresentationState();
    expect(state.isLive).toBe(true);
    expect(state.announcements?.isLive).toBe(true);

    // Clear announcements independently
    state = await api.clearAnnouncements();
    expect(state.announcements).toBeNull();
    // Main slide remains live!
    expect(state.isLive).toBe(true);
    expect(state.currentSlideId).toBe(mainSlide.id);

    // Restart announcements and clearAll
    await api.setAnnouncementsPresentation(foyerPres.id, ['output-foyer']);
    state = await api.clearAll();
    expect(state.isLive).toBe(false);
    expect(state.announcements).toBeNull();
  });

  it('AudienceView displays announcements slide on target outputs and main slide on normal outputs', async () => {
    const mainPres = await api.createPresentation('Main Sanctuary Deck', 'Other');
    const mainSlide = await api.createSlide(mainPres.id, { title: 'Main', body: 'Worship Lyrics Here' });
    await api.setLiveSlide(mainPres.id, mainSlide.id);

    const foyerPres = await api.createPresentation('Loop Deck', 'Announcements');
    await api.createSlide(foyerPres.id, { title: 'Foyer', body: 'Welcome to Sunday Worship Loop' });
    await api.setAnnouncementsPresentation(foyerPres.id, ['output-foyer-display']);

    // Render sanctuary output
    const { unmount } = render(<AudienceView outputId="output-audience" />);
    await waitFor(() => {
      expect(screen.getByText('Worship Lyrics Here')).toBeTruthy();
      expect(screen.queryByText('Welcome to Sunday Worship Loop')).toBeNull();
    });
    unmount();

    // Render foyer output
    render(<AudienceView outputId="output-foyer-display" />);
    await waitFor(() => {
      expect(screen.getByText('Welcome to Sunday Worship Loop')).toBeTruthy();
      expect(screen.queryByText('Worship Lyrics Here')).toBeNull();
    });
  });

  it('AnnouncementsControl component renders controls and interacts with API', async () => {
    const foyerPres = await api.createPresentation('Weekly Announcements', 'Announcements');
    await api.createSlide(foyerPres.id, { title: 'Notice 1', body: 'Wednesday Prayer Meeting' });
    await api.createSlide(foyerPres.id, { title: 'Notice 2', body: 'Sunday School 9am' });

    const startSpy = vi.spyOn(api, 'setAnnouncementsPresentation');
    const nextSpy = vi.spyOn(api, 'nextAnnouncementsSlide');
    const clearSpy = vi.spyOn(api, 'clearAnnouncements');

    const { rerender } = render(<AnnouncementsControl presentationState={idle} />);
    await waitFor(() => expect(screen.getByTestId('announcements-start-btn')).toBeTruthy());

    // Select presentation and start
    const select = screen.getByTestId('announcements-select-presentation') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: foyerPres.id } });
    fireEvent.click(screen.getByTestId('announcements-start-btn'));
    expect(startSpy).toHaveBeenCalledWith(foyerPres.id, expect.any(Array), 8, true);

    // Re-render with active announcements state
    const activeState: PresentationState = {
      ...idle,
      announcements: {
        presentationId: foyerPres.id,
        slideId: 's1',
        slideIndex: 0,
        totalSlides: 2,
        currentSlide: {
          id: 's1',
          presentationId: foyerPres.id,
          sortOrder: 0,
          title: 'Notice 1',
          body: 'Wednesday Prayer Meeting',
          backgroundColor: '#000000',
          foregroundColor: '#ffffff',
          fontSize: 'medium',
          textAlignment: 'center',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        nextSlide: null,
        isLive: true,
        isLooping: true,
        autoAdvanceSeconds: 8,
        targetOutputIds: ['output-foyer'],
      },
    };

    rerender(<AnnouncementsControl presentationState={activeState} />);
    expect(screen.getByTestId('announcements-live-badge')).toBeTruthy();
    expect(screen.getByText('Slide 1 of 2')).toBeTruthy();
    expect(screen.getByText('Wednesday Prayer Meeting')).toBeTruthy();

    // Click Next
    fireEvent.click(screen.getByTestId('announcements-next'));
    expect(nextSpy).toHaveBeenCalledTimes(1);

    // Click Clear
    fireEvent.click(screen.getByTestId('announcements-clear'));
    expect(clearSpy).toHaveBeenCalledTimes(1);

    startSpy.mockRestore();
    nextSpy.mockRestore();
    clearSpy.mockRestore();
  });
});
