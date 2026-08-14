import type { PrismaClient, Prisma } from "@prisma/client";
import { parseAdr } from "./parser";
import { deriveMentions, deriveSupersedes } from "./linkDerivation";
import {
  createInstallationAdrRemote,
  readInstallationId,
  type AdrRemote,
  type AdrRemoteFactory,
  type AdrTreeEntry,
} from "./github";

/**
 * adrSync/engine — one sync run for a repo's ADR enrolment.
 *
 * One-way, read-only projection of ADR markdown files out of git (the source
 * of truth) into `AdrDocument` rows keyed by repo+path. Budget rules are
 * day-one requirements, not optimisations:
 * - the run short-circuits as `unchanged` (zero file fetches) when the tree
 *   SHA(s) covering `adrPaths` match the last successful pull;
 * - an unchanged file (same blob SHA) is skipped from the tree listing alone;
 * - a parse failure records a per-file item and continues — a malformed ADR
 *   is normal and never fails the run;
 * - vanished files are soft-deleted (`deletedAt`), never hard-deleted.
 */

export interface AdrSyncRunItem {
  path: string;
  action:
    | "created"
    | "updated"
    | "skipped"
    | "skipped-template"
    | "deleted"
    | "failed";
  reason?: string;
}

export interface AdrSyncResult {
  runId: string | null; // null only when the config itself failed to load
  status: "success" | "unchanged" | "error";
  created: number;
  updated: number;
  skipped: number;
  deleted: number;
  failed: number;
  items: AdrSyncRunItem[];
  error?: string;
}

export interface AdrSyncDeps {
  remoteFactory?: AdrRemoteFactory;
  now?: () => Date;
}

/**
 * The short-circuit key over possibly-several enrolled dirs: stable join of
 * `path:treeSha` (or `path:absent`) so adding/removing/moving a dir changes it.
 */
export function combineTreeShas(
  entries: Array<{ path: string; sha: string | null }>,
): string {
  return [...entries]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((e) => `${e.path}:${e.sha ?? "absent"}`)
    .join("\n");
}

/** Walk the root tree down to `dirPath`, returning that dir's tree SHA (null when absent). */
async function resolveDirTreeSha(
  remote: AdrRemote,
  owner: string,
  repo: string,
  rootTreeSha: string,
  dirPath: string,
): Promise<string | null> {
  let currentSha = rootTreeSha;
  const segments = dirPath.split("/").filter((s) => s.length > 0);
  for (const segment of segments) {
    const listing = await remote.getTree(owner, repo, currentSha);
    if (listing.truncated) {
      throw new Error(`Tree listing truncated while resolving ${dirPath}`);
    }
    const next = listing.entries.find(
      (e) => e.type === "tree" && e.path === segment,
    );
    if (!next) return null;
    currentSha = next.sha;
  }
  return currentSha;
}

/**
 * Pre-enrolment probe: how many markdown files live under each candidate dir?
 * Read-only against GitHub; touches no rows. Backs the settings page's
 * detected-count preview.
 */
export async function probeAdrPaths(
  db: PrismaClient,
  params: {
    repositoryId: string;
    adrPaths: string[];
    /** The workspace's GitHub App installation integration id. */
    installationId: number;
  },
  deps?: AdrSyncDeps,
): Promise<Array<{ path: string; exists: boolean; markdownCount: number }>> {
  const remoteFactory = deps?.remoteFactory ?? createInstallationAdrRemote;
  const repository = await db.workspaceRepository.findUnique({
    where: { id: params.repositoryId },
    select: { owner: true, name: true },
  });
  if (!repository) {
    throw new Error("Repository not found");
  }
  const remote = await remoteFactory(params.installationId);
  const head = await remote.getHead(repository.owner, repository.name);

  const results: Array<{ path: string; exists: boolean; markdownCount: number }> = [];
  for (const dirPath of params.adrPaths) {
    const dirSha = await resolveDirTreeSha(
      remote,
      repository.owner,
      repository.name,
      head.treeSha,
      dirPath,
    );
    if (!dirSha) {
      results.push({ path: dirPath, exists: false, markdownCount: 0 });
      continue;
    }
    const listing = await remote.getTree(
      repository.owner,
      repository.name,
      dirSha,
      true,
    );
    if (listing.truncated) {
      throw new Error(
        `Tree listing for ${dirPath} was truncated by GitHub — path covers too many files`,
      );
    }
    results.push({
      path: dirPath,
      exists: true,
      markdownCount: listing.entries.filter(
        (e) => e.type === "blob" && /\.md$/i.test(e.path),
      ).length,
    });
  }
  return results;
}

export async function runAdrSync(
  db: PrismaClient,
  configId: string,
  trigger: "manual" | "cron" | "webhook",
  deps?: AdrSyncDeps & { triggeredById?: string },
): Promise<AdrSyncResult> {
  const now = deps?.now ?? (() => new Date());
  const remoteFactory = deps?.remoteFactory ?? createInstallationAdrRemote;

  const config = await db.adrSyncConfig.findUnique({
    where: { id: configId },
    include: {
      repository: { select: { id: true, owner: true, name: true } },
      integration: { select: { providerConfig: true } },
    },
  });
  if (!config) {
    return {
      runId: null,
      status: "error",
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 0,
      items: [],
      error: "Sync config not found",
    };
  }

  const run = await db.adrSyncRun.create({
    data: {
      configId,
      trigger,
      status: "running",
      startedAt: now(),
      triggeredById: deps?.triggeredById ?? null,
    },
  });

  const fail = async (message: string): Promise<AdrSyncResult> => {
    await db.adrSyncRun.update({
      where: { id: run.id },
      data: { status: "error", finishedAt: now(), error: message },
    });
    return {
      runId: run.id,
      status: "error",
      created: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      failed: 0,
      items: [],
      error: message,
    };
  };

  try {
    if (!config.integrationId || !config.integration) {
      return await fail("Repository is disconnected (no integration)");
    }
    const installationId = readInstallationId(
      config.integration.providerConfig,
    );
    if (!installationId) {
      return await fail("Integration has no usable GitHub installation id");
    }

    const remote = await remoteFactory(installationId);
    const { owner, name: repoName } = config.repository;

    const head = await remote.getHead(owner, repoName);

    // Resolve the tree SHA covering each enrolled dir; the combined value is
    // the short-circuit key.
    const dirShas: Array<{ path: string; sha: string | null }> = [];
    for (const dirPath of config.adrPaths) {
      dirShas.push({
        path: dirPath,
        sha: await resolveDirTreeSha(
          remote,
          owner,
          repoName,
          head.treeSha,
          dirPath,
        ),
      });
    }
    const combined = combineTreeShas(dirShas);

    if (config.lastTreeSha !== null && combined === config.lastTreeSha) {
      await db.adrSyncRun.update({
        where: { id: run.id },
        data: { status: "unchanged", finishedAt: now() },
      });
      return {
        runId: run.id,
        status: "unchanged",
        created: 0,
        updated: 0,
        skipped: 0,
        deleted: 0,
        failed: 0,
        items: [],
      };
    }

    // List every markdown blob under the enrolled dirs. A truncated listing
    // must fail the run: files missing from it would read as deletions and
    // the advanced tree SHA would lock the loss in as "unchanged".
    const blobs: Array<{ path: string; sha: string }> = [];
    for (const dir of dirShas) {
      if (!dir.sha) continue;
      const listing = await remote.getTree(owner, repoName, dir.sha, true);
      if (listing.truncated) {
        return await fail(
          `Tree listing for ${dir.path} was truncated by GitHub — path covers too many files to sync safely`,
        );
      }
      const entries: AdrTreeEntry[] = listing.entries;
      for (const entry of entries) {
        if (entry.type === "blob" && /\.md$/i.test(entry.path)) {
          blobs.push({ path: `${dir.path}/${entry.path}`, sha: entry.sha });
        }
      }
    }

    const existing = await db.adrDocument.findMany({
      where: { repositoryId: config.repository.id },
      select: {
        id: true,
        path: true,
        contentHash: true,
        deletedAt: true,
      },
    });
    const existingByPath = new Map(existing.map((d) => [d.path, d]));

    const items: AdrSyncRunItem[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let deleted = 0;
    let failed = 0;

    const seenPaths = new Set<string>();
    for (const blob of blobs) {
      seenPaths.add(blob.path);
      const prior = existingByPath.get(blob.path);

      // Blob-SHA skip: unchanged file ⇒ no content fetch at all.
      if (prior && prior.contentHash === blob.sha && prior.deletedAt === null) {
        skipped++;
        items.push({ path: blob.path, action: "skipped", reason: "unchanged" });
        continue;
      }

      try {
        const content = await remote.getBlob(owner, repoName, blob.sha);
        const parsed = parseAdr({ path: blob.path, content });

        if (parsed.isTemplate) {
          skipped++;
          items.push({
            path: blob.path,
            action: "skipped-template",
            reason: `status is the template alternation: ${parsed.statusRaw ?? ""}`,
          });
          continue;
        }

        const data = {
          number: parsed.number,
          slug: parsed.slug,
          title: parsed.title,
          status: parsed.status,
          statusRaw: parsed.statusRaw,
          decidedAt: parsed.decidedAt,
          body: content,
          contentHash: blob.sha,
          lastSeenSha: blob.sha,
          deletedAt: null,
        };
        if (prior) {
          await db.adrDocument.update({ where: { id: prior.id }, data });
          updated++;
          items.push({ path: blob.path, action: "updated" });
        } else {
          await db.adrDocument.create({
            data: { repositoryId: config.repository.id, path: blob.path, ...data },
          });
          created++;
          items.push({ path: blob.path, action: "created" });
        }
      } catch (error) {
        // Never fail the run on one file.
        failed++;
        items.push({
          path: blob.path,
          action: "failed",
          reason: error instanceof Error ? error.message : "unknown error",
        });
      }
    }

    // Soft-delete documents whose file vanished from the repo.
    for (const doc of existing) {
      if (!seenPaths.has(doc.path) && doc.deletedAt === null) {
        await db.adrDocument.update({
          where: { id: doc.id },
          data: { deletedAt: now() },
        });
        deleted++;
        items.push({ path: doc.path, action: "deleted", reason: "file removed from repo" });
      }
    }

    // Recompute derived edges touching this repo from the fresh docs.
    //
    // SUPERSEDES is always intra-repo (resolved by number within the repo),
    // so deleting by from-side repo covers every stale edge.
    //
    // MENTIONS is cross-repo, recomputed in both directions WITHOUT any
    // refetch: outbound from this repo's fresh bodies, and inbound by
    // re-matching other repos' STORED bodies against this repo's docs.
    const workspaceConfigs = await db.adrSyncConfig.findMany({
      where: { workspaceId: config.workspaceId },
      select: {
        repositoryId: true,
        shortCode: true,
        repository: { select: { fullName: true } },
      },
    });
    const repoIdentities = workspaceConfigs.map((c) => ({
      repositoryId: c.repositoryId,
      fullName: c.repository.fullName,
      shortCode: c.shortCode,
    }));
    const allDocs = await db.adrDocument.findMany({
      where: {
        repositoryId: { in: workspaceConfigs.map((c) => c.repositoryId) },
        deletedAt: null,
      },
      select: {
        id: true,
        repositoryId: true,
        number: true,
        statusRaw: true,
        body: true,
      },
    });
    const thisRepoDocs = allDocs.filter(
      (d) => d.repositoryId === config.repository.id,
    );
    const otherRepoDocs = allDocs.filter(
      (d) => d.repositoryId !== config.repository.id,
    );

    const supersedes = deriveSupersedes(thisRepoDocs);
    const mentionsOut = deriveMentions(thisRepoDocs, repoIdentities, allDocs);
    const mentionsIn = deriveMentions(
      otherRepoDocs,
      repoIdentities,
      thisRepoDocs,
    );

    await db.adrLink.deleteMany({
      where: {
        OR: [
          { type: "SUPERSEDES", from: { repositoryId: config.repository.id } },
          { type: "MENTIONS", from: { repositoryId: config.repository.id } },
          { type: "MENTIONS", to: { repositoryId: config.repository.id } },
        ],
      },
    });
    const derivedLinks = [...supersedes, ...mentionsOut, ...mentionsIn];
    if (derivedLinks.length > 0) {
      await db.adrLink.createMany({
        data: derivedLinks,
        skipDuplicates: true,
      });
    }

    await db.adrSyncConfig.update({
      where: { id: configId },
      data: {
        // Advance the short-circuit key only on a CLEAN run: a transient blob
        // fetch failure would otherwise be locked in — the next run would see
        // an unchanged tree and short-circuit past the retry forever on a
        // quiet repo. Unchanged blobs still skip via their blob SHA.
        lastTreeSha: failed === 0 ? combined : null,
        lastCommitSha: head.commitSha,
        lastSyncedAt: now(),
      },
    });
    await db.adrSyncRun.update({
      where: { id: run.id },
      data: {
        status: "success",
        finishedAt: now(),
        created,
        updated,
        skipped,
        deleted,
        failed,
        items: items as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      runId: run.id,
      status: "success",
      created,
      updated,
      skipped,
      deleted,
      failed,
      items,
    };
  } catch (error) {
    return await fail(
      error instanceof Error ? error.message : "unknown error",
    );
  }
}
