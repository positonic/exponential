/**
 * The chat's "Import roles & responsibilities" pill (Agent PRD D11).
 *
 * Whether a workspace qualifies is the server's call (`position.coverage`,
 * tested with the router). What lives here is the browser half: clicking
 * prefills the composer, dismissing hides it in that workspace for 30 days,
 * and blocked storage renders the pill instead of crashing.
 */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "~/test/test-utils";

const coverageQuery = vi.hoisted(() => ({
  useQuery: vi.fn(),
}));

vi.mock("~/trpc/react", () => ({
  api: { position: { coverage: coverageQuery } },
}));

import {
  IMPORT_PILL_DISMISS_MS,
  PositionsImportPill,
  importPillStorageKey,
  isImportPillDismissed,
} from "~/app/_components/PositionsImportPill";

const WORKSPACE_ID = "ws-team";
const NOW = Date.UTC(2026, 9, 10, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function offerImport(offer: boolean) {
  coverageQuery.useQuery.mockReturnValue({
    data: { offerImport: offer, memberCount: 3, eligibleCount: 3, coveredCount: offer ? 0 : 2 },
  });
}

function renderPill(workspaceId = WORKSPACE_ID, onImport = vi.fn()) {
  render(<PositionsImportPill key={workspaceId} workspaceId={workspaceId} onImport={onImport} />);
  return { onImport };
}

const pill = () => screen.queryByTestId("positions-import-pill");
const dismissButton = () => screen.getByRole("button", { name: "Dismiss import roles & responsibilities" });

describe("isImportPillDismissed", () => {
  it.each([
    { case: "nothing stored", dismissedAt: null, expected: false },
    { case: "dismissed a moment ago", dismissedAt: NOW - 1000, expected: true },
    { case: "dismissed 29 days ago", dismissedAt: NOW - 29 * DAY, expected: true },
    { case: "dismissed exactly 30 days ago", dismissedAt: NOW - IMPORT_PILL_DISMISS_MS, expected: false },
    { case: "dismissed 31 days ago", dismissedAt: NOW - 31 * DAY, expected: false },
    { case: "a timestamp from the future", dismissedAt: NOW + DAY, expected: false },
    { case: "a non-number value", dismissedAt: "yesterday", expected: false },
    { case: "a legacy boolean", dismissedAt: true, expected: false },
  ])("$case → $expected", ({ dismissedAt, expected }) => {
    expect(isImportPillDismissed(dismissedAt, NOW)).toBe(expected);
  });
});

describe("PositionsImportPill", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    window.localStorage.clear();
    coverageQuery.useQuery.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("shows when coverage offers the import, and clicking it asks the composer to prefill", () => {
    offerImport(true);
    const { onImport } = renderPill();

    expect(pill()).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Import roles & responsibilities/ }));

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(coverageQuery.useQuery).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID }, { enabled: true });
  });

  it("stays hidden when coverage does not offer it (a personal workspace, or half covered)", () => {
    offerImport(false);
    renderPill();

    expect(pill()).toBeNull();
  });

  it("dismissing hides it, records the time for that workspace, and it stays hidden after a remount", () => {
    offerImport(true);
    renderPill();

    fireEvent.click(dismissButton());

    expect(pill()).toBeNull();
    expect(window.localStorage.getItem(importPillStorageKey(WORKSPACE_ID))).toBe(String(NOW));

    // A reload 29 days later: still hidden, and the query no longer runs.
    cleanup();
    coverageQuery.useQuery.mockClear();
    vi.setSystemTime(NOW + 29 * DAY);
    renderPill();

    expect(pill()).toBeNull();
    expect(coverageQuery.useQuery).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID }, { enabled: false });
  });

  it("comes back 30 days after the dismissal", () => {
    window.localStorage.setItem(importPillStorageKey(WORKSPACE_ID), JSON.stringify(NOW - 30 * DAY));
    offerImport(true);
    renderPill();

    expect(pill()).not.toBeNull();
  });

  it("a dismissal in one workspace leaves another workspace's pill alone", () => {
    window.localStorage.setItem(importPillStorageKey("ws-other"), JSON.stringify(NOW));
    offerImport(true);
    renderPill(WORKSPACE_ID);

    expect(pill()).not.toBeNull();
  });

  it("blocked storage renders the pill and still dismisses it for this session", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    offerImport(true);

    renderPill();
    expect(pill()).not.toBeNull();

    fireEvent.click(dismissButton());
    expect(pill()).toBeNull();
  });
});
