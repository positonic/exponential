"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";

/**
 * Lets a product detail page (a ticket, a feature, a cycle) hand the name of
 * the entity it loaded up to ProductLayout, which owns the browser-tab title.
 * The page can't set `document.title` itself: the layout's effect runs after
 * its children's and would overwrite it.
 */

interface DetailTitle {
  ownerId: string;
  label: string;
}

interface DetailTitleRegistry {
  register: (ownerId: string, label: string) => void;
  unregister: (ownerId: string) => void;
}

const ProductDetailTitleContext = createContext<DetailTitleRegistry>({
  register: () => undefined,
  unregister: () => undefined,
});

/** Held by ProductLayout: the current detail label, and the registry to provide. */
export function useProductDetailTitleState() {
  const [detail, setDetail] = useState<DetailTitle | null>(null);

  const register = useCallback((ownerId: string, label: string) => {
    setDetail({ ownerId, label });
  }, []);
  // Clears only its own entry, so a page unmounting after the next one
  // registered can't wipe the newcomer's name.
  const unregister = useCallback((ownerId: string) => {
    setDetail((prev) => (prev?.ownerId === ownerId ? null : prev));
  }, []);

  const registry = useMemo(() => ({ register, unregister }), [register, unregister]);

  return { detailLabel: detail?.label ?? null, registry };
}

export function ProductDetailTitleProvider({
  registry,
  children,
}: {
  registry: DetailTitleRegistry;
  children: React.ReactNode;
}) {
  return (
    <ProductDetailTitleContext.Provider value={registry}>
      {children}
    </ProductDetailTitleContext.Provider>
  );
}

/**
 * Names the browser tab after this detail page's entity while it's mounted.
 * Pass null/undefined while it's loading; the tab shows the section's label
 * ("Backlog · CLEAR") until then.
 */
export function useProductDetailTitle(label: string | null | undefined) {
  const { register, unregister } = useContext(ProductDetailTitleContext);
  const ownerId = useId();
  const trimmed = label?.trim() ?? "";

  useEffect(() => {
    if (!trimmed) return;
    register(ownerId, trimmed);
    return () => unregister(ownerId);
  }, [ownerId, trimmed, register, unregister]);
}
