"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Alert, SegmentedControl, Skeleton, Text, TextInput } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconBook2,
  IconFolder,
  IconNotebook,
  IconSearch,
} from "@tabler/icons-react";

import { LocalWikiFirstRun } from "~/app/_components/LocalWikiFirstRun";
import type { SearchHit, WikiCommit, WikiPage, WikiStatus } from "~/lib/localWiki";
import { reportHandledError } from "~/lib/reportHandledError";
import { pageFolder, pageTitle, wikiHref } from "~/lib/wiki/wikiLinks";
import { useRefreshOnWikiChange, useWikiBridge } from "~/lib/wiki/useWikiBridge";
import { WikiCommitList } from "./WikiCommitList";

/**
 * The three fixed files `schema.md` names — the wiki's spine. They sort first
 * because they're where a reader starts, not because of their filenames.
 */
const SPINE = ["index.md", "schema.md", "log.md"];

interface Group {
  folder: string | null;
  pages: WikiPage[];
}

function groupPages(pages: WikiPage[]): Group[] {
  const byFolder = new Map<string | null, WikiPage[]>();
  for (const page of pages) {
    const folder = pageFolder(page.path);
    const bucket = byFolder.get(folder);
    if (bucket) bucket.push(page);
    else byFolder.set(folder, [page]);
  }

  const root = (byFolder.get(null) ?? []).slice().sort((a, b) => {
    const ai = SPINE.indexOf(a.path);
    const bi = SPINE.indexOf(b.path);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? SPINE.length : ai) - (bi === -1 ? SPINE.length : bi);
    return a.path.localeCompare(b.path);
  });

  const folders = [...byFolder.keys()]
    .filter((f): f is string => f !== null)
    .sort((a, b) => a.localeCompare(b))
    .map((folder) => ({ folder, pages: byFolder.get(folder) ?? [] }));

  return root.length > 0 ? [{ folder: null, pages: root }, ...folders] : folders;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} kB`;
}

/**
 * Above this many pages we stop reading every file just to title the list, and
 * fall back to filenames. A personal wiki is small by design — `schema.md`
 * banks on that, and so does search being plain grep — so this is a guard
 * against a pathological folder, not an expected path.
 */
const TITLE_READ_LIMIT = 300;

/** Commits in the "Recent changes" view — a session's worth, not the whole log. */
const RECENT_CHANGES_LIMIT = 30;

function PageRow({ page, title }: { page: WikiPage; title?: string }) {
  return (
    <Link
      href={wikiHref(page.path)}
      className="group flex items-center justify-between gap-4 rounded-[10px] border border-border-primary bg-background-secondary px-[18px] py-3 transition-colors hover:border-border-focus hover:bg-surface-hover"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <IconNotebook size={15} className="shrink-0 text-text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <Text className="truncate text-[14.5px] font-semibold text-text-primary">
            {title ?? pageTitle(page.path)}
          </Text>
          <Text className="truncate font-mono text-xs text-text-muted">{page.path}</Text>
        </div>
      </div>
      <Text className="shrink-0 text-xs text-text-muted">{formatBytes(page.bytes)}</Text>
    </Link>
  );
}

function SearchResults({
  hits,
  titles,
}: {
  hits: SearchHit[];
  titles: ReadonlyMap<string, string>;
}) {
  if (hits.length === 0) {
    return (
      <div className="rounded-[10px] border border-border-primary bg-background-secondary px-6 py-12 text-center">
        <Text className="text-text-secondary">Nothing in the wiki matches that.</Text>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {hits.map((hit) => (
        <Link
          key={hit.path}
          href={wikiHref(hit.path)}
          className="flex flex-col gap-1 rounded-[10px] border border-border-primary bg-background-secondary px-[18px] py-3 transition-colors hover:border-border-focus hover:bg-surface-hover"
        >
          <div className="flex items-center gap-2">
            <IconNotebook size={15} className="shrink-0 text-text-muted" aria-hidden />
            <Text className="truncate text-[14.5px] font-semibold text-text-primary">
              {titles.get(hit.path) ?? pageTitle(hit.path)}
            </Text>
            {hit.pathMatched ? (
              <Text className="shrink-0 text-xs text-text-muted">name matches</Text>
            ) : null}
          </div>
          {hit.lines.length > 0 ? (
            <div className="flex flex-col gap-0.5 pl-[23px]">
              {hit.lines.map((line, i) => (
                <Text key={i} className="truncate font-mono text-xs text-text-secondary">
                  {line}
                </Text>
              ))}
            </div>
          ) : null}
        </Link>
      ))}
    </div>
  );
}

/**
 * Everything the librarian has filed on this machine.
 *
 * Reads the wiki straight off disk through the Tauri bridge — no tRPC, no
 * server round trip, because the wiki is device-local by construction and
 * nothing in it should reach Exponential's servers.
 *
 * Search goes to the shell's `wiki_search` (real grep over the files) rather
 * than filtering titles in the browser: the wiki's contents are what you want
 * to search, and the pages aren't loaded here.
 */
export function WikiListContent() {
  const { bridge, ready } = useWikiBridge();

  const [status, setStatus] = useState<WikiStatus | null>(null);
  const [pages, setPages] = useState<WikiPage[] | null>(null);
  /** Page path → its own heading, filled in after the list paints. */
  const [titles, setTitles] = useState<ReadonlyMap<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 200);
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const [view, setView] = useState<"pages" | "changes">("pages");
  const [changes, setChanges] = useState<WikiCommit[] | null>(null);

  const load = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.status();
      setStatus(next);
      const list = next.exists ? await bridge.listPages() : [];
      setPages(list);
      setChanges(next.exists ? await bridge.recentChanges(RECENT_CHANGES_LIMIT) : []);
      setError(null);

      // Title each page by its own `# Heading` — what the librarian actually
      // writes, and far more readable than a filename. `list_pages` doesn't
      // carry it, so it costs one read per page; the list is already on screen
      // by then, and the filenames stand in until these land.
      if (list.length > 0 && list.length <= TITLE_READ_LIMIT) {
        const resolved = await Promise.all(
          list.map(async (page) => {
            try {
              return [page.path, pageTitle(page.path, await bridge.readPage(page.path))] as const;
            } catch {
              // One unreadable page shouldn't cost the whole list its titles.
              return [page.path, pageTitle(page.path)] as const;
            }
          }),
        );
        setTitles(new Map(resolved));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reportHandledError(e, { area: "local-wiki-list" });
    }
  }, [bridge]);

  useEffect(() => {
    void load();
  }, [load]);

  // The librarian writes these same files from the chat drawer: re-read when
  // the shell says the folder changed, and on focus for the changes it can't
  // see (the user's own editor, a git pull).
  useRefreshOnWikiChange(bridge, useCallback(() => void load(), [load]));

  useEffect(() => {
    const query = debouncedSearch.trim();
    if (!bridge || !query) {
      setHits(null);
      return;
    }
    let cancelled = false;
    bridge
      .search(query)
      .then((found) => {
        if (!cancelled) setHits(found);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        reportHandledError(e, { area: "local-wiki-search" });
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, debouncedSearch]);

  const groups = useMemo(() => groupPages(pages ?? []), [pages]);

  if (!ready) {
    return (
      <div className="w-full px-6 py-8">
        <Skeleton height={40} width={220} mb="lg" />
        <Skeleton height={280} />
      </div>
    );
  }

  // The wiki is a folder on this machine reached over the shell's IPC. In a
  // browser there is no such folder, and pretending otherwise would be worse
  // than saying so.
  if (!bridge) {
    return (
      <div className="w-full px-6 py-8">
        <div className="mx-auto max-w-md rounded-[10px] border border-border-primary bg-background-secondary px-6 py-12 text-center">
          <IconBook2 size={28} className="mx-auto text-text-muted" aria-hidden />
          <Text className="mt-3 font-semibold text-text-primary">
            The local wiki lives on your machine
          </Text>
          <Text className="mt-2 text-sm text-text-secondary">
            It&apos;s a folder of markdown files the librarian keeps, so it&apos;s only
            reachable from the desktop app.
          </Text>
        </div>
      </div>
    );
  }

  if (status && !status.exists) {
    return <LocalWikiFirstRun status={status} onCreate={async () => {
      await bridge.init();
      await load();
    }} />;
  }

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-1 flex items-center gap-2">
        <IconBook2 size={22} className="text-text-secondary" aria-hidden />
        <Text component="h1" size="xl" fw={700} className="text-text-primary">
          Local wiki
        </Text>
      </div>
      {status ? (
        <Text className="mb-5 break-all font-mono text-xs text-text-muted">
          {status.root}
          {status.git ? "" : " — no git history (git was unavailable)"}
        </Text>
      ) : null}

      <SegmentedControl
        value={view}
        onChange={(next) => setView(next === "changes" ? "changes" : "pages")}
        data={[
          { value: "pages", label: "Pages" },
          { value: "changes", label: "Recent changes" },
        ]}
        size="xs"
        mb="md"
      />

      {view === "pages" ? (
        <TextInput
          leftSection={<IconSearch size={14} />}
          placeholder="Search the wiki…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          size="sm"
          mb="md"
          className="max-w-sm"
        />
      ) : null}

      {error ? (
        <Alert color="red" mb="md" title="Couldn't read the wiki">
          {error}
        </Alert>
      ) : null}

      {view === "changes" ? (
        changes === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton height={56} />
            <Skeleton height={56} />
          </div>
        ) : (
          <WikiCommitList
            commits={changes}
            showPaths
            emptyMessage={
              status && !status.git
                ? "This wiki isn't a git repository, so there's no history to show."
                : "Nothing committed yet. Every writing turn lands here as one commit."
            }
          />
        )
      ) : hits !== null ? (
        <SearchResults hits={hits} titles={titles} />
      ) : pages === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton height={56} />
          <Skeleton height={56} />
          <Skeleton height={56} />
        </div>
      ) : pages.length === 0 ? (
        <div className="rounded-[10px] border border-border-primary bg-background-secondary px-6 py-12 text-center">
          <Text className="text-text-secondary">
            Nothing filed yet. Ask the librarian something worth remembering.
          </Text>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <div key={group.folder ?? "__root"} className="flex flex-col gap-2">
              {group.folder ? (
                <div className="flex items-center gap-1.5">
                  <IconFolder size={14} className="text-text-muted" aria-hidden />
                  <Text className="font-mono text-xs text-text-muted">{group.folder}</Text>
                </div>
              ) : null}
              {group.pages.map((page) => (
                <PageRow key={page.path} page={page} title={titles.get(page.path)} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
