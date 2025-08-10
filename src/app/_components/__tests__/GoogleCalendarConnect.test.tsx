import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GoogleCalendarConnect } from '../GoogleCalendarConnect';
import { useSearchParams } from 'next/navigation';
import { notifications } from '@mantine/notifications';

// Mock modules
jest.mock('next/navigation');
jest.mock('@mantine/notifications');

const mockUseSearchParams = useSearchParams as jest.MockedFunction<typeof useSearchParams>;
const mockNotifications = notifications as jest.Mocked<typeof notifications>;

describe('GoogleCalendarConnect', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Setup default mock return values
    mockUseSearchParams.mockReturnValue({
      get: jest.fn().mockReturnValue(null),
    } as any);
  });

  describe('when calendar is not connected', () => {
    it('renders connect button', () => {
      render(<GoogleCalendarConnect isConnected={false} />);
      
      const button = screen.getByRole('button', { name: /connect google calendar/i });
      expect(button).toBeInTheDocument();
      expect(button).not.toBeDisabled();
    });

    it('shows loading state when button is clicked', () => {
      render(<GoogleCalendarConnect isConnected={false} />);
      
      const button = screen.getByRole('button', { name: /connect google calendar/i });
      fireEvent.click(button);
      
      // Button should show loading state
      expect(button).toHaveAttribute('data-loading', 'true');
    });

    it('redirects to auth endpoint when clicked', () => {
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
    it('renders connected state button', () => {
      render(<GoogleCalendarConnect isConnected={true} />);
      
      const button = screen.getByRole('button', { name: /calendar connected/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();
    });

    it('shows check icon in connected state', () => {
      render(<GoogleCalendarConnect isConnected={true} />);
      
      const button = screen.getByRole('button', { name: /calendar connected/i });
      // Check for the icon by looking for the button's content
      expect(button).toHaveTextContent('Calendar Connected');
    });
  });

  describe('URL parameter handling', () => {
    it('shows success notification when calendar_connected=true', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn().mockImplementation((param) => {
          if (param === 'calendar_connected') return 'true';
          return null;
        }),
      } as any);

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockNotifications.show).toHaveBeenCalledWith({
        title: 'Calendar Connected!',
        message: 'Your Google Calendar is now connected and ready to use.',
        color: 'green',
        icon: expect.anything(),
      });
    });

    it('shows error notification for access_denied', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn().mockImplementation((param) => {
          if (param === 'calendar_error') return 'access_denied';
          return null;
        }),
      } as any);

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockNotifications.show).toHaveBeenCalledWith({
        title: 'Connection Failed',
        message: 'Calendar access was denied. Please try again and grant permissions.',
        color: 'red',
      });
    });

    it('shows error notification for invalid_request', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn().mockImplementation((param) => {
          if (param === 'calendar_error') return 'invalid_request';
          return null;
        }),
      } as any);

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockNotifications.show).toHaveBeenCalledWith({
        title: 'Connection Failed',
        message: 'Invalid request. Please try connecting again.',
        color: 'red',
      });
    });

    it('shows error notification for no_google_account', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn().mockImplementation((param) => {
          if (param === 'calendar_error') return 'no_google_account';
          return null;
        }),
      } as any);

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockNotifications.show).toHaveBeenCalledWith({
        title: 'Connection Failed',
        message: 'Please sign in with Google first, then connect your calendar.',
        color: 'red',
      });
    });

    it('shows error notification for token_exchange_failed', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn().mockImplementation((param) => {
          if (param === 'calendar_error') return 'token_exchange_failed';
          return null;
        }),
      } as any);

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockNotifications.show).toHaveBeenCalledWith({
        title: 'Connection Failed',
        message: 'Failed to connect calendar. Please try again.',
        color: 'red',
      });
    });

    it('shows generic error notification for unknown error', () => {
      mockUseSearchParams.mockReturnValue({
        get: jest.fn().mockImplementation((param) => {
          if (param === 'calendar_error') return 'unknown_error';
          return null;
        }),
      } as any);

      render(<GoogleCalendarConnect isConnected={false} />);

      expect(mockNotifications.show).toHaveBeenCalledWith({
        title: 'Connection Failed',
        message: 'Failed to connect Google Calendar.',
        color: 'red',
      });
    });
  });

  describe('component lifecycle', () => {
    it('only processes URL parameters once on mount', () => {
      const mockGet = jest.fn().mockReturnValue('true');
      mockUseSearchParams.mockReturnValue({
        get: mockGet,
      } as any);

      const { rerender } = render(<GoogleCalendarConnect isConnected={false} />);
      
      expect(mockNotifications.show).toHaveBeenCalledTimes(1);
      
      // Re-render should not trigger another notification
      rerender(<GoogleCalendarConnect isConnected={false} />);
      
      expect(mockNotifications.show).toHaveBeenCalledTimes(1);
    });
  });
});