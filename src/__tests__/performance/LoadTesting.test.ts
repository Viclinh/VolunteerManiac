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

// Load testing utilities
class LoadTestMetrics {
  private startTime: number = 0;
  private completedRequests: number = 0;
  private failedRequests: number = 0;
  private responseTimes: number[] = [];
  private memoryUsage: number[] = [];

  start(): void {
    this.startTime = performance.now();
    this.completedRequests = 0;
    this.failedRequests = 0;
    this.responseTimes = [];
    this.memoryUsage = [];
  }

  recordRequest(responseTime: number, success: boolean = true): void {
    this.responseTimes.push(responseTime);
    if (success) {
      this.completedRequests++;
    } else {
      this.failedRequests++;
    }
    
    // Record memory usage if available
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      this.memoryUsage.push((performance as any).memory.usedJSHeapSize);
    }
  }

  getMetrics() {
    const totalTime = performance.now() - this.startTime;
    const totalRequests = this.completedRequests + this.failedRequests;
    const avgResponseTime = this.responseTimes.length > 0 
      ? this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length 
      : 0;
    const minResponseTime = this.responseTimes.length > 0 ? Math.min(...this.responseTimes) : 0;
    const maxResponseTime = this.responseTimes.length > 0 ? Math.max(...this.responseTimes) : 0;
    const requestsPerSecond = totalRequests > 0 ? (totalRequests / totalTime) * 1000 : 0;
    const successRate = totalRequests > 0 ? (this.completedRequests / totalRequests) * 100 : 0;

    return {
      totalTime,
      totalRequests,
      completedRequests: this.completedRequests,
      failedRequests: this.failedRequests,
      avgResponseTime,
      minResponseTime,
      maxResponseTime,
      requestsPerSecond,
      successRate,
      memoryUsage: this.memoryUsage
    };
  }
}

// Mock API Service for load testing
class MockLoadTestAPIService extends BaseAPIService {
  public serviceName: string;
  private mockOpportunities: VolunteerOpportunity[];
  private responseDelay: number;
  private failureRate: number;
  private requestCount: number = 0;

  constructor(
    serviceName: string,
    opportunities: VolunteerOpportunity[] = [],
    responseDelay: number = 0,
    failureRate: number = 0
  ) {
    super(serviceName, 'http://mock.api', 5000);
    this.serviceName = serviceName;
    this.mockOpportunities = opportunities;
    this.responseDelay = responseDelay;
    this.failureRate = failureRate;
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    this.requestCount++;
    
    // Simulate network delay
    if (this.responseDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.responseDelay));
    }

    // Simulate random failures based on failure rate
    if (Math.random() < this.failureRate) {
      throw new Error(`Mock API service ${this.serviceName} simulated failure (request ${this.requestCount})`);
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

  getRequestCount(): number {
    return this.requestCount;
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }
}

// Generate mock opportunities for load testing
function generateLoadTestOpportunities(count: number, sourcePrefix: string = 'load'): VolunteerOpportunity[] {
  const opportunities: VolunteerOpportunity[] = [];
  const causes = ['Environment', 'Education', 'Health & Medicine', 'Hunger', 'Animals', 'Arts & Culture'];
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego'];
  
  for (let i = 0; i < count; i++) {
    opportunities.push({
      id: `${sourcePrefix}-${i}`,
      source: sourcePrefix,
      title: `Load Test Opportunity ${i}`,
      organization: `Load Test Organization ${i % 20}`,
      description: `Load test description for opportunity ${i}. This simulates realistic data sizes and content.`,
      location: `${cities[i % cities.length]}, State`,
      city: cities[i % cities.length],
      country: 'United States',
      type: i % 3 === 0 ? 'virtual' : 'in-person',
      cause: causes[i % causes.length],
      skills: [`skill${i % 8}`, `skill${(i + 1) % 8}`, `skill${(i + 2) % 8}`],
      timeCommitment: `${1 + (i % 8)} hours`,
      date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      participants: 5 + (i % 95),
      image: `https://example.com/loadtest${i}.jpg`,
      contactInfo: { 
        email: `loadtest${i}@example.org`,
        phone: i % 4 === 0 ? `555-${String(i).padStart(4, '0')}` : undefined,
        website: i % 5 === 0 ? `https://org${i}.example.com` : undefined
      },
      externalUrl: `https://example.org/loadtest/${i}`,
      lastUpdated: new Date(Date.now() - (i % 30) * 24 * 60 * 60 * 1000),
      verified: i % 5 !== 0,
      distance: Math.random() * 100,
      applicationDeadline: i % 10 === 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : undefined,
      requirements: i % 7 === 0 ? [`requirement${i % 3}`, `requirement${(i + 1) % 3}`] : undefined
    });
  }
  
  return opportunities;
}

