import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AudienceView } from '../src/components/AudienceView';
import { api } from '../src/services/api';

describe('Unicode & Tamil Text Rendering Safety', () => {
  beforeEach(async () => {
    // Select the Tamil worship song
    await api.setLiveSlide('pres-2', 'slide-2-1');
  });

  it('renders Tamil Unicode characters correctly in the audience view', async () => {
    await act(async () => {
      render(<AudienceView />);
    });

    const display = screen.getByTestId('audience-slide-body');
    expect(display).toBeInTheDocument();
    expect(display.textContent).toContain('கிருபையும் சமாதானமும்');
    expect(display.textContent).toContain('நிறைந்த என் இயேசுவே');
  });

  it('escapes executable HTML, JS, and script injection safely without rendering HTML elements', async () => {
    // Add malicious payload slide
    const xssSlide = await api.createSlide('pres-1', {
      title: 'Payload Slide',
      body: '<script>window.__pwned = true;</script><img src="x" onerror="window.__img_pwned=true"/><b>Bold Text</b>',
    });

    await api.setLiveSlide('pres-1', xssSlide.id);

    await act(async () => {
      render(<AudienceView />);
    });

    const display = screen.getByTestId('audience-slide-body');
    // Ensure the raw markup is safely rendered as plain text string, NOT as DOM elements
    expect(display.textContent).toContain('<script>window.__pwned = true;</script>');
    expect(document.querySelector('script[src="x"]')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    // Global flags should not be modified
    expect((window as unknown as { __pwned?: boolean }).__pwned).toBeUndefined();
  });
});
