"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, Button, Group, Skeleton, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconDeviceFloppy, IconPencil } from "@tabler/icons-react";
import type { PluggableList } from "unified";

import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import type { WikiCommit } from "~/lib/localWiki";
import { reportHandledError } from "~/lib/reportHandledError";
import { pageTitle, remarkWikiLinks, WIKI_ROUTE } from "~/lib/wiki/wikiLinks";
import { useRefreshOnWikiChange, useWikiBridge } from "~/lib/wiki/useWikiBridge";
import { WikiCommitList } from "./WikiCommitList";
import { WikiPageActions } from "./WikiPageActions";
import styles from "./wiki.module.css";

/** Commits shown under a page. Enough to see how it got here, not a full log. */
const PAGE_HISTORY_LIMIT = 10;

/** What a page that doesn't exist yet starts as, once you choose to write it. */
function seedFor(path: string): string {
  return `# ${pageTitle(path)}\n\n`;
}

/**
 * One page of the local wiki: read it, or edit its Markdown.
 *
 * **Editing is raw Markdown on purpose.** The obvious move was to reuse
 * `RichDocEditor`, which already reads Markdown in and writes Markdown out. It
 * does not survive contact with this content: round-tripping through the
 * ProseMirror schema escapes `[[wikilinks]]` into `\[\[wikilinks\]\]` — killing
 * the wiki's entire navigation model — reflows hard-wrapped paragraphs onto one
 * line, and rewrites `_emphasis_` as `*emphasis*`. In a git-versioned folder
 * that an agent also writes to, that turns every save into an unreadable diff
 * and breaks links the librarian relies on. The file on disk is canonical here,
 * so what you edit is the file, byte for byte.
 */
