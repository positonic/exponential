import { db } from "~/server/db";

interface TokenCache {
  accessToken: string;
  expiresAt: number;
  cachedAt: number;
}

// In-memory cache for tokens (5-minute TTL)
const tokenCache = new Map<string, TokenCache>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // Refresh 5 minutes before expiry

export class GoogleTokenManager {
  /**
   * Get a valid access token, refreshing if necessary
   */
  static async getValidAccessToken(userId: string): Promise<string> {
    const cacheKey = userId;

    // Check cache first
    const cached = tokenCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      // Check if token is still valid (not expired)
      if (cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER) {
        return cached.accessToken;
      }
    }

    // Fetch from database
    const account = await db.account.findFirst({
      where: {
        userId,
        provider: "google",
      },
    });

    if (!account) {
      throw new Error("No Google account connection found");
    }

    if (!account.access_token) {
      throw new Error("No access token found");
    }

    // Check if token needs refresh
    const expiresAt = account.expires_at ? account.expires_at * 1000 : 0; // Convert to ms
    const needsRefresh = expiresAt <= Date.now() + TOKEN_REFRESH_BUFFER;

    if (needsRefresh) {
      return await this.refreshAccessToken(account.id, userId);
    }

    // Cache the token
    tokenCache.set(cacheKey, {
      accessToken: account.access_token,
      expiresAt,
      cachedAt: Date.now(),
    });

    return account.access_token;
  }

  /**
   * Refresh an expired access token using the refresh token
   */
  private static async refreshAccessToken(
    accountId: string,
    userId: string
  ): Promise<string> {
    console.log("🔄 Refreshing Google access token...");

    // Get the account with refresh token
    const account = await db.account.findUnique({
      where: { id: accountId },
    });

    if (!account || !account.refresh_token) {
      throw new Error("Refresh token not found");
    }

    try {
      // Request new access token from Google
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          refresh_token: account.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error("❌ Token refresh failed:", {
          status: tokenResponse.status,
          response: errorText,
        });

        throw new Error(`Failed to refresh token: ${tokenResponse.status}`);
      }

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        expires_in: number;
        scope?: string;
      };

      // Calculate new expiry (Unix timestamp in seconds)
      const expiresAt = Math.floor(Date.now() / 1000) + tokens.expires_in;

      // Update database
      await db.account.update({
        where: { id: accountId },
        data: {
          access_token: tokens.access_token,
          expires_at: expiresAt,
          scope: tokens.scope ?? account.scope,
        },
      });

      // Update cache
      tokenCache.set(userId, {
        accessToken: tokens.access_token,
        expiresAt: expiresAt * 1000, // Convert to ms
        cachedAt: Date.now(),
      });

      console.log("✅ Access token refreshed successfully");
      return tokens.access_token;
    } catch (error) {
      console.error("Token refresh error:", error);
      throw error;
    }
  }

  /**
   * Invalidate cache for a user
   */
  static invalidateCache(userId: string): void {
    tokenCache.delete(userId);
  }

  /**
   * Clear all cached tokens (for testing or admin purposes)
   */
  static clearAllCache(): void {
    tokenCache.clear();
  }

  /**
   * Get Google Account connection details
   */
  static async getConnection(userId: string) {
    return await db.account.findFirst({
      where: {
        userId,
        provider: "google",
      },
    });
  }

  /**
   * Check if user has granted required scopes
   */
  static hasRequiredScopes(
    account: { scope: string | null },
    requiredScopes: string[]
  ): boolean {
    if (!account.scope) return false;
    const grantedScopes = account.scope.split(" ");
    return requiredScopes.every((scope) => grantedScopes.includes(scope));
  }
}
