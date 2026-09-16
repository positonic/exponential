"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useIsomorphicEffect } from "@mantine/hooks";
import { useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import { parsePeekKey, type PeekKey } from "~/lib/decision-log";
import { PeekDrawer } from "~/app/_components/product/peek/PeekDrawer";
import { AdrDetail } from "./AdrDetail";
import { DecisionDetail } from "./DecisionDetail";
import type { PeekPreview } from "./DetailPreview";

/**
 * The Decision Log's peek drawer (?peek=adr-<id> | decision-<id>): detail
 * over the list, the list never unmounts. Built to feel instant:
 *
 * - The URL moves with `history.pushState`, not `router.push`. A pushed
 *   search param is a navigation, and a navigation is an RSC round trip to
 *   the async (sidemenu) layout; the drawer would wait on the server just to
 *   open, flip or close. Next syncs pushState into useSearchParams, and Back
 *   still steps through peeks.
 * - Only this drawer subscribes to the URL. Rows read the open key from a
 *   tiny store, so opening or flipping re-renders two rows, not the list.
 * - A row prefetches its detail on hover intent, press and focus; an open
 *   peek prefetches its neighbours, so j/k lands on cached data.
 * - Until the query lands, the drawer paints the row's own label, title and
 *   status (DetailPreview), never a blank skeleton.
 * - The detail views are imported statically. Code-splitting them saved 7 kB
 *   of an ~900 kB page, and a React.lazy boundary suspends on its first
 *   render even with the chunk loaded: React then holds the fallback for its
 *   300ms reveal throttle, which cost more than the chunk.
 */

/** Long enough that sweeping the pointer down the list fetches nothing. */
const HOVER_INTENT_MS = 60;
/** Neighbours wait this long, so holding j/k doesn't fetch every row it passes. */
const NEIGHBOUR_PREFETCH_MS = 150;

interface PeekStore {
  subscribe: (listener: () => void) => () => void;
  getActive: () => string | null;
  setActive: (key: string | null) => void;
  open: (key: PeekKey | null) => void;
  prefetch: (key: PeekKey) => void;
}

const PeekContext = createContext<PeekStore | null>(null);

const noopSubscribe = () => () => undefined;

export function DecisionPeekProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const utils = api.useUtils();
  const latest = useRef({ utils, workspaceId });
  latest.current = { utils, workspaceId };

  // Created once: every member is stable, so the context never re-renders
  // its consumers. State that changes lives behind subscribe/getActive.
  const [store] = useState<PeekStore>(() => {
    let active: string | null = null;
    const listeners = new Set<() => void>();
    const setActive = (key: string | null) => {
      if (key === active) return;
      active = key;
      listeners.forEach((listener) => listener());
    };
    return {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getActive: () => active,
      setActive,
      open: (key) => {
        const url = new URL(window.location.href);
        if (key) url.searchParams.set("peek", key);
        else url.searchParams.delete("peek");
        window.history.pushState(null, "", url);
        setActive(key);
      },
      prefetch: (key) => {
        const peek = parsePeekKey(key);
        if (!peek) return;
        const { utils: u, workspaceId: ws } = latest.current;
        // prefetch is a no-op while the cached entry is still fresh, and it
        // never throws: a failed prefetch just leaves the query to retry.
        if (peek.kind === "adr") {
          void u.adr.get.prefetch({ workspaceId: ws, adrId: peek.id });
          void u.decision.listForAdr.prefetch({ workspaceId: ws, adrDocumentId: peek.id });
        } else {
          void u.decision.get.prefetch({ workspaceId: ws, decisionId: peek.id });
        }
      },
    };
  });

  return <PeekContext.Provider value={store}>{children}</PeekContext.Provider>;
}

/**
 * Props for a row's link. Plain click peeks; modified and middle clicks keep
 * the link's own behaviour (new tab, new window), so the full page stays one
 * gesture away. Next's viewport prefetch is off: rows open in the peek, and
 * prefetching every visible row's full page is an RSC request per row.
 */
export function usePeekLink(key: PeekKey) {
  const store = useContext(PeekContext);
  const isActive = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.getActive() === key,
    () => false,
  );
  const intent = useRef<number | undefined>(undefined);
  const cancelIntent = () => {
    if (intent.current !== undefined) window.clearTimeout(intent.current);
    intent.current = undefined;
  };
  useEffect(() => cancelIntent, []);

  return {
    prefetch: false,
    "data-peeked": isActive ? "" : undefined,
    onClick: (e: MouseEvent<HTMLAnchorElement>) => {
      if (!store || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      e.preventDefault();
      store.open(key);
    },
    onPointerEnter: () => {
      if (!store) return;
      cancelIntent();
      intent.current = window.setTimeout(() => store.prefetch(key), HOVER_INTENT_MS);
    },
    onPointerLeave: cancelIntent,
    onPointerDown: () => {
      cancelIntent();
      store?.prefetch(key);
    },
    onFocus: () => store?.prefetch(key),
  };
}

export function DecisionPeekDrawer({
  workspaceId,
  workspaceSlug,
  visibleKeys,
  previews,
}: {
  workspaceId: string;
  workspaceSlug: string;
  /** Row keys in on-screen order, for prev/next. */
  visibleKeys: PeekKey[];
  /** What each row already knows, painted while its detail loads. */
  previews: ReadonlyMap<string, PeekPreview>;
}) {
  const store = useContext(PeekContext);
  const searchParams = useSearchParams();
  const peekRaw = searchParams.get("peek");
  const peek = parsePeekKey(peekRaw);
  const activeKey = peek ? (peekRaw as PeekKey) : null;

  // The URL is the source of truth (reloads, Back, shared links); the store
  // mirrors it for the rows' highlight.
  useIsomorphicEffect(() => {
    store?.setActive(activeKey);
  }, [store, activeKey]);

  const index = activeKey ? visibleKeys.indexOf(activeKey) : -1;
  const prevKey = index > 0 ? visibleKeys[index - 1] : undefined;
  const nextKey = index !== -1 ? visibleKeys[index + 1] : undefined;

  useEffect(() => {
    if (!store || (!prevKey && !nextKey)) return;
    const id = window.setTimeout(() => {
      if (nextKey) store.prefetch(nextKey);
      if (prevKey) store.prefetch(prevKey);
    }, NEIGHBOUR_PREFETCH_MS);
    return () => window.clearTimeout(id);
  }, [store, prevKey, nextKey]);

  const preview = activeKey ? previews.get(activeKey) : undefined;

  return (
    <PeekDrawer
      label="Decision details"
      opened={!!peek}
      onClose={() => store?.open(null)}
      fullPageHref={
        peek
          ? peek.kind === "adr"
            ? `/w/${workspaceSlug}/decisions/${peek.id}`
            : `/w/${workspaceSlug}/decisions/d/${peek.id}`
          : null
      }
      onPrev={prevKey && store ? () => store.open(prevKey) : undefined}
      onNext={nextKey && store ? () => store.open(nextKey) : undefined}
    >
      {peek?.kind === "adr" ? (
        <AdrDetail
          key={peek.id}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          adrId={peek.id}
          preview={preview}
        />
      ) : peek?.kind === "decision" ? (
        <DecisionDetail
          key={peek.id}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          decisionId={peek.id}
          preview={preview}
        />
      ) : null}
    </PeekDrawer>
  );
}
