/**
 * The event modal's own decisions: which events offer Delete, that deleting
 * takes a second, explicit step, and what the guest-email choice sends.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";
import type { CalendarEventWithSource } from "~/server/services/GoogleCalendarService";

const deleteMutate = vi.fn();

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => ({
      calendar: {
        getEventsMultiCalendar: { invalidate: vi.fn() },
        getTodayEvents: { invalidate: vi.fn() },
        getUpcomingEvents: { invalidate: vi.fn() },
      },
    }),
    calendar: {
      deleteEvent: {
        useMutation: () => ({
          mutate: (vars: unknown, opts?: { onSuccess?: () => void }) => {
            deleteMutate(vars);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@mantine/notifications", () => ({ notifications: { show: vi.fn() } }));

import { CalendarEventModal } from "../CalendarEventModal";

const googleEvent: CalendarEventWithSource = {
  id: "evt-1",
  summary: "Roadmap sync",
  start: { dateTime: "2026-10-05T10:00:00+01:00" },
  end: { dateTime: "2026-10-05T11:00:00+01:00" },
  htmlLink: "https://calendar.google.com/event?eid=abc",
  status: "confirmed",
  calendarId: "me@example.com",
  calendarName: "me@example.com",
  provider: "google",
  accountId: "ca-1",
  accountEmail: "me@example.com",
  canDelete: true,
  attendees: [
    { email: "me@example.com", responseStatus: "accepted" },
    { email: "guest@example.com", displayName: "Gwen Guest", responseStatus: "needsAction" },
  ],
};

describe("CalendarEventModal", () => {
  const onClose = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    deleteMutate.mockClear();
    onClose.mockClear();
    onDeleted.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test("deletes only after a second, explicit confirmation — emailing guests by default", async () => {
    render(<CalendarEventModal event={googleEvent} onClose={onClose} onDeleted={onDeleted} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/removed from Google Calendar too/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));

    expect(deleteMutate).toHaveBeenCalledWith({
      eventId: "evt-1",
      calendarId: "me@example.com",
      accountId: "ca-1",
      notifyAttendees: true,
    });
    expect(onDeleted).toHaveBeenCalledWith(googleEvent);
    expect(onClose).toHaveBeenCalled();
  });

  test("Keep event backs out without deleting", async () => {
    render(<CalendarEventModal event={googleEvent} onClose={onClose} onDeleted={onDeleted} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep event" }));

    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  test("unticking the guest email deletes silently", async () => {
    render(<CalendarEventModal event={googleEvent} onClose={onClose} onDeleted={onDeleted} />);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Email guests/ }));
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));

    expect(deleteMutate).toHaveBeenCalledWith(
      expect.objectContaining({ notifyAttendees: false }),
    );
  });

  test("lists guests without the account's own address, and links out to the provider", async () => {
    render(<CalendarEventModal event={googleEvent} onClose={onClose} />);

    expect(await screen.findByText("Gwen Guest")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open in Google Calendar/ })).toHaveAttribute(
      "href",
      googleEvent.htmlLink,
    );
  });

  test("a view-only calendar gets no Delete, and says why", async () => {
    render(<CalendarEventModal event={{ ...googleEvent, canDelete: false }} onClose={onClose} />);

    expect(await screen.findByText(/view-only access/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  test("a feed event gets no Delete and no provider link", async () => {
    const feedEvent: CalendarEventWithSource = {
      ...googleEvent,
      provider: "ics",
      htmlLink: "",
      accountId: "feed-1",
      accountEmail: null,
      canDelete: undefined,
      attendees: undefined,
    };
    render(<CalendarEventModal event={feedEvent} onClose={onClose} />);

    expect(await screen.findByText(/calendar feed, which is read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
