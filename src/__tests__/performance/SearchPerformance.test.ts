import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchController } from '../../services/SearchController';
import { APIServiceRegistry } from '../../services/api/APIServiceRegistry';
import { BaseAPIService } from '../../services/api/BaseAPIService';
import { MultiLocationService } from '../../services/MultiLocationService';
import { SearchResultsCache } from '../../services/SearchResultsCache';
import { VolunteerOpportunity, SearchParameters, APIResult } from '../../types/volunteer';
import { Coordinates } from '../../types/location';

// Mock console methods to avoid noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Performance test utilities
class PerformanceTimer {
  private startTime: number = 0;
  private endTime: number = 0;

  start(): void {
    this.startTime = performance.now();
  }

  stop(): number {
    this.endTime = performance.now();
    return this.endTime - this.startTime;
  }

  getElapsed(): number {
    return this.endTime - this.startTime;
  }
}

// Mock API Service for performance testing
class MockPerformanceAPIService extends BaseAPIService {
  public serviceName: string;
  private mockOpportunities: VolunteerOpportunity[];
  private responseDelay: number;
  private shouldFail: boolean;

  constructor(
    serviceName: string,
    opportunities: VolunteerOpportunity[] = [],
    responseDelay: number = 0,
    shouldFail: boolean = false
  ) {
    super(serviceName, 'http://mock.api', 5000);
    this.serviceName = serviceName;
    this.mockOpportunities = opportunities;
    this.responseDelay = responseDelay;
    this.shouldFail = shouldFail;
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    // Simulate network delay
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    if (this.shouldFail) {
      throw new Error(`Mock API service ${this.serviceName} failure`);
    }

    return this.createSuccessResult(this.mockOpportunities);
  }

  async getOpportunityDetails(id: string): Promise<VolunteerOpportunity> {
    const opportunity = this.mockOpportunities.find(opp => opp.id === id);
    if (!opportunity) {
      throw new Error('Opportunity not found');
    }
    return opportunity;
  }

  protected normalizeOpportunity(rawData: any): VolunteerOpportunity {
    return rawData;
  }
}

// Generate mock opportunities for performance testing
function generateMockOpportunities(count: number, sourcePrefix: string = 'test'): VolunteerOpportunity[] {
  const opportunities: VolunteerOpportunity[] = [];
  const causes = ['Environment', 'Education', 'Health & Medicine', 'Hunger', 'Animals'];
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
  
  for (let i = 0; i < count; i++) {
    opportunities.push({
      id: `${sourcePrefix}-${i}`,
      source: sourcePrefix,
      title: `Volunteer Opportunity ${i}`,
      organization: `Organization ${i % 10}`,
      description: `Description for opportunity ${i}. This is a longer description to simulate real data.`,
      location: `${cities[i % cities.length]}, State`,
      city: cities[i % cities.length],
      country: 'United States',
      type: i % 2 === 0 ? 'in-person' : 'virtual',
      cause: causes[i % causes.length],
      skills: [`skill${i % 5}`, `skill${(i + 1) % 5}`],
      timeCommitment: `${2 + (i % 6)} hours`,
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      participants: 10 + (i % 50),
      image: `https://example.com/image${i}.jpg`,
      contactInfo: { 
        email: `contact${i}@example.org`,
        phone: i % 3 === 0 ? `555-${String(i).padStart(4, '0')}` : undefined
      },
      externalUrl: `https://example.org/volunteer/${i}`,
      lastUpdated: new Date(),
      verified: i % 4 !== 0,
      distance: Math.random() * 50 // Random distance up to 50 miles
    });
  }
  
  return opportunities;
}

