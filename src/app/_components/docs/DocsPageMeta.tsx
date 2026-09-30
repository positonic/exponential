import { IconBrandGithub, IconClock } from "@tabler/icons-react";

interface DocsPageMetaProps {
  /** ISO date, or null when git could not say. */
  lastUpdated: string | null;
  editUrl: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
}

/** "Last updated" and "Edit this page on GitHub", shown under every page. */
export function DocsPageMeta({ lastUpdated, editUrl }: DocsPageMetaProps) {
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border-primary pt-4 text-xs text-text-muted">
      <span className="flex items-center gap-1.5">
        {lastUpdated ? (
          <>
            <IconClock size={14} />
            Last updated <time dateTime={lastUpdated}>{formatDate(lastUpdated)}</time>
          </>
        ) : null}
      </span>
      <a
        href={editUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 transition-colors hover:text-text-primary"
      >
        <IconBrandGithub size={14} />
        Edit this page on GitHub
      </a>
    </div>
  );
}
