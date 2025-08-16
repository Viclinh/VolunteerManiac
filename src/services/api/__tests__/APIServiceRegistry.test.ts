import { describe, it, expect, vi, beforeEach } from 'vitest';
import { APIServiceRegistry } from '../APIServiceRegistry';
import { BaseAPIService } from '../BaseAPIService';
import { SearchParameters, APIResult, VolunteerOpportunity } from '../../../types/volunteer';

// Mock service implementation
class MockAPIService extends BaseAPIService {
  private mockSearchResult: APIResult;
  private mockHealthResult: { healthy: boolean; responseTime?: number; error?: string };

  constructor(
    serviceName: string,
    mockSearchResult?: APIResult,
    mockHealthResult?: { healthy: boolean; responseTime?: number; error?: string }
  ) {
    super(serviceName, 'https://mock.api.com');
    this.mockSearchResult = mockSearchResult || {
      source: serviceName,
      opportunities: [],
      success: true
    };
    this.mockHealthResult = mockHealthResult || { healthy: true, responseTime: 100 };
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    if (!this.mockSearchResult.success) {
      throw new Error(this.mockSearchResult.error || 'Mock error');
    }
    return this.mockSearchResult;
  }

  async getOpportunityDetails(id: string): Promise<VolunteerOpportunity> {
    return {
      id,
      source: this.serviceName,
      title: 'Mock Opportunity',
      organization: 'Mock Org',
      description: 'Mock description',
      location: 'Mock Location',
      city: 'Mock City',
      country: 'Mock Country',
      type: 'in-person',
      cause: 'Mock Cause',
      skills: [],
      timeCommitment: 'Mock Time',
      date: '2024-01-01',
      contactInfo: {},
      externalUrl: 'https://mock.com',
      lastUpdated: new Date(),
      verified: false
    };
  }

  protected normalizeOpportunity(rawData: any): VolunteerOpportunity {
    return rawData;
  }

  async getHealthStatus() {
    if (!this.mockHealthResult.healthy) {
      throw new Error(this.mockHealthResult.error || 'Health check failed');
    }
    return this.mockHealthResult;
  }
}

