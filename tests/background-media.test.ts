import { describe, it, expect } from 'vitest';
import { backgroundImageCss, isVideoBackground } from '../src/services/backgroundMedia';

describe('backgroundMedia', () => {
  it('recognises video backgrounds by extension', () => {
    expect(isVideoBackground('media/loops/worship.mp4')).toBe(true);
    expect(isVideoBackground('media/loops/worship.WEBM')).toBe(true);
    expect(isVideoBackground('media/themes/hall.jpg')).toBe(false);
    expect(isVideoBackground(null)).toBe(false);
  });

  it('gives a CSS image for pictures and nothing for videos or empty paths', () => {
    expect(backgroundImageCss('media/hall.jpg')).toBe('url("media/hall.jpg")');
    expect(backgroundImageCss('media/hall.jpg', (p) => `/r/${p}`)).toBe('url("/r/media/hall.jpg")');
    expect(backgroundImageCss('media/loop.mp4')).toBeUndefined();
    expect(backgroundImageCss(undefined)).toBeUndefined();
  });
});
