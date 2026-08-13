#!/usr/bin/env ts-node

/**
 * Backfill historical merged PRs into GitHubActivity.
 *
 * The "PRs merged" metric (SprintAnalyticsService.getMergedPrDurations) reads
 * pull_request rows written by the GitHub webhook — so it only knows about
 * PRs merged AFTER the webhook was connected. This script fetches every
 * closed PR from a workspace's connected repos (WorkspaceRepository) via the
 * GitHub REST API and writes the two rows the webhook would have written per
 * merged PR:
 *
 *   - an "opened" row (eventTimestamp = PR created_at) — feeds turnaround
 *   - a "closed" row (prState "merged", prMergedAt set)  — feeds the count
 *
 * Same externalId scheme as GitHubActivityService.processPullRequestEvent
 * (`${node_id}:${action}` + eventType unique), so it is idempotent AND a
 * webhook replay of the same PR still dedups against these rows. Ticket
 * linking / action mapping are deliberately skipped — this feeds metrics only.
 *
 * Auth: set GITHUB_TOKEN (e.g. `GITHUB_TOKEN=$(gh auth token)`) with read
 * access to the repos.
 *
 * Dry run (default, read-only):
 *   GITHUB_TOKEN=$(gh auth token) npx tsx scripts/backfill-github-prs.ts --workspace clear
 * Apply:
 *   GITHUB_TOKEN=$(gh auth token) npx tsx scripts/backfill-github-prs.ts --workspace clear --apply
 * Options:
 *   --repo <owner/name>   only this repo (repeatable)
 */

// Load environment variables (default import — named import breaks under ESM
// tsx). The db import below must stay DYNAMIC: a static import is hoisted
// above loadEnvConfig and env validation fires before anything is loaded.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());

const { db } = await import('../src/server/db');

const APPLY = process.argv.includes('--apply');

function argValues(flag: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && process.argv[i + 1]) {
      values.push(process.argv[i + 1]!);
    }
  }
  return values;
}

const WORKSPACE_SLUG = argValues('--workspace')[0] ?? null;
const REPO_FILTER = argValues('--repo');
const TOKEN = process.env.GITHUB_TOKEN;

interface GitHubPr {
  number: number;
  node_id: string;
  title: string;
  html_url: string;
  created_at: string;
  merged_at: string | null;
  user: { login: string } | null;
  head: { ref: string };
}

async function fetchMergedPrs(fullName: string): Promise<GitHubPr[]> {
  const merged: GitHubPr[] = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.github.com/repos/${fullName}/pulls?state=closed&per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
    );
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status} for ${fullName} page ${page}: ${await res.text()}`);
    }
    const prs = (await res.json()) as GitHubPr[];
    merged.push(...prs.filter((pr) => pr.merged_at != null));
    if (prs.length < 100) break;
  }
  return merged;
}

async function main() {
  if (!WORKSPACE_SLUG) {
    console.error('Usage: GITHUB_TOKEN=... npx tsx scripts/backfill-github-prs.ts --workspace <slug> [--repo owner/name] [--apply]');
    process.exit(1);
  }
  if (!TOKEN) {
    console.error('GITHUB_TOKEN is not set. Try: GITHUB_TOKEN=$(gh auth token) npx tsx scripts/backfill-github-prs.ts ...');
    process.exit(1);
  }

  const workspace = await db.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, name: true },
  });
  if (!workspace) {
    console.error(`Workspace "${WORKSPACE_SLUG}" not found`);
    process.exit(1);
  }

  const repos = await db.workspaceRepository.findMany({
    where: {
      workspaceId: workspace.id,
      ...(REPO_FILTER.length > 0 ? { fullName: { in: REPO_FILTER } } : {}),
    },
    select: { fullName: true, integrationId: true },
  });
  if (repos.length === 0) {
    console.error('No connected repositories found for this workspace.');
    process.exit(1);
  }

  console.log(`Workspace: ${workspace.name} (${WORKSPACE_SLUG})`);
  console.log(`Repos: ${repos.map((r) => r.fullName).join(', ')}\n`);

  let totalNew = 0;
  let totalExisting = 0;

  for (const repo of repos) {
    const prs = await fetchMergedPrs(repo.fullName);

    const rows = prs.flatMap((pr) => {
      const shared = {
        workspaceId: workspace.id,
        integrationId: repo.integrationId,
        eventType: 'pull_request',
        deliveryId: null,
        branchName: pr.head.ref,
        prNumber: pr.number,
        prTitle: pr.title,
        prUrl: pr.html_url,
        prAuthor: pr.user?.login ?? 'unknown',
        repoFullName: repo.fullName,
        repoUrl: `https://github.com/${repo.fullName}`,
      };
      return [
        {
          ...shared,
          eventAction: 'opened',
          externalId: `${pr.node_id}:opened`,
          prState: 'open',
          prMergedAt: null,
          eventTimestamp: new Date(pr.created_at),
        },
        {
          ...shared,
          eventAction: 'closed',
          externalId: `${pr.node_id}:closed`,
          prState: 'merged',
          prMergedAt: new Date(pr.merged_at!),
          eventTimestamp: new Date(pr.merged_at!),
        },
      ];
    });

    const existing = await db.gitHubActivity.findMany({
      where: {
        eventType: 'pull_request',
        externalId: { in: rows.map((r) => r.externalId) },
      },
      select: { externalId: true },
    });
    const existingIds = new Set(existing.map((e) => e.externalId));
    const newRows = rows.filter((r) => !existingIds.has(r.externalId));

    totalNew += newRows.length;
    totalExisting += existingIds.size;
    console.log(
      `${repo.fullName}: ${prs.length} merged PRs -> ${newRows.length} new rows (${existingIds.size} already present)`,
    );

    if (APPLY && newRows.length > 0) {
      await db.gitHubActivity.createMany({ data: newRows, skipDuplicates: true });
    }
  }

  console.log(
    APPLY
      ? `\nDone — inserted ${totalNew} rows (${totalExisting} were already present).`
      : `\nDry run — no writes. Re-run with --apply to insert ${totalNew} rows (${totalExisting} already present).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
