import { Coordinates, LocationInfo, LocationSuggestion } from '../types/location';

export interface GeocodingCacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface GeocodingCache {
  [key: string]: GeocodingCacheEntry;
}

export interface GeocodingCacheStats {
  totalEntries: number;
  expiredEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  totalSize: number; // Approximate size in bytes
  oldestEntry?: Date;
  newestEntry?: Date;
  mostAccessedEntry?: { key: string; accessCount: number };
}

export class GeocodingService {
  private static readonly NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
  private static readonly DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private static readonly SUGGESTION_CACHE_TTL = 60 * 60 * 1000; // 1 hour for suggestions
  private static readonly REQUEST_DELAY = 1000; // 1 second delay between requests (Nominatim policy)
  private static readonly DEFAULT_MAX_CACHE_SIZE = 1000; // Maximum number of cache entries
  
  private cache: GeocodingCache = {};
  private lastRequestTime = 0;
  private hitCount = 0;
  private missCount = 0;
  private maxCacheSize = GeocodingService.DEFAULT_MAX_CACHE_SIZE;
  private defaultTTL = GeocodingService.DEFAULT_CACHE_TTL;

  /**
   * Convert an address string to coordinates
   * @param address - The address to geocode
   * @returns Promise resolving to Coordinates
   */
  async geocodeLocation(address: string): Promise<Coordinates> {
    if (!address.trim()) {
      throw new Error('Address cannot be empty');
    }

    const cacheKey = `geocode:${address.toLowerCase().trim()}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    await this.respectRateLimit();

    try {
      const url = new URL(`${GeocodingService.NOMINATIM_BASE_URL}/search`);
      url.searchParams.set('q', address);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'VolunteerManiac/1.0 (volunteer-search-app)',
        },
      });

      if (!response.ok) {
        throw new Error(`Geocoding request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        throw new Error(`No results found for address: ${address}`);
      }

      const result = data[0];
      const coordinates: Coordinates = {
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
      };

      // Cache the result
      this.setCache(cacheKey, coordinates, this.defaultTTL);

      return coordinates;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Geocoding failed: ${error.message}`);
      }
      throw new Error('Geocoding failed: Unknown error');
    }
  }

  /**
   * Convert coordinates to address information
   * @param coordinates - The coordinates to reverse geocode
   * @returns Promise resolving to LocationInfo
   */
  async reverseGeocode(coordinates: Coordinates): Promise<LocationInfo> {
    const { latitude, longitude } = coordinates;
    
    if (!this.isValidCoordinate(latitude, longitude)) {
      throw new Error('Invalid coordinates provided');
    }

    const cacheKey = `reverse:${latitude.toFixed(6)},${longitude.toFixed(6)}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    await this.respectRateLimit();

