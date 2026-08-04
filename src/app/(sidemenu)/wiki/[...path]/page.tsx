"use client";

import { useParams } from "next/navigation";

import { segmentsToPath } from "~/lib/wiki/wikiLinks";
import { WikiPageView } from "../_components/WikiPageView";

/**
 * One wiki page, addressed by its path without the extension — `/wiki/people/ada`
 * is `people/ada.md`. That's the same handle `[[people/ada]]` uses, so a link in
 * the prose and a link in the URL bar mean the same thing.
 */
export default function LocalWikiPageRoute() {
  const params = useParams<{ path?: string[] }>();
  const path = segmentsToPath(params?.path);

  if (!path) return null;

  return (
    <main className="flex h-full flex-col text-text-primary">
      <WikiPageView path={path} />
    </main>
  );
}
