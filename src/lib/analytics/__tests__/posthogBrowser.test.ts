import { beforeEach, describe, expect, it, vi } from "vitest";

const { ph } = vi.hoisted(() => ({
  ph: {
    __loaded: true,
    init: vi.fn(),
    identify: vi.fn(),
    reset: vi.fn(),
    get_distinct_id: vi.fn(() => "anon_1"),
    get_property: vi.fn((): string | undefined => "anonymous"),
  },
}));
vi.mock("posthog-js", () => ({ default: ph }));

import {
  initPostHogBrowser,
  posthogBrowserConfig,
  syncPostHogIdentity,
} from "../posthogBrowser";

describe("posthogBrowserConfig", () => {
  it("keeps private work out of PostHog", () => {
    expect(posthogBrowserConfig.autocapture).toBe(false);
    expect(posthogBrowserConfig.mask_all_text).toBe(true);
    expect(posthogBrowserConfig.mask_all_element_attributes).toBe(true);
    expect(posthogBrowserConfig.session_recording).toEqual({
      maskAllInputs: true,
      maskTextSelector: "*",
    });
    expect(posthogBrowserConfig.capture_exceptions).toBe(false);
    expect(posthogBrowserConfig.person_profiles).toBe("identified_only");
  });

  it("sends through the same-origin proxy and captures App Router page views", () => {
    expect(posthogBrowserConfig.api_host).toBe("/ingest");
    expect(posthogBrowserConfig.capture_pageview).toBe("history_change");
    expect(posthogBrowserConfig.capture_pageleave).toBe(true);
  });
});

describe("initPostHogBrowser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing without a key", () => {
    expect(initPostHogBrowser(undefined)).toBe(false);
    expect(ph.init).not.toHaveBeenCalled();
  });

  it("initialises with the shared config", () => {
    expect(initPostHogBrowser("phc_test")).toBe(true);
    expect(ph.init).toHaveBeenCalledWith("phc_test", posthogBrowserConfig);
  });
});

describe("syncPostHogIdentity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ph.__loaded = true;
    ph.get_distinct_id.mockReturnValue("anon_1");
    ph.get_property.mockReturnValue("anonymous");
  });

  it("identifies by user id only", () => {
    syncPostHogIdentity("user_1");
    expect(ph.identify).toHaveBeenCalledWith("user_1");
  });

  it("does not re-identify an already identified user", () => {
    ph.get_distinct_id.mockReturnValue("user_1");
    syncPostHogIdentity("user_1");
    expect(ph.identify).not.toHaveBeenCalled();
  });

  it("resets on sign-out, but leaves anonymous visitors alone", () => {
    syncPostHogIdentity(null);
    expect(ph.reset).not.toHaveBeenCalled();
    ph.get_property.mockReturnValue("identified");
    syncPostHogIdentity(null);
    expect(ph.reset).toHaveBeenCalledTimes(1);
  });

  it("is a no-op before PostHog loads", () => {
    ph.__loaded = false;
    syncPostHogIdentity("user_1");
    expect(ph.identify).not.toHaveBeenCalled();
  });
});