    try {
      const url = new URL(`${GeocodingService.NOMINATIM_BASE_URL}/reverse`);
      url.searchParams.set('lat', latitude.toString());
      url.searchParams.set('lon', longitude.toString());
      url.searchParams.set('format', 'json');
      url.searchParams.set('addressdetails', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'VolunteerManiac/1.0 (volunteer-search-app)',
        },
      });

      if (!response.ok) {
        throw new Error(`Reverse geocoding request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || !data.address) {
        throw new Error('No address information found for coordinates');
      }

      const address = data.address;
      const locationInfo: LocationInfo = {
        city: address.city || address.town || address.village || address.hamlet || 'Unknown',
        state: address.state || address.region || address.province,
        country: address.country || 'Unknown',
        formattedAddress: data.display_name || `${latitude}, ${longitude}`,
      };

      // Cache the result
      this.setCache(cacheKey, locationInfo, this.defaultTTL);

      return locationInfo;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Reverse geocoding failed: ${error.message}`);
      }
      throw new Error('Reverse geocoding failed: Unknown error');
    }
  }

  /**
   * Get location suggestions for autocomplete
   * @param query - The search query
   * @param limit - Maximum number of suggestions (default: 5)
   * @returns Promise resolving to array of LocationSuggestion
   */
  async getLocationSuggestions(query: string, limit: number = 5): Promise<LocationSuggestion[]> {
    if (!query.trim() || query.length < 2) {
      return [];
    }

    const cacheKey = `suggestions:${query.toLowerCase().trim()}:${limit}`;
    const cached = this.getFromCache(cacheKey);
    
    if (cached) {
      return cached;
    }

    await this.respectRateLimit();

    try {
      const url = new URL(`${GeocodingService.NOMINATIM_BASE_URL}/search`);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', Math.min(limit, 10).toString());
      url.searchParams.set('addressdetails', '1');
      url.searchParams.set('extratags', '1');

      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'VolunteerManiac/1.0 (volunteer-search-app)',
        },
      });

      if (!response.ok) {
        throw new Error(`Location suggestions request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || data.length === 0) {
        return [];
      }

      const suggestions: LocationSuggestion[] = data.map((item: any) => {
        const address = item.address || {};
        
        return {
          displayName: item.display_name,
          coordinates: {
            latitude: parseFloat(item.lat),
            longitude: parseFloat(item.lon),
          },
          details: {
            city: address.city || address.town || address.village || address.hamlet || 'Unknown',
            state: address.state || address.region || address.province,
            country: address.country || 'Unknown',
            formattedAddress: item.display_name,
          },
        };
      });

      // Cache the suggestions with shorter TTL
      this.setCache(cacheKey, suggestions, GeocodingService.SUGGESTION_CACHE_TTL);

      return suggestions;
    } catch (error) {
      console.warn('Failed to get location suggestions:', error);
      return [];
    }
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): number {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of Object.entries(this.cache)) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => {
      delete this.cache[key];
    });

    if (keysToDelete.length > 0) {
      console.log(`[GeocodingService] Cleaned up ${keysToDelete.length} expired cache entries`);
    }

    return keysToDelete.length;
  }

  /**
   * Clear all cache entries
   */
  clearCache(): void {
    const entriesCount = Object.keys(this.cache).length;
    this.cache = {};
    this.hitCount = 0;
    this.missCount = 0;
    console.log(`[GeocodingService] Cleared ${entriesCount} cache entries`);
  }

  /**
   * Remove least recently used entries when cache is full
   */
  private evictLRUEntries(): void {
    const entries = Object.entries(this.cache);
    if (entries.length <= this.maxCacheSize) {
      return;
    }

    // Sort by last accessed time (oldest first)
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

    // Remove oldest entries until we're under the limit
    const entriesToRemove = entries.length - this.maxCacheSize;
    for (let i = 0; i < entriesToRemove; i++) {
      delete this.cache[entries[i][0]];
    }

    console.log(`[GeocodingService] Evicted ${entriesToRemove} LRU cache entries`);
  }

  /**
   * Get enhanced cache statistics
   */
  getCacheStats(): GeocodingCacheStats {
    this.clearExpiredCache(); // Clean up before calculating stats

    const entries = Object.entries(this.cache);
    const totalRequests = this.hitCount + this.missCount;
    const hitRate = totalRequests > 0 ? this.hitCount / totalRequests : 0;

    // Calculate approximate cache size (rough estimation)
    const totalSize = entries.reduce((size, [key, entry]) => {
      return size + key.length * 2 + JSON.stringify(entry.data).length * 2; // Rough UTF-16 estimation
    }, 0);

    const timestamps = entries.map(([, entry]) => entry.timestamp);
    const oldestEntry = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;
    const newestEntry = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : undefined;

    // Find most accessed entry
    let mostAccessedEntry: { key: string; accessCount: number } | undefined;
    let maxAccessCount = 0;
    for (const [key, entry] of entries) {
      if (entry.accessCount > maxAccessCount) {
        maxAccessCount = entry.accessCount;
        mostAccessedEntry = { key, accessCount: entry.accessCount };
      }
    }

    return {
      totalEntries: entries.length,
      expiredEntries: 0, // Already cleaned up
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: Math.round(hitRate * 100) / 100,
      totalSize,
      oldestEntry,
      newestEntry,
      mostAccessedEntry
    };
  }

  /**
   * Set cache configuration
   */
  setCacheConfig(options: {
    maxCacheSize?: number;
    defaultTTL?: number;
  }): void {
    if (options.maxCacheSize !== undefined) {
      this.maxCacheSize = options.maxCacheSize;
      // If current cache exceeds new max size, evict entries
      this.evictLRUEntries();
      console.log(`[GeocodingService] Max cache size set to ${this.maxCacheSize}`);
    }

    if (options.defaultTTL !== undefined) {
      this.defaultTTL = options.defaultTTL;
      console.log(`[GeocodingService] Default TTL set to ${this.defaultTTL}ms`);
    }
  }

  /**
   * Warm cache with popular locations
   */
  async warmCache(popularLocations: string[]): Promise<void> {
    console.log(`[GeocodingService] Warming cache with ${popularLocations.length} popular locations`);

    const warmupPromises = popularLocations.map(async (location) => {
      try {
        // Check if already cached
        const cacheKey = `geocode:${location.toLowerCase().trim()}`;
        if (this.getFromCache(cacheKey)) {
          return; // Already cached
        }

        // Geocode the location
        await this.geocodeLocation(location);
      } catch (error) {
        console.warn(`[GeocodingService] Failed to warm cache for location: ${location}`, error);
      }
    });

    await Promise.allSettled(warmupPromises);
    console.log(`[GeocodingService] Cache warming completed`);
  }

  /**
   * Get cache keys for debugging
   */
  getCacheKeys(): string[] {
    return Object.keys(this.cache);
  }

  /**
   * Get cache entry details for debugging
   */
  getCacheEntry(key: string): GeocodingCacheEntry | null {
    return this.cache[key] || null;
  }

  /**
   * Respect Nominatim's usage policy by adding delay between requests
   */
  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < GeocodingService.REQUEST_DELAY) {
      const delay = GeocodingService.REQUEST_DELAY - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get data from cache if not expired
   */
  private getFromCache(key: string): any | null {
    const entry = this.cache[key];
    
    if (!entry) {
      this.missCount++;
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      delete this.cache[key];
      this.missCount++;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccessed = now;
    this.hitCount++;

    return entry.data;
  }

  /**
   * Store data in cache with TTL
   */
  private setCache(key: string, data: any, ttl: number): void {
    // Clean up expired entries and evict LRU if necessary
    this.clearExpiredCache();
    
    // If cache would exceed max size, evict LRU entries
    if (Object.keys(this.cache).length >= this.maxCacheSize) {
      this.evictLRUEntries();
    }

    const now = Date.now();
    this.cache[key] = {
      data,
      timestamp: now,
      ttl,
      accessCount: 1,
      lastAccessed: now
    };
  }

  /**
   * Validate coordinate values
   */
  private isValidCoordinate(latitude: number, longitude: number): boolean {
    return (
      typeof latitude === 'number' &&
      typeof longitude === 'number' &&
      !isNaN(latitude) &&
      !isNaN(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    );
  }
}