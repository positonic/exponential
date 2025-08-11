/**
 * In-memory cache service with TTL support
 * For production, consider using Redis
 */
export class CacheService {
  private cache = new Map<string, { value: any; expiry: number }>();
  private readonly defaultTTL = 300000; // 5 minutes
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor() {
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get cached value
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      this.stats.evictions++;
      return null;
    }
    
    this.stats.hits++;
    return entry.value as T;
  }

  /**
   * Set cached value with TTL
   */
  set(key: string, value: any, ttl: number = this.defaultTTL): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }

  /**
   * Delete cached value
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get or set cached value
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    
    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: this.stats.hits > 0 
        ? this.stats.hits / (this.stats.hits + this.stats.misses)
        : 0,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Combined cache service with aggregate stats
class CombinedCacheService {
  userMappings = new CacheService();
  whatsappConfigs = new CacheService();
  aiModels = new CacheService();
  conversations = new CacheService();

  getStats() {
    const services = [
      this.userMappings,
      this.whatsappConfigs,
      this.aiModels,
      this.conversations
    ];

    const totalStats = services.reduce((acc, service) => {
      const stats = service.getStats();
      return {
        size: acc.size + stats.size,
        hits: acc.hits + stats.hits,
        misses: acc.misses + stats.misses,
        evictions: acc.evictions + stats.evictions,
      };
    }, { size: 0, hits: 0, misses: 0, evictions: 0 });

    return {
      ...totalStats,
      hitRate: totalStats.hits > 0 
        ? totalStats.hits / (totalStats.hits + totalStats.misses)
        : 0,
    };
  }
}

// Global cache instances
export const cacheService = new CombinedCacheService();