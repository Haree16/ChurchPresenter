import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { api } from '../src/services/api';
import { useLogoUrl, DEFAULT_LOGO_URL } from '../src/hooks/useLogoUrl';
import { LogoSettingsCard } from '../src/components/Settings/LogoSettingsCard';

function UrlProbe({ k }: { k: unknown }) {
  return <span data-testid="url">{useLogoUrl(k)}</span>;
}

describe('Custom logo setting', () => {
  it('uses the built-in logo until a custom one is set, then falls back when cleared', async () => {
    await api.clearCustomLogo();
    const { rerender } = render(<UrlProbe k={0} />);
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe(DEFAULT_LOGO_URL));

    await api.setCustomLogo('/home/me/church-logo.PNG');
    rerender(<UrlProbe k={1} />);
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('church-logo.PNG'));

    await api.clearCustomLogo();
    rerender(<UrlProbe k={2} />);
    await waitFor(() => expect(screen.getByTestId('url').textContent).toBe(DEFAULT_LOGO_URL));
  });

  it('rejects non-image files', async () => {
    await expect(api.setCustomLogo('/tmp/video.mp4')).rejects.toThrow(/PNG, JPG/);
    await expect(api.setCustomLogo('/tmp/noextension')).rejects.toThrow();
  });

  it('settings card previews the built-in logo and disables reset when nothing is custom', async () => {
    await api.clearCustomLogo();
    render(<LogoSettingsCard />);
    await waitFor(() =>
      expect((screen.getByTestId('logo-preview') as HTMLImageElement).getAttribute('src')).toBe(DEFAULT_LOGO_URL)
    );
    expect((screen.getByTestId('logo-reset-btn') as HTMLButtonElement).disabled).toBe(true);
  });

  it('settings card enables reset for a custom logo and returns to the built-in one', async () => {
    await api.setCustomLogo('/x/logo.svg');
    render(<LogoSettingsCard />);
    const reset = screen.getByTestId('logo-reset-btn') as HTMLButtonElement;
    await waitFor(() => expect(reset.disabled).toBe(false));

    fireEvent.click(reset);
    await waitFor(() => expect(reset.disabled).toBe(true));
    expect((screen.getByTestId('logo-preview') as HTMLImageElement).getAttribute('src')).toBe(DEFAULT_LOGO_URL);
  });
});
