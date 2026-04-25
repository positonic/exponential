import { type NextRequest, NextResponse } from "next/server";
import { db } from "~/server/db";
import { generateJWT } from "~/server/utils/jwt";

/**
 * POST /api/whatsapp-gateway/refresh-token
 *
 * Server-to-server endpoint for the WhatsApp gateway to refresh expired JWT tokens.
 * Authenticates via shared secret, not user session.
 *
 * Headers:
 *   X-Gateway-Secret: <WHATSAPP_GATEWAY_SECRET>
 *
 * Body:
 *   { sessionId: string }
 *
 * Response:
 *   { token: string, expiresAt: string }
 */
export async function POST(request: NextRequest) {
  try {
    // Verify gateway secret
    const gatewaySecret = process.env.WHATSAPP_GATEWAY_SECRET;
    if (!gatewaySecret) {
      console.error("[refresh-token] WHATSAPP_GATEWAY_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const providedSecret = request.headers.get("X-Gateway-Secret");
    if (!providedSecret || providedSecret !== gatewaySecret) {
      console.warn("[refresh-token] Invalid or missing gateway secret");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json() as { sessionId?: string };
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 }
      );
    }

    // Look up session and user
    const session = await db.whatsAppGatewaySession.findUnique({
      where: { sessionId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
          },
        },
      },
    });

    if (!session) {
      console.warn(`[refresh-token] Session not found: ${sessionId}`);
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    if (session.status !== "CONNECTED") {
      console.warn(`[refresh-token] Session not connected: ${sessionId} (status: ${session.status})`);
      return NextResponse.json(
        { error: "Session not connected" },
        { status: 400 }
      );
    }

    // Generate fresh token
    const token = generateJWT(session.user, { tokenType: "whatsapp-gateway" });

    // Calculate expiry (1 hour from now based on jwt.ts config)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // Update lastPingAt to track activity
    await db.whatsAppGatewaySession.update({
      where: { sessionId },
      data: { lastPingAt: new Date() },
    });

    console.log(`[refresh-token] Token refreshed for session: ${sessionId}, user: ${session.userId}`);

    return NextResponse.json({
      token,
      expiresAt,
    });
  } catch (error) {
    console.error("[refresh-token] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
