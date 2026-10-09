"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal, TextInput, Kbd, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { IconSearch, IconFileText, IconArrowRight } from "@tabler/icons-react";
import Fuse from "fuse.js";
import type { DocSearchEntry } from "~/lib/docs/types";
import { useDocsNav } from "./DocsNavProvider";

const MAX_RESULTS = 8;

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

/**
 * Client-side search over the static index built in the docs layout
 * (title, description, section, headings, first paragraph). Opens with `/`
 * or from the sidebar and mobile bar buttons.
 */
export function DocsSearch() {
  const router = useRouter();
  const { searchIndex, isSearchOpen, openSearch, closeSearch } = useDocsNav();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const fuse = useMemo(
    () =>
      new Fuse<DocSearchEntry>(searchIndex, {
        includeMatches: false,
        threshold: 0.35,
        ignoreLocation: true,
        minMatchCharLength: 2,
        keys: [
          { name: "title", weight: 0.45 },
          { name: "headings", weight: 0.25 },
          { name: "description", weight: 0.15 },
          { name: "excerpt", weight: 0.1 },
          { name: "section", weight: 0.05 },
        ],
      }),
    [searchIndex],
  );

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return searchIndex.slice(0, MAX_RESULTS);
    return fuse.search(q, { limit: MAX_RESULTS }).map((r) => r.item);
  }, [query, fuse, searchIndex]);

  useEffect(() => {
    setSelected(0);
  }, [results]);

  useEffect(() => {
    if (!isSearchOpen) setQuery("");
  }, [isSearchOpen]);

  useHotkeys([
    [
      "/",
      (e) => {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        openSearch();
      },
    ],
  ]);

  const go = (entry: DocSearchEntry | undefined) => {
    if (!entry) return;
    closeSearch();
    router.push(entry.href);
  };

  return (
    <Modal
      opened={isSearchOpen}
      onClose={closeSearch}
      withCloseButton={false}
      size="lg"
      padding={0}
      radius="md"
      yOffset="10vh"
      zIndex={400}
      aria-label="Search the docs"
    >
      <div className="border-b border-border-primary p-3">
        <TextInput
          ref={inputRef}
          data-autofocus
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search the docs…"
          leftSection={<IconSearch size={16} />}
          rightSection={<Kbd size="xs">esc</Kbd>}
          rightSectionWidth={44}
          variant="unstyled"
          size="md"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              go(results[selected]);
            }
          }}
        />
      </div>

      <ul role="listbox" aria-label="Search results" className="max-h-[60vh] overflow-y-auto p-2">
        {results.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-text-muted">
            No pages match &ldquo;{query}&rdquo;.
          </li>
        )}
        {results.map((entry, i) => (
          <li key={entry.href} role="option" aria-selected={i === selected}>
            <button
              type="button"
              onMouseEnter={() => setSelected(i)}
              onClick={() => go(entry)}
              className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                i === selected ? "bg-surface-secondary" : "hover:bg-surface-hover"
              }`}
            >
              <IconFileText size={18} className="mt-0.5 shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <Text size="sm" fw={500} className="truncate text-text-primary">
                    {entry.title}
                  </Text>
                  {entry.section && (
                    <Text size="xs" className="shrink-0 text-text-muted">
                      {entry.section}
                    </Text>
                  )}
                </div>
                {entry.description && (
                  <Text size="xs" className="line-clamp-1 text-text-secondary">
                    {entry.description}
                  </Text>
                )}
              </div>
              {i === selected && <IconArrowRight size={16} className="mt-1 shrink-0 text-text-muted" />}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
