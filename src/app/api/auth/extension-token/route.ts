import { type NextRequest, NextResponse } from "next/server";
import { decode } from "next-auth/jwt";
import { db } from "~/server/db";
import { generateJWT } from "~/server/utils/jwt";

// Simple in-memory rate limiter (best-effort on serverless)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Periodic cleanup
if (typeof globalThis !== "undefined") {
  const cleanup = () => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap.entries()) {
      if (now > entry.resetAt) rateLimitMap.delete(ip);
    }
  };
  setInterval(cleanup, 5 * 60_000).unref?.();
}

function getSessionCookieName(): string {
  const useSecureCookies =
    process.env.NEXTAUTH_URL?.startsWith("https://") ??
    !!process.env.VERCEL_URL;
  return useSecureCookies
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";
}

function getCorsHeaders(): Record<string, string> | null {
  const extensionId = process.env.CHROME_EXTENSION_ID;
  if (!extensionId) {
    return null; // CORS not configured - endpoint disabled
  }
  return {
    "Access-Control-Allow-Origin": `chrome-extension://${extensionId}`,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

export function OPTIONS() {
  const corsHeaders = getCorsHeaders();
  if (!corsHeaders) {
    return NextResponse.json(
      { error: "Extension endpoint not configured" },
      { status: 503 },
    );
  }
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(request: NextRequest) {
  const corsHeaders = getCorsHeaders();

  if (!corsHeaders) {
    return NextResponse.json(
      { error: "Extension endpoint not configured. Set CHROME_EXTENSION_ID." },
      { status: 503 },
    );
  }

  try {
    // Rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { ...corsHeaders, "Retry-After": "60" } },
      );
    }

    // Strict origin validation (CHROME_EXTENSION_ID is required at this point)
    const extensionId = process.env.CHROME_EXTENSION_ID!;
    const origin = request.headers.get("origin");
    if (origin && origin !== `chrome-extension://${extensionId}`) {
      console.warn("[extension-token] Origin mismatch:", origin);
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403, headers: corsHeaders },
      );
    }

    // Get session token from header
    const sessionToken = request.headers.get("x-session-token");
    if (!sessionToken) {
      return NextResponse.json(
        { error: "x-session-token header is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    // Decode the NextAuth JWE session cookie
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("[extension-token] AUTH_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500, headers: corsHeaders },
      );
    }

    const cookieName = getSessionCookieName();

    const decoded = await decode({
      token: sessionToken,
      secret,
      salt: cookieName,
    });

    if (!decoded?.sub) {
      return NextResponse.json(
        { error: "Invalid or expired session" },
        { status: 401, headers: corsHeaders },
      );
    }

    // Verify user exists
    const user = await db.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, name: true, image: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401, headers: corsHeaders },
      );
    }

    // Generate extension JWT (24h default expiry)
    const token = generateJWT(user, { tokenType: "extension-token" });
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

    console.log(`[extension-token] Token issued for user: ${user.id}`);

    return NextResponse.json(
      { jwt: token, expiresAt },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("[extension-token] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
}
