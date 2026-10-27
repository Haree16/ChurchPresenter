import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { mediaService } from '../services/mediaService';

export const DEFAULT_LOGO_URL = '/logo.png';

/**
 * URL of the logo shown by "clear to logo": the custom image chosen in Settings, else the built-in one.
 * Re-reads the setting whenever `refreshKey` changes (e.g. each time the logo screen is shown).
 */
export function useLogoUrl(refreshKey: unknown = 0): string {
  const [url, setUrl] = useState<string>(DEFAULT_LOGO_URL);

  useEffect(() => {
    let cancelled = false;
    api
      .getSetting('logo_path')
      .then((path) => {
        if (cancelled) return;
        setUrl(path && path.trim() ? mediaService.resolveMediaUrl(path) || DEFAULT_LOGO_URL : DEFAULT_LOGO_URL);
      })
      .catch(() => {
        if (!cancelled) setUrl(DEFAULT_LOGO_URL);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return url;
}
