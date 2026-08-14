/**
 * adrSync/linkDerivation — pure derivation of AdrLink edges from projected
 * document content. Derived, re-derivable, and recomputed on every sync run;
 * never user-authored (that's AdrTicketLink).
 *
 * - SUPERSEDES: from the superseded doc's verbatim `statusRaw` matching
 *   "superseded by [ADR-]NNNN", resolved by number WITHIN the same repo. The
 *   edge is normalised to point from the superseder to the superseded.
 * - MENTIONS: from a body scan for other enrolled repos' full names and
 *   `SHORTCODE-NNNN` references; each edge carries the matched line as
 *   evidence.
 */

export interface AdrDocForLinks {
  id: string;
  repositoryId: string;
  number: number | null;
  statusRaw: string | null;
  body: string;
}

export interface DerivedLink {
  type: "SUPERSEDES" | "MENTIONS";
  fromId: string;
  toId: string;
  evidence: string | null;
}

const SUPERSEDED_BY_RE = /superseded by\s+(?:ADR[- ]?)?0*(\d{1,4})\b/i;

/**
 * SUPERSEDES edges among one repo's documents. A doc whose status says
 * "superseded by NNNN" produces an edge FROM the doc numbered NNNN TO itself.
 * Ambiguous numbers (this workspace really has duplicate 0055s) resolve to
 * nothing — labels are labels, not keys, and we never guess.
 */
export function deriveSupersedes(docs: AdrDocForLinks[]): DerivedLink[] {
  const byNumber = new Map<number, AdrDocForLinks[]>();
  for (const doc of docs) {
    if (doc.number === null) continue;
    const bucket = byNumber.get(doc.number) ?? [];
    bucket.push(doc);
    byNumber.set(doc.number, bucket);
  }

  const links: DerivedLink[] = [];
  for (const doc of docs) {
    if (!doc.statusRaw) continue;
    const match = SUPERSEDED_BY_RE.exec(doc.statusRaw);
    if (!match?.[1]) continue;
    const candidates = byNumber.get(parseInt(match[1], 10)) ?? [];
    if (candidates.length !== 1) continue; // absent or ambiguous — never guess
    const superseder = candidates[0]!;
    if (superseder.id === doc.id) continue;
    links.push({
      type: "SUPERSEDES",
      fromId: superseder.id,
      toId: doc.id,
      evidence: doc.statusRaw,
    });
  }
  return links;
}

export interface RepoIdentity {
  repositoryId: string;
  /** e.g. "positonic/exponential" */
  fullName: string;
  shortCode: string;
}

/**
 * MENTIONS edges from `sourceDocs` bodies to other enrolled repos' documents.
 *
 * Two detectors, per the spec:
 * - another enrolled repo's name (case-insensitive; the bare repo name, e.g.
 *   "clear-api", not the owner prefix) → edge to that repo's doc ONLY when a
 *   specific ADR is identifiable on the same line via a number reference;
 *   otherwise the repo-name mention alone cannot pick a target doc, so it
 *   yields nothing (edges connect documents, not repos);
 * - `SHORTCODE-NNNN` (another repo's short code) → edge to that repo's doc
 *   with that number.
 *
 * Evidence is the matched line, verbatim. Self-references (same repo) are the
 * supersession/graph-within-repo domain and are excluded here.
 */
export function deriveMentions(
  sourceDocs: AdrDocForLinks[],
  repos: RepoIdentity[],
  /** All candidate target docs across enrolled repos (non-deleted). */
  targetDocs: AdrDocForLinks[],
): DerivedLink[] {
  const reposById = new Map(repos.map((r) => [r.repositoryId, r]));
  const docsByRepoAndNumber = new Map<string, AdrDocForLinks>();
  for (const doc of targetDocs) {
    if (doc.number === null) continue;
    docsByRepoAndNumber.set(`${doc.repositoryId}:${doc.number}`, doc);
  }
  const repoByShortCode = new Map(repos.map((r) => [r.shortCode.toUpperCase(), r]));

  const links: DerivedLink[] = [];
  const seen = new Set<string>();

  for (const doc of sourceDocs) {
    const sourceRepo = reposById.get(doc.repositoryId);
    for (const line of doc.body.split("\n")) {
      // SHORTCODE-NNNN references to OTHER repos.
      const codeRe = /\b([A-Z][A-Z0-9]{1,9})-0*(\d{1,4})\b/g;
      let match: RegExpExecArray | null;
      while ((match = codeRe.exec(line)) !== null) {
        const repo = repoByShortCode.get(match[1]!.toUpperCase());
        if (!repo || repo.repositoryId === doc.repositoryId) continue;
        const target = docsByRepoAndNumber.get(
          `${repo.repositoryId}:${parseInt(match[2]!, 10)}`,
        );
        if (!target || target.id === doc.id) continue;
        const key = `${doc.id}:${target.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({
          type: "MENTIONS",
          fromId: doc.id,
          toId: target.id,
          evidence: line.trim(),
        });
      }

      // Bare repo-name mentions ("clear-api") paired with a number reference
      // on the same line ("clear-api's 0003", "0002 in clear-context-pipeline").
      for (const repo of repos) {
        if (repo.repositoryId === doc.repositoryId) continue;
        const repoName = repo.fullName.split("/").pop() ?? repo.fullName;
        if (repoName.length < 3) continue;
        if (!line.toLowerCase().includes(repoName.toLowerCase())) continue;
        // Ignore the line if the "mention" is only this source repo's own name
        // being a substring (e.g. "clear" inside "clear-api").
        if (
          sourceRepo &&
          repoName.toLowerCase() ===
            (sourceRepo.fullName.split("/").pop() ?? "").toLowerCase()
        )
          continue;
        const numberMatch = /\b0*(\d{1,4})\b/.exec(
          line.replace(new RegExp(repoName, "ig"), " "),
        );
        if (!numberMatch?.[1]) continue;
        const target = docsByRepoAndNumber.get(
          `${repo.repositoryId}:${parseInt(numberMatch[1], 10)}`,
        );
        if (!target || target.id === doc.id) continue;
        const key = `${doc.id}:${target.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({
          type: "MENTIONS",
          fromId: doc.id,
          toId: target.id,
          evidence: line.trim(),
        });
      }
    }
  }
  return links;
}
