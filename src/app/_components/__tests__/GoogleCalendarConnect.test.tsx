import { test, expect, describe, beforeEach, afterEach, mock } from 'bun:test';
import { render, screen, fireEvent, cleanup } from '~/test/test-utils';
import { GoogleCalendarConnect } from '../GoogleCalendarConnect';

// Add custom matchers for DOM testing
const customMatchers = {
  toBeInTheDocument(received: any) {
    const pass = received && document.body.contains(received);
    return {
      pass,
      message: () => pass 
        ? `expected element not to be in the document`
        : `expected element to be in the document`,
    };
  },
  toBeDisabled(received: HTMLElement) {
    const pass = received.hasAttribute('disabled') || received.getAttribute('aria-disabled') === 'true';
    return {
      pass,
      message: () => pass
        ? `expected element not to be disabled`
        : `expected element to be disabled`,
    };
  },
  toHaveAttribute(received: HTMLElement, name: string, value?: string) {
    const hasAttribute = received.hasAttribute(name);
    const attributeValue = received.getAttribute(name);
    const pass = value !== undefined 
      ? hasAttribute && attributeValue === value
      : hasAttribute;
    
    return {
      pass,
      message: () => pass
        ? `expected element not to have attribute "${name}"${value !== undefined ? ` with value "${value}"` : ''}`
        : `expected element to have attribute "${name}"${value !== undefined ? ` with value "${value}"` : ''}`,
    };
  },
};

// Type augmentation for Bun's expect
declare module "bun:test" {
  interface Matchers<T> {
    toBeInTheDocument(): void;
    toBeDisabled(): void;
    toHaveAttribute(name: string, value?: string): void;
  }
}

expect.extend(customMatchers);

// Mock next/navigation
const mockPush = mock(() => undefined);
const mockUseSearchParams = mock(() => ({
  get: mock(() => null),
}));

mock.module('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: mockUseSearchParams,
}));

// Mock @mantine/notifications
const mockShow = mock(() => undefined);
mock.module('@mantine/notifications', () => ({
  notifications: {
    show: mockShow,
  },
}));

describe('GoogleCalendarConnect', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockPush.mockClear();
    mockShow.mockClear();
    mockUseSearchParams.mockImplementation(() => ({
      get: mock(() => null),
    }));
  });
  
  afterEach(() => {
    // Clean up DOM after each test
    cleanup();
  });

  describe('when calendar is not connected', () => {
    test('renders connect button', () => {
      render(<GoogleCalendarConnect isConnected={false} />);
      
      const button = screen.getByRole('button', { name: /connect google calendar/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    test('shows loading state when button is clicked', () => {
      render(<GoogleCalendarConnect isConnected={false} />);
      
      const button = screen.getByRole('button', { name: /connect google calendar/i });
      fireEvent.click(button);
      
      // Button should show loading state - check for data-loading attribute
      const loadingButton = screen.getByRole('button');
      expect(loadingButton).toHaveAttribute('data-loading');
    });

    test('redirects to auth endpoint when clicked', () => {
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { ...originalLocation, href: '' } as Location;

      render(<GoogleCalendarConnect isConnected={false} />);
      
      const button = screen.getByRole('button', { name: /connect google calendar/i });
      fireEvent.click(button);
      
      expect(window.location.href).toBe('/api/auth/google-calendar');
      
      // Restore original location
      window.location = originalLocation;
    });
  });

  describe('when calendar is connected', () => {
    test('renders connected state button', () => {
      render(<GoogleCalendarConnect isConnected={true} />);
      
      const button = screen.getByRole('button', { name: /calendar connected/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });
  });

  describe('URL parameter handling', () => {
    test('shows success notification when calendar_connected=true', () => {
      mockUseSearchParams.mockImplementation(() => ({
        get: mock((param: string) => {
          if (param === 'calendar_connected') return 'true';
          return null;
        }),
      }));

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockShow).toHaveBeenCalledWith({
        title: 'Calendar Connected!',
        message: 'Your Google Calendar is now connected and ready to use.',
        color: 'green',
        icon: expect.anything(),
      });
    });

    test('shows error notification for access_denied', () => {
      mockUseSearchParams.mockImplementation(() => ({
        get: mock((param: string) => {
          if (param === 'calendar_error') return 'access_denied';
          return null;
        }),
      }));

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockShow).toHaveBeenCalledWith({
        title: 'Connection Failed',
        message: 'Calendar access was denied. Please try again and grant permissions.',
        color: 'red',
      });
    });

    test('shows error notification for token_exchange_failed', () => {
      mockUseSearchParams.mockImplementation(() => ({
        get: mock((param: string) => {
          if (param === 'calendar_error') return 'token_exchange_failed';
          return null;
        }),
      }));

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockShow).toHaveBeenCalledWith({
        title: 'Connection Failed',
        message: 'Failed to connect calendar. Please try again.',
        color: 'red',
      });
    });
  });
});