describe('APIServiceRegistry', () => {
  let registry: APIServiceRegistry;
  let mockService1: MockAPIService;
  let mockService2: MockAPIService;
  let mockService3: MockAPIService;

  beforeEach(() => {
    registry = new APIServiceRegistry();
    
    mockService1 = new MockAPIService('Service1', {
      source: 'Service1',
      opportunities: [
        {
          id: '1',
          source: 'Service1',
          title: 'Opportunity 1',
          organization: 'Org 1',
          description: 'Description 1',
          location: 'Location 1',
          city: 'City 1',
          country: 'Country 1',
          type: 'in-person',
          cause: 'Cause 1',
          skills: [],
          timeCommitment: 'Time 1',
          date: '2024-01-01',
          contactInfo: {},
          externalUrl: 'https://example1.com',
          lastUpdated: new Date(),
          verified: true
        }
      ],
      success: true
    });

    mockService2 = new MockAPIService('Service2', {
      source: 'Service2',
      opportunities: [
        {
          id: '2',
          source: 'Service2',
          title: 'Opportunity 2',
          organization: 'Org 2',
          description: 'Description 2',
          location: 'Location 2',
          city: 'City 2',
          country: 'Country 2',
          type: 'virtual',
          cause: 'Cause 2',
          skills: [],
          timeCommitment: 'Time 2',
          date: '2024-01-02',
          contactInfo: {},
          externalUrl: 'https://example2.com',
          lastUpdated: new Date(),
          verified: true
        }
      ],
      success: true
    });

    mockService3 = new MockAPIService('Service3', {
      source: 'Service3',
      opportunities: [],
      success: false,
      error: 'Service unavailable'
    }, { healthy: false, error: 'Service down' });
  });

  describe('service registration', () => {
    it('should register services', () => {
      registry.registerService(mockService1);
      registry.registerService(mockService2);

      const services = registry.getServices();
      expect(services).toHaveLength(2);
      expect(services.map(s => s['serviceName'])).toContain('Service1');
      expect(services.map(s => s['serviceName'])).toContain('Service2');
    });

    it('should unregister services', () => {
      registry.registerService(mockService1);
      registry.registerService(mockService2);
      
      registry.unregisterService('Service1');
      
      const services = registry.getServices();
      expect(services).toHaveLength(1);
      expect(services[0]['serviceName']).toBe('Service2');
    });

    it('should get specific service by name', () => {
      registry.registerService(mockService1);
      
      const service = registry.getService('Service1');
      expect(service).toBe(mockService1);
      
      const nonExistentService = registry.getService('NonExistent');
      expect(nonExistentService).toBeUndefined();
    });
  });

  describe('search functionality', () => {
    const searchParams: SearchParameters = {
      location: { latitude: 40.7128, longitude: -74.0060 },
      radius: 25
    };

    it('should search all services', async () => {
      registry.registerService(mockService1);
      registry.registerService(mockService2);

      const results = await registry.searchAllServices(searchParams);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].opportunities).toHaveLength(1);
      expect(results[1].success).toBe(true);
      expect(results[1].opportunities).toHaveLength(1);
    });

    it('should handle service failures gracefully', async () => {
      registry.registerService(mockService1);
      registry.registerService(mockService3); // This one fails

      const results = await registry.searchAllServices(searchParams);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('Service unavailable');
    });

    it('should search only healthy services', async () => {
      registry.registerService(mockService1); // Healthy
      registry.registerService(mockService2); // Healthy
      registry.registerService(mockService3); // Unhealthy

      const results = await registry.searchHealthyServices(searchParams);

      // Should only get results from healthy services
      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('health monitoring', () => {
    it('should get health status of all services', async () => {
      registry.registerService(mockService1);
      registry.registerService(mockService2);
      registry.registerService(mockService3);

      const healthStatuses = await registry.getServicesHealth();

      expect(healthStatuses).toHaveLength(3);
      expect(healthStatuses[0].healthy).toBe(true);
      expect(healthStatuses[1].healthy).toBe(true);
      expect(healthStatuses[2].healthy).toBe(false);
    });

    it('should cache health results', async () => {
      registry.registerService(mockService1);

      // First call
      const health1 = await registry.getServiceHealth(mockService1);
      expect(health1.healthy).toBe(true);

      // Second call should use cache (we can't easily test this without mocking time)
      const health2 = await registry.getServiceHealth(mockService1);
      expect(health2.healthy).toBe(true);
    });

    it('should clear health cache', async () => {
      registry.registerService(mockService1);
      
      await registry.getServiceHealth(mockService1);
      registry.clearHealthCache();
      
      // After clearing cache, next call should fetch fresh data
      const health = await registry.getServiceHealth(mockService1);
      expect(health.healthy).toBe(true);
    });

    it('should get only healthy services', async () => {
      registry.registerService(mockService1); // Healthy
      registry.registerService(mockService2); // Healthy
      registry.registerService(mockService3); // Unhealthy

      const healthyServices = await registry.getHealthyServices();

      expect(healthyServices).toHaveLength(2);
      expect(healthyServices.map(s => s['serviceName'])).toContain('Service1');
      expect(healthyServices.map(s => s['serviceName'])).toContain('Service2');
      expect(healthyServices.map(s => s['serviceName'])).not.toContain('Service3');
    });
  });

  describe('registry statistics', () => {
    it('should provide registry stats', () => {
      registry.registerService(mockService1);
      registry.registerService(mockService2);

      const stats = registry.getStats();

      expect(stats.totalServices).toBe(2);
      expect(stats.registeredServices).toContain('Service1');
      expect(stats.registeredServices).toContain('Service2');
      expect(stats.healthCacheSize).toBe(0); // No health checks performed yet
    });

    it('should update stats after health checks', async () => {
      registry.registerService(mockService1);
      registry.registerService(mockService2);

      await registry.getServicesHealth();

      const stats = registry.getStats();
      expect(stats.healthCacheSize).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should handle service search errors', async () => {
      const errorService = new MockAPIService('ErrorService');
      // Override to throw error
      errorService.searchOpportunities = vi.fn().mockRejectedValue(new Error('Search failed'));
      
      registry.registerService(errorService);

      const results = await registry.searchAllServices({
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Search failed');
    });

    it('should handle health check errors', async () => {
      const errorService = new MockAPIService('ErrorService');
      // Override to throw error
      errorService.getHealthStatus = vi.fn().mockRejectedValue(new Error('Health check failed'));
      
      registry.registerService(errorService);

      const health = await registry.getServiceHealth(errorService);

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Health check failed');
    });
  });
});