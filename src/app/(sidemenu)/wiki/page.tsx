import { WikiListContent } from "./_components/WikiListContent";

/**
 * The local wiki index.
 *
 * Deliberately NOT under `/w/[workspaceSlug]` — the wiki is a folder on this
 * device, with no workspace, no members and no sharing. Nesting it under a
 * workspace slug would imply an ownership that doesn't exist, and it would
 * inherit workspace-membership gating that means nothing for a local folder.
 */
export default function LocalWikiPage() {
  return (
    <main className="flex h-full flex-col text-text-primary">
      <WikiListContent />
    </main>
  );
}
