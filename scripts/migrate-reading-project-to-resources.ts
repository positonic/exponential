#!/usr/bin/env ts-node

/**
 * Move a "Reading" Project's Actions into the Reading list (ticket pink.grape).
 *
 * A Project used purely as somewhere to save things to read is not a project:
 * it can never finish, and its items are mis-typed Actions. This script turns
 * each Action in such a project into a `Resource` and then completes the
 * project so it stops showing up in reviews:
 *
 *   - title        = the action's name (with any URL stripped out)
 *   - url          = the first http(s) link found in the name or description
 *   - description  = whatever text remains after the URL is removed
 *   - contentType  = "bookmark" when a URL was found, else "note"
 *   - readStatus   = "read" (readAt = completedAt) for COMPLETED actions,
 *                    "to_read" for everything else
 *   - workspaceId  = the project's workspace; no projectId (it is going away)
 *
 * Nothing is embedded: a bare link has no body, and indexing follows content.
 * Actions are left in place (the project is COMPLETED, not deleted) so the
 * run is reversible by hand. Not idempotent across --apply runs: a second
 * --apply would create the Resources again, so the script refuses when the
 * project is already COMPLETED.
 *
 * Dry run (default, read-only — prints the mapping):
 *   npx tsx scripts/migrate-reading-project-to-resources.ts --project <cuid|slug>
 * Apply:
 *   npx tsx scripts/migrate-reading-project-to-resources.ts --project <cuid|slug> --apply
 */

import path from 'node:path';

export interface ActionRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ResourceDraft {
  title: string;
  url: string | null;
  description: string | null;
  contentType: 'bookmark' | 'note';
  readStatus: 'read' | 'to_read';
  readAt: Date | null;
  createdAt: Date;
  sourceActionId: string;
}

const URL_RE = /https?:\/\/[^\s<>()"']+/i;

/** Pull the first http(s) link out of a string, returning it and the rest. */
export function splitUrl(text: string): { url: string | null; rest: string } {
  const match = URL_RE.exec(text);
  if (!match) return { url: null, rest: text.trim() };
  // Trailing punctuation that commonly follows a pasted link is not part of it.
  const url = match[0].replace(/[.,;:!?)\]]+$/, '');
  const rest = (text.slice(0, match.index) + text.slice(match.index + match[0].length))
    .replace(/\s{2,}/g, ' ')
    .trim();
  return { url, rest };
}

/** Pure mapping from an Action row to the Resource it becomes. */
export function draftFromAction(action: ActionRow): ResourceDraft {
  const fromName = splitUrl(action.name);
  const fromDescription = splitUrl(action.description ?? '');
  const url = fromName.url ?? fromDescription.url;

  const title = fromName.rest || (url ? hostnameOf(url) ?? url : action.name.trim());
  const leftoverDescription = fromDescription.rest;

  const isDone = action.status === 'COMPLETED';
  return {
    title,
    url,
    description: leftoverDescription.length > 0 ? leftoverDescription : null,
    contentType: url ? 'bookmark' : 'note',
    readStatus: isDone ? 'read' : 'to_read',
    readAt: isDone ? action.completedAt ?? action.createdAt : null,
    createdAt: action.createdAt,
    sourceActionId: action.id,
  };
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] ?? null) : null;
}

export async function main(): Promise<void> {
  // The db import must stay DYNAMIC: a static import is hoisted above
  // loadEnvConfig and env validation fires before anything is loaded.
  const envModule = (await import('@next/env')) as unknown as {
    default?: { loadEnvConfig: (dir: string) => void };
    loadEnvConfig?: (dir: string) => void;
  };
  const loadEnvConfig = envModule.default?.loadEnvConfig ?? envModule.loadEnvConfig;
  if (!loadEnvConfig) throw new Error('Could not load @next/env');
  loadEnvConfig(process.cwd());
  const { db } = await import('../src/server/db');

  const APPLY = process.argv.includes('--apply');
  const PROJECT = argValue('--project');
  if (!PROJECT) {
    console.error(
      'Usage: npx tsx scripts/migrate-reading-project-to-resources.ts --project <cuid|slug> [--apply]',
    );
    process.exit(1);
  }

  const project = await db.project.findFirst({
    where: { OR: [{ id: PROJECT }, { slug: PROJECT }] },
    select: { id: true, name: true, slug: true, status: true, workspaceId: true, createdById: true },
  });
  if (!project) {
    console.error(`No project matches "${PROJECT}".`);
    process.exit(1);
  }
  if (project.status === 'COMPLETED') {
    console.error(`Project "${project.name}" is already COMPLETED — refusing to migrate it twice.`);
    process.exit(1);
  }

  const actions = await db.action.findMany({
    where: { projectId: project.id, status: { notIn: ['DELETED'] } },
    select: { id: true, name: true, description: true, status: true, completedAt: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const drafts = actions.map(draftFromAction);
  console.log(
    `${APPLY ? 'Migrating' : 'Dry run:'} project "${project.name}" (${project.slug}) — ${drafts.length} actions → resources`,
  );
  for (const d of drafts) {
    console.log(
      `  [${d.readStatus === 'read' ? 'read   ' : 'to_read'}] ${d.title}${d.url ? `  →  ${d.url}` : ''}${d.description ? `  (${d.description})` : ''}`,
    );
  }
  const unread = drafts.filter((d) => d.readStatus === 'to_read').length;
  console.log(`  ${unread} to read, ${drafts.length - unread} read.`);

  if (!APPLY) {
    console.log('Re-run with --apply to write.');
    await db.$disconnect();
    return;
  }

  await db.$transaction([
    ...drafts.map((d) =>
      db.resource.create({
        data: {
          title: d.title,
          url: d.url,
          description: d.description,
          contentType: d.contentType,
          readStatus: d.readStatus,
          readAt: d.readAt,
          createdAt: d.createdAt,
          fetchedAt: null,
          tags: ['reading-list'],
          userId: project.createdById,
          workspaceId: project.workspaceId,
        },
      }),
    ),
    db.project.update({ where: { id: project.id }, data: { status: 'COMPLETED' } }),
  ]);
  console.log(`Created ${drafts.length} resources and completed project "${project.name}".`);
  await db.$disconnect();
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
