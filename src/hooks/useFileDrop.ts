"use client";

import { useCallback, useRef, useState } from "react";

function hasDraggedFiles(e: React.DragEvent) {
  return Array.from(e.dataTransfer.types).includes("Files");
}

export interface FileDropHandlers {
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

/**
 * Turn any element into a file drop target: spread `handlers` onto it, render
 * a drop hint while `isDragging`. Drags that carry no files (text, links) are
 * ignored so text fields inside the target keep their normal drag behaviour.
 */
export function useFileDrop(onFiles: (files: File[]) => void) {
  const [isDragging, setIsDragging] = useState(false);
  // dragenter/dragleave fire for every child the pointer crosses, so count
  // them rather than toggling — the hint only clears when the drag truly
  // leaves the target.
  const depth = useRef(0);

  const reset = useCallback(() => {
    depth.current = 0;
    setIsDragging(false);
  }, []);

  const onDragEnter = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    depth.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e)) return;
    // Required for the drop event to fire, and stops the browser from opening
    // the file when it's released over a text field.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!hasDraggedFiles(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setIsDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      if (!hasDraggedFiles(e)) return;
      e.preventDefault();
      reset();
      onFiles(Array.from(e.dataTransfer.files));
    },
    [onFiles, reset],
  );

  const handlers: FileDropHandlers = {
    onDragEnter,
    onDragOver,
    onDragLeave,
    onDrop,
  };

  return { isDragging, handlers, reset };
}
