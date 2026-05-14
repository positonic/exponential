"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { HOUR_HEIGHT } from "./types";

/**
 * Generic edge-drag resize wrapper for a calendar time block. Adds 6px-tall
 * invisible drag handles to the top and bottom edges. Pointer events on the
 * handles do NOT bubble up to dnd-kit's `useDraggable` listeners (which would
 * otherwise interpret edge-drag as a move) — we call
 * `e.stopPropagation()` at pointer-down on the handle.
 *
 * The pointer is captured to the handle element so the user can leave the
 * block while resizing without losing the drag. We snap final start/end to
 * 15-minute boundaries (matching the move grid).
 *
 * Caller supplies `startedAt` / `endedAt` (absolute datetimes) and an
 * `onCommit` callback that fires once on pointer-up with the new range.
 * `endedAt: null` (running entries) is accepted on input but the resize
 * commits a concrete endedAt; callers may choose to preserve null for the
 * top-edge case.
 */
const SNAP_MINUTES = 15;
const SNAP_PX = (HOUR_HEIGHT / 60) * SNAP_MINUTES;
const MIN_HEIGHT_PX = SNAP_PX; // never shrink smaller than one slot

export type ResizeEdge = "top" | "bottom";

interface ResizableBlockProps {
  startedAt: Date;
  /** Pass `null` for running entries. Top-resize is disabled for these. */
  endedAt: Date | null;
  /**
   * Commit handler invoked once on pointer-up with the new range. `null`
   * endedAt is only emitted when caller flags it via `allowOpenEnd`.
   */
  onCommit: (newStart: Date, newEnd: Date) => void;
  /** Disable interactions while the parent is mid-mutation. */
  disabled?: boolean;
  children: React.ReactNode;
}

export function ResizableBlock({
  startedAt,
  endedAt,
  onCommit,
  disabled,
  children,
}: ResizableBlockProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<{
    edge: ResizeEdge;
    pointerId: number;
    originY: number;
    originalStart: Date;
    originalEnd: Date | null;
  } | null>(null);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!drag) return;
      // Live preview is implicit via the parent re-render after onCommit, but
      // we don't need to drive the layout here — we just track pointer delta
      // and apply it on pointer-up. (Optimistic preview during drag is left to
      // a future slice; this keeps drag math centralised.)
      void e;
    },
    [drag],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!drag) return;
      try {
        (e.target as Element | null)?.releasePointerCapture(drag.pointerId);
      } catch {
        // ignore
      }
      const dy = e.clientY - drag.originY;
      // Snap dy to nearest SNAP_PX
      const snappedDy = Math.round(dy / SNAP_PX) * SNAP_PX;
      const deltaMs = (snappedDy / HOUR_HEIGHT) * 60 * 60_000;

      if (drag.edge === "bottom") {
        // Resize end: new endedAt = original endedAt + delta (or start + delta for running)
        const base =
          drag.originalEnd?.getTime() ??
          drag.originalStart.getTime() + 30 * 60_000;
        let newEndMs = base + deltaMs;
        const minEnd = drag.originalStart.getTime() + MIN_HEIGHT_PX * (60_000 / HOUR_HEIGHT) * 60;
        if (newEndMs < minEnd) newEndMs = minEnd;
        onCommit(drag.originalStart, new Date(newEndMs));
      } else {
        // top edge: resize start. Don't allow start ≥ end.
        const end =
          drag.originalEnd ??
          new Date(drag.originalStart.getTime() + 30 * 60_000);
        let newStartMs = drag.originalStart.getTime() + deltaMs;
        const maxStart = end.getTime() - MIN_HEIGHT_PX * (60_000 / HOUR_HEIGHT) * 60;
        if (newStartMs > maxStart) newStartMs = maxStart;
        onCommit(new Date(newStartMs), end);
      }

      setDrag(null);
    },
    [drag, onCommit],
  );

  useEffect(() => {
    if (!drag) return;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [drag, handlePointerMove, handlePointerUp]);

  const beginDrag = (edge: ResizeEdge) => (e: React.PointerEvent) => {
    if (disabled) return;
    if (edge === "top" && !endedAt) return; // running entries: top-edge disabled
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDrag({
      edge,
      pointerId: e.pointerId,
      originY: e.clientY,
      originalStart: new Date(startedAt),
      originalEnd: endedAt ? new Date(endedAt) : null,
    });
  };

  return (
    <div ref={rootRef} className="relative h-full w-full">
      {/* Top edge handle — disabled when no endedAt (running entries can only extend forward) */}
      <div
        onPointerDown={beginDrag("top")}
        className="absolute left-0 right-0 top-0 z-30"
        style={{
          height: 6,
          cursor: !endedAt || disabled ? "default" : "ns-resize",
          touchAction: "none",
          pointerEvents: !endedAt || disabled ? "none" : "auto",
        }}
        aria-hidden
      />
      {children}
      <div
        onPointerDown={beginDrag("bottom")}
        className="absolute bottom-0 left-0 right-0 z-30"
        style={{
          height: 6,
          cursor: disabled ? "default" : "ns-resize",
          touchAction: "none",
          pointerEvents: disabled ? "none" : "auto",
        }}
        aria-hidden
      />
    </div>
  );
}
