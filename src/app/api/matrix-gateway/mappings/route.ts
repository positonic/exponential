import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";

/**
 * /api/matrix-gateway/mappings
 *
 * Server-to-server endpoints for the Matrix gateway to persist and read
 * Gateway pairing mappings (Matrix user ID -> Exponential user). Mappings live
 * in IntegrationUserMapping under a single system Integration row
 * (provider "matrix") which is get-or-created idempotently on first write —
 * there is no manual seed step. See ADR-0043.
 *
 * All methods authenticate via shared secret:
 *   X-Gateway-Secret: <GATEWAY_SECRET>
 *
 *   POST   { mxid, userId }  -> upsert one mapping
 *   GET                      -> { mappings: [{ mxid, userId }] }
 *   DELETE { mxid }          -> remove one mapping
 */

const MXID_PATTERN = /^@[^:\s]+:\S+$/;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function checkGatewaySecret(request: NextRequest): NextResponse | null {
  const gatewaySecret =
    process.env.GATEWAY_SECRET ?? process.env.WHATSAPP_GATEWAY_SECRET;
  if (!gatewaySecret) {
    console.error("[matrix-mappings] GATEWAY_SECRET not configured");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }
  const providedSecret = request.headers.get("X-Gateway-Secret");
  if (!providedSecret || providedSecret !== gatewaySecret) {
    console.warn("[matrix-mappings] Invalid or missing gateway secret");
    return unauthorized();
  }
  return null;
}

async function getOrCreateMatrixIntegration() {
  const existing = await db.integration.findFirst({
    where: { provider: "matrix", status: "ACTIVE", userId: null },
  });
  if (existing) return existing;
  return db.integration.create({
    data: {
      name: "Matrix Gateway",
      type: "MESSAGING",
      provider: "matrix",
      status: "ACTIVE",
      description:
        "System integration anchoring Matrix Gateway pairing mappings (ADR-0043)",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const denied = checkGatewaySecret(request);
    if (denied) return denied;

    const body = (await request.json()) as { mxid?: string; userId?: string };
    const { mxid, userId } = body;

    if (!mxid || !MXID_PATTERN.test(mxid)) {
      return NextResponse.json(
        { error: "mxid is required and must be a full Matrix user ID (@user:server)" },
        { status: 400 },
      );
    }
    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const integration = await getOrCreateMatrixIntegration();

    const mapping = await db.integrationUserMapping.upsert({
      where: {
        integrationId_externalUserId: {
          integrationId: integration.id,
          externalUserId: mxid,
        },
      },
      update: { userId },
      create: {
        integrationId: integration.id,
        externalUserId: mxid,
        userId,
      },
    });

    console.log(`[matrix-mappings] Mapping upserted: ${mxid} -> ${userId}`);
    return NextResponse.json({
      mapping: { mxid: mapping.externalUserId, userId: mapping.userId },
    });
  } catch (error) {
    console.error("[matrix-mappings] POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const denied = checkGatewaySecret(request);
    if (denied) return denied;

    const integration = await db.integration.findFirst({
      where: { provider: "matrix", status: "ACTIVE", userId: null },
    });
    if (!integration) {
      // Nothing has paired yet — the Integration row is created on first POST.
      return NextResponse.json({ mappings: [] });
    }

    const mappings = await db.integrationUserMapping.findMany({
      where: { integrationId: integration.id },
      select: { externalUserId: true, userId: true },
    });

    return NextResponse.json({
      mappings: mappings.map((m) => ({
        mxid: m.externalUserId,
        userId: m.userId,
      })),
    });
  } catch (error) {
    console.error("[matrix-mappings] GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const denied = checkGatewaySecret(request);
    if (denied) return denied;

    const body = (await request.json()) as { mxid?: string };
    const { mxid } = body;

    if (!mxid) {
      return NextResponse.json({ error: "mxid is required" }, { status: 400 });
    }

    const integration = await db.integration.findFirst({
      where: { provider: "matrix", status: "ACTIVE", userId: null },
    });
    if (!integration) {
      return NextResponse.json({ deleted: 0 });
    }

    const result = await db.integrationUserMapping.deleteMany({
      where: { integrationId: integration.id, externalUserId: mxid },
    });

    console.log(`[matrix-mappings] Mapping deleted: ${mxid} (${result.count})`);
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("[matrix-mappings] DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
