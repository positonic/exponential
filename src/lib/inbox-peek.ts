/**
 * What the inbox can open in its peek drawer, read from a row's full-page
 * href. The href itself is the `?peek=` value, so a reload, Back or a shared
 * link reopens the same item, and a notification's deeplink peeks with no
 * extra data. Anything that isn't one of these routes opens as a page.
 */
export type InboxPeekTarget =
  | { kind: "action"; workspaceSlug: string; id: string }
  | { kind: "ticket"; workspaceSlug: string; productSlug: string; ref: string }
  | { kind: "decision"; workspaceSlug: string; id: string }
  | { kind: "meeting"; id: string };

const SEGMENT = "([^/?#]+)";
const TAIL = "/?(?:[?#].*)?$";

const ROUTES: Array<[RegExp, (m: string[]) => InboxPeekTarget]> = [
  [
    new RegExp(`^/w/${SEGMENT}/actions/${SEGMENT}${TAIL}`),
    ([, workspaceSlug, id]) => ({ kind: "action", workspaceSlug: workspaceSlug!, id: id! }),
  ],
  [
    new RegExp(`^/w/${SEGMENT}/products/${SEGMENT}/tickets/${SEGMENT}${TAIL}`),
    ([, workspaceSlug, productSlug, ref]) => ({
      kind: "ticket",
      workspaceSlug: workspaceSlug!,
      productSlug: productSlug!,
      ref: ref!,
    }),
  ],
  [
    new RegExp(`^/w/${SEGMENT}/decisions/d/${SEGMENT}${TAIL}`),
    ([, workspaceSlug, id]) => ({ kind: "decision", workspaceSlug: workspaceSlug!, id: id! }),
  ],
  [new RegExp(`^/recording/${SEGMENT}${TAIL}`), ([, id]) => ({ kind: "meeting", id: id! })],
];

export function parseInboxPeekHref(href: string | null | undefined): InboxPeekTarget | null {
  if (!href) return null;
  for (const [pattern, build] of ROUTES) {
    const match = pattern.exec(href);
    if (match) return build(match);
  }
  return null;
}
