import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { AlertBanner, isAlertActive } from '../src/components/AlertBanner';
import { AudienceAlertControl } from '../src/components/AudienceAlertControl';
import { AudienceView } from '../src/components/AudienceView';

afterEach(() => {
  vi.useRealTimers();
});

describe('AlertBanner', () => {
  it('shows the message and nothing when there is no alert', () => {
    const { rerender } = render(<AlertBanner alert={null} />);
    expect(screen.queryByTestId('audience-alert')).toBeNull();
    rerender(<AlertBanner alert={{ id: 'a', message: 'Nursery: family 12', expiresAtMs: null }} />);
    expect(screen.getByTestId('audience-alert').textContent).toBe('Nursery: family 12');
  });

  it('renders the message as plain text, never as HTML', () => {
    render(<AlertBanner alert={{ id: 'a', message: '<img src=x onerror=alert(1)>', expiresAtMs: null }} />);
    const el = screen.getByTestId('audience-alert');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('hides itself when it expires', () => {
    vi.useFakeTimers();
    const alert = { id: 'a', message: 'Soon gone', expiresAtMs: Date.now() + 5000 };
    render(<AlertBanner alert={alert} />);
    expect(screen.getByTestId('audience-alert')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(screen.queryByTestId('audience-alert')).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByTestId('audience-alert')).toBeNull();
  });

  it('does not show an alert that is already expired, and keeps one with no expiry', () => {
    const past = { id: 'a', message: 'old', expiresAtMs: Date.now() - 1 };
    const { rerender } = render(<AlertBanner alert={past} />);
    expect(screen.queryByTestId('audience-alert')).toBeNull();
    rerender(<AlertBanner alert={{ id: 'b', message: 'forever', expiresAtMs: null }} />);
    expect(screen.getByTestId('audience-alert')).toBeTruthy();
    expect(isAlertActive({ id: 'b', message: 'x', expiresAtMs: null }, Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isAlertActive(null, 0)).toBe(false);
  });

  it('a replacement alert with a new id and later expiry shows again', () => {
    vi.useFakeTimers();
    const first = { id: 'a', message: 'one', expiresAtMs: Date.now() + 1000 };
    const { rerender } = render(<AlertBanner alert={first} />);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByTestId('audience-alert')).toBeNull();
    rerender(<AlertBanner alert={{ id: 'b', message: 'two', expiresAtMs: Date.now() + 5000 }} />);
    expect(screen.getByTestId('audience-alert').textContent).toBe('two');
  });
});

describe('Alert API (mock)', () => {
  it('validates the message', async () => {
    await expect(api.sendAlert('   ')).rejects.toThrow(/empty/);
    await expect(api.sendAlert('x'.repeat(201))).rejects.toThrow(/too long/);
    await expect(api.sendAlert('x'.repeat(200))).resolves.toBeTruthy();
    await api.clearAlert();
  });

  it('applies the default duration, until-cleared and the one-hour cap', async () => {
    const before = Date.now();
    let s = await api.sendAlert('default');
    expect(s.alert!.expiresAtMs! - before).toBeGreaterThanOrEqual(29_000);
    expect(s.alert!.expiresAtMs! - before).toBeLessThan(31_000);

    s = await api.sendAlert('forever', 0);
    expect(s.alert!.expiresAtMs).toBeNull();

    s = await api.sendAlert('huge', 999_999);
    expect(s.alert!.expiresAtMs! - Date.now()).toBeLessThanOrEqual(3_600_000);
    await api.clearAlert();
  });

  it('clear_alert action and Clear All remove it; blackout and logo do not', async () => {
    await api.sendAlert('hello', 0);
    await api.toggleLogo();
    expect((await api.getPresentationState()).alert).toBeTruthy();
    await api.toggleLogo(); // back off

    const cleared = await api.dispatchAction('clear_alert');
    expect(cleared.alert).toBeNull();

    await api.sendAlert('again', 0);
    const all = await api.clearAll();
    expect(all.alert).toBeNull();
  });
});

describe('AudienceView shows alerts above every output', () => {
  it('on a blackout screen', async () => {
    await api.clearAll();
    await api.sendAlert('Nursery call', 0);
    render(<AudienceView />);
    await waitFor(() => expect(screen.getByTestId('audience-alert').textContent).toBe('Nursery call'));
    expect(screen.getByTestId('audience-blackout')).toBeTruthy();
    await api.clearAlert();
  });

  it('on the logo screen and on a live slide', async () => {
    await api.clearAll();
    await api.toggleLogo();
    await api.sendAlert('Over the logo', 0);
    const { unmount } = render(<AudienceView />);
    await waitFor(() => expect(screen.getByTestId('audience-logo')).toBeTruthy());
    expect(screen.getByTestId('audience-alert').textContent).toBe('Over the logo');
    unmount();

    await api.nextSlide(); // going live clears the logo
    await api.sendAlert('Over the slide', 0);
    render(<AudienceView />);
    await waitFor(() => expect(screen.getByTestId('audience-alert').textContent).toBe('Over the slide'));
    expect(screen.queryByTestId('audience-logo')).toBeNull();
    await api.clearAlert();
  });

  it('disappears from the audience screen when cleared', async () => {
    await api.sendAlert('Temp', 0);
    render(<AudienceView />);
    await waitFor(() => expect(screen.getByTestId('audience-alert')).toBeTruthy());
    await act(async () => {
      await api.clearAlert();
    });
    await waitFor(() => expect(screen.queryByTestId('audience-alert')).toBeNull());
  });
});

describe('AudienceAlertControl', () => {
  it('disables Show Alert for empty text and sends trimmed text with the chosen duration', async () => {
    const spy = vi.spyOn(api, 'sendAlert');
    render(<AudienceAlertControl alert={null} />);
    const send = screen.getByTestId('btn-send-alert') as HTMLButtonElement;
    expect(send.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('input-alert-text'), { target: { value: '  Nursery: 12  ' } });
    fireEvent.change(screen.getByTestId('select-alert-duration'), { target: { value: '60' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);

    await waitFor(() => expect(spy).toHaveBeenCalledWith('Nursery: 12', 60));
    expect((screen.getByTestId('input-alert-text') as HTMLInputElement).value).toBe('');
    spy.mockRestore();
    await api.clearAlert();
  });

  it('sends on Enter, caps the text at 200 characters and can send "until cleared"', async () => {
    const spy = vi.spyOn(api, 'sendAlert');
    render(<AudienceAlertControl alert={null} />);
    const input = screen.getByTestId('input-alert-text') as HTMLInputElement;
    expect(input.maxLength).toBe(200);

    fireEvent.change(screen.getByTestId('select-alert-duration'), { target: { value: '0' } });
    fireEvent.change(input, { target: { value: 'Car lights on' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(spy).toHaveBeenCalledWith('Car lights on', 0));
    spy.mockRestore();
    await api.clearAlert();
  });

  it('shows ON SCREEN and enables Clear only while an alert is active', async () => {
    const { rerender } = render(<AudienceAlertControl alert={null} />);
    expect((screen.getByTestId('btn-clear-alert') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId('audience-alert-active')).toBeNull();

    rerender(<AudienceAlertControl alert={{ id: 'a', message: 'Live now', expiresAtMs: null }} />);
    expect(screen.getByTestId('audience-alert-active').textContent).toContain('Live now');
    expect((screen.getByTestId('btn-clear-alert') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows the error when the alert is rejected', async () => {
    const spy = vi.spyOn(api, 'sendAlert').mockRejectedValueOnce(new Error('Alert message is too long'));
    render(<AudienceAlertControl alert={null} />);
    fireEvent.change(screen.getByTestId('input-alert-text'), { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('btn-send-alert'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/too long/));
    spy.mockRestore();
  });
});