describe('Load Testing', () => {
  let searchController: SearchController;
  let mockRegistry: APIServiceRegistry;
  let mockCoordinates: Coordinates;
  let mockSearchParams: SearchParameters;
  let metrics: LoadTestMetrics;

  beforeEach(() => {
    mockRegistry = new APIServiceRegistry();
    searchController = new SearchController(mockRegistry);
    metrics = new LoadTestMetrics();
    
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
  });

  describe('Concurrent Request Load Testing', () => {
    it('should handle 10 concurrent requests efficiently', async () => {
      const opportunities = generateLoadTestOpportunities(100, 'concurrent10');
      const service = new MockLoadTestAPIService('ConcurrentService', opportunities, 100, 0);
      mockRegistry.registerService(service);

      metrics.start();
      
      // Launch 10 concurrent requests
      const promises = [];
      for (let i = 0; i < 10; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 25 + i * 5 // Vary parameters to avoid cache hits
        };
        
        const promise = searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        }).then(result => {
          metrics.recordRequest(result.responseTime || 0, true);
          return result;
        }).catch(error => {
          metrics.recordRequest(0, false);
          throw error;
        });
        
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const testMetrics = metrics.getMetrics();

      // Verify all requests succeeded
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.opportunities).toHaveLength(100);
      });

      // Performance expectations
      expect(testMetrics.successRate).toBe(100);
      expect(testMetrics.avgResponseTime).toBeLessThan(300); // Should be efficient
      expect(testMetrics.requestsPerSecond).toBeGreaterThan(20); // Should handle good throughput
      
      console.log(`10 concurrent requests: ${testMetrics.requestsPerSecond.toFixed(2)} req/s, avg ${testMetrics.avgResponseTime.toFixed(2)}ms`);
    });

    it('should handle 50 concurrent requests with acceptable performance', async () => {
      const opportunities = generateLoadTestOpportunities(75, 'concurrent50');
      const service = new MockLoadTestAPIService('ConcurrentService50', opportunities, 150, 0);
      mockRegistry.registerService(service);

      metrics.start();
      
      // Launch 50 concurrent requests
      const promises = [];
      for (let i = 0; i < 50; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 10 + (i % 20) * 5, // Create variety in parameters
          keywords: i % 5 === 0 ? 'education' : undefined
        };
        
        const promise = searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        }).then(result => {
          metrics.recordRequest(result.responseTime || 0, true);
          return result;
        }).catch(error => {
          metrics.recordRequest(0, false);
          throw error;
        });
        
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const testMetrics = metrics.getMetrics();

      // Verify most requests succeeded
      expect(results).toHaveLength(50);
      expect(testMetrics.successRate).toBeGreaterThan(95); // Allow for some failures under load
      expect(testMetrics.avgResponseTime).toBeLessThan(500); // Should handle load reasonably
      expect(testMetrics.requestsPerSecond).toBeGreaterThan(50); // Should maintain throughput
      
      console.log(`50 concurrent requests: ${testMetrics.requestsPerSecond.toFixed(2)} req/s, avg ${testMetrics.avgResponseTime.toFixed(2)}ms, success ${testMetrics.successRate.toFixed(1)}%`);
    });

    it('should handle 100 concurrent requests with graceful degradation', async () => {
      const opportunities = generateLoadTestOpportunities(50, 'concurrent100');
      const service = new MockLoadTestAPIService('ConcurrentService100', opportunities, 200, 0.05); // 5% failure rate
      mockRegistry.registerService(service);

      metrics.start();
      
      // Launch 100 concurrent requests
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 15 + (i % 30) * 3,
          type: i % 3 === 0 ? 'virtual' : 'in-person'
        };
        
        const promise = searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        }).then(result => {
          metrics.recordRequest(result.responseTime || 0, true);
          return result;
        }).catch(error => {
          metrics.recordRequest(0, false);
          return null; // Don't fail the entire test
        });
        
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const testMetrics = metrics.getMetrics();

      // Verify system handles high load
      const successfulResults = results.filter(r => r !== null);
      expect(successfulResults.length).toBeGreaterThan(90); // Should handle most requests
      expect(testMetrics.successRate).toBeGreaterThan(90); // Allow for some failures under high load
      expect(testMetrics.avgResponseTime).toBeLessThan(1000); // May be slower but should complete
      
      console.log(`100 concurrent requests: ${testMetrics.requestsPerSecond.toFixed(2)} req/s, avg ${testMetrics.avgResponseTime.toFixed(2)}ms, success ${testMetrics.successRate.toFixed(1)}%`);
    });
  });

  describe('Sustained Load Testing', () => {
    it('should handle sustained load over time without degradation', async () => {
      const opportunities = generateLoadTestOpportunities(200, 'sustained');
      const service = new MockLoadTestAPIService('SustainedService', opportunities, 100, 0.02); // 2% failure rate
      mockRegistry.registerService(service);

      metrics.start();
      
      const batchSize = 10;
      const numberOfBatches = 10;
      const delayBetweenBatches = 100; // 100ms between batches
      
      const allResults = [];
      const batchMetrics = [];

      for (let batch = 0; batch < numberOfBatches; batch++) {
        const batchStart = performance.now();
        const batchPromises = [];
        
        // Launch batch of concurrent requests
        for (let i = 0; i < batchSize; i++) {
          const searchParams = {
            ...mockSearchParams,
            radius: 20 + ((batch * batchSize + i) % 25) * 2
          };
          
          const promise = searchController.performSearch(searchParams, { 
            useHealthyServicesOnly: false 
          }).then(result => {
            metrics.recordRequest(result.responseTime || 0, true);
            return result;
          }).catch(error => {
            metrics.recordRequest(0, false);
            return null;
          });
          
          batchPromises.push(promise);
        }

        const batchResults = await Promise.all(batchPromises);
        const batchEnd = performance.now();
        
        allResults.push(...batchResults);
        batchMetrics.push({
          batch,
          time: batchEnd - batchStart,
          successCount: batchResults.filter(r => r !== null).length
        });

        // Wait between batches
        if (batch < numberOfBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
        }
      }

      const testMetrics = metrics.getMetrics();

      // Verify sustained performance
      expect(testMetrics.totalRequests).toBe(100); // 10 batches * 10 requests
      expect(testMetrics.successRate).toBeGreaterThan(95);
      
      // Check that performance doesn't degrade significantly over time
      const firstHalfBatches = batchMetrics.slice(0, 5);
      const secondHalfBatches = batchMetrics.slice(5);
      
      const firstHalfAvgTime = firstHalfBatches.reduce((sum, b) => sum + b.time, 0) / firstHalfBatches.length;
      const secondHalfAvgTime = secondHalfBatches.reduce((sum, b) => sum + b.time, 0) / secondHalfBatches.length;
      
      // Performance shouldn't degrade by more than 50%
      expect(secondHalfAvgTime).toBeLessThan(firstHalfAvgTime * 1.5);
      
      console.log(`Sustained load: ${testMetrics.requestsPerSecond.toFixed(2)} req/s over ${testMetrics.totalTime.toFixed(0)}ms, success ${testMetrics.successRate.toFixed(1)}%`);
    });

    it('should handle memory efficiently during sustained load', async () => {
      const opportunities = generateLoadTestOpportunities(300, 'memory');
      const service = new MockLoadTestAPIService('MemoryService', opportunities, 50, 0);
      mockRegistry.registerService(service);

      // Configure cache with limits to test memory management
      searchController.configureCaching({
        defaultTTL: 30000, // 30 seconds
        maxCacheSize: 20 // Limit cache size
      });

      const numberOfRequests = 50;
      const memorySnapshots = [];

      for (let i = 0; i < numberOfRequests; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 10 + (i % 40) * 2, // Create variety to test cache eviction
          keywords: i % 10 === 0 ? `keyword${i % 5}` : undefined
        };

        await searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        });

        // Take memory snapshot if available
        if (typeof performance !== 'undefined' && (performance as any).memory) {
          memorySnapshots.push({
            request: i,
            memory: (performance as any).memory.usedJSHeapSize
          });
        }

        // Small delay to allow garbage collection
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Verify cache is working and memory is managed
      const cacheStats = searchController.getCacheStats();
      expect(cacheStats.totalEntries).toBeLessThanOrEqual(20); // Should respect cache size limit
      expect(cacheStats.hitCount).toBeGreaterThan(0); // Should have some cache hits

      // If memory snapshots are available, check for memory leaks
      if (memorySnapshots.length > 10) {
        const firstQuarter = memorySnapshots.slice(0, Math.floor(memorySnapshots.length / 4));
        const lastQuarter = memorySnapshots.slice(-Math.floor(memorySnapshots.length / 4));
        
        const firstQuarterAvg = firstQuarter.reduce((sum, s) => sum + s.memory, 0) / firstQuarter.length;
        const lastQuarterAvg = lastQuarter.reduce((sum, s) => sum + s.memory, 0) / lastQuarter.length;
        
        // Memory shouldn't grow excessively (allow for some growth due to caching)
        expect(lastQuarterAvg).toBeLessThan(firstQuarterAvg * 3);
        
        console.log(`Memory test: First quarter avg ${(firstQuarterAvg / 1024 / 1024).toFixed(2)}MB, Last quarter avg ${(lastQuarterAvg / 1024 / 1024).toFixed(2)}MB`);
      }
    });
  });

  describe('Stress Testing', () => {
    it('should handle extreme concurrent load gracefully', async () => {
      const opportunities = generateLoadTestOpportunities(25, 'stress');
      const service = new MockLoadTestAPIService('StressService', opportunities, 300, 0.1); // 10% failure rate
      mockRegistry.registerService(service);

      metrics.start();
      
      // Launch 200 concurrent requests (stress test)
      const promises = [];
      for (let i = 0; i < 200; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 5 + (i % 50) * 2,
          type: i % 4 === 0 ? 'virtual' : 'in-person',
          keywords: i % 15 === 0 ? `stress${i % 8}` : undefined
        };
        
        const promise = searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false,
          timeout: 5000 // Longer timeout for stress test
        }).then(result => {
          metrics.recordRequest(result.responseTime || 0, true);
          return result;
        }).catch(error => {
          metrics.recordRequest(0, false);
          return null;
        });
        
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const testMetrics = metrics.getMetrics();

      // Under extreme load, system should still function but may have reduced performance
      const successfulResults = results.filter(r => r !== null);
      expect(successfulResults.length).toBeGreaterThan(150); // Should handle at least 75% of requests
      expect(testMetrics.successRate).toBeGreaterThan(75);
      expect(testMetrics.avgResponseTime).toBeLessThan(2000); // May be slow but should complete
      
      console.log(`Stress test (200 concurrent): ${testMetrics.requestsPerSecond.toFixed(2)} req/s, avg ${testMetrics.avgResponseTime.toFixed(2)}ms, success ${testMetrics.successRate.toFixed(1)}%`);
    });

    it('should recover gracefully from service failures under load', async () => {
      // Create services with different failure characteristics
      const services = [
        new MockLoadTestAPIService('StableService', generateLoadTestOpportunities(50, 'stable'), 100, 0.02),
        new MockLoadTestAPIService('UnstableService', generateLoadTestOpportunities(75, 'unstable'), 200, 0.3), // 30% failure rate
        new MockLoadTestAPIService('SlowService', generateLoadTestOpportunities(30, 'slow'), 500, 0.05)
      ];

      services.forEach(service => mockRegistry.registerService(service));

      metrics.start();
      
      // Launch concurrent requests that will hit all services
      const promises = [];
      for (let i = 0; i < 60; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 15 + (i % 35) * 2
        };
        
        const promise = searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false,
          timeout: 3000
        }).then(result => {
          metrics.recordRequest(result.responseTime || 0, true);
          return result;
        }).catch(error => {
          metrics.recordRequest(0, false);
          return null;
        });
        
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const testMetrics = metrics.getMetrics();

      // System should handle mixed service reliability
      const successfulResults = results.filter(r => r !== null);
      expect(successfulResults.length).toBeGreaterThan(40); // Should get results despite failures
      expect(testMetrics.successRate).toBeGreaterThan(65); // Allow for service failures
      
      // Successful results should contain data from stable services
      successfulResults.forEach(result => {
        if (result) {
          expect(result.opportunities.length).toBeGreaterThan(0);
          expect(result.sources.length).toBeGreaterThan(0);
        }
      });
      
      console.log(`Mixed service reliability: ${testMetrics.requestsPerSecond.toFixed(2)} req/s, success ${testMetrics.successRate.toFixed(1)}%`);
    });

    it('should handle cache thrashing under high load', async () => {
      const opportunities = generateLoadTestOpportunities(100, 'thrash');
      const service = new MockLoadTestAPIService('ThrashService', opportunities, 150, 0);
      mockRegistry.registerService(service);

      // Configure small cache to force evictions
      searchController.configureCaching({
        defaultTTL: 10000, // 10 seconds
        maxCacheSize: 5 // Very small cache
      });

      metrics.start();
      
      // Create many different search parameters to cause cache thrashing
      const promises = [];
      for (let i = 0; i < 50; i++) {
        const searchParams = {
          ...mockSearchParams,
          radius: 10 + i * 2, // Each request has different radius
          keywords: `unique${i}`, // Each request has unique keywords
          type: i % 3 === 0 ? 'virtual' : 'in-person'
        };
        
        const promise = searchController.performSearch(searchParams, { 
          useHealthyServicesOnly: false 
        }).then(result => {
          metrics.recordRequest(result.responseTime || 0, true);
          return result;
        }).catch(error => {
          metrics.recordRequest(0, false);
          return null;
        });
        
        promises.push(promise);
      }

      const results = await Promise.all(promises);
      const testMetrics = metrics.getMetrics();
      const cacheStats = searchController.getCacheStats();

      // System should handle cache thrashing without major issues
      expect(testMetrics.successRate).toBeGreaterThan(95);
      expect(cacheStats.totalEntries).toBeLessThanOrEqual(5); // Should respect cache limit
      expect(cacheStats.missCount).toBeGreaterThan(cacheStats.hitCount); // Should have more misses due to thrashing
      
      console.log(`Cache thrashing: ${testMetrics.requestsPerSecond.toFixed(2)} req/s, cache hit rate ${((cacheStats.hitCount / (cacheStats.hitCount + cacheStats.missCount)) * 100).toFixed(1)}%`);
    });
  });

  describe('Performance Regression Testing', () => {
    it('should maintain baseline performance characteristics', async () => {
      const opportunities = generateLoadTestOpportunities(150, 'baseline');
      const service = new MockLoadTestAPIService('BaselineService', opportunities, 120, 0);
      mockRegistry.registerService(service);

      // Define performance baselines
      const baselines = {
        singleRequestMaxTime: 200,
        concurrentRequestsMaxAvgTime: 300,
        throughputMinReqPerSec: 15,
        cacheHitMaxTime: 50
      };

      // Test 1: Single request performance
      const singleStart = performance.now();
      const singleResult = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });
      const singleTime = performance.now() - singleStart;

      expect(singleTime).toBeLessThan(baselines.singleRequestMaxTime);
      expect(singleResult.opportunities).toHaveLength(150);

      // Test 2: Concurrent requests performance
      metrics.start();
      const concurrentPromises = [];
      for (let i = 0; i < 20; i++) {
        const promise = searchController.performSearch({
          ...mockSearchParams,
          radius: 25 + i * 2
        }, { useHealthyServicesOnly: false }).then(result => {
          metrics.recordRequest(result.responseTime || 0, true);
          return result;
        });
        concurrentPromises.push(promise);
      }

      await Promise.all(concurrentPromises);
      const concurrentMetrics = metrics.getMetrics();

      expect(concurrentMetrics.avgResponseTime).toBeLessThan(baselines.concurrentRequestsMaxAvgTime);
      expect(concurrentMetrics.requestsPerSecond).toBeGreaterThan(baselines.throughputMinReqPerSec);

      // Test 3: Cache performance
      const cacheStart = performance.now();
      await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      }); // Should hit cache
      const cacheTime = performance.now() - cacheStart;

      expect(cacheTime).toBeLessThan(baselines.cacheHitMaxTime);

      console.log(`Baseline performance: Single ${singleTime.toFixed(2)}ms, Concurrent avg ${concurrentMetrics.avgResponseTime.toFixed(2)}ms, Cache ${cacheTime.toFixed(2)}ms`);
    });
  });
});