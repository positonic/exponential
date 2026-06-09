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

interface GoogleAccountRow {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  expires_at: number | null;
}

/**
 * Choose which Google account to use when a user has connected more than one.
 * Prefers (in order): an account that has the required scope, an account with a
 * refresh token, then the account granting the most scopes. This keeps Gmail/CRM
 * features working even after the user adds a calendar-only second Google account.
 */
function pickBestGoogleAccount<T extends GoogleAccountRow>(
  accounts: T[],
  requiredScope?: string,
): T | undefined {
  const usable = accounts.filter((a) => a.access_token);
  if (usable.length === 0) return undefined;

  const scopeCount = (a: GoogleAccountRow) =>
    a.scope ? a.scope.split(" ").length : 0;

  return [...usable].sort((a, b) => {
    if (requiredScope) {
      const aHas = a.scope?.includes(requiredScope) ? 1 : 0;
      const bHas = b.scope?.includes(requiredScope) ? 1 : 0;
      if (aHas !== bHas) return bHas - aHas;
    }
    const aRefresh = a.refresh_token ? 1 : 0;
    const bRefresh = b.refresh_token ? 1 : 0;
    if (aRefresh !== bRefresh) return bRefresh - aRefresh;
    return scopeCount(b) - scopeCount(a);
  })[0];
}

export class GoogleTokenManager {
  /**
   * Get a valid access token, refreshing if necessary.
   * When the user has multiple Google accounts, pass `requiredScope` to target
   * the account that granted it; otherwise the broadest-scoped account is used.
   */
  static async getValidAccessToken(
    userId: string,
    requiredScope?: string,
  ): Promise<string> {
    const cacheKey = `${userId}:${requiredScope ?? "default"}`;

    // Check cache first
    const cached = tokenCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      // Check if token is still valid (not expired)
      if (cached.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER) {
        return cached.accessToken;
      }
    }

    // Fetch all Google accounts and pick the best one for this purpose
    const accounts = await db.account.findMany({
      where: {
        userId,
        provider: "google",
      },
    });

    const account = pickBestGoogleAccount(accounts, requiredScope);

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
      return await this.refreshAccessToken(account.id, cacheKey);
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
    cacheKey: string
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
      tokenCache.set(cacheKey, {
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
   * Invalidate all cached tokens for a user (across scope variants).
   */
  static invalidateCache(userId: string): void {
    tokenCache.delete(userId); // legacy key
    for (const key of tokenCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        tokenCache.delete(key);
      }
    }
  }

  /**
   * Clear all cached tokens (for testing or admin purposes)
   */
  static clearAllCache(): void {
    tokenCache.clear();
  }

  /**
   * Get Google Account connection details. When the user has multiple Google
   * accounts, pass `requiredScope` to pick the account that granted it;
   * otherwise the broadest-scoped account is returned.
   */
  static async getConnection(userId: string, requiredScope?: string) {
    const accounts = await db.account.findMany({
      where: {
        userId,
        provider: "google",
      },
    });
    return pickBestGoogleAccount(accounts, requiredScope) ?? null;
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
