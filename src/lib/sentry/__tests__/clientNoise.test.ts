import { describe, expect, it } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import {
  DENY_URLS,
  IGNORE_ERRORS,
  beforeSendClient,
  isStaleDeployModuleError,
} from "../clientNoise";

// Mirrors how Sentry's inbound filter tests ignoreErrors: bare message and
// "<Type>: <message>".
function ignored(type: string, value: string): boolean {
  const candidates = [value, `${type}: ${value}`];
  return IGNORE_ERRORS.some((re) => candidates.some((c) => re.test(c)));
}

describe("IGNORE_ERRORS", () => {
  it.each([
    ["TypeError", "undefined is not an object (evaluating 'window.__firefox__.reader')"],
    ["i", "Failed to connect to MetaMask"],
    ["Error", "Attempting to use a disconnected port object"],
    ["TypeError", "Load failed"],
    ["TypeError", "Load failed (www.exponential.im)"],
    ["TRPCClientError", "Load failed"],
    ["Error", "NetworkError: A network error occurred."],
    ["TypeError", "network error"],
    ["AbortError", "Fetch is aborted"],
    ["UnhandledRejection", "Object captured as promise rejection with keys: code, message"],
    ["HierarchyRequestError", "Failed to execute 'appendChild' on 'Node': Only one element on document allowed."],
  ])("drops %s: %s", (type, value) => {
    expect(ignored(type, value)).toBe(true);
  });

  it.each([
    ["TypeError", "Cannot read properties of undefined (reading 'map')"],
    ["TRPCClientError", "UNAUTHORIZED"],
    ["Error", "Load failed to parse project"],
    ["TypeError", "e.scrollTo is not a function"],
    ["NotFoundError", "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."],
    ["Error", "Something network error happened"],
    ["UnhandledRejection", "Object captured as promise rejection with keys: code, data, message"],
    ["UnhandledRejection", "Object captured as promise rejection with keys: code"],
  ])("keeps %s: %s", (type, value) => {
    expect(ignored(type, value)).toBe(false);
  });
});

describe("DENY_URLS", () => {
  it("matches extension origins, not our chunks", () => {
    const denied = (url: string) => DENY_URLS.some((re) => re.test(url));
    expect(denied("chrome-extension://abc/content.js")).toBe(true);
    expect(denied("moz-extension://abc/inject.js")).toBe(true);
    expect(denied("safari-web-extension://abc/x.js")).toBe(true);
    expect(denied("https://www.exponential.im/_next/static/chunks/app.js")).toBe(false);
  });
});

function callEvent(top: { function?: string; filename?: string }, value = "Cannot read properties of undefined (reading 'call')"): ErrorEvent {
  return {
    type: undefined,
    exception: {
      values: [
        {
          type: "TypeError",
          value,
          stacktrace: {
            frames: [{ function: "outer", filename: "https://x/_next/static/chunks/app.js" }, top],
          },
        },
      ],
    },
  } as ErrorEvent;
}

describe("isStaleDeployModuleError / beforeSendClient", () => {
  it("drops the 'call' TypeError when the webpack runtime threw it", () => {
    const byName = callEvent({ function: "__webpack_require__" });
    const byFile = callEvent({ function: "o", filename: "https://www.exponential.im/_next/static/chunks/webpack-3f2a1b.js" });
    expect(isStaleDeployModuleError(byName)).toBe(true);
    expect(isStaleDeployModuleError(byFile)).toBe(true);
    expect(beforeSendClient(byName)).toBeNull();
  });

  it("keeps the same message from app code", () => {
    const appCode = callEvent({ function: "handleClick", filename: "https://x/_next/static/chunks/app/page-abc.js" });
    expect(isStaleDeployModuleError(appCode)).toBe(false);
    expect(beforeSendClient(appCode)).toBe(appCode);
  });

  it("keeps other messages from the runtime", () => {
    const other = callEvent({ function: "__webpack_require__" }, "Cannot read properties of undefined (reading 'apply')");
    expect(isStaleDeployModuleError(other)).toBe(false);
  });
});
