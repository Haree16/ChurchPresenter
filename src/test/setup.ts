import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Setup basic global mocks for testing
if (typeof window !== 'undefined') {
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mark vitest environment
  (window as unknown as { __VITEST__?: boolean }).__VITEST__ = true;
}
