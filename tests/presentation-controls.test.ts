import { describe, it, expect, beforeEach } from 'vitest';
import { api } from '../src/services/api';

describe('Presentation Controls & Navigation', () => {
  beforeEach(async () => {
    // Reset to first slide of Amazing Grace
    await api.setLiveSlide('pres-1', 'slide-1-1');
  });

  it('navigates sequentially to the next slide', async () => {
    let state = await api.getPresentationState();
    expect(state.currentSlideIndex).toBe(0);
    expect(state.currentSlide?.title).toBe('Verse 1');

    state = await api.nextSlide();
    expect(state.currentSlideIndex).toBe(1);
    expect(state.currentSlide?.title).toBe('Verse 2');

    state = await api.nextSlide();
    expect(state.currentSlideIndex).toBe(2);
    expect(state.currentSlide?.title).toBe('Verse 3');

    // Should not advance beyond total slides
    const finalState = await api.nextSlide();
    expect(finalState.currentSlideIndex).toBe(2);
  });

  it('navigates backward to the previous slide', async () => {
    await api.nextSlide(); // at index 1
    let state = await api.getPresentationState();
    expect(state.currentSlideIndex).toBe(1);

    state = await api.previousSlide();
    expect(state.currentSlideIndex).toBe(0);
    expect(state.currentSlide?.title).toBe('Verse 1');

    // Should not go below index 0
    const finalState = await api.previousSlide();
    expect(finalState.currentSlideIndex).toBe(0);
  });

  it('toggles clear-to-logo without modifying the active slide and clears when going live', async () => {
    const before = await api.getPresentationState();
    expect(before.isLogo).toBeFalsy();

    expect(await api.toggleLogo()).toBe(true);
    let state = await api.getPresentationState();
    expect(state.isLogo).toBe(true);
    expect(state.currentSlideId).toBe(before.currentSlideId);

    state = await api.nextSlide();
    expect(state.isLogo).toBe(false);
    expect(state.isLive).toBe(true);

    expect(await api.toggleLogo()).toBe(true);
    expect(await api.toggleLogo()).toBe(false);
  });

  it('toggles black screen without modifying the active slide and restores properly', async () => {
    const initialState = await api.getPresentationState();
    expect(initialState.isBlackout).toBe(false);
    const activeSlideId = initialState.currentSlideId;

    // Toggle blackout ON
    const blackoutOn = await api.toggleBlackout();
    expect(blackoutOn).toBe(true);

    let state = await api.getPresentationState();
    expect(state.isBlackout).toBe(true);
    expect(state.currentSlideId).toBe(activeSlideId); // Slide remains preserved

    // Toggle blackout OFF
    const blackoutOff = await api.toggleBlackout();
    expect(blackoutOff).toBe(false);

    state = await api.getPresentationState();
    expect(state.isBlackout).toBe(false);
    expect(state.currentSlideId).toBe(activeSlideId);
  });

  it('supports direct slide jump', async () => {
    const state = await api.setLiveSlide('pres-1', 'slide-1-3');
    expect(state.currentSlideIndex).toBe(2);
    expect(state.currentSlide?.id).toBe('slide-1-3');
    expect(state.isLive).toBe(true);
  });
});
