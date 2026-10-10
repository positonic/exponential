/**
 * useSeedWorkspaceQuery tests — a real QueryClient with `~/trpc/react` mocked,
 * so each test drives one branch of the seeding decision: leave client state
 * alone, take an already-settled server payload, share a still-streaming one,
 * or fall back to the client fetch when the server couldn't read the workspace.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SuperJSON, { type SuperJSONResult } from "superjson";

const SLUG = "acme";
const QUERY_KEY = [["workspace", "getBySlug"], { input: { slug: SLUG }, type: "query" }];

const { mockClientQuery, utilsRef } = vi.hoisted(() => ({
  mockClientQuery: vi.fn(),
  utilsRef: { current: null as unknown },
}));

vi.mock("~/trpc/react", () => ({
  api: {
    useUtils: () => utilsRef.current,
  },
}));

import { useSeedWorkspaceQuery, type ServerWorkspace } from "../useSeedWorkspaceQuery";

const serverWorkspace = { id: "ws-1", slug: SLUG, name: "Acme", createdAt: new Date("2026-01-02T03:04:05Z") };
const clientWorkspace = { id: "ws-1", slug: SLUG, name: "Acme (client)", createdAt: new Date("2026-01-02T03:04:05Z") };

/** A React Flight promise that has already resolved calls `then` callbacks synchronously. */
function settledFlightPromise(value: SuperJSONResult | null): ServerWorkspace {
  const thenable = {
    then(onFulfilled?: (v: SuperJSONResult | null) => unknown) {
      onFulfilled?.(value);
      return thenable;
    },
    catch() {
      return thenable;
    },
  };
  return thenable as unknown as ServerWorkspace;
}

function deferred() {
  let resolve!: (value: SuperJSONResult | null) => void;
  const promise = new Promise<SuperJSONResult | null>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

let queryClient: QueryClient;

function renderSeed(workspace: ServerWorkspace) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSeedWorkspaceQuery(SLUG, workspace), { wrapper });
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockClientQuery.mockReset();
  const setData = vi.fn((input: { slug: string }, data: unknown) => {
    queryClient.setQueryData([["workspace", "getBySlug"], { input, type: "query" }], data);
  });
  utilsRef.current = {
    client: { workspace: { getBySlug: { query: mockClientQuery } } },
    workspace: {
      getBySlug: {
        queryOptions: (input: { slug: string }) => ({
          queryKey: [["workspace", "getBySlug"], { input, type: "query" }],
        }),
        setData,
      },
    },
  };
});

afterEach(() => {
  queryClient.clear();
});

describe("useSeedWorkspaceQuery", () => {
  it("leaves data the client already holds untouched", () => {
    queryClient.setQueryData(QUERY_KEY, clientWorkspace);

    renderSeed(settledFlightPromise(SuperJSON.serialize(serverWorkspace)));

    expect(queryClient.getQueryData(QUERY_KEY)).toBe(clientWorkspace);
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("leaves a fetch that is already in flight alone", () => {
    // Never settles; clear() in afterEach cancels it, so swallow that rejection.
    queryClient
      .fetchQuery({ queryKey: QUERY_KEY, queryFn: () => new Promise(() => undefined) })
      .catch(() => undefined);

    renderSeed(settledFlightPromise(SuperJSON.serialize(serverWorkspace)));

    expect(queryClient.getQueryData(QUERY_KEY)).toBeUndefined();
    expect(queryClient.getQueryState(QUERY_KEY)?.fetchStatus).toBe("fetching");
  });

  it("seeds an already-settled server payload before any fetch", () => {
    renderSeed(settledFlightPromise(SuperJSON.serialize(serverWorkspace)));

    expect(queryClient.getQueryData(QUERY_KEY)).toEqual(serverWorkspace);
    expect((queryClient.getQueryData(QUERY_KEY) as typeof serverWorkspace).createdAt).toBeInstanceOf(Date);
    expect(queryClient.getQueryState(QUERY_KEY)?.fetchStatus).toBe("idle");
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("leaves the cache empty when the settled server result is null", () => {
    renderSeed(settledFlightPromise(null));

    expect(queryClient.getQueryState(QUERY_KEY)).toBeUndefined();
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("makes a still-streaming payload the in-flight fetch", async () => {
    const stream = deferred();

    renderSeed(stream.promise);
    expect(queryClient.getQueryState(QUERY_KEY)?.fetchStatus).toBe("fetching");

    stream.resolve(SuperJSON.serialize(serverWorkspace));
    await waitFor(() => expect(queryClient.getQueryData(QUERY_KEY)).toEqual(serverWorkspace));
    expect(mockClientQuery).not.toHaveBeenCalled();
  });

  it("falls back to the client fetch when a streaming result resolves to null", async () => {
    mockClientQuery.mockResolvedValue(clientWorkspace);
    const stream = deferred();

    renderSeed(stream.promise);
    stream.resolve(null);

    await waitFor(() => expect(queryClient.getQueryData(QUERY_KEY)).toEqual(clientWorkspace));
    expect(mockClientQuery).toHaveBeenCalledTimes(1);
    expect(mockClientQuery).toHaveBeenCalledWith({ slug: SLUG });
  });
});
