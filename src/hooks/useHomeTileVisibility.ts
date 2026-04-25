"use client";

import { useState, useCallback } from "react";
import { startOfDay } from "date-fns";

const STORAGE_PREFIX = "home-tile";

function getTodayKey(): string {
  return startOfDay(new Date()).toISOString().split("T")[0] ?? "";
}

function getStorageValue(
  tileId: string,
  type: "dismissed" | "visited",
): boolean {
  if (typeof window === "undefined") return false;
  const key = `${STORAGE_PREFIX}-${type}-${tileId}`;
  return localStorage.getItem(key) === getTodayKey();
}

function setStorageValue(
  tileId: string,
  type: "dismissed" | "visited",
): void {
  const key = `${STORAGE_PREFIX}-${type}-${tileId}`;
  localStorage.setItem(key, getTodayKey());
}

interface UseHomeTileVisibilityReturn {
  isHidden: boolean;
  dismiss: (e: React.MouseEvent) => void;
  markVisited: () => void;
}

export function useHomeTileVisibility(
  tileId: string,
): UseHomeTileVisibilityReturn {
  const [dismissed, setDismissed] = useState(() =>
    getStorageValue(tileId, "dismissed"),
  );
  const [visited, setVisited] = useState(() =>
    getStorageValue(tileId, "visited"),
  );

  const dismiss = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setStorageValue(tileId, "dismissed");
      setDismissed(true);
    },
    [tileId],
  );

  const markVisited = useCallback(() => {
    setStorageValue(tileId, "visited");
    setVisited(true);
  }, [tileId]);

  return {
    isHidden: dismissed || visited,
    dismiss,
    markVisited,
  };
}
