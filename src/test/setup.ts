import { beforeAll } from 'bun:test';
import '@testing-library/jest-dom';

// Setup DOM environment for testing
beforeAll(() => {
  // Mock window.matchMedia
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {
        // deprecated - mock implementation
      },
      removeListener: () => {
        // deprecated - mock implementation
      },
      addEventListener: () => {
        // Mock implementation
      },
      removeEventListener: () => {
        // Mock implementation
      },
      dispatchEvent: () => false,
    }),
  });

  // Mock IntersectionObserver
  global.IntersectionObserver = class IntersectionObserver {
    constructor() {
      // Mock constructor
    }
    disconnect() {
      // Mock implementation
    }
    observe() {
      // Mock implementation
    }
    unobserve() {
      // Mock implementation
    }
  } as any;

  // Mock ResizeObserver
  global.ResizeObserver = class ResizeObserver {
    constructor() {
      // Mock constructor
    }
    disconnect() {
      // Mock implementation
    }
    observe() {
      // Mock implementation
    }
    unobserve() {
      // Mock implementation
    }
  } as any;
});