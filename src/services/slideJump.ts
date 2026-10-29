import { api } from './api';
import { PresentationState } from '../types';

/**
 * Takes slide number `n` (1-based) of whatever is live: the current service item when a service
 * is live, otherwise the current presentation. Returns false when there is no such slide.
 */
export async function goToSlideNumber(state: PresentationState, n: number): Promise<boolean> {
  if (!Number.isInteger(n) || n < 1) return false;

  if (state.currentServiceId && state.currentItemId) {
    const slides = await api.getServiceItemSlides(state.currentItemId);
    const slide = slides[n - 1];
    if (!slide) return false;
    await api.setLiveServiceItemSlide(state.currentServiceId, state.currentItemId, slide.id);
    return true;
  }

  if (state.currentPresentationId) {
    const slides = await api.getSlides(state.currentPresentationId);
    const slide = slides[n - 1];
    if (!slide) return false;
    await api.setLiveSlide(state.currentPresentationId, slide.id);
    return true;
  }

  return false;
}
