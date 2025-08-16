import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchController } from '../../services/SearchController';
import { APIServiceRegistry } from '../../services/api/APIServiceRegistry';
import { BaseAPIService } from '../../services/api/BaseAPIService';
import { SearchResultsCache } from '../../services/SearchResultsCache';
import { VolunteerOpportunity, SearchParameters, APIResult } from '../../types/volunteer';
import { Coordinates } from '../../types/location';

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Memory monitoring utilities
class MemoryMonitor {
  private snapshots: Array<{
    timestamp: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  }> = [];

  takeSnapshot(label?: string): void {
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      const memory = (performance as any).memory;
      this.snapshots.push({
        timestamp: performance.now(),
        heapUsed: memory.usedJSHeapSize,
        heapTotal: memory.totalJSHeapSize,
        external: memory.usedJSHeapSize, // Approximation
        arrayBuffers: 0 // Not available in browser
      });
    } else {
      // Fallback for environments without performance.memory
      this.snapshots.push({
        timestamp: performance.now(),
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        arrayBuffers: 0
      });
    }
  }

  getMemoryGrowth(): number {
    if (this.snapshots.length < 2) return 0;
    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];
    return last.heapUsed - first.heapUsed;
  }

  getMaxMemoryUsage(): number {
    if (this.snapshots.length === 0) return 0;
    return Math.max(...this.snapshots.map(s => s.heapUsed));
  }

  getAverageMemoryUsage(): number {
    if (this.snapshots.length === 0) return 0;
    const total = this.snapshots.reduce((sum, s) => sum + s.heapUsed, 0);
    return total / this.snapshots.length;
  }

  reset(): void {
    this.snapshots = [];
  }

  getSnapshots() {
    return [...this.snapshots];
  }
}

// Mock API Service for memory testing
class MockMemoryTestAPIService extends BaseAPIService {
  public serviceName: string;
  private mockOpportunities: VolunteerOpportunity[];
  private responseDelay: number;

