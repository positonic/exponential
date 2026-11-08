/**
 * The occurrence header's one status line: who the agenda went to, whether
 * it changed after sending (with Resend), and the pre-read opened from the
 * line rather than printed on the page.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "~/test/test-utils";
import "@testing-library/jest-dom/vitest";

import { AgendaSentStatus } from "../AgendaSentStatus";

const SENT = "2026-11-10T12:25:00.000Z";

describe("AgendaSentStatus", () => {
  it("says how many participants it was sent to, with no resend while unchanged", () => {
    render(
      <AgendaSentStatus
        agendaGeneratedAt={SENT}
        agendaCirculatedAt={SENT}
        changedSinceSent={false}
        recipientCount={4}
        recipientNoun="participants"
        narrative="**Hello**"
        onResend={vi.fn()}
      />,
    );
    expect(screen.getByTestId("agenda-sent-status")).toHaveTextContent(/Sent to 4 participants/);
    expect(screen.queryByTestId("agenda-changed-since-sent")).not.toBeInTheDocument();
    expect(screen.queryByTestId("agenda-resend")).not.toBeInTheDocument();
    expect(screen.getByTestId("agenda-open-narrative")).toHaveTextContent("what was sent");
  });

  it("flags a changed agenda and resends it", () => {
    const onResend = vi.fn();
    render(
      <AgendaSentStatus
        agendaGeneratedAt="2026-11-10T12:49:00.000Z"
        agendaCirculatedAt={SENT}
        changedSinceSent
        recipientCount={4}
        recipientNoun="participants"
        narrative={null}
        onResend={onResend}
      />,
    );
    expect(screen.getByTestId("agenda-changed-since-sent")).toBeInTheDocument();
    expect(screen.queryByTestId("agenda-open-narrative")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agenda-resend"));
    expect(onResend).toHaveBeenCalledTimes(1);
  });

  it("opens the narrative in a modal", async () => {
    render(
      <AgendaSentStatus
        agendaGeneratedAt={SENT}
        agendaCirculatedAt={null}
        changedSinceSent={false}
        recipientCount={0}
        recipientNoun="participants"
        narrative="The pre-read body"
      />,
    );
    expect(screen.getByTestId("agenda-sent-status")).toHaveTextContent("Not sent yet");
    fireEvent.click(screen.getByTestId("agenda-open-narrative"));
    expect(await screen.findByText("The pre-read body")).toBeInTheDocument();
  });
});
