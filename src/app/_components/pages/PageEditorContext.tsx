"use client";

import { createContext, useContext } from "react";

/**
 * What a node view inside a Page body needs to know about its host page
 * (ADR-0078). Node views are rendered by Tiptap outside the page's React
 * tree, so they can reach `useWorkspace()` but not the page id or whether
 * the page is editable; `PageDocument` provides this around the editor.
 * Null in other `RichDocEditor` hosts (Feature, Ticket, Insight bodies),
 * where a database block never occurs but the node is in the schema.
 */
export interface PageEditorContextValue {
  pageId: string;
  workspaceId: string;
  workspaceSlug: string;
  editable: boolean;
}

const PageEditorContext = createContext<PageEditorContextValue | null>(null);

export const PageEditorProvider = PageEditorContext.Provider;

export function usePageEditorContext(): PageEditorContextValue | null {
  return useContext(PageEditorContext);
}
