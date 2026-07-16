import { beforeAll, afterAll, vi } from 'vitest';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

// `server-only` throws outside a React Server environment; stub it so unit
// tests can import server modules (e.g. via the tRPC routers).
vi.mock('server-only', () => ({}));

// Register Happy DOM before all tests
GlobalRegistrator.register();

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

// Cleanup after all tests
afterAll(() => {
  GlobalRegistrator.unregister();
});