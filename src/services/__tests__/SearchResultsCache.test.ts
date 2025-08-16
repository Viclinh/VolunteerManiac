import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SearchResultsCache } from '../SearchResultsCache';
import { SearchParameters, VolunteerOpportunity } from '../../types/volunteer';
import { Coordinates } from '../../types/location';

describe('SearchResultsCache', () => {
  let cache: SearchResultsCache;
  let mockSearchParams: SearchParameters;
  let mockOpportunities: VolunteerOpportunity[];
  let mockMetadata: { totalResults: number; sources: string[]; responseTime: number };

  beforeEach(() => {
    cache = new SearchResultsCache();
    
    mockSearchParams = {
      location: { latitude: 40.7128, longitude: -74.0060 }, // New York
      radius: 25,
      type: 'both',
      causes: ['education', 'environment'],
      limit: 50
    };

    mockOpportunities = [
      {
        id: '1',
        title: 'Test Opportunity 1',
        organization: 'Test Org 1',
        location: 'New York, NY',
        city: 'New York',
        country: 'USA',
        type: 'in-person',
        cause: 'education',
        description: 'Test description 1',
        timeCommitment: '2-4 hours',
        skills: ['teaching'],
        image: 'test1.jpg',
        date: '2024-01-15',
        participants: 10,
        source: 'TestAPI',
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
        distance: 0,
        contactInfo: { email: 'test1@example.com' },
        externalUrl: 'https://example.com/1',
        lastUpdated: new Date(),
        verified: true
      },
      {
        id: '2',
        title: 'Test Opportunity 2',
        organization: 'Test Org 2',
        location: 'New York, NY',
        city: 'New York',
        country: 'USA',
        type: 'virtual',
        cause: 'environment',
        description: 'Test description 2',
        timeCommitment: '1-2 hours',
        skills: ['research'],
        image: 'test2.jpg',
        date: '2024-01-16',
        participants: 5,
        source: 'TestAPI',
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
        distance: 0,
        contactInfo: { email: 'test2@example.com' },
        externalUrl: 'https://example.com/2',
        lastUpdated: new Date(),
        verified: true
      }
    ];

    mockMetadata = {
      totalResults: 2,
      sources: ['TestAPI'],
      responseTime: 1500
    };

    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for identical search parameters', () => {
      const params1: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both',
        causes: ['education', 'environment'],
        limit: 50
      };

      const params2: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both',
        causes: ['environment', 'education'], // Different order
        limit: 50
      };

      cache.set(params1, mockOpportunities, mockMetadata);
      const result = cache.get(params2);

      expect(result).toEqual(mockOpportunities);
    });

    it('should generate different cache keys for different coordinates', () => {
      const params1: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both'
      };

      const params2: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 }, // Los Angeles
        radius: 25,
        type: 'both'
      };

      cache.set(params1, mockOpportunities, mockMetadata);
      const result = cache.get(params2);

      expect(result).toBeNull();
    });

    it('should generate different cache keys for different radius values', () => {
      const params1: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both'
      };

      const params2: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 50,
        type: 'both'
      };

      cache.set(params1, mockOpportunities, mockMetadata);
      const result = cache.get(params2);

      expect(result).toBeNull();
    });
  });

  describe('Cache Operations', () => {
    it('should store and retrieve search results', () => {
      cache.set(mockSearchParams, mockOpportunities, mockMetadata);
      const result = cache.get(mockSearchParams);

      expect(result).toEqual(mockOpportunities);
    });

    it('should return null for cache miss', () => {
      const differentParams: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 },
        radius: 25,
        type: 'both'
      };

      const result = cache.get(differentParams);
      expect(result).toBeNull();
    });

    it('should check if cache has entry', () => {
      cache.set(mockSearchParams, mockOpportunities, mockMetadata);
      
      expect(cache.has(mockSearchParams)).toBe(true);
      
      const differentParams: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 },
        radius: 25,
        type: 'both'
      };
      expect(cache.has(differentParams)).toBe(false);
    });

    it('should clear all cache entries', () => {
      cache.set(mockSearchParams, mockOpportunities, mockMetadata);
      expect(cache.has(mockSearchParams)).toBe(true);

      cache.clear();
      expect(cache.has(mockSearchParams)).toBe(false);

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
    });
  });

  describe('TTL and Expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTTL = 100; // 100ms
      cache.set(mockSearchParams, mockOpportunities, mockMetadata, shortTTL);
      
      // Should be available immediately
      expect(cache.get(mockSearchParams)).toEqual(mockOpportunities);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Should be expired now
      expect(cache.get(mockSearchParams)).toBeNull();
    });

    it('should set custom default TTL', () => {
      const customTTL = 60000; // 1 minute
      cache.setDefaultTTL(customTTL);
      
      cache.set(mockSearchParams, mockOpportunities, mockMetadata);
      const entry = cache.getEntry(mockSearchParams);
      
      expect(entry?.ttl).toBe(customTTL);
    });

    it('should clean up expired entries automatically', async () => {
      const shortTTL = 50;
      cache.set(mockSearchParams, mockOpportunities, mockMetadata, shortTTL);
      
      // Add another entry that won't expire
      const longLivedParams: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 },
        radius: 25,
        type: 'both'
      };
      cache.set(longLivedParams, mockOpportunities, mockMetadata, 10000);
      
      expect(cache.getStats().totalEntries).toBe(2);
      
      // Wait for first entry to expire
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Trigger cleanup by getting stats
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(1);
    });
  });

  describe('Cache Size Management', () => {
    it('should respect maximum cache size', () => {
      cache.setMaxCacheSize(2);
      
      // Add 3 entries
      const params1: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both'
      };
      const params2: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 },
        radius: 25,
        type: 'both'
      };
      const params3: SearchParameters = {
        location: { latitude: 41.8781, longitude: -87.6298 },
        radius: 25,
        type: 'both'
      };

      cache.set(params1, mockOpportunities, mockMetadata);
      cache.set(params2, mockOpportunities, mockMetadata);
      cache.set(params3, mockOpportunities, mockMetadata);

      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(2);
    });

    it('should remove oldest entry when cache is full', () => {
      cache.setMaxCacheSize(2);
      
      const params1: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both'
      };
      const params2: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 },
        radius: 25,
        type: 'both'
      };
      const params3: SearchParameters = {
        location: { latitude: 41.8781, longitude: -87.6298 },
        radius: 25,
        type: 'both'
      };

      cache.set(params1, mockOpportunities, mockMetadata);
      cache.set(params2, mockOpportunities, mockMetadata);
      
      // First entry should still be there
      expect(cache.has(params1)).toBe(true);
      
      cache.set(params3, mockOpportunities, mockMetadata);
      
      // First entry should be removed (oldest)
      expect(cache.has(params1)).toBe(false);
      expect(cache.has(params2)).toBe(true);
      expect(cache.has(params3)).toBe(true);
    });
  });

  describe('Cache Invalidation', () => {
    it('should invalidate entries by location', () => {
      const nyParams: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both'
      };
      const laParams: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 },
        radius: 25,
        type: 'both'
      };

      cache.set(nyParams, mockOpportunities, mockMetadata);
      cache.set(laParams, mockOpportunities, mockMetadata);

      const removedCount = cache.invalidate({
        location: { latitude: 40.7128, longitude: -74.0060 }
      });

      expect(removedCount).toBe(1);
      expect(cache.has(nyParams)).toBe(false);
      expect(cache.has(laParams)).toBe(true);
    });

    it('should invalidate entries by radius', () => {
      const params25: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both'
      };
      const params50: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 50,
        type: 'both'
      };

      cache.set(params25, mockOpportunities, mockMetadata);
      cache.set(params50, mockOpportunities, mockMetadata);

      const removedCount = cache.invalidate({ radius: 25 });

      expect(removedCount).toBe(1);
      expect(cache.has(params25)).toBe(false);
      expect(cache.has(params50)).toBe(true);
    });

    it('should invalidate entries by causes', () => {
      const educationParams: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both',
        causes: ['education']
      };
      const environmentParams: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        type: 'both',
        causes: ['environment']
      };

      cache.set(educationParams, mockOpportunities, mockMetadata);
      cache.set(environmentParams, mockOpportunities, mockMetadata);

      const removedCount = cache.invalidate({ causes: ['education'] });

      expect(removedCount).toBe(1);
      expect(cache.has(educationParams)).toBe(false);
      expect(cache.has(environmentParams)).toBe(true);
    });
  });

  describe('Cache Statistics', () => {
    it('should track hit and miss counts', () => {
      cache.set(mockSearchParams, mockOpportunities, mockMetadata);
      
      // Hit
      cache.get(mockSearchParams);
      
      // Miss
      const differentParams: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 },
        radius: 25,
        type: 'both'
      };
      cache.get(differentParams);

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should calculate cache statistics correctly', () => {
      cache.set(mockSearchParams, mockOpportunities, mockMetadata);
      
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.oldestEntry).toBeInstanceOf(Date);
      expect(stats.newestEntry).toBeInstanceOf(Date);
    });

    it('should return empty stats for empty cache', () => {
      const stats = cache.getStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.oldestEntry).toBeUndefined();
      expect(stats.newestEntry).toBeUndefined();
    });
  });

  describe('Cache Warming', () => {
    it('should warm cache with popular locations', async () => {
      const popularLocations = [
        { coordinates: { latitude: 40.7128, longitude: -74.0060 }, radius: 25 },
        { coordinates: { latitude: 34.0522, longitude: -118.2437 }, radius: 25 }
      ];

      const mockSearchFunction = vi.fn().mockResolvedValue({
        opportunities: mockOpportunities,
        metadata: mockMetadata
      });

      await cache.warmCache(popularLocations, mockSearchFunction);

      expect(mockSearchFunction).toHaveBeenCalledTimes(2);
      expect(cache.getStats().totalEntries).toBe(2);
    });

    it('should handle errors during cache warming', async () => {
      const popularLocations = [
        { coordinates: { latitude: 40.7128, longitude: -74.0060 }, radius: 25 }
      ];

      const mockSearchFunction = vi.fn().mockRejectedValue(new Error('Search failed'));

      await cache.warmCache(popularLocations, mockSearchFunction);

      expect(mockSearchFunction).toHaveBeenCalledTimes(1);
      expect(cache.getStats().totalEntries).toBe(0);
    });
  });

  describe('Utility Methods', () => {
    it('should get all cache keys', () => {
      cache.set(mockSearchParams, mockOpportunities, mockMetadata);
      
      const keys = cache.getKeys();
      expect(keys).toHaveLength(1);
      expect(keys[0]).toContain('lat:40.713');
    });

    it('should get cache entry details', () => {
      cache.set(mockSearchParams, mockOpportunities, mockMetadata);
      
      const entry = cache.getEntry(mockSearchParams);
      expect(entry).toBeDefined();
      expect(entry?.data).toEqual(mockOpportunities);
      expect(entry?.metadata).toEqual(mockMetadata);
    });

    it('should return null for non-existent entry', () => {
      const differentParams: SearchParameters = {
        location: { latitude: 34.0522, longitude: -118.2437 },
        radius: 25,
        type: 'both'
      };
      
      const entry = cache.getEntry(differentParams);
      expect(entry).toBeNull();
    });
  });
});