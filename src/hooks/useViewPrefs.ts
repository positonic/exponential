import { useCallback, useMemo, useRef, useState } from "react";
import {
  useMutationState,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { getMutationKey, getQueryKey } from "@trpc/react-query";
import { api, type RouterInputs } from "~/trpc/react";
import { useCoalescedSave } from "./useCoalescedSave";

type SaveViewPrefsInput = RouterInputs["product"]["product"]["saveViewPrefs"];
/** What `saveViewPrefs` accepts: every view pref, each optional. */
export type ViewPrefsPatch = SaveViewPrefsInput["prefs"];
/** Saved prefs as stored: untrusted JSON, so each field is unknown until checked. */
export type StoredViewPrefs = Record<string, unknown>;

/** Prefs are kept per user, per product (or per product page, by suffixing the slug). */
export interface ViewPrefsKey {
  productSlug: string;
  workspaceId: string;
}

/**
 * Every view-prefs save made through this hook goes into one queue: React
 * Query runs mutations that share a scope one at a time, in order. The server
 * merges each save into one settings row per user with a read-then-write, so
 * overlapping saves could drop each other; and the reconcile below relies on
 * every save still pending when one succeeds having been made after it.
 */
const SAVE_SCOPE = { id: "product.product.saveViewPrefs" };

interface UseViewPrefsOptions {
  /** Merge saves that land inside this window into one (see useCoalescedSave). */
  debounceMs?: number;
}

export interface UseViewPrefsResult<T extends ViewPrefsPatch> {
  /**
   * The saved prefs once they have loaded, with this page's unsaved changes
   * laid over them. Untrusted JSON: check each field before using it.
   */
  prefs: StoredViewPrefs | undefined;
  /** The read failed; the page falls back to its defaults. */
  isError: boolean;
  /** Persist a change. It shows in `prefs` and the cached prefs at once. */
  save: (patch: T) => void;
}

/**
 * A page's saved view prefs (`product.product.getViewPrefs`), kept in step
 * with what the page saves through `saveViewPrefs`.
 *
 * Pages restore their view from the cached prefs when they mount, and a
 * client-side tab switch remounts them, so the cache has to carry a change
 * from the moment it is made. Each save patches the cached prefs. The patch
 * waits for the prefs to have loaded: a lone patch in an empty cache would
 * pass for the whole saved view (the Backlog would restore it, then ignore
 * the real prefs when they arrived and overwrite the saved filters).
 *
 * The patch alone is not enough while a read is in flight - most easily, when
 * a control is changed before the prefs have loaded. The response was built
 * before the save committed, lands after the patch, and puts the old value
 * back; a remount inside staleTime then restores it. So:
 *
 * - `prefs` lays the pending changes - saves not yet settled, plus any still
 *   inside the debounce window - over the cached prefs, so a restore that
 *   runs before they settle keeps the user's choice;
 * - saves run one at a time, in the order they were made (SAVE_SCOPE);
 * - once a save has succeeded and no read is in flight (a read started after
 *   the commit is fine, one started before may carry the old value), its
 *   values are written over whatever landed, with every change made after it
 *   laid on top, so an older save never overwrites a newer one. The save
 *   itself settles without waiting for that read;
 * - a failed save resets the cached prefs, so the next read restores what the
 *   server really holds.
 *
 * Cancelling the in-flight read would be simpler, but a cancelled first read
 * is not retried, and the Backlog holds its ticket list until the prefs load.
 */
export function useViewPrefs<T extends ViewPrefsPatch>(
  key: { productSlug: string; workspaceId: string | null | undefined },
  { debounceMs = 0 }: UseViewPrefsOptions = {},
): UseViewPrefsResult<T> {
  const queryClient = useQueryClient();
  const utils = api.useUtils();
  const { productSlug } = key;
  const workspaceId = key.workspaceId ?? "";
  const input = useMemo<ViewPrefsKey>(
    () => ({ productSlug, workspaceId }),
    [productSlug, workspaceId],
  );

  const query = api.product.product.getViewPrefs.useQuery(input, { enabled: !!key.workspaceId });

  // Changes handed to `save` that no save has picked up yet: the debounce
  // window. In state for rendering, and in a ref for the reconcile, which
  // runs outside render.
  const [unsent, setUnsentState] = useState<ViewPrefsPatch>({});
  const unsentRef = useRef<ViewPrefsPatch>(unsent);
  const setUnsent = useCallback((next: ViewPrefsPatch) => {
    unsentRef.current = next;
    setUnsentState(next);
  }, []);

  // The saves for these prefs that have not settled, sent or still queued.
  const inFlight = useMutationState({
    filters: {
      mutationKey: getMutationKey(api.product.product.saveViewPrefs),
      status: "pending",
      predicate: (mutation) => isSaveFor(mutation.state.variables, input),
    },
    select: (mutation) => ({
      id: mutation.mutationId,
      prefs: isSaveViewPrefsInput(mutation.state.variables) ? mutation.state.variables.prefs : {},
    }),
  });

  const mutation = api.product.product.saveViewPrefs.useMutation({
    scope: SAVE_SCOPE,
    onMutate: (vars) => {
      setUnsent(withoutSent(unsentRef.current, vars.prefs));
      utils.product.product.getViewPrefs.setData(keyOf(vars), (prev) =>
        prev ? { ...prev, ...vars.prefs } : prev,
      );
    },
    onSuccess: (_data, vars) => {
      const saved = keyOf(vars);
      void untilNotFetching(
        queryClient,
        getQueryKey(api.product.product.getViewPrefs, saved, "query"),
      ).then(() => {
        // Saves run in order, so every save still pending was made after
        // this one: lay those, and the debounce window, over its values.
        const later = pendingPatch(queryClient, saved, unsentRef.current);
        utils.product.product.getViewPrefs.setData(saved, (prev) =>
          prev ? { ...prev, ...vars.prefs, ...later } : prev,
        );
      });
    },
    onError: (_error, vars) => {
      void utils.product.product.getViewPrefs.reset(keyOf(vars));
    },
  });
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;

  const send = useCallback(
    (patch: ViewPrefsPatch) => mutateRef.current({ ...input, prefs: patch }),
    [input],
  );
  const { push } = useCoalescedSave<ViewPrefsPatch>(send, debounceMs);

  const save = useCallback(
    (patch: T) => {
      if (!key.workspaceId) return;
      setUnsent({ ...unsentRef.current, ...patch });
      if (debounceMs > 0) push(patch);
      else send(patch);
    },
    [key.workspaceId, debounceMs, push, send, setUnsent],
  );

  const prefs = useMemo<StoredViewPrefs | undefined>(() => {
    if (query.data === undefined) return undefined;
    const sent = [...inFlight]
      .sort((a, b) => a.id - b.id)
      .reduce<ViewPrefsPatch>((acc, save) => ({ ...acc, ...save.prefs }), {});
    return { ...query.data, ...sent, ...unsent };
  }, [query.data, inFlight, unsent]);

  return { prefs, isError: query.isError, save };
}

function keyOf(vars: SaveViewPrefsInput): ViewPrefsKey {
  return { productSlug: vars.productSlug, workspaceId: vars.workspaceId };
}

function isSaveViewPrefsInput(value: unknown): value is SaveViewPrefsInput {
  return (
    typeof value === "object" &&
    value !== null &&
    "productSlug" in value &&
    "workspaceId" in value &&
    "prefs" in value
  );
}

function isSaveFor(value: unknown, key: ViewPrefsKey): boolean {
  return (
    isSaveViewPrefsInput(value) &&
    value.productSlug === key.productSlug &&
    value.workspaceId === key.workspaceId
  );
}

/** Every change for `key` the server may not hold yet, later changes winning. */
function pendingPatch(
  queryClient: QueryClient,
  key: ViewPrefsKey,
  unsent: ViewPrefsPatch,
): ViewPrefsPatch {
  const sent = queryClient
    .getMutationCache()
    .findAll({
      mutationKey: getMutationKey(api.product.product.saveViewPrefs),
      status: "pending",
      predicate: (mutation) => isSaveFor(mutation.state.variables, key),
    })
    .sort((a, b) => a.mutationId - b.mutationId)
    .reduce<ViewPrefsPatch>(
      (acc, mutation) =>
        isSaveViewPrefsInput(mutation.state.variables)
          ? { ...acc, ...mutation.state.variables.prefs }
          : acc,
      {},
    );
  return { ...sent, ...unsent };
}

/** `unsent` minus the entries a save has just picked up (same key, same value). */
function withoutSent(unsent: ViewPrefsPatch, sent: ViewPrefsPatch): ViewPrefsPatch {
  const rest: Record<string, unknown> = { ...unsent };
  for (const [k, value] of Object.entries(sent)) {
    if (rest[k] === value) delete rest[k];
  }
  return rest as ViewPrefsPatch;
}

/** Resolves once no fetch is in flight for the query (at once if none is). */
function untilNotFetching(queryClient: QueryClient, queryKey: QueryKey): Promise<void> {
  const cache = queryClient.getQueryCache();
  const query = cache.find({ queryKey });
  if (!query || query.state.fetchStatus === "idle") return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = cache.subscribe((event) => {
      if (event.query !== query) return;
      if (event.type === "removed" || query.state.fetchStatus === "idle") {
        unsubscribe();
        resolve();
      }
    });
  });
}
