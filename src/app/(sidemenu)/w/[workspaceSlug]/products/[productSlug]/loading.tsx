import { Skeleton, Stack } from "@mantine/core";

/**
 * Instant loading fallback for product tab navigation. Without this Suspense
 * boundary, clicking a tab leaves the previous tab on screen with no feedback
 * until the new route's JS + data resolve — which reads as an unresponsive
 * "nothing happened" click. This renders immediately on every tab switch.
 *
 * The shared product layout (title + tab bar) stays mounted; only this content
 * area is replaced, so the tabs remain interactive while the page streams in.
 */
export default function ProductTabLoading() {
  return (
    <Stack gap="md" aria-busy="true">
      <Skeleton height={36} width={240} radius="sm" />
      <Skeleton height={110} radius="md" />
      <Skeleton height={110} radius="md" />
      <Skeleton height={110} radius="md" />
    </Stack>
  );
}