export function WikiPageView({ path }: { path: string }) {
  const router = useRouter();
  const { bridge, ready } = useWikiBridge();

  const [content, setContent] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [knownPaths, setKnownPaths] = useState<ReadonlySet<string>>(new Set());
  const [history, setHistory] = useState<WikiCommit[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** What was last read from (or written to) disk — the base for a stale check. */
  const baseline = useRef<string | null>(null);
  const editing = draft !== null;

  const load = useCallback(async () => {
    if (!bridge) return;
    try {
      const pages = await bridge.listPages();
      setKnownPaths(new Set(pages.map((p) => p.path)));

      // Read separately from the page itself: a page can have history it no
      // longer has content for (deleted, or renamed away), and one failing
      // must not blank the other.
      bridge
        .pageHistory(path, PAGE_HISTORY_LIMIT)
        .then(setHistory)
        .catch((e: unknown) => {
          setHistory([]);
          reportHandledError(e, { area: "local-wiki-page-history" });
        });

      if (!pages.some((p) => p.path === path)) {
        setMissing(true);
        setContent(null);
        setError(null);
        baseline.current = null;
        return;
      }

      const text = await bridge.readPage(path);
      setMissing(false);
      setContent(text);
      baseline.current = text;
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      reportHandledError(e, { area: "local-wiki-page", context: { path } });
    }
  }, [bridge, path]);

  useEffect(() => {
    void load();
  }, [load]);

  // Don't clobber an open draft with what the librarian just wrote; only
  // refresh the read view.
  useRefreshOnWikiChange(
    bridge,
    useCallback(() => {
      if (draft === null) void load();
    }, [draft, load]),
  );

  const write = useCallback(
    async (next: string) => {
      if (!bridge) return;
      setSaving(true);
      try {
        await bridge.writePage(path, next);
        // Same door the librarian uses, so `git log` stays the one record of
        // what changed — including anything else left uncommitted, since
        // `wiki_commit_turn` stages the whole tree by design.
        await bridge.commitTurn(`Edit ${path}`);
        baseline.current = next;
        setContent(next);
        setMissing(false);
        setDraft(null);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        reportHandledError(e, { area: "local-wiki-write", context: { path } });
        notifications.show({
          color: "red",
          title: "Couldn't save",
          message: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setSaving(false);
      }
    },
    [bridge, path],
  );

  const save = useCallback(async () => {
    if (!bridge || draft === null) return;

    // The librarian may have written this page while it was open. Re-read
    // before overwriting, and let the reader decide — losing an agent's edit
    // silently is exactly the failure a git-backed wiki should never have.
    let onDisk: string | null = null;
    try {
      onDisk = await bridge.readPage(path);
    } catch {
      onDisk = null; // Not there — a new page. Nothing to clobber.
    }

    if (onDisk !== null && baseline.current !== null && onDisk !== baseline.current) {
      modals.openConfirmModal({
        title: "This page changed on disk",
        children: (
          <Text size="sm">
            The librarian (or something else) wrote to {path} while you were editing.
            Saving now replaces what&apos;s there. Your version is still in the editor
            if you&apos;d rather merge it by hand.
          </Text>
        ),
        labels: { confirm: "Overwrite", cancel: "Keep what's on disk" },
        confirmProps: { color: "red" },
        onConfirm: () => void write(draft),
      });
      return;
    }

    await write(draft);
  }, [bridge, draft, path, write]);

  /**
   * Keep wikilink navigation inside the app. The shared renderer emits plain
   * anchors, and letting one through would reload the whole web app inside the
   * shell.
   */
  const onBodyClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      const anchor = (e.target as HTMLElement).closest("a");
      const href = anchor?.getAttribute("href");
      if (!href?.startsWith(`${WIKI_ROUTE}/`)) return;
      e.preventDefault();
      router.push(href);
    },
    [router],
  );

  const remarkPlugins = useMemo<PluggableList>(
    () => [[remarkWikiLinks, knownPaths]],
    [knownPaths],
  );

  if (!ready || (bridge && content === null && !missing && !error)) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <Skeleton height={32} width={280} mb="xl" />
        <Skeleton height={360} />
      </div>
    );
  }

  if (!bridge) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <Text className="text-text-secondary">
          The local wiki is only reachable from the desktop app.
        </Text>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        href={WIKI_ROUTE}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text-primary"
      >
        <IconArrowLeft size={14} aria-hidden />
        Local wiki
      </Link>

      <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
        {/* The file's own `# Heading` is the page's title and renders below, so
            the header carries the thing the document can't tell you: which file
            this is. Repeating the heading here would just say it twice. */}
        <Text className="min-w-0 truncate font-mono text-sm text-text-secondary">{path}</Text>

        {missing && !editing ? null : editing ? (
          <Group gap="xs" wrap="nowrap">
            <Button variant="subtle" color="gray" onClick={() => setDraft(null)} disabled={saving}>
              Cancel
            </Button>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              onClick={() => void save()}
              loading={saving}
            >
              Save
            </Button>
          </Group>
        ) : (
          <Group gap="xs" wrap="nowrap">
            <Button
              variant="default"
              leftSection={<IconPencil size={16} />}
              onClick={() => setDraft(content ?? "")}
            >
              Edit
            </Button>
            <WikiPageActions bridge={bridge} path={path} onChanged={() => void load()} />
          </Group>
        )}
      </Group>

      {error ? (
        <Alert color="red" mb="md" title="Something went wrong">
          {error}
        </Alert>
      ) : null}

      {missing && !editing ? (
        <div className="rounded-[10px] border border-border-primary bg-background-secondary px-6 py-12 text-center">
          <Text className="font-semibold text-text-primary">
            Nobody has written this page yet
          </Text>
          <Text className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
            A link to a page that doesn&apos;t exist is how the wiki marks something
            worth writing down.
          </Text>
          <Button className="mt-6" onClick={() => setDraft(seedFor(path))}>
            Write it
          </Button>
        </div>
      ) : editing ? (
        <div
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        >
          <MarkdownInput
            value={draft}
            onChange={(value) => setDraft(value)}
            minRows={20}
            maxRows={60}
            placeholder="Markdown. [[wikilinks]] point at other pages."
            hint={
              <Text className="text-xs text-text-muted">
                Saved to {path} and committed to the wiki&apos;s git history. ⌘↵ to save.
              </Text>
            }
          />
        </div>
      ) : (
        <div className={styles.body} onClick={onBodyClick}>
          <MarkdownRenderer
            content={content ?? ""}
            variant="prose"
            extraRemarkPlugins={remarkPlugins}
          />
        </div>
      )}

      {/* Hidden while editing: the draft is the subject then, not the past.
          Absent when there is no history at all, so a wiki without git — or a
          page written but not yet committed — shows nothing rather than an
          empty box asking to be explained. */}
      {!editing && history.length > 0 ? (
        <div className="mt-10 border-t border-border-primary pt-6">
          <Text className="mb-3 text-sm font-semibold text-text-secondary">History</Text>
          <WikiCommitList commits={history} emptyMessage="No commits touch this page yet." />
        </div>
      ) : null}
    </div>
  );
}
