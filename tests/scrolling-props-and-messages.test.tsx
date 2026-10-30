import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../src/services/api';
import { validateProp } from '../src/services/propLayout';
import { PropsLayer } from '../src/components/PropsLayer';
import { PropsControl } from '../src/components/PropsControl';
import { PropsManagerModal } from '../src/components/PropsManagerModal';
import { Prop } from '../src/types';

const baseTextProp = (over: Partial<Prop> = {}): Prop => ({
  id: '',
  name: 'Announcement Ticker',
  kind: 'text',
  text: 'Youth fellowship will meet this Saturday at 5 PM in the fellowship hall. All youth and parents welcome!',
  imagePath: null,
  position: 'bottom-bar',
  sizePct: 5,
  textColor: '#ffffff',
  backgroundColor: '#0284c7',
  scrollMode: 'left',
  scrollSpeed: 4,
  ...over,
});

async function reset() {
  await api.clearAll();
  for (const p of await api.listProps()) {
    await api.deleteProp(p.id);
  }
}

describe('Phase 9.5: Scrolling Text & Messages (Ticker marquee)', () => {
  describe('validateProp', () => {
    it('accepts valid scroll modes: none, left, right, up', () => {
      for (const mode of ['none', 'left', 'right', 'up'] as const) {
        expect(validateProp(baseTextProp({ scrollMode: mode }))).toBeNull();
      }
    });

    it('rejects invalid scroll modes', () => {
      expect(validateProp(baseTextProp({ scrollMode: 'diagonal' as any }))).toMatch(/Unknown scroll mode/);
    });

    it('rejects scrolling on image props', () => {
      expect(
        validateProp({
          ...baseTextProp(),
          kind: 'image',
          text: null,
          imagePath: 'media/bug.png',
          scrollMode: 'left',
        })
      ).toMatch(/Only text props can scroll/);
    });

    it('validates scroll speed between 1 and 10', () => {
      expect(validateProp(baseTextProp({ scrollSpeed: 1 }))).toBeNull();
      expect(validateProp(baseTextProp({ scrollSpeed: 10 }))).toBeNull();
      expect(validateProp(baseTextProp({ scrollSpeed: 0 }))).toMatch(/Scroll speed/);
      expect(validateProp(baseTextProp({ scrollSpeed: 11 }))).toMatch(/Scroll speed/);
    });

    it('allows up to 500 characters of text for announcement tickers', () => {
      expect(validateProp(baseTextProp({ text: 'a'.repeat(500) }))).toBeNull();
      expect(validateProp(baseTextProp({ text: 'a'.repeat(501) }))).toMatch(/too long/);
    });
  });

  describe('PropsLayer rendering', () => {
    it('renders static props with standard text layout', () => {
      const prop = baseTextProp({ id: 'p1', scrollMode: 'none' });
      render(<PropsLayer props={[prop]} />);

      const item = screen.getByTestId('prop-item');
      expect(item.getAttribute('data-scroll-mode')).toBe('none');
      expect(item.textContent).toContain('Youth fellowship');
      expect(screen.queryByTestId('prop-scroll-track')).toBeNull();
    });

    it('renders scrolling ticker with scroll-track and CSS animation', () => {
      const prop = baseTextProp({ id: 'p2', scrollMode: 'left', scrollSpeed: 6 });
      render(<PropsLayer props={[prop]} />);

      const item = screen.getByTestId('prop-item');
      expect(item.getAttribute('data-scroll-mode')).toBe('left');
      expect(item.getAttribute('data-scroll-speed')).toBe('6');

      const track = screen.getByTestId('prop-scroll-track');
      expect(track).toBeTruthy();
      expect(track.textContent).toContain('Youth fellowship');
      expect(track.style.animation).toContain('propScrollLeft');
    });

    it('supports scroll right and scroll up crawl modes', () => {
      const rightProp = baseTextProp({ id: 'p3', scrollMode: 'right', scrollSpeed: 5 });
      const { unmount } = render(<PropsLayer props={[rightProp]} />);

      let track = screen.getByTestId('prop-scroll-track');
      expect(track.style.animation).toContain('propScrollRight');
      unmount();

      const upProp = baseTextProp({ id: 'p4', scrollMode: 'up', scrollSpeed: 2 });
      render(<PropsLayer props={[upProp]} />);
      track = screen.getByTestId('prop-scroll-track');
      expect(track.style.animation).toContain('propScrollUp');
    });
  });

  describe('PropsManagerModal configuration', () => {
    it('configures scroll mode and scroll speed, and saves prop', async () => {
      await reset();
      const onClose = () => {};
      render(<PropsManagerModal isOpen={true} onClose={onClose} />);

      fireEvent.change(screen.getByTestId('prop-name'), { target: { value: 'Welcome Ticker' } });
      fireEvent.change(screen.getByTestId('prop-text'), { target: { value: 'Welcome to our Sunday service! God bless you.' } });
      fireEvent.change(screen.getByTestId('prop-scroll-mode'), { target: { value: 'left' } });

      const speedInput = screen.getByTestId('prop-scroll-speed');
      expect(speedInput).toBeTruthy();
      fireEvent.change(speedInput, { target: { value: '7' } });

      fireEvent.click(screen.getByTestId('prop-save'));

      await waitFor(async () => {
        const list = await api.listProps();
        expect(list.some((p) => p.name === 'Welcome Ticker' && p.scrollMode === 'left' && p.scrollSpeed === 7)).toBe(true);
      });

      await reset();
    });
  });

  describe('PropsControl operator panel', () => {
    it('displays Ticker badge for scrolling props and toggles them live', async () => {
      await reset();
      const tickerProp = await api.createProp(baseTextProp({ name: 'Live Ticker', scrollMode: 'left' }));
      const staticProp = await api.createProp(baseTextProp({ name: 'Static Bug', scrollMode: 'none' }));

      const state = await api.getPresentationState();
      render(<PropsControl presentationState={state} />);

      await waitFor(() => {
        expect(screen.getByText('Live Ticker')).toBeTruthy();
        expect(screen.getByText('Static Bug')).toBeTruthy();
      });

      // Ticker badge should be visible on the ticker prop button
      const tickerBadge = screen.getByTestId('prop-ticker-badge');
      expect(tickerBadge).toBeTruthy();
      expect(tickerBadge.textContent).toBe('Ticker');

      // Toggle ticker prop on
      const buttons = screen.getAllByTestId('prop-toggle');
      fireEvent.click(buttons[0]);

      await waitFor(async () => {
        const s = await api.getPresentationState();
        expect(s.activeProps?.some((p) => p.id === tickerProp.id)).toBe(true);
      });

      // Clear props immediately removes it
      await api.clearProps();
      const cleared = await api.getPresentationState();
      expect(cleared.activeProps).toEqual([]);

      await reset();
    });
  });
});
