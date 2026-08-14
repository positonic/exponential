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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * ADR-shaped number tokens on a line: `ADR-0003`, `ADR 3`, `#0003`, or a
 * bare leading-zero form (`0003`). A bare `3`, `v2`, `5 times`, or a list
 * marker `1.` is NOT ADR-shaped — dense per-repo numbering means loose
 * number matching manufactures false edges out of ordinary prose.
 */
function adrShapedNumbers(line: string): number[] {
  const out: number[] = [];
  // The bare leading-zero form must not fire inside dates ("2026-06-14") —
  // hence the digit/dash lookarounds. Sentence-final "…as 0001." stays valid.
  const re =
    /(?:\b(?:ADR)[- ]?|#)0*(\d{1,4})\b|(?<![\d-])\b0(\d{1,3})\b(?![\d-])/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const raw = match[1] ?? (match[2] !== undefined ? `0${match[2]}` : undefined);
    if (raw !== undefined) out.push(parseInt(raw, 10));
  }
  return out;
}

/**
 * MENTIONS edges from `sourceDocs` bodies to other enrolled repos' documents.
 *
 * Two detectors, per the spec:
 * - `SHORTCODE-NNNN` (another enrolled repo's short code) → edge to that
 *   repo's doc with that number;
 * - another enrolled repo's bare name (boundary-matched, escaped) → edge ONLY
 *   when an ADR-shaped number on the same line identifies the doc; a repo
 *   name alone cannot pick a target (edges connect documents, not repos).
 *
 * False edges are worse than missing ones, so the same never-guess rule as
 * deriveSupersedes applies throughout: a number that is duplicated in the
 * target repo resolves to nothing, and (for the bare-name detector) a number
 * that also exists in the SOURCE repo is presumed a local reference and
 * skipped. Self-references (same repo) are excluded — that's the
 * supersession/within-repo domain.
 *
 * Evidence is the matched line, verbatim.
 */
export function deriveMentions(
  sourceDocs: AdrDocForLinks[],
  repos: RepoIdentity[],
  /** All candidate target docs across enrolled repos (non-deleted). */
  targetDocs: AdrDocForLinks[],
): DerivedLink[] {
  // number → docs buckets per repo; ambiguous buckets resolve to nothing.
  const docsByRepoAndNumber = new Map<string, AdrDocForLinks[]>();
  for (const doc of targetDocs) {
    if (doc.number === null) continue;
    const key = `${doc.repositoryId}:${doc.number}`;
    const bucket = docsByRepoAndNumber.get(key) ?? [];
    bucket.push(doc);
    docsByRepoAndNumber.set(key, bucket);
  }
  const resolveTarget = (
    repositoryId: string,
    number: number,
  ): AdrDocForLinks | null => {
    const bucket = docsByRepoAndNumber.get(`${repositoryId}:${number}`) ?? [];
    return bucket.length === 1 ? bucket[0]! : null; // absent or ambiguous — never guess
  };
  const sourceRepoNumbers = new Map<string, Set<number>>();
  for (const doc of sourceDocs) {
    if (doc.number === null) continue;
    const set = sourceRepoNumbers.get(doc.repositoryId) ?? new Set<number>();
    set.add(doc.number);
    sourceRepoNumbers.set(doc.repositoryId, set);
  }
  const repoByShortCode = new Map(repos.map((r) => [r.shortCode.toUpperCase(), r]));

  const links: DerivedLink[] = [];
  const seen = new Set<string>();
  const push = (doc: AdrDocForLinks, target: AdrDocForLinks, line: string) => {
    if (target.id === doc.id) return;
    const key = `${doc.id}:${target.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({
      type: "MENTIONS",
      fromId: doc.id,
      toId: target.id,
      evidence: line.trim(),
    });
  };

  for (const doc of sourceDocs) {
    for (const line of doc.body.split("\n")) {
      // SHORTCODE-NNNN references to OTHER repos — the precise detector.
      const codeRe = /\b([A-Z][A-Z0-9]{1,9})-0*(\d{1,4})\b/g;
      let match: RegExpExecArray | null;
      while ((match = codeRe.exec(line)) !== null) {
        const repo = repoByShortCode.get(match[1]!.toUpperCase());
        if (!repo || repo.repositoryId === doc.repositoryId) continue;
        const target = resolveTarget(
          repo.repositoryId,
          parseInt(match[2]!, 10),
        );
        if (target) push(doc, target, line);
      }

      // Bare repo-name mentions paired with an ADR-shaped number on the line
      // ("the pipeline half is 0002 in clear-context-pipeline").
      for (const repo of repos) {
        if (repo.repositoryId === doc.repositoryId) continue;
        const repoName = repo.fullName.split("/").pop() ?? repo.fullName;
        if (repoName.length < 3) continue;
        // Boundary-matched and escaped: "clear" must not fire inside
        // "clear-api", "api" must not fire inside "capital" or "clear-api".
        const nameRe = new RegExp(
          `(?<![\\w-])${escapeRegExp(repoName)}(?![\\w-])`,
          "i",
        );
        if (!nameRe.test(line)) continue;
        for (const number of adrShapedNumbers(line)) {
          // A number that also exists in the source repo is presumed a LOCAL
          // reference ("Supersedes ADR-0007; see also clear-api") — skip it.
          if (sourceRepoNumbers.get(doc.repositoryId)?.has(number)) continue;
          const target = resolveTarget(repo.repositoryId, number);
          if (target) {
            push(doc, target, line);
            break;
          }
        }
      }
    }
  }
  return links;
}
