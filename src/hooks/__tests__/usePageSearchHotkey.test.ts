/**
 * usePageSearchHotkey tests — the ⌘F binding for a page's own search box.
 *
 * The interesting cases are the ones where the hotkey must *decline*: an open
 * dropdown or modal owns the keyboard, and stealing ⌘F there either yanks focus
 * out of the overlay or drops it into a box hidden behind one.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { usePageSearchHotkey } from "../usePageSearchHotkey";

/**
 * happy-dom does no layout, and reports a non-empty getClientRects() for every
 * attached element — so "visible" is the default and hiding has to be explicit.
 * Both the hook and isOverlayBlocking gate on getClientRects().length.
 */
function attach<T extends HTMLElement>(el: T, { visible = true } = {}): T {
  el.getClientRects = () =>
    (visible
      ? [{ width: 120, height: 32 }]
      : []) as unknown as DOMRectList;
  document.body.appendChild(el);
  return el;
}

function makeVisibleInput(): HTMLInputElement {
  return attach(document.createElement("input"));
}

function makeOverlay(role: "listbox" | "modal", { visible = true } = {}) {
  const el = document.createElement("div");
  if (role === "modal") el.setAttribute("aria-modal", "true");
  else el.setAttribute("role", "listbox");
  return attach(el, { visible });
}

function pressF(
  init: Partial<KeyboardEventInit> & { code?: string } = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    code: "KeyF",
    key: "f",
    metaKey: true,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  window.dispatchEvent(event);
  return event;
}

function setPlatform(value: string) {
  Object.defineProperty(navigator, "platform", {
    value,
    configurable: true,
  });
}

let input: HTMLInputElement;
const originalPlatform = navigator.platform;

beforeEach(() => {
  document.body.innerHTML = "";
  input = makeVisibleInput();
  setPlatform("MacIntel");
});

afterEach(() => {
  setPlatform(originalPlatform);
});

function mount(target: HTMLInputElement | null = input) {
  return renderHook(() => usePageSearchHotkey({ current: target }));
}

describe("usePageSearchHotkey", () => {
  it("focuses and selects the box, and suppresses native find", () => {
    input.value = "existing query";
    const select = vi.spyOn(input, "select");
    mount();

    const event = pressF();

    expect(document.activeElement).toBe(input);
    expect(select).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores ⌘F when no box is on screen", () => {
    mount(null);
    expect(pressF().defaultPrevented).toBe(false);
  });

  it("ignores ⌘F when the box is rendered but has no layout box", () => {
    mount(attach(document.createElement("input"), { visible: false }));

    expect(pressF().defaultPrevented).toBe(false);
  });

  // The case the review caught: an open Select puts focus on its own input,
  // which has no [aria-modal] ancestor — the earlier guard let this through.
  it("declines while a dropdown listbox is open", () => {
    makeOverlay("listbox");
    mount();

    expect(pressF().defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);
  });

  it("declines while a modal is open, even before focus moves into it", () => {
    makeOverlay("modal");
    mount();

    expect(pressF().defaultPrevented).toBe(false);
  });

  it("is not fooled by the listboxes Mantine leaves mounted but hidden", () => {
    makeOverlay("listbox", { visible: false });
    mount();

    expect(pressF().defaultPrevented).toBe(true);
  });

  it("leaves Ctrl+F alone on macOS — that is emacs forward-char", () => {
    mount();
    const event = pressF({ metaKey: false, ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input);
  });

  it("uses Ctrl+F off macOS", () => {
    setPlatform("Win32");
    mount();

    expect(pressF({ metaKey: false, ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it("matches the physical F key, not the layout-mapped character", () => {
    mount();
    // ⌘F on a Cyrillic layout: code is still KeyF, key arrives as "а".
    expect(pressF({ key: "а" }).defaultPrevented).toBe(true);
  });

  // Regression: matching on `code` alone broke every input path that leaves it
  // empty — synthetic events, on-screen keyboards, some IME/remote-desktop
  // stacks. Caught in a real browser, not by the first cut of these tests.
  it("falls back to `key` when the event carries no `code`", () => {
    mount();
    expect(pressF({ code: "", key: "f" }).defaultPrevented).toBe(true);
  });

  it("still ignores other keys that carry no `code`", () => {
    mount();
    expect(pressF({ code: "", key: "k" }).defaultPrevented).toBe(false);
  });

  it("leaves ⌘⇧F and ⌘⌥F to the browser", () => {
    mount();

    expect(pressF({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(pressF({ altKey: true }).defaultPrevented).toBe(false);
  });

  it("stops listening after unmount", () => {
    const { unmount } = mount();
    unmount();

    expect(pressF().defaultPrevented).toBe(false);
  });
});