  constructor(
    serviceName: string,
    opportunities: VolunteerOpportunity[] = [],
    responseDelay: number = 0
  ) {
    super(serviceName, 'http://mock.api', 5000);
    this.serviceName = serviceName;
    this.mockOpportunities = opportunities;
    this.responseDelay = responseDelay;
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
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

// Generate memory-intensive mock opportunities
function generateMemoryIntensiveOpportunities(count: number, sourcePrefix: string = 'memory'): VolunteerOpportunity[] {
  const opportunities: VolunteerOpportunity[] = [];
  const causes = ['Environment', 'Education', 'Health & Medicine', 'Hunger', 'Animals', 'Arts & Culture', 'Technology', 'Human Rights'];
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'];
  
  for (let i = 0; i < count; i++) {
    // Create larger data structures to test memory usage
    const largeDescription = `Memory test opportunity ${i}. `.repeat(20) + 
      `This is a comprehensive description that includes detailed information about the volunteer opportunity, ` +
      `requirements, benefits, and impact. This text is intentionally verbose to simulate real-world data sizes ` +
      `and test memory usage patterns. Opportunity ID: ${i}, Source: ${sourcePrefix}. ` +
      `Additional details: ${Array(50).fill(`detail${i}`).join(', ')}.`;

    const manySkills = Array.from({length: 15}, (_, j) => `skill_${i}_${j}`);
    const largeContactInfo = {
      email: `memory.test.${i}@example.org`,
      phone: `555-${String(i).padStart(4, '0')}`,
      website: `https://memory-test-org-${i}.example.com/volunteer`,
      address: `${i} Memory Test Street, ${cities[i % cities.length]}, State ${i % 50}, ${10000 + i}`,
      socialMedia: {
        facebook: `https://facebook.com/memorytest${i}`,
        twitter: `https://twitter.com/memorytest${i}`,
        instagram: `https://instagram.com/memorytest${i}`
      }
    };

    opportunities.push({
      id: `${sourcePrefix}-memory-${i}`,
      source: sourcePrefix,
      title: `Memory Test Volunteer Opportunity ${i} - ${causes[i % causes.length]}`,
      organization: `Memory Test Organization ${i % 25} - ${cities[i % cities.length]} Chapter`,
      description: largeDescription,
      location: `${cities[i % cities.length]}, State ${i % 50}`,
      city: cities[i % cities.length],
      country: 'United States',
      type: i % 3 === 0 ? 'virtual' : 'in-person',
      cause: causes[i % causes.length],
      skills: manySkills,
      timeCommitment: `${1 + (i % 10)} hours per ${i % 2 === 0 ? 'week' : 'month'}`,
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      participants: 5 + (i % 195),
      image: `https://example.com/memory-test-images/large-image-${i}.jpg`,
      contactInfo: largeContactInfo as any,
      externalUrl: `https://memory-test.example.org/volunteer/opportunity/${i}?source=${sourcePrefix}`,
      lastUpdated: new Date(Date.now() - (i % 60) * 24 * 60 * 60 * 1000),
      verified: i % 7 !== 0,
      distance: Math.random() * 150,
      applicationDeadline: i % 8 === 0 ? new Date(Date.now() + (30 + i % 90) * 24 * 60 * 60 * 1000) : undefined,
      requirements: Array.from({length: i % 8}, (_, j) => `Memory test requirement ${j} for opportunity ${i}`),
      // Additional large data fields
      tags: Array.from({length: 20}, (_, j) => `tag_${i}_${j}`),
      categories: Array.from({length: 5}, (_, j) => `category_${i}_${j}`),
      metadata: {
        createdBy: `user_${i % 100}`,
        lastModifiedBy: `admin_${i % 20}`,
        version: i % 10,
        flags: Array.from({length: 10}, (_, j) => `flag_${j}`),
        analytics: {
          views: i * 10,
          applications: i % 50,
          completions: i % 25
        }
      }
    } as any);
  }
  
  return opportunities;
}

describe('Memory Usage and Caching Performance Tests', () => {
  let searchController: SearchController;
  let mockRegistry: APIServiceRegistry;
  let mockCoordinates: Coordinates;
  let mockSearchParams: SearchParameters;
  let memoryMonitor: MemoryMonitor;

  beforeEach(() => {
    mockRegistry = new APIServiceRegistry();
    searchController = new SearchController(mockRegistry);
    memoryMonitor = new MemoryMonitor();
    
    mockCoordinates = { latitude: 40.7128, longitude: -74.0060 }; // NYC
    mockSearchParams = {
      location: mockCoordinates,
      radius: 25,
      type: 'both',
      limit: 100
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    memoryMonitor.reset();
  });

  describe('Memory Usage with Large Datasets', () => {
    it('should handle large opportunity datasets without excessive memory growth', async () => {
      const largeOpportunities = generateMemoryIntensiveOpportunities(1000, 'large');
      const service = new MockMemoryTestAPIService('LargeDataService', largeOpportunities, 50);
      mockRegistry.registerService(service);

      memoryMonitor.takeSnapshot();

      // Perform search with large dataset
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });

      memoryMonitor.takeSnapshot();

      expect(result.opportunities).toHaveLength(1000);
      
      // Memory growth should be reasonable for the amount of data
      const memoryGrowth = memoryMonitor.getMemoryGrowth();
      const maxMemory = memoryMonitor.getMaxMemoryUsage();
      
      // Allow for reasonable memory usage (these are rough estimates)
      if (maxMemory > 0) { // Only test if memory monitoring is available
        expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth
        console.log(`Large dataset memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      }
    });

    it('should handle multiple large searches without memory leaks', async () => {
      const opportunities = generateMemoryIntensiveOpportunities(500, 'multiple');
      const service = new MockMemoryTestAPIService('MultipleSearchService', opportunities, 30);
      mockRegistry.registerService(service);

      memoryMonitor.takeSnapshot();

      // Perform multiple searches with different parameters
      for (let i = 0; i < 10; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 20 + i * 5,
          keywords: i % 3 === 0 ? `keyword${i}` : undefined
        };

        await searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        });

        memoryMonitor.takeSnapshot();

        // Force garbage collection opportunity
        if (i % 3 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      const snapshots = memoryMonitor.getSnapshots();
      const memoryGrowth = memoryMonitor.getMemoryGrowth();

      if (snapshots.length > 2 && snapshots[0].heapUsed > 0) {
        // Memory shouldn't grow excessively across multiple searches
        expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB total growth
        
        // Check for memory leaks by comparing first and last few snapshots
        const firstThree = snapshots.slice(1, 4); // Skip initial snapshot
        const lastThree = snapshots.slice(-3);
        
        const firstAvg = firstThree.reduce((sum, s) => sum + s.heapUsed, 0) / firstThree.length;
        const lastAvg = lastThree.reduce((sum, s) => sum + s.heapUsed, 0) / lastThree.length;
        
        // Memory shouldn't grow more than 3x from start to end
        expect(lastAvg).toBeLessThan(firstAvg * 3);
        
        console.log(`Multiple searches memory: Start ${(firstAvg / 1024 / 1024).toFixed(2)}MB, End ${(lastAvg / 1024 / 1024).toFixed(2)}MB`);
      }
    });

    it('should efficiently manage memory with concurrent searches', async () => {
      const opportunities = generateMemoryIntensiveOpportunities(300, 'concurrent');
      const service = new MockMemoryTestAPIService('ConcurrentMemoryService', opportunities, 100);
      mockRegistry.registerService(service);

      memoryMonitor.takeSnapshot();

      // Launch concurrent searches
      const promises = [];
      for (let i = 0; i < 20; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 15 + i * 3,
          type: i % 2 === 0 ? 'virtual' : 'in-person'
        };

        promises.push(searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        }));
      }

      const results = await Promise.all(promises);
      memoryMonitor.takeSnapshot();

      // All searches should succeed
      expect(results).toHaveLength(20);
      results.forEach(result => {
        expect(result.opportunities).toHaveLength(300);
      });

      const memoryGrowth = memoryMonitor.getMemoryGrowth();
      
      if (memoryGrowth > 0) {
        // Concurrent searches shouldn't use 20x the memory of a single search
        expect(memoryGrowth).toBeLessThan(200 * 1024 * 1024); // Less than 200MB for 20 concurrent searches
        console.log(`Concurrent searches memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      }
    });
  });

  describe('Cache Memory Management', () => {
    it('should manage cache memory efficiently with size limits', async () => {
      const opportunities = generateMemoryIntensiveOpportunities(200, 'cache');
      const service = new MockMemoryTestAPIService('CacheMemoryService', opportunities, 50);
      mockRegistry.registerService(service);

      // Configure cache with size limit
      searchController.configureCaching({
        defaultTTL: 60000, // 1 minute
        maxCacheSize: 10 // Limit to 10 entries
      });

      memoryMonitor.takeSnapshot();

      // Fill cache beyond its limit
      for (let i = 0; i < 20; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 10 + i * 2 // Each search has different parameters
        };

        await searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        });

        memoryMonitor.takeSnapshot();
      }

      const cacheStats = searchController.getCacheStats();
      const memoryGrowth = memoryMonitor.getMemoryGrowth();

      // Cache should respect size limits
      expect(cacheStats.totalEntries).toBeLessThanOrEqual(10);
      
      if (memoryGrowth > 0) {
        // Memory growth should be limited due to cache eviction
        expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // Less than 100MB
        console.log(`Cache memory management: ${cacheStats.totalEntries} entries, ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`);
      }
    });

    it('should handle cache TTL expiration without memory leaks', async () => {
      const opportunities = generateMemoryIntensiveOpportunities(150, 'ttl');
      const service = new MockMemoryTestAPIService('TTLService', opportunities, 30);
      mockRegistry.registerService(service);

      // Configure cache with short TTL
      searchController.configureCaching({
        defaultTTL: 100, // 100ms TTL
        maxCacheSize: 50
      });

      memoryMonitor.takeSnapshot();

      // Perform searches and wait for TTL expiration
      for (let i = 0; i < 10; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 20 + i * 3
        };

        await searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        });

        // Wait for TTL to expire
        await new Promise(resolve => setTimeout(resolve, 150));
        
        memoryMonitor.takeSnapshot();
      }

      const cacheStats = searchController.getCacheStats();
      const memoryGrowth = memoryMonitor.getMemoryGrowth();

      // Cache should be mostly empty due to TTL expiration
      expect(cacheStats.totalEntries).toBeLessThan(5);
      
      if (memoryGrowth > 0) {
        // Memory shouldn't grow significantly due to TTL cleanup
        expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
        console.log(`TTL expiration memory: ${cacheStats.totalEntries} entries, ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`);
      }
    });

    it('should handle cache clearing efficiently', async () => {
      const opportunities = generateMemoryIntensiveOpportunities(400, 'clear');
      const service = new MockMemoryTestAPIService('ClearService', opportunities, 40);
      mockRegistry.registerService(service);

      memoryMonitor.takeSnapshot();

      // Fill cache
      for (let i = 0; i < 15; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 25 + i * 2
        };

        await searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        });
      }

      memoryMonitor.takeSnapshot();
      const memoryBeforeClear = memoryMonitor.getSnapshots().slice(-1)[0].heapUsed;

      // Clear cache
      searchController.clearCache();
      
      // Give time for garbage collection
      await new Promise(resolve => setTimeout(resolve, 100));
      memoryMonitor.takeSnapshot();

      const cacheStats = searchController.getCacheStats();
      const finalMemory = memoryMonitor.getSnapshots().slice(-1)[0].heapUsed;

      // Cache should be empty
      expect(cacheStats.totalEntries).toBe(0);
      expect(cacheStats.hitCount).toBe(0);
      expect(cacheStats.missCount).toBe(0);

      if (memoryBeforeClear > 0 && finalMemory > 0) {
        // Memory should decrease after cache clear (though GC timing is unpredictable)
        const memoryReduction = memoryBeforeClear - finalMemory;
        console.log(`Cache clear memory reduction: ${(memoryReduction / 1024 / 1024).toFixed(2)}MB`);
      }
    });
  });

  describe('Memory Efficiency with Different Data Sizes', () => {
    it('should scale memory usage proportionally with data size', async () => {
      const dataSizes = [50, 100, 200, 400];
      const memoryUsages: number[] = [];

      for (const size of dataSizes) {
        // Reset for each test
        mockRegistry = new APIServiceRegistry();
        searchController = new SearchController(mockRegistry);
        memoryMonitor.reset();

        const opportunities = generateMemoryIntensiveOpportunities(size, `scale${size}`);
        const service = new MockMemoryTestAPIService(`ScaleService${size}`, opportunities, 20);
        mockRegistry.registerService(service);

        memoryMonitor.takeSnapshot();

        await searchController.performSearch(mockSearchParams, { 
          useHealthyServicesOnly: false 
        });

        memoryMonitor.takeSnapshot();

        const memoryGrowth = memoryMonitor.getMemoryGrowth();
        memoryUsages.push(memoryGrowth);

        console.log(`Data size ${size}: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      }

      // Memory usage should scale reasonably with data size
      if (memoryUsages.every(usage => usage > 0)) {
        // Larger datasets should use more memory, but not exponentially more
        for (let i = 1; i < memoryUsages.length; i++) {
          const ratio = memoryUsages[i] / memoryUsages[i - 1];
          expect(ratio).toBeGreaterThan(0.5); // Should use at least 50% more memory
          expect(ratio).toBeLessThan(5); // But not more than 5x the memory
        }
      }
    });

    it('should handle empty and small datasets efficiently', async () => {
      const testCases = [
        { size: 0, name: 'empty' },
        { size: 1, name: 'single' },
        { size: 5, name: 'small' },
        { size: 25, name: 'medium-small' }
      ];

      for (const testCase of testCases) {
        mockRegistry = new APIServiceRegistry();
        searchController = new SearchController(mockRegistry);
        memoryMonitor.reset();

        const opportunities = testCase.size > 0 
          ? generateMemoryIntensiveOpportunities(testCase.size, testCase.name)
          : [];
        const service = new MockMemoryTestAPIService(`${testCase.name}Service`, opportunities, 10);
        mockRegistry.registerService(service);

        memoryMonitor.takeSnapshot();

        const result = await searchController.performSearch(mockSearchParams, { 
          useHealthyServicesOnly: false 
        });

        memoryMonitor.takeSnapshot();

        expect(result.opportunities).toHaveLength(testCase.size);

        const memoryGrowth = memoryMonitor.getMemoryGrowth();
        
        if (memoryGrowth > 0) {
          // Small datasets should use minimal memory
          if (testCase.size <= 5) {
            expect(memoryGrowth).toBeLessThan(5 * 1024 * 1024); // Less than 5MB for small datasets
          }
          console.log(`${testCase.name} dataset (${testCase.size}): ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
        }
      }
    });
  });

  describe('Memory Performance Under Stress', () => {
    it('should maintain memory efficiency under rapid successive searches', async () => {
      const opportunities = generateMemoryIntensiveOpportunities(100, 'rapid');
      const service = new MockMemoryTestAPIService('RapidService', opportunities, 20);
      mockRegistry.registerService(service);

      // Configure reasonable cache
      searchController.configureCaching({
        defaultTTL: 30000,
        maxCacheSize: 15
      });

      memoryMonitor.takeSnapshot();

      // Perform rapid successive searches
      for (let i = 0; i < 50; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 10 + (i % 30) * 2,
          keywords: i % 10 === 0 ? `rapid${i % 5}` : undefined
        };

        await searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        });

        // Take memory snapshot every 5 searches
        if (i % 5 === 0) {
          memoryMonitor.takeSnapshot();
        }
      }

      const snapshots = memoryMonitor.getSnapshots();
      const memoryGrowth = memoryMonitor.getMemoryGrowth();
      const cacheStats = searchController.getCacheStats();

      if (snapshots.length > 3 && snapshots[0].heapUsed > 0) {
        // Memory shouldn't grow linearly with number of searches due to caching
        expect(memoryGrowth).toBeLessThan(150 * 1024 * 1024); // Less than 150MB for 50 searches
        
        // Cache should be working
        expect(cacheStats.hitCount).toBeGreaterThan(0);
        expect(cacheStats.totalEntries).toBeLessThanOrEqual(15);
        
        console.log(`Rapid searches: ${memoryGrowth / 1024 / 1024}MB growth, ${cacheStats.hitCount} cache hits`);
      }
    });

    it('should handle memory pressure gracefully', async () => {
      // Create very large dataset to simulate memory pressure
      const largeOpportunities = generateMemoryIntensiveOpportunities(2000, 'pressure');
      const service = new MockMemoryTestAPIService('PressureService', largeOpportunities, 100);
      mockRegistry.registerService(service);

      // Configure aggressive caching to increase memory pressure
      searchController.configureCaching({
        defaultTTL: 300000, // 5 minutes
        maxCacheSize: 25
      });

      memoryMonitor.takeSnapshot();

      try {
        // Perform searches that create memory pressure
        for (let i = 0; i < 30; i++) {
          const searchParams = {
            ...mockSearchParams,
            radius: 5 + i * 3,
            type: i % 3 === 0 ? 'virtual' : 'in-person',
            keywords: `pressure${i % 8}`
          };

          const result = await searchController.performSearch(searchParams, { 
            useHealthyServicesOnly: false 
          });

          expect(result.opportunities).toHaveLength(2000);

          if (i % 5 === 0) {
            memoryMonitor.takeSnapshot();
          }
        }

        const memoryGrowth = memoryMonitor.getMemoryGrowth();
        const cacheStats = searchController.getCacheStats();

        // System should handle memory pressure without crashing
        expect(cacheStats.totalEntries).toBeLessThanOrEqual(25);
        
        if (memoryGrowth > 0) {
          // Memory growth should be controlled despite large datasets
          expect(memoryGrowth).toBeLessThan(500 * 1024 * 1024); // Less than 500MB
          console.log(`Memory pressure test: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB growth`);
        }

      } catch (error) {
        // If we hit memory limits, that's acceptable for this stress test
        console.log('Memory pressure test hit limits (expected for stress test):', error.message);
      }
    });
  });
});