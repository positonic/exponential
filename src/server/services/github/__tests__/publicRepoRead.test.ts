import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Octokit } from "@octokit/rest";

const report = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: report }));

import { readPublicRepo, resetPublicRepoReadReporting } from "../publicRepoRead";

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { name: "HttpError", status });
}

/** A fake client factory that records which token each client was built with. */
function clients() {
  const built: Array<string | undefined> = [];
  const createClient = (token?: string) => {
    built.push(token);
    return { token } as unknown as Octokit;
  };
  return { built, createClient };
}

describe("readPublicRepo", () => {
  beforeEach(() => {
    report.mockReset();
    resetPublicRepoReadReporting();
  });

  it("reads with the token when it works", async () => {
    const { built, createClient } = clients();
    const result = await readPublicRepo(async () => "commits", { token: "ghp_ok", createClient });
    expect(result).toBe("commits");
    expect(built).toEqual(["ghp_ok"]);
    expect(report).not.toHaveBeenCalled();
  });

  it("falls back to an unauthenticated read on 'Bad credentials', reporting the dead token once", async () => {
    const { built, createClient } = clients();
    const read = vi.fn(async (octokit: Octokit) => {
      if ((octokit as unknown as { token?: string }).token) throw httpError(401, "Bad credentials");
      return "commits";
    });

    expect(await readPublicRepo(read, { token: "ghp_expired", createClient })).toBe("commits");
    expect(await readPublicRepo(read, { token: "ghp_expired", createClient })).toBe("commits");

    // The second read skips the doomed authenticated attempt entirely.
    expect(built).toEqual(["ghp_expired", undefined, undefined]);
    expect(report).toHaveBeenCalledTimes(1);
    expect((report.mock.calls[0]![0] as Error).message).toMatch(/rotate the token/);
  });

  it("tries a rotated token again after the old one was rejected", async () => {
    const { built, createClient } = clients();
    const read = vi.fn(async (octokit: Octokit) => {
      if ((octokit as unknown as { token?: string }).token === "ghp_expired") throw httpError(401, "Bad credentials");
      return "commits";
    });

    await readPublicRepo(read, { token: "ghp_expired", createClient });
    await readPublicRepo(read, { token: "ghp_rotated", createClient });

    expect(built).toEqual(["ghp_expired", undefined, "ghp_rotated"]);
  });

  it("reads unauthenticated when no token is configured", async () => {
    const { built, createClient } = clients();
    expect(await readPublicRepo(async () => "releases", { token: "", createClient })).toBe("releases");
    expect(built).toEqual([undefined]);
  });

  it("maps an unrecoverable GitHub failure to a typed tRPC error instead of a 500", async () => {
    const { createClient } = clients();
    const error = await readPublicRepo(
      async () => {
        throw httpError(403, "API rate limit exceeded for 1.2.3.4");
      },
      { createClient },
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" });

    const down = await readPublicRepo(
      async () => {
        throw new TypeError("fetch failed");
      },
      { createClient },
    ).catch((e: unknown) => e);
    expect(down).toMatchObject({ code: "BAD_GATEWAY" });
  });

  it("rethrows errors it does not recognise unchanged", async () => {
    const { createClient } = clients();
    const boom = new Error("boom");
    await expect(readPublicRepo(async () => { throw boom; }, { token: "t", createClient })).rejects.toBe(boom);
  });
});
