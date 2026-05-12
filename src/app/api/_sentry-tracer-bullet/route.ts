// TEMPORARY: tracer bullet for Sentry (GH issue 104). Hit this in production
// to verify the first Sentry event arrives, then delete this route before
// final merge.
export async function GET() {
  throw new Error(
    "Sentry tracer bullet: deliberate production throw to verify ingestion (GH issue 104).",
  );
}
