import { VolunteerOpportunity, SearchParameters, SearchFilters } from '../types/volunteer';
import { Coordinates } from '../types/location';

export interface CacheEntry {
  key: string;
  data: VolunteerOpportunity[];
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  searchParams: SearchParameters;
  metadata: {
    totalResults: number;
    sources: string[];
    responseTime: number;
  };
}

export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  totalSize: number; // Approximate size in bytes
  oldestEntry?: Date;
  newestEntry?: Date;
}

export class SearchResultsCache {
  private cache = new Map<string, CacheEntry>();
  private defaultTTL = 30 * 60 * 1000; // 30 minutes in milliseconds
  private maxCacheSize = 100; // Maximum number of cache entries
  private hitCount = 0;
  private missCount = 0;

  /**
   * Generate cache key based on search parameters
   */
  private generateCacheKey(searchParams: SearchParameters): string {
    const {
      location,
      radius,
      causes = [],
      type = 'both',
      limit = 50
    } = searchParams;

    // Round coordinates to 3 decimal places for cache key consistency
    const roundedLat = Math.round(location.latitude * 1000) / 1000;
    const roundedLng = Math.round(location.longitude * 1000) / 1000;

    // Sort causes for consistent key generation
    const sortedCauses = [...causes].sort();

    const keyComponents = [
      `lat:${roundedLat}`,
      `lng:${roundedLng}`,
      `radius:${radius}`,
      `type:${type}`,
      `causes:${sortedCauses.join(',')}`,
      `limit:${limit}`
    ];

    return keyComponents.join('|');
  }

  /**
   * Store search results in cache
   */
  set(
    searchParams: SearchParameters,
    opportunities: VolunteerOpportunity[],
    metadata: {
      totalResults: number;
      sources: string[];
      responseTime: number;
    },
    customTTL?: number
  ): void {
    const key = this.generateCacheKey(searchParams);
    const ttl = customTTL || this.defaultTTL;
    const timestamp = Date.now();

    const entry: CacheEntry = {
      key,
      data: opportunities,
      timestamp,
      ttl,
      searchParams: { ...searchParams },
      metadata: { ...metadata }
    };

    // Clean up expired entries before adding new one
    this.cleanupExpiredEntries();

    // If cache would exceed max size after adding this entry, remove oldest entries
    while (this.cache.size >= this.maxCacheSize) {
      this.removeOldestEntry();
    }

    this.cache.set(key, entry);
    console.log(`[SearchResultsCache] Cached results for key: ${key} (${opportunities.length} opportunities)`);
  }

  /**
   * Retrieve search results from cache
   */
  get(searchParams: SearchParameters): VolunteerOpportunity[] | null {
    const key = this.generateCacheKey(searchParams);
    const entry = this.cache.get(key);

    if (!entry) {
      this.missCount++;
      console.log(`[SearchResultsCache] Cache miss for key: ${key}`);
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.missCount++;
      console.log(`[SearchResultsCache] Cache expired for key: ${key}`);
      return null;
    }

    this.hitCount++;
    console.log(`[SearchResultsCache] Cache hit for key: ${key} (${entry.data.length} opportunities)`);
    return entry.data;
  }

  /**
   * Check if a cache entry exists and is valid
   */
  has(searchParams: SearchParameters): boolean {
    const key = this.generateCacheKey(searchParams);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return false;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Remove expired entries from cache
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[SearchResultsCache] Cleaned up ${removedCount} expired entries`);
    }
  }

  /**
   * Remove oldest entry from cache
   */
  private removeOldestEntry(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log(`[SearchResultsCache] Removed oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    const entriesCount = this.cache.size;
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
    console.log(`[SearchResultsCache] Cleared ${entriesCount} cache entries`);
  }

  /**
   * Invalidate cache entries matching specific criteria
   */
  invalidate(criteria: {
    location?: Coordinates;
    radius?: number;
    causes?: string[];
    type?: string;
  }): number {
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      let shouldRemove = false;

      // Check location match (within small radius for floating point comparison)
      if (criteria.location) {
        const distance = this.calculateDistance(
          criteria.location,
          entry.searchParams.location
        );
        if (distance < 0.1) { // Within 0.1 km
          shouldRemove = true;
        }
      }

      // Check radius match
      if (criteria.radius && entry.searchParams.radius === criteria.radius) {
        shouldRemove = true;
      }

      // Check causes match
      if (criteria.causes && entry.searchParams.causes) {
        const hasMatchingCause = criteria.causes.some(cause =>
          entry.searchParams.causes?.includes(cause)
        );
        if (hasMatchingCause) {
          shouldRemove = true;
        }
      }

      // Check type match
      if (criteria.type && entry.searchParams.type === criteria.type) {
        shouldRemove = true;
      }

      if (shouldRemove) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[SearchResultsCache] Invalidated ${removedCount} cache entries`);
    }

    return removedCount;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(coord2.latitude - coord1.latitude);
    const dLon = this.toRadians(coord2.longitude - coord1.longitude);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(coord1.latitude)) * Math.cos(this.toRadians(coord2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.cleanupExpiredEntries(); // Clean up before calculating stats

    const entries = Array.from(this.cache.values());
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;

    // Calculate approximate cache size
    const totalSize = entries.reduce((size, entry) => {
      // Rough estimation: each opportunity is ~1KB
      return size + (entry.data.length * 1024);
    }, 0);

    const timestamps = entries.map(entry => entry.timestamp);
    const oldestEntry = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
    const newestEntry = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

    return {
      totalEntries: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: Math.round(hitRate * 100) / 100,
      totalSize,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Get all cache keys (for debugging)
   */
  getKeys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache entry details (for debugging)
   */
  getEntry(searchParams: SearchParameters): CacheEntry | null {
    const key = this.generateCacheKey(searchParams);
    return this.cache.get(key) || null;
  }

  /**
   * Set custom TTL for future cache entries
   */
  setDefaultTTL(ttlMs: number): void {
    this.defaultTTL = ttlMs;
    console.log(`[SearchResultsCache] Default TTL set to ${ttlMs}ms`);
  }

  /**
   * Set maximum cache size
   */
  setMaxCacheSize(maxSize: number): void {
    this.maxCacheSize = maxSize;
    
    // If current cache exceeds new max size, remove oldest entries
    while (this.cache.size > maxSize) {
      this.removeOldestEntry();
    }
    
    console.log(`[SearchResultsCache] Max cache size set to ${maxSize}`);
  }

  /**
   * Preload cache with popular locations (cache warming)
   */
  async warmCache(
    popularLocations: { coordinates: Coordinates; radius: number }[],
    searchFunction: (params: SearchParameters) => Promise<{
      opportunities: VolunteerOpportunity[];
      metadata: { totalResults: number; sources: string[]; responseTime: number };
    }>
  ): Promise<void> {
    console.log(`[SearchResultsCache] Warming cache with ${popularLocations.length} popular locations`);

    const warmupPromises = popularLocations.map(async (location) => {
      const searchParams: SearchParameters = {
        location: location.coordinates,
        radius: location.radius,
        type: 'both',
        limit: 50
      };

      try {
        const result = await searchFunction(searchParams);
        this.set(searchParams, result.opportunities, result.metadata);
      } catch (error) {
        console.warn(`[SearchResultsCache] Failed to warm cache for location:`, location, error);
      }
    });

    await Promise.allSettled(warmupPromises);
    console.log(`[SearchResultsCache] Cache warming completed`);
  }
}

// Export singleton instance
export const searchResultsCache = new SearchResultsCache();