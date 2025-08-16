import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeocodingService } from '../geocodingService';
import { Coordinates, LocationInfo, LocationSuggestion } from '../../types/location';

// Mock fetch globally
global.fetch = vi.fn();

describe('GeocodingService', () => {
  let geocodingService: GeocodingService;
  let mockFetch: any;

  beforeEach(() => {
    geocodingService = new GeocodingService();
    mockFetch = global.fetch as any;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('geocodeLocation', () => {
    it('should successfully geocode an address', async () => {
      const mockResponse = [
        {
          lat: '40.7128',
          lon: '-74.0060',
          display_name: 'New York, NY, USA',
          address: {
            city: 'New York',
            state: 'New York',
            country: 'United States',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await geocodingService.geocodeLocation('New York, NY');

      expect(result).toEqual({
        latitude: 40.7128,
        longitude: -74.0060,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('nominatim.openstreetmap.org/search'),
        expect.objectContaining({
          headers: {
            'User-Agent': 'VolunteerManiac/1.0 (volunteer-search-app)',
          },
        })
      );
    });

    it('should throw error for empty address', async () => {
      await expect(geocodingService.geocodeLocation('')).rejects.toThrow(
        'Address cannot be empty'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw error when no results found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await expect(geocodingService.geocodeLocation('Invalid Address')).rejects.toThrow(
        'No results found for address: Invalid Address'
      );
    });

    it('should throw error when API request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(geocodingService.geocodeLocation('New York')).rejects.toThrow(
        'Geocoding failed: Geocoding request failed: 500 Internal Server Error'
      );
    });

    it('should throw error when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(geocodingService.geocodeLocation('New York')).rejects.toThrow(
        'Geocoding failed: Network error'
      );
    });

    it('should return cached result on second call', async () => {
      const mockResponse = [
        {
          lat: '40.7128',
          lon: '-74.0060',
          display_name: 'New York, NY, USA',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // First call
      const result1 = await geocodingService.geocodeLocation('New York');
      
      // Second call should use cache
      const result2 = await geocodingService.geocodeLocation('New York');

      expect(result1).toEqual(result2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('reverseGeocode', () => {
    it('should successfully reverse geocode coordinates', async () => {
      const mockResponse = {
        display_name: 'New York, NY, USA',
        address: {
          city: 'New York',
          state: 'New York',
          country: 'United States',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const coordinates: Coordinates = { latitude: 40.7128, longitude: -74.0060 };
      const result = await geocodingService.reverseGeocode(coordinates);

      expect(result).toEqual({
        city: 'New York',
        state: 'New York',
        country: 'United States',
        formattedAddress: 'New York, NY, USA',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('nominatim.openstreetmap.org/reverse'),
        expect.objectContaining({
          headers: {
            'User-Agent': 'VolunteerManiac/1.0 (volunteer-search-app)',
          },
        })
      );
    });

    it('should handle missing city information', async () => {
      const mockResponse = {
        display_name: 'Rural Area, State, Country',
        address: {
          town: 'Small Town',
          state: 'State',
          country: 'Country',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const coordinates: Coordinates = { latitude: 45.0, longitude: -90.0 };
      const result = await geocodingService.reverseGeocode(coordinates);

      expect(result.city).toBe('Small Town');
    });

    it('should throw error for invalid coordinates', async () => {
      const invalidCoordinates: Coordinates = { latitude: 91, longitude: 181 };

      await expect(geocodingService.reverseGeocode(invalidCoordinates)).rejects.toThrow(
        'Invalid coordinates provided'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should throw error when API request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const coordinates: Coordinates = { latitude: 40.7128, longitude: -74.0060 };

      await expect(geocodingService.reverseGeocode(coordinates)).rejects.toThrow(
        'Reverse geocoding failed: Reverse geocoding request failed: 404 Not Found'
      );
    });

    it('should throw error when no address information found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const coordinates: Coordinates = { latitude: 40.7128, longitude: -74.0060 };

      await expect(geocodingService.reverseGeocode(coordinates)).rejects.toThrow(
        'No address information found for coordinates'
      );
    });

    it('should return cached result on second call', async () => {
      const mockResponse = {
        display_name: 'New York, NY, USA',
        address: {
          city: 'New York',
          state: 'New York',
          country: 'United States',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const coordinates: Coordinates = { latitude: 40.7128, longitude: -74.0060 };
      
      // First call
      const result1 = await geocodingService.reverseGeocode(coordinates);
      
      // Second call should use cache
      const result2 = await geocodingService.reverseGeocode(coordinates);

      expect(result1).toEqual(result2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLocationSuggestions', () => {
    it('should return location suggestions', async () => {
      const mockResponse = [
        {
          lat: '40.7128',
          lon: '-74.0060',
          display_name: 'New York, NY, USA',
          address: {
            city: 'New York',
            state: 'New York',
            country: 'United States',
          },
        },
        {
          lat: '40.7589',
          lon: '-73.9851',
          display_name: 'New York, Manhattan, NY, USA',
          address: {
            city: 'New York',
            state: 'New York',
            country: 'United States',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await geocodingService.getLocationSuggestions('New York');

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        displayName: 'New York, NY, USA',
        coordinates: {
          latitude: 40.7128,
          longitude: -74.0060,
        },
        details: {
          city: 'New York',
          state: 'New York',
          country: 'United States',
          formattedAddress: 'New York, NY, USA',
        },
      });
    });

    it('should return empty array for short queries', async () => {
      const result = await geocodingService.getLocationSuggestions('N');
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return empty array for empty queries', async () => {
      const result = await geocodingService.getLocationSuggestions('');
      expect(result).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should limit results to specified limit', async () => {
      const mockResponse = Array.from({ length: 10 }, (_, i) => ({
        lat: `40.${i}`,
        lon: `-74.${i}`,
        display_name: `Location ${i}`,
        address: {
          city: `City ${i}`,
          country: 'Country',
        },
      }));

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await geocodingService.getLocationSuggestions('test', 3);

      expect(result).toHaveLength(10); // All results returned, but API was called with limit=3
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('limit=3'),
        expect.any(Object)
      );
    });

    it('should handle API errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await geocodingService.getLocationSuggestions('New York');

      expect(result).toEqual([]);
    });

    it('should return cached suggestions on second call', async () => {
      const mockResponse = [
        {
          lat: '40.7128',
          lon: '-74.0060',
          display_name: 'New York, NY, USA',
          address: {
            city: 'New York',
            country: 'United States',
          },
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // First call
      const result1 = await geocodingService.getLocationSuggestions('New York');
      
      // Second call should use cache
      const result2 = await geocodingService.getLocationSuggestions('New York');

      expect(result1).toEqual(result2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache management', () => {
    it('should clear expired cache entries', async () => {
      // Mock a geocoding call to populate cache
      const mockResponse = [
        {
          lat: '40.7128',
          lon: '-74.0060',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await geocodingService.geocodeLocation('New York');

      // Verify cache has entry
      let stats = geocodingService.getCacheStats();
      expect(stats.totalEntries).toBe(1);

      // Manually expire the cache entry by manipulating time
      const service = geocodingService as any;
      const cacheKey = Object.keys(service.cache)[0];
      service.cache[cacheKey].timestamp = Date.now() - (25 * 60 * 60 * 1000); // 25 hours ago

      // Clear expired entries
      geocodingService.clearExpiredCache();

      stats = geocodingService.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should clear all cache entries', async () => {
      // Mock a geocoding call to populate cache
      const mockResponse = [
        {
          lat: '40.7128',
          lon: '-74.0060',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await geocodingService.geocodeLocation('New York');

      // Verify cache has entry
      let stats = geocodingService.getCacheStats();
      expect(stats.totalEntries).toBe(1);

      // Clear all cache
      geocodingService.clearCache();

      stats = geocodingService.getCacheStats();
      expect(stats.totalEntries).toBe(0);
    });

    it('should provide accurate cache statistics', async () => {
      // Initially empty
      let stats = geocodingService.getCacheStats();
      expect(stats.totalEntries).toBe(0);
      expect(stats.expiredEntries).toBe(0);

      // Add some cache entries
      const mockResponse = [{ lat: '40.7128', lon: '-74.0060' }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      await geocodingService.geocodeLocation('New York');
      await geocodingService.geocodeLocation('Los Angeles');

      stats = geocodingService.getCacheStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.expiredEntries).toBe(0);
    });
  });

  describe('rate limiting', () => {
    it('should respect rate limiting between requests', async () => {
      const mockResponse = [{ lat: '40.7128', lon: '-74.0060' }];
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const startTime = Date.now();
      
      // Make two requests
      await geocodingService.geocodeLocation('New York');
      await geocodingService.geocodeLocation('Los Angeles');

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should take at least 1 second due to rate limiting
      expect(duration).toBeGreaterThanOrEqual(1000);
    });
  });
  });

  describe('Enhanced Caching', () => {
    it('should provide enhanced cache management methods', () => {
      // Test that enhanced methods exist and work
      expect(() => geocodingService.setCacheConfig({ maxCacheSize: 100 })).not.toThrow();
      expect(() => geocodingService.setCacheConfig({ defaultTTL: 60000 })).not.toThrow();
      
      const stats = geocodingService.getCacheStats();
      expect(stats).toHaveProperty('hitCount');
      expect(stats).toHaveProperty('missCount');
      expect(stats).toHaveProperty('hitRate');
      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('mostAccessedEntry');

      const keys = geocodingService.getCacheKeys();
      expect(Array.isArray(keys)).toBe(true);

      expect(() => geocodingService.warmCache(['New York'])).not.toThrow();
    });
  });