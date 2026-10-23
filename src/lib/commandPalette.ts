/**
 * Opens the global command palette (⌘K) from anywhere in the app shell.
 *
 * The palette is mounted once at the root layout and owns its own open state,
 * so callers that live elsewhere in the tree — the sidebar's search row — reach
 * it through a window event rather than a context they would have to be
 * nested under. Keep this to the one event; the palette is the only listener.
 */
export const COMMAND_PALETTE_OPEN_EVENT = 'exponential:command-palette:open';

export function openCommandPalette(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
}

/** Subscribes `onOpen` to the open event; returns the unsubscribe. */
export function onCommandPaletteOpen(onOpen: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
  return () => window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpen);
}
