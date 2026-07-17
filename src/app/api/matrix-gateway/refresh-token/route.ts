import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { generateJWT } from "~/server/utils/jwt";

/**
 * POST /api/matrix-gateway/refresh-token
 *
 * Server-to-server endpoint for the Matrix gateway to refresh expired JWT tokens.
 * Authenticates via shared secret, not user session.
 *
 * Headers:
 *   X-Gateway-Secret: <GATEWAY_SECRET>
 *
 * Body:
 *   { userId: string }
 *
 * Response:
 *   { token: string, expiresAt: string }
 */
export async function POST(request: NextRequest) {
  try {
    const gatewaySecret =
      process.env.GATEWAY_SECRET ?? process.env.WHATSAPP_GATEWAY_SECRET;
    if (!gatewaySecret) {
      console.error("[matrix-refresh-token] GATEWAY_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }

    const providedSecret = request.headers.get("X-Gateway-Secret");
    if (!providedSecret || providedSecret !== gatewaySecret) {
      console.warn("[matrix-refresh-token] Invalid or missing gateway secret");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as { userId?: string };
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, image: true },
    });

    if (!user) {
      console.warn(`[matrix-refresh-token] User not found: ${userId}`);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const token = generateJWT(user, { tokenType: "matrix-gateway" });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    console.log(`[matrix-refresh-token] Token refreshed for user: ${userId}`);

    return NextResponse.json({ token, expiresAt });
  } catch (error) {
    console.error("[matrix-refresh-token] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
