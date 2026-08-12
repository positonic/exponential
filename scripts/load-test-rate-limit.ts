/**
 * Verifies the shared rate limiter holds across serverless scale-out
 * (ticket silver.brook, acceptance: "verified by a load test, not by unit
 * tests alone").
 *
 * Fires N requests at a rate-limited endpoint with enough concurrency that
 * Vercel fans them across multiple lambda instances, then reports the status
 * distribution. With the OLD in-memory limiter each warm instance had its own
 * window, so a burst comfortably exceeding the configured limit still saw
 * ~zero 429s. With Upstash configured, allowed responses must not exceed the
 * configured limit (small overshoot tolerated for sliding-window edges).
 *
 * Usage (against a preview or prod deploy — POSTs the forms endpoint by
 * default, which is public):
 *
 *   npx tsx scripts/load-test-rate-limit.ts \
 *     --url https://<deploy>/api/forms/<slug>/submit \
 *     --count 30 --concurrency 10 --expect-limit 5
 *
 * Notes:
 * - The forms endpoint's per-IP limit is 5/min, so from one machine 30
 *   requests should yield ≤~6 non-429 responses when the shared store works.
 * - Sends an intentionally empty body ({data:{}}), so allowed requests are
 *   422 validation responses — they still consumed rate-limit budget. Counted
 *   as "allowed" below. No submissions are created.
 */

interface Args {
  url: string;
  count: number;
  concurrency: number;
  expectLimit: number | null;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const url = get("--url");
  if (!url) {
    console.error(
      "Usage: npx tsx scripts/load-test-rate-limit.ts --url <endpoint> [--count 30] [--concurrency 10] [--expect-limit 5]",
    );
    process.exit(1);
  }
  return {
    url,
    count: Number(get("--count") ?? 30),
    concurrency: Number(get("--concurrency") ?? 10),
    expectLimit: get("--expect-limit") ? Number(get("--expect-limit")) : null,
  };
}

async function main() {
  const args = parseArgs();
  const statuses = new Map<number, number>();
  let retryAfterSeen = false;

  let next = 0;
  async function worker() {
    while (next < args.count) {
      next += 1;
      try {
        const res = await fetch(args.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: {} }),
        });
        statuses.set(res.status, (statuses.get(res.status) ?? 0) + 1);
        if (res.status === 429 && res.headers.get("retry-after")) {
          retryAfterSeen = true;
        }
      } catch (error) {
        statuses.set(-1, (statuses.get(-1) ?? 0) + 1);
        console.error("request failed:", error);
      }
    }
  }

  const started = Date.now();
  await Promise.all(
    Array.from({ length: args.concurrency }, () => worker()),
  );
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  const allowed = [...statuses.entries()]
    .filter(([code]) => code !== 429 && code !== -1)
    .reduce((sum, [, n]) => sum + n, 0);
  const limited = statuses.get(429) ?? 0;

  console.log(`\n${args.count} requests in ${elapsed}s → status counts:`);
  for (const [code, n] of [...statuses.entries()].sort()) {
    console.log(`  ${code === -1 ? "network-error" : code}: ${n}`);
  }
  console.log(`\nallowed (non-429): ${allowed}, limited (429): ${limited}`);
  console.log(`429s carried Retry-After: ${retryAfterSeen ? "yes" : "NO"}`);

  if (args.expectLimit !== null) {
    // Sliding windows can let a couple extra through at the boundary.
    const tolerance = Math.ceil(args.expectLimit * 0.4) + 1;
    const holds = allowed <= args.expectLimit + tolerance;
    console.log(
      holds
        ? `PASS: allowed ${allowed} ≤ limit ${args.expectLimit} (+${tolerance} tolerance) — the limit holds across instances`
        : `FAIL: allowed ${allowed} > limit ${args.expectLimit} (+${tolerance} tolerance) — limits are NOT shared (is Upstash configured on this deploy?)`,
    );
    process.exit(holds ? 0 : 1);
  }
}

void main();
