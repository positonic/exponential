/**
 * The event modal's own decisions: which events offer Delete, that deleting
 * takes a second, explicit step, and what the guest-email choice sends.
 */

import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";
import type { CalendarEventWithSource } from "~/server/services/GoogleCalendarService";

interface DeleteResult {
  alreadyGone: boolean;
}
interface MutationCallbacks {
  onSuccess?: (result: DeleteResult) => void;
  onError?: (error: Error) => void;
}

const { deleteMutate, showNotification, mutation } = vi.hoisted(() => ({
  deleteMutate: vi.fn(),
  showNotification: vi.fn(),
  /** How the next delete settles; a test sets it to drive that branch. */
  mutation: { outcome: { alreadyGone: false } as { alreadyGone: boolean } | Error },
}));

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
        // Mirrors react-query's ordering: the hook's callbacks run first, and
        // the mutate-level onSuccess only on success.
        useMutation: (hookOptions?: MutationCallbacks) => ({
          mutate: (vars: unknown, callOptions?: MutationCallbacks) => {
            deleteMutate(vars);
            const { outcome } = mutation;
            if (outcome instanceof Error) {
              hookOptions?.onError?.(outcome);
              return;
            }
            hookOptions?.onSuccess?.(outcome);
            callOptions?.onSuccess?.(outcome);
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("@mantine/notifications", () => ({ notifications: { show: showNotification } }));

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
    showNotification.mockClear();
    onClose.mockClear();
    onDeleted.mockClear();
    mutation.outcome = { alreadyGone: false };
  });

  const confirmDelete = async () => {
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete event" }));
  };

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
    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Event deleted" }),
    );
  });

  test("an event the provider no longer had is hidden without claiming it was deleted", async () => {
    mutation.outcome = { alreadyGone: true };
    render(<CalendarEventModal event={googleEvent} onClose={onClose} onDeleted={onDeleted} />);

    await confirmDelete();

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Event was already gone" }),
    );
    expect(showNotification).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Event deleted" }),
    );
    expect(onDeleted).toHaveBeenCalledWith(googleEvent);
    expect(onClose).toHaveBeenCalled();
  });

  test("a failed delete says so and leaves the event showing", async () => {
    mutation.outcome = new Error("You don't have permission to delete this event.");
    render(<CalendarEventModal event={googleEvent} onClose={onClose} onDeleted={onDeleted} />);

    await confirmDelete();

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Couldn't delete event",
        message: "You don't have permission to delete this event.",
      }),
    );
    // Hiding it here would drop a live event from the calendar for the session.
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
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
