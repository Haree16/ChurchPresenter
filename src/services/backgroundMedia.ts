import { getMediaTypeFromExtension } from './mediaService';

/** True when a theme/slide background path points at a video (a looping motion background). */
export function isVideoBackground(path?: string | null): boolean {
  return !!path && getMediaTypeFromExtension(path) === 'video';
}

/**
 * CSS `background-image` value for a background path. Videos have no still image, so small
 * previews fall back to the solid background colour (the audience window plays the video).
 */
export function backgroundImageCss(
  path?: string | null,
  resolve: (p: string) => string = (p) => p
): string | undefined {
  if (!path || isVideoBackground(path)) return undefined;
  return `url("${resolve(path)}")`;
}