describe('Search Performance Tests', () => {
  let searchController: SearchController;
  let mockRegistry: APIServiceRegistry;
  let mockCoordinates: Coordinates;
  let mockSearchParams: SearchParameters;
  let timer: PerformanceTimer;

  beforeEach(() => {
    mockRegistry = new APIServiceRegistry();
    searchController = new SearchController(mockRegistry);
    timer = new PerformanceTimer();
    
    mockCoordinates = { latitude: 40.7128, longitude: -74.0060 }; // NYC
    mockSearchParams = {
      location: mockCoordinates,
      radius: 25,
      keywords: 'environment',
      type: 'both',
      limit: 50
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Single Service Performance', () => {
    it('should handle small result sets efficiently (< 100ms)', async () => {
      const smallOpportunities = generateMockOpportunities(10, 'small');
      const service = new MockPerformanceAPIService('SmallService', smallOpportunities, 0);
      mockRegistry.registerService(service);

      timer.start();
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const elapsed = timer.stop();

      expect(result.opportunities).toHaveLength(10);
      expect(elapsed).toBeLessThan(100); // Should complete in under 100ms
      expect(result.responseTime).toBeDefined();
    });

    it('should handle medium result sets efficiently (< 200ms)', async () => {
      const mediumOpportunities = generateMockOpportunities(100, 'medium');
      const service = new MockPerformanceAPIService('MediumService', mediumOpportunities, 0);
      mockRegistry.registerService(service);

      timer.start();
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const elapsed = timer.stop();

      expect(result.opportunities).toHaveLength(100);
      expect(elapsed).toBeLessThan(200); // Should complete in under 200ms
    });

    it('should handle large result sets within reasonable time (< 500ms)', async () => {
      const largeOpportunities = generateMockOpportunities(1000, 'large');
      const service = new MockPerformanceAPIService('LargeService', largeOpportunities, 0);
      mockRegistry.registerService(service);

      timer.start();
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const elapsed = timer.stop();

      expect(result.opportunities).toHaveLength(1000);
      expect(elapsed).toBeLessThan(500); // Should complete in under 500ms
    });

    it('should handle very large result sets with acceptable performance (< 1000ms)', async () => {
      const veryLargeOpportunities = generateMockOpportunities(5000, 'verylarge');
      const service = new MockPerformanceAPIService('VeryLargeService', veryLargeOpportunities, 0);
      mockRegistry.registerService(service);

      timer.start();
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const elapsed = timer.stop();

      expect(result.opportunities).toHaveLength(5000);
      expect(elapsed).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe('Multiple Service Performance', () => {
    it('should handle concurrent requests from multiple services efficiently', async () => {
      // Register multiple services with different response times
      const services = [
        new MockPerformanceAPIService('FastService', generateMockOpportunities(50, 'fast'), 50),
        new MockPerformanceAPIService('MediumService', generateMockOpportunities(100, 'medium'), 100),
        new MockPerformanceAPIService('SlowService', generateMockOpportunities(75, 'slow'), 200)
      ];

      services.forEach(service => mockRegistry.registerService(service));

      timer.start();
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const elapsed = timer.stop();

      // Should complete in roughly the time of the slowest service (not sum of all)
      expect(elapsed).toBeLessThan(400); // Should be closer to 200ms than 350ms (50+100+200)
      expect(result.opportunities).toHaveLength(225); // 50 + 100 + 75
      expect(result.sources).toHaveLength(3);
    });

    it('should handle many concurrent services without significant performance degradation', async () => {
      // Register 10 services
      const serviceCount = 10;
      for (let i = 0; i < serviceCount; i++) {
        const service = new MockPerformanceAPIService(
          `Service${i}`,
          generateMockOpportunities(20, `service${i}`),
          50 + (i * 10) // Staggered response times
        );
        mockRegistry.registerService(service);
      }

      timer.start();
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const elapsed = timer.stop();

      // Should complete in roughly the time of the slowest service
      expect(elapsed).toBeLessThan(300); // Slowest service is ~140ms + overhead
      expect(result.opportunities).toHaveLength(200); // 10 services * 20 opportunities
      expect(result.sources).toHaveLength(10);
    });

    it('should handle mixed success/failure scenarios efficiently', async () => {
      // Mix of successful and failing services
      const services = [
        new MockPerformanceAPIService('Success1', generateMockOpportunities(30, 'success1'), 50, false),
        new MockPerformanceAPIService('Failure1', [], 100, true),
        new MockPerformanceAPIService('Success2', generateMockOpportunities(40, 'success2'), 75, false),
        new MockPerformanceAPIService('Failure2', [], 150, true),
        new MockPerformanceAPIService('Success3', generateMockOpportunities(35, 'success3'), 25, false)
      ];

      services.forEach(service => mockRegistry.registerService(service));

      timer.start();
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const elapsed = timer.stop();

      // Should not be significantly slowed by failures
      expect(elapsed).toBeLessThan(300);
      expect(result.opportunities).toHaveLength(105); // 30 + 40 + 35
      expect(result.errors).toHaveLength(2);
      expect(result.sources).toHaveLength(5);
    });
  });

  describe('Caching Performance', () => {
    it('should show significant performance improvement with cache hits', async () => {
      const opportunities = generateMockOpportunities(200, 'cached');
      const service = new MockPerformanceAPIService('CachedService', opportunities, 100);
      mockRegistry.registerService(service);

      // First search (cache miss)
      timer.start();
      const firstResult = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const firstElapsed = timer.stop();

      // Second search with same parameters (cache hit)
      timer.start();
      const secondResult = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const secondElapsed = timer.stop();

      // Cache hit should be significantly faster
      expect(secondElapsed).toBeLessThan(firstElapsed * 0.5); // At least 50% faster
      expect(secondResult.opportunities).toHaveLength(firstResult.opportunities.length);
      expect(secondElapsed).toBeLessThan(50); // Cache hits should be very fast
    });

    it('should handle cache with large datasets efficiently', async () => {
      const largeOpportunities = generateMockOpportunities(2000, 'largecached');
      const service = new MockPerformanceAPIService('LargeCachedService', largeOpportunities, 200);
      mockRegistry.registerService(service);

      // First search to populate cache
      await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });

      // Multiple cache hits
      const cacheHitTimes: number[] = [];
      for (let i = 0; i < 5; i++) {
        timer.start();
        await searchController.performSearch(mockSearchParams, { 
          useHealthyServicesOnly: false 
        });
        cacheHitTimes.push(timer.stop());
      }

      // All cache hits should be fast and consistent
      cacheHitTimes.forEach(time => {
        expect(time).toBeLessThan(100);
      });

      // Performance should be consistent across cache hits
      const avgTime = cacheHitTimes.reduce((sum, time) => sum + time, 0) / cacheHitTimes.length;
      const maxDeviation = Math.max(...cacheHitTimes.map(time => Math.abs(time - avgTime)));
      expect(maxDeviation).toBeLessThan(avgTime * 0.5); // Deviation should be less than 50% of average
    });
  });

  describe('Memory Usage Performance', () => {
    it('should handle extensive caching without excessive memory growth', async () => {
      const opportunities = generateMockOpportunities(500, 'memory');
      const service = new MockPerformanceAPIService('MemoryService', opportunities, 50);
      mockRegistry.registerService(service);

      // Perform many searches with different parameters to fill cache
      const searchVariations = [
        { ...mockSearchParams, radius: 10 },
        { ...mockSearchParams, radius: 25 },
        { ...mockSearchParams, radius: 50 },
        { ...mockSearchParams, type: 'in-person' },
        { ...mockSearchParams, type: 'virtual' },
        { ...mockSearchParams, keywords: 'education' },
        { ...mockSearchParams, keywords: 'health' },
        { ...mockSearchParams, location: { latitude: 34.0522, longitude: -118.2437 } }, // LA
        { ...mockSearchParams, location: { latitude: 41.8781, longitude: -87.6298 } }, // Chicago
        { ...mockSearchParams, location: { latitude: 29.7604, longitude: -95.3698 } }  // Houston
      ];

      // Fill cache with multiple searches
      for (const params of searchVariations) {
        await searchController.performSearch(params, { useHealthyServicesOnly: false });
      }

      // Get cache statistics
      const cacheStats = searchController.getCacheStats();
      
      // Verify cache is working but not growing excessively
      expect(cacheStats.totalEntries).toBeGreaterThan(0);
      expect(cacheStats.totalEntries).toBeLessThan(20); // Should have reasonable limits
      expect(cacheStats.hitRate).toBeGreaterThan(0); // Should have some cache hits

      // Perform additional searches to test cache eviction
      timer.start();
      await searchController.performSearch(mockSearchParams, { useHealthyServicesOnly: false });
      const elapsed = timer.stop();

      // Should still be performant even with full cache
      expect(elapsed).toBeLessThan(100);
    });

    it('should handle cache cleanup efficiently', async () => {
      const opportunities = generateMockOpportunities(300, 'cleanup');
      const service = new MockPerformanceAPIService('CleanupService', opportunities, 30);
      mockRegistry.registerService(service);

      // Fill cache
      for (let i = 0; i < 10; i++) {
        await searchController.performSearch({
          ...mockSearchParams,
          radius: 10 + i * 5
        }, { useHealthyServicesOnly: false });
      }

      // Clear cache and measure performance
      timer.start();
      searchController.clearCache();
      const clearElapsed = timer.stop();

      // Cache clearing should be fast
      expect(clearElapsed).toBeLessThan(10);

      // Verify cache is cleared
      const cacheStats = searchController.getCacheStats();
      expect(cacheStats.totalEntries).toBe(0);
      expect(cacheStats.hitCount).toBe(0);
      expect(cacheStats.missCount).toBe(0);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple simultaneous searches efficiently', async () => {
      const opportunities = generateMockOpportunities(100, 'concurrent');
      const service = new MockPerformanceAPIService('ConcurrentService', opportunities, 100);
      mockRegistry.registerService(service);

      // Launch multiple searches simultaneously
      const searchPromises = [];
      const startTime = performance.now();

      for (let i = 0; i < 5; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 25 + i * 10
        };
        searchPromises.push(searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        }));
      }

      // Wait for all searches to complete
      const results = await Promise.all(searchPromises);
      const totalElapsed = performance.now() - startTime;

      // Should complete all searches in roughly the time of one search (due to concurrency)
      expect(totalElapsed).toBeLessThan(300); // Should be closer to 100ms than 500ms (5 * 100ms)
      
      // All searches should succeed
      results.forEach(result => {
        expect(result.opportunities).toHaveLength(100);
        expect(result.totalResults).toBe(100);
      });
    });

    it('should handle concurrent searches with cache interactions', async () => {
      const opportunities = generateMockOpportunities(150, 'concurrentcache');
      const service = new MockPerformanceAPIService('ConcurrentCacheService', opportunities, 80);
      mockRegistry.registerService(service);

      // First, populate cache with one search
      await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });

      // Launch multiple searches, some should hit cache, others should miss
      const searchPromises = [];
      const startTime = performance.now();

      for (let i = 0; i < 6; i++) {
        const searchParams = i < 3 
          ? mockSearchParams // These should hit cache
          : { ...mockSearchParams, radius: 50 + i * 10 }; // These should miss cache
        
        searchPromises.push(searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        }));
      }

      const results = await Promise.all(searchPromises);
      const totalElapsed = performance.now() - startTime;

      // Should be faster than if all were cache misses
      expect(totalElapsed).toBeLessThan(400); // Should benefit from cache hits
      
      // All searches should succeed
      results.forEach(result => {
        expect(result.opportunities).toHaveLength(150);
      });

      // Verify cache statistics show hits
      const cacheStats = searchController.getCacheStats();
      expect(cacheStats.hitCount).toBeGreaterThan(0);
    });
  });

  describe('Multi-Location Performance', () => {
    it('should handle multi-location searches efficiently', async () => {
      const opportunities = generateMockOpportunities(50, 'multiloc');
      const service = new MockPerformanceAPIService('MultiLocService', opportunities, 100);
      mockRegistry.registerService(service);

      const multiLocationService = new MultiLocationService();
      const multiSearchController = new SearchController(mockRegistry, multiLocationService);

      // Mock multi-location service methods
      vi.spyOn(multiLocationService, 'isMultiLocationInput').mockReturnValue(true);
      vi.spyOn(multiLocationService, 'validateLocationInput').mockReturnValue({
        isValid: true,
        errors: [],
        suggestions: [],
        parsedCount: 3
      });
      vi.spyOn(multiLocationService, 'parseLocationInput').mockReturnValue([
        'New York', 'Los Angeles', 'Chicago'
      ]);
      vi.spyOn(multiLocationService, 'geocodeMultipleLocations').mockResolvedValue([
        {
          originalInput: 'New York',
          locationInfo: { city: 'New York', state: 'NY', country: 'USA', formattedAddress: 'New York, NY, USA' },
          coordinates: { latitude: 40.7128, longitude: -74.0060 },
          index: 0
        },
        {
          originalInput: 'Los Angeles',
          locationInfo: { city: 'Los Angeles', state: 'CA', country: 'USA', formattedAddress: 'Los Angeles, CA, USA' },
          coordinates: { latitude: 34.0522, longitude: -118.2437 },
          index: 1
        },
        {
          originalInput: 'Chicago',
          locationInfo: { city: 'Chicago', state: 'IL', country: 'USA', formattedAddress: 'Chicago, IL, USA' },
          coordinates: { latitude: 41.8781, longitude: -87.6298 },
          index: 2
        }
      ]);

      timer.start();
      const result = await multiSearchController.performMultiLocationSearch(
        'New York, Los Angeles, Chicago',
        25,
        { causes: [], type: 'both' }
      );
      const elapsed = timer.stop();

      // Should complete 3 location searches in reasonable time
      expect(elapsed).toBeLessThan(500); // Should be efficient despite multiple locations
      expect(result.totalResults).toBe(150); // 50 opportunities * 3 locations
      
      if ('searchStatistics' in result) {
        expect(result.searchStatistics?.totalLocations).toBe(3);
        expect(result.searchStatistics?.successfulLocations).toBe(3);
      }
    });

    it('should handle large multi-location searches with acceptable performance', async () => {
      const opportunities = generateMockOpportunities(200, 'largemultiloc');
      const service = new MockPerformanceAPIService('LargeMultiLocService', opportunities, 150);
      mockRegistry.registerService(service);

      const multiLocationService = new MultiLocationService();
      const multiSearchController = new SearchController(mockRegistry, multiLocationService);

      // Mock for 5 locations
      vi.spyOn(multiLocationService, 'isMultiLocationInput').mockReturnValue(true);
      vi.spyOn(multiLocationService, 'validateLocationInput').mockReturnValue({
        isValid: true,
        errors: [],
        suggestions: [],
        parsedCount: 5
      });
      vi.spyOn(multiLocationService, 'parseLocationInput').mockReturnValue([
        'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'
      ]);
      vi.spyOn(multiLocationService, 'geocodeMultipleLocations').mockResolvedValue([
        { originalInput: 'New York', locationInfo: { city: 'New York', state: 'NY', country: 'USA', formattedAddress: 'New York, NY, USA' }, coordinates: { latitude: 40.7128, longitude: -74.0060 }, index: 0 },
        { originalInput: 'Los Angeles', locationInfo: { city: 'Los Angeles', state: 'CA', country: 'USA', formattedAddress: 'Los Angeles, CA, USA' }, coordinates: { latitude: 34.0522, longitude: -118.2437 }, index: 1 },
        { originalInput: 'Chicago', locationInfo: { city: 'Chicago', state: 'IL', country: 'USA', formattedAddress: 'Chicago, IL, USA' }, coordinates: { latitude: 41.8781, longitude: -87.6298 }, index: 2 },
        { originalInput: 'Houston', locationInfo: { city: 'Houston', state: 'TX', country: 'USA', formattedAddress: 'Houston, TX, USA' }, coordinates: { latitude: 29.7604, longitude: -95.3698 }, index: 3 },
        { originalInput: 'Phoenix', locationInfo: { city: 'Phoenix', state: 'AZ', country: 'USA', formattedAddress: 'Phoenix, AZ, USA' }, coordinates: { latitude: 33.4484, longitude: -112.0740 }, index: 4 }
      ]);

      timer.start();
      const result = await multiSearchController.performMultiLocationSearch(
        'New York, Los Angeles, Chicago, Houston, Phoenix',
        25,
        { causes: [], type: 'both' }
      );
      const elapsed = timer.stop();

      // Should handle 5 locations with large datasets efficiently
      expect(elapsed).toBeLessThan(1000); // Should complete within 1 second
      expect(result.totalResults).toBe(1000); // 200 opportunities * 5 locations
      
      if ('searchStatistics' in result) {
        expect(result.searchStatistics?.totalLocations).toBe(5);
        expect(result.searchStatistics?.successfulLocations).toBe(5);
      }
    });
  });

  describe('Response Time Benchmarks', () => {
    it('should meet response time benchmarks for different scenarios', async () => {
      const testScenarios = [
        {
          name: 'Small dataset, single service',
          opportunities: 25,
          serviceDelay: 50,
          expectedMaxTime: 150
        },
        {
          name: 'Medium dataset, single service',
          opportunities: 100,
          serviceDelay: 100,
          expectedMaxTime: 250
        },
        {
          name: 'Large dataset, single service',
          opportunities: 500,
          serviceDelay: 200,
          expectedMaxTime: 400
        }
      ];

      for (const scenario of testScenarios) {
        const opportunities = generateMockOpportunities(scenario.opportunities, 'benchmark');
        const service = new MockPerformanceAPIService(
          'BenchmarkService',
          opportunities,
          scenario.serviceDelay
        );
        
        // Clear registry and register new service
        mockRegistry = new APIServiceRegistry();
        mockRegistry.registerService(service);
        searchController = new SearchController(mockRegistry);

        timer.start();
        const result = await searchController.performSearch(mockSearchParams, { 
          useHealthyServicesOnly: false 
        });
        const elapsed = timer.stop();

        expect(elapsed).toBeLessThan(scenario.expectedMaxTime);
        expect(result.opportunities).toHaveLength(scenario.opportunities);
        expect(result.responseTime).toBeDefined();
        expect(result.responseTime).toBeGreaterThan(scenario.serviceDelay);
        
        console.log(`${scenario.name}: ${elapsed.toFixed(2)}ms (expected < ${scenario.expectedMaxTime}ms)`);
      }
    });

    it('should maintain consistent performance across multiple runs', async () => {
      const opportunities = generateMockOpportunities(200, 'consistency');
      const service = new MockPerformanceAPIService('ConsistencyService', opportunities, 100);
      mockRegistry.registerService(service);

      const runTimes: number[] = [];
      const numberOfRuns = 10;

      // Perform multiple runs
      for (let i = 0; i < numberOfRuns; i++) {
        timer.start();
        await searchController.performSearch(mockSearchParams, { 
          useHealthyServicesOnly: false 
        });
        runTimes.push(timer.stop());
      }

      // Calculate statistics
      const avgTime = runTimes.reduce((sum, time) => sum + time, 0) / runTimes.length;
      const minTime = Math.min(...runTimes);
      const maxTime = Math.max(...runTimes);
      const variance = runTimes.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / runTimes.length;
      const stdDev = Math.sqrt(variance);

      // Performance should be consistent
      expect(maxTime - minTime).toBeLessThan(avgTime * 0.5); // Range should be less than 50% of average
      expect(stdDev).toBeLessThan(avgTime * 0.3); // Standard deviation should be less than 30% of average
      
      console.log(`Consistency test - Avg: ${avgTime.toFixed(2)}ms, Min: ${minTime.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms, StdDev: ${stdDev.toFixed(2)}ms`);
    });
  });
});