import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/services/api', () => ({
  api: {
    getServiceItemSlides: vi.fn(),
    setLiveServiceItemSlide: vi.fn(),
    getSlides: vi.fn(),
    setLiveSlide: vi.fn(),
  },
}));

import { api } from '../src/services/api';
import { goToSlideNumber } from '../src/services/slideJump';

const base: any = { currentPresentationId: null, currentServiceId: null, currentItemId: null };

describe('goToSlideNumber', () => {
  beforeEach(() => vi.clearAllMocks());

  it('takes the Nth slide of the live service item', async () => {
    (api.getServiceItemSlides as any).mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const ok = await goToSlideNumber({ ...base, currentServiceId: 's1', currentItemId: 'i1' }, 2);
    expect(ok).toBe(true);
    expect(api.setLiveServiceItemSlide).toHaveBeenCalledWith('s1', 'i1', 'b');
  });

  it('falls back to the current presentation', async () => {
    (api.getSlides as any).mockResolvedValue([{ id: 'x' }, { id: 'y' }]);
    expect(await goToSlideNumber({ ...base, currentPresentationId: 'p1' }, 1)).toBe(true);
    expect(api.setLiveSlide).toHaveBeenCalledWith('p1', 'x');
  });

  it('does nothing for out-of-range numbers or nothing live', async () => {
    (api.getSlides as any).mockResolvedValue([{ id: 'x' }]);
    expect(await goToSlideNumber({ ...base, currentPresentationId: 'p1' }, 5)).toBe(false);
    expect(await goToSlideNumber({ ...base, currentPresentationId: 'p1' }, 0)).toBe(false);
    expect(await goToSlideNumber(base, 1)).toBe(false);
    expect(api.setLiveSlide).not.toHaveBeenCalled();
  });
});
