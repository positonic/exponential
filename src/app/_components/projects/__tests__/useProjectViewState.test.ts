/**
 * useProjectViewState tests — the search box's URL-mirroring state machine.
 *
 * The invariant worth pinning down: the input is driven by local state and the
 * URL only catches up after a pause, so `lastWrittenQueryRef` has to tell the
 * hook's *own* write (echoing back through useSearchParams) apart from a real
 * external change. Get that backwards in either direction and you either
 * resurrect stale text mid-typing or stop honouring `?q=` deep links — both
 * silent, and invisible to types and lint.
 *
 * `next/navigation` is mocked so this exercises the state machine only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const { mockReplace, mockSearchParams } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockSearchParams: { current: new URLSearchParams() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/w/acme/projects",
  useSearchParams: () => mockSearchParams.current,
}));

import {
  useProjectViewState,
  computeProjectFilterCounts,
} from "../useProjectViewState";

/** Matches SEARCH_URL_DEBOUNCE_MS in the hook. */
const DEBOUNCE_MS = 350;

function setUrl(query: string) {
  mockSearchParams.current = new URLSearchParams(query);
}

beforeEach(() => {
  vi.useFakeTimers();
  mockReplace.mockClear();
  setUrl("");
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useProjectViewState search query", () => {
  it("updates the visible text synchronously, before any URL write", () => {
    const { result } = renderHook(() => useProjectViewState());

    act(() => result.current.setSearchQuery("no"));

    expect(result.current.searchQuery).toBe("no");
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("writes the URL once per typing burst, not once per keystroke", () => {
    const { result } = renderHook(() => useProjectViewState());

    // Five keystrokes, each well inside the debounce window.
    for (const value of ["n", "no", "not", "noti", "notif"]) {
      act(() => {
        result.current.setSearchQuery(value);
        vi.advanceTimersByTime(50);
      });
    }

    expect(mockReplace).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(DEBOUNCE_MS));

    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith("/w/acme/projects?q=notif", {
      scroll: false,
    });
  });

  it("merges the query into params that already exist", () => {
    setUrl("status=ACTIVE&sort=-endDate");
    const { result } = renderHook(() => useProjectViewState());

    act(() => {
      result.current.setSearchQuery("edge");
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    const [url] = mockReplace.mock.calls[0] as [string];
    const written = new URLSearchParams(url.split("?")[1]);
    expect(written.get("q")).toBe("edge");
    expect(written.get("status")).toBe("ACTIVE");
    expect(written.get("sort")).toBe("-endDate");
  });

  it("drops the param entirely when the query is cleared", () => {
    setUrl("q=edge");
    const { result } = renderHook(() => useProjectViewState());

    act(() => {
      result.current.setSearchQuery("");
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(mockReplace).toHaveBeenCalledWith("/w/acme/projects", {
      scroll: false,
    });
  });

  it("seeds the input from a `?q=` deep link", () => {
    setUrl("q=edge");
    const { result } = renderHook(() => useProjectViewState());

    expect(result.current.searchQuery).toBe("edge");
  });

  it("adopts an external URL change (back/forward, a link carrying ?q=)", () => {
    const { result, rerender } = renderHook(() => useProjectViewState());

    setUrl("q=fromelsewhere");
    rerender();

    expect(result.current.searchQuery).toBe("fromelsewhere");
  });

  it("does not clobber in-flight typing when its own write echoes back", () => {
    const { result, rerender } = renderHook(() => useProjectViewState());

    act(() => {
      result.current.setSearchQuery("notif");
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    // The write lands; useSearchParams now reports what the hook itself wrote.
    setUrl("q=notif");
    rerender();
    expect(result.current.searchQuery).toBe("notif");

    // Meanwhile the user keeps typing. The echo must not roll this back.
    act(() => result.current.setSearchQuery("notifications"));
    rerender();

    expect(result.current.searchQuery).toBe("notifications");
  });

  it("fires no navigation when unmounted mid-debounce", () => {
    const { result, unmount } = renderHook(() => useProjectViewState());

    act(() => result.current.setSearchQuery("abandoned"));
    unmount();
    act(() => void vi.advanceTimersByTime(DEBOUNCE_MS * 4));

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not persist anything when no persistScope is given", () => {
    const { result } = renderHook(() => useProjectViewState());

    act(() => result.current.setFilters({ status: ["ACTIVE"] }));

    expect(window.localStorage.length).toBe(0);
  });

  it("carries the live text on view-tab links before the URL catches up", () => {
    setUrl("status=ACTIVE");
    const { result } = renderHook(() => useProjectViewState());

    act(() => result.current.setSearchQuery("realtime"));

    // Still mid-debounce — the URL has no `q` yet, but a tab link clicked right
    // now must not lose what the user typed.
    expect(mockReplace).not.toHaveBeenCalled();
    const params = new URLSearchParams(result.current.viewParamsQueryString);
    expect(params.get("q")).toBe("realtime");
    expect(params.get("status")).toBe("ACTIVE");
  });
});

/**
 * Filter/sort persistence — with a `persistScope`, the hook remembers the
 * user's filters in localStorage (keyed per workspace + page family) and
 * re-applies them on a bare-URL visit. A URL that already carries view state
 * must always win, and clearing filters must clear the memory — not have the
 * old filters snap back on the next visit.
 */
const STORAGE_KEY = "exponential.viewFilters.acme.projects";

describe("useProjectViewState filter persistence", () => {
  it("saves filter changes and restores them on a later bare-URL mount", () => {
    const first = renderHook(() =>
      useProjectViewState(undefined, "projects"),
    );
    act(() => first.result.current.setFilters({ status: ["ACTIVE"] }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("status=ACTIVE");
    first.unmount();

    // A fresh visit to the bare URL re-applies the saved state.
    setUrl("");
    mockReplace.mockClear();
    renderHook(() => useProjectViewState(undefined, "projects"));

    expect(mockReplace).toHaveBeenCalledWith("/w/acme/projects?status=ACTIVE", {
      scroll: false,
    });
  });

  it("restores the saved sort as well as the filters", () => {
    window.localStorage.setItem(STORAGE_KEY, "status=ACTIVE&sort=-endDate");

    renderHook(() => useProjectViewState(undefined, "projects"));

    const [url] = mockReplace.mock.calls[0] as [string];
    const written = new URLSearchParams(url.split("?")[1]);
    expect(written.get("status")).toBe("ACTIVE");
    expect(written.get("sort")).toBe("-endDate");
  });

  it("lets a deep link's explicit params win over the saved state", () => {
    window.localStorage.setItem(STORAGE_KEY, "status=ACTIVE");
    setUrl("status=ON_HOLD");

    const { result } = renderHook(() =>
      useProjectViewState(undefined, "projects"),
    );

    expect(mockReplace).not.toHaveBeenCalled();
    expect(result.current.filters.status).toEqual(["ON_HOLD"]);
    // Merely following the link doesn't overwrite the saved default.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("status=ACTIVE");
  });

  it("remembers an explicit clear as an empty entry, not as never-visited", () => {
    window.localStorage.setItem(STORAGE_KEY, "status=ACTIVE");
    setUrl("status=ACTIVE");

    const { result } = renderHook(() =>
      useProjectViewState(undefined, "projects"),
    );
    act(() => result.current.setFilters({}));

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("");
  });

  it("applies the product default on a first-ever visit, without saving it", () => {
    renderHook(() =>
      useProjectViewState(undefined, "projects", "status=ACTIVE,ON_HOLD"),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/w/acme/projects?status=ACTIVE%2CON_HOLD",
      { scroll: false },
    );
    // The default stays a default — only user interaction writes the memory,
    // so a future change to the product default still reaches this user.
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("prefers the user's saved state over the product default", () => {
    window.localStorage.setItem(STORAGE_KEY, "status=COMPLETED");

    renderHook(() =>
      useProjectViewState(undefined, "projects", "status=ACTIVE,ON_HOLD"),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      "/w/acme/projects?status=COMPLETED",
      { scroll: false },
    );
  });

  it("does not re-apply the default after the user explicitly cleared filters", () => {
    window.localStorage.setItem(STORAGE_KEY, "");

    renderHook(() =>
      useProjectViewState(undefined, "projects", "status=ACTIVE,ON_HOLD"),
    );

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("never persists the search query", () => {
    const { result } = renderHook(() =>
      useProjectViewState(undefined, "projects"),
    );

    act(() => {
      result.current.setSearchQuery("transient");
      vi.advanceTimersByTime(DEBOUNCE_MS);
    });

    expect(mockReplace).toHaveBeenCalledWith("/w/acme/projects?q=transient", {
      scroll: false,
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("computeProjectFilterCounts", () => {
  const projects = [
    { name: "Alpha", status: "ACTIVE", priority: "HIGH", driId: "u1" },
    { name: "Beta", status: "ACTIVE", priority: "LOW", driId: "u2" },
    { name: "Gamma", status: "COMPLETED", priority: "HIGH", driId: null },
  ];

  it("counts each field with the other filters applied (facet semantics)", () => {
    const counts = computeProjectFilterCounts(
      projects,
      { priority: ["HIGH"] },
      "",
    );

    // Priority options are counted without the priority filter itself...
    expect(counts.priority).toEqual({ HIGH: 2, LOW: 1 });
    // ...while the other fields are counted under it.
    expect(counts.status).toEqual({ ACTIVE: 1, COMPLETED: 1 });
    expect(counts.driId).toEqual({ u1: 1 });
  });

  it("counts the other fields under an active status filter", () => {
    const counts = computeProjectFilterCounts(
      projects,
      { status: ["ACTIVE"] },
      "",
    );

    expect(counts.priority).toEqual({ HIGH: 1, LOW: 1 });
    expect(counts.driId).toEqual({ u1: 1, u2: 1 });
  });

  it("omits status counts under an active status filter until server totals arrive", () => {
    // The fetched list excludes the filtered-out statuses, so a client count
    // would report them as a confident 0 — no counts beats wrong counts.
    const counts = computeProjectFilterCounts(
      projects.filter((p) => p.status === "ACTIVE"),
      { status: ["ACTIVE"] },
      "",
    );

    expect(counts.status).toBeUndefined();
  });

  it("applies the search text to every field's counts", () => {
    const counts = computeProjectFilterCounts(projects, {}, "alp");

    expect(counts.priority).toEqual({ HIGH: 1 });
    expect(counts.status).toEqual({ ACTIVE: 1 });
  });

  it("prefers server status totals when the list is fetched pre-filtered", () => {
    const counts = computeProjectFilterCounts(
      projects.filter((p) => p.status === "ACTIVE"),
      { status: ["ACTIVE"] },
      "",
      { ACTIVE: 2, COMPLETED: 7, CANCELLED: 3 },
    );

    expect(counts.status).toEqual({ ACTIVE: 2, COMPLETED: 7, CANCELLED: 3 });
  });
});
