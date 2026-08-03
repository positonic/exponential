"use client";

import { useState } from "react";

import type { WikiStatus } from "~/lib/localWiki";

/**
 * What you see when you pick the Local wiki librarian and don't have a wiki yet.
 *
 * It exists because the wiki used to appear as a side effect of asking a
 * question — `wiki_init` ran at the start of every turn, so a folder and a git
 * repo materialised in your Documents because you typed something. Creating
 * files on someone's machine should be a decision they made, so this names the
 * path and waits.
 *
 * It is also the only thing that tells you what the librarian *is* before you
 * talk to it.
 */
export function LocalWikiFirstRun({
  status,
  onCreate,
}: {
  status: WikiStatus;
  onCreate: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      await onCreate();
    } catch (e) {
      // Most likely an unwritable folder. Show what actually went wrong rather
      // than a spinner that never resolves.
      setError(e instanceof Error ? e.message : String(e));
      setCreating(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h2 className="text-lg font-medium text-text-primary">Create your local wiki</h2>

        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          A folder of markdown files, versioned with git, that the librarian reads and
          writes on this machine. Ask it things and it answers from what it has filed;
          tell it something worth keeping and it writes it down.
        </p>

        <p className="mt-3 text-sm leading-relaxed text-text-secondary">
          Nothing in it is sent to Exponential&apos;s servers — only your messages and
          whatever the librarian quotes back reach the model.
        </p>

        <p className="mt-4 break-all font-mono text-xs text-text-muted">{status.root}</p>

        <button
          type="button"
          onClick={() => void create()}
          disabled={creating}
          className="mt-6 rounded-md bg-brand-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {creating ? "Creating…" : "Create wiki"}
        </button>

        {error && (
          <p className="mt-4 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
