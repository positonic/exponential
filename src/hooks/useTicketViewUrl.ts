import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { notifications } from "@mantine/notifications";
import {
  buildTicketViewParams,
  parseTicketViewParams,
  ticketViewQueryString,
  withoutTicketViewParams,
  type TicketViewState,
} from "~/app/_components/product/ticketViewUrl";

interface UseTicketViewUrlOptions {
  /** Resolves `assignee=me` in a link to the person opening it. */
  sessionUserId?: string;
  /** Group-by values the page supports; others in a link are ignored. */
  groupByValues?: readonly string[];
}

export interface UseTicketViewUrlResult {
  /**
   * The view the URL carries, or null when it carries none. While it is
   * non-null the page shows this view instead of the user's saved prefs, and
   * changes go to the URL (`replaceView`), never to the prefs.
   */
  urlView: TicketViewState | null;
  /** Rewrite the URL to carry `state` (keeps non-view params such as peek). */
  replaceView: (state: TicketViewState) => void;
  /** Drop every view param: back to the user's own saved view. */
  exitView: () => void;
  /** Copy a link to `state` on this page to the clipboard and confirm it. */
  copyViewLink: (state: TicketViewState) => void;
}

/**
 * Shareable ticket views (Backlog, Graph): the URL side of a page's view
 * state. The parsing and building are the pure functions in ticketViewUrl;
 * this hook only binds them to the current URL and the router.
 */
export function useTicketViewUrl(
  { sessionUserId, groupByValues }: UseTicketViewUrlOptions = {},
): UseTicketViewUrlResult {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  const urlView = useMemo(
    () => parseTicketViewParams(new URLSearchParams(query), { sessionUserId, groupByValues }),
    [query, sessionUserId, groupByValues],
  );

  const go = useCallback(
    (params: URLSearchParams) => {
      const qs = ticketViewQueryString(params);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const replaceView = useCallback(
    (state: TicketViewState) => go(buildTicketViewParams(state, new URLSearchParams(query))),
    [go, query],
  );

  const exitView = useCallback(
    () => go(withoutTicketViewParams(new URLSearchParams(query))),
    [go, query],
  );

  const copyViewLink = useCallback(
    (state: TicketViewState) => {
      // A link carries the view only: an open peek drawer is the sender's.
      const qs = ticketViewQueryString(buildTicketViewParams(state));
      const url = `${window.location.origin}${pathname}${qs ? `?${qs}` : ""}`;
      navigator.clipboard.writeText(url).then(
        () =>
          notifications.show({
            title: "Link copied",
            message: "Anyone in this workspace who opens it sees this view.",
            color: "green",
          }),
        () =>
          notifications.show({
            title: "Couldn't copy the link",
            message: "Your browser blocked clipboard access.",
            color: "red",
          }),
      );
    },
    [pathname],
  );

  return { urlView, replaceView, exitView, copyViewLink };
}
