import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '~/test/test-utils';
import { GoogleCalendarConnect } from '../GoogleCalendarConnect';
import '@testing-library/jest-dom/vitest';

// Hoisted mocks for vitest
const { mockPush, mockUseSearchParams, mockShow } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockUseSearchParams: vi.fn(() => ({
    get: vi.fn(() => null),
  })),
  mockShow: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: mockUseSearchParams,
}));

vi.mock('@mantine/notifications', () => ({
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
      get: vi.fn(() => null),
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
        get: vi.fn((param: string) => {
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
        get: vi.fn((param: string) => {
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
        get: vi.fn((param: string) => {
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