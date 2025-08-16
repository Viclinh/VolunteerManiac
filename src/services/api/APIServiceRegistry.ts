import { BaseAPIService } from './BaseAPIService';
import { SearchParameters, APIResult, APIError } from '../../types/volunteer';

export interface ServiceHealth {
  serviceName: string;
  healthy: boolean;
  responseTime?: number;
  error?: string;
  lastChecked: Date;
}

export class APIServiceRegistry {
  private services: Map<string, BaseAPIService> = new Map();
  private healthCache: Map<string, ServiceHealth> = new Map();
  private healthCacheTTL = 60000; // 1 minute

  /**
   * Register an API service
   */
  registerService(service: BaseAPIService): void {
    this.services.set(service['serviceName'], service);
  }

  /**
   * Unregister an API service
   */
  unregisterService(serviceName: string): void {
    this.services.delete(serviceName);
    this.healthCache.delete(serviceName);
  }

  /**
   * Get all registered services
   */
  getServices(): BaseAPIService[] {
    return Array.from(this.services.values());
  }

  /**
   * Get a specific service by name
   */
  getService(serviceName: string): BaseAPIService | undefined {
    return this.services.get(serviceName);
  }

  /**
   * Search opportunities across all registered services
   */
  async searchAllServices(params: SearchParameters): Promise<APIResult[]> {
    const services = this.getServices();
    const promises = services.map(service => 
      this.searchWithService(service, params)
    );

    // Execute all searches in parallel
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Create error result for failed service
        const serviceName = services[index]['serviceName'];
        return {
          source: serviceName,
          opportunities: [],
          success: false,
          error: result.reason?.message || 'Service failed'
        };
      }
    });
  }

  /**
   * Search opportunities from healthy services only
   */
  async searchHealthyServices(params: SearchParameters): Promise<APIResult[]> {
    const healthyServices = await this.getHealthyServices();
    const promises = healthyServices.map(service => 
      this.searchWithService(service, params)
    );

    const results = await Promise.allSettled(promises);
    
    return results
      .filter(result => result.status === 'fulfilled')
      .map(result => (result as PromiseFulfilledResult<APIResult>).value);
  }

  /**
   * Search with a specific service with error handling
   */
  private async searchWithService(service: BaseAPIService, params: SearchParameters): Promise<APIResult> {
    try {
      return await service.searchOpportunities(params);
    } catch (error) {
      const serviceName = service['serviceName'];
      console.error(`[APIServiceRegistry] Search failed for ${serviceName}:`, error);
      
      return {
        source: serviceName,
        opportunities: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get health status of all services
   */
  async getServicesHealth(): Promise<ServiceHealth[]> {
    const services = this.getServices();
    const healthPromises = services.map(service => this.getServiceHealth(service));
    
    return Promise.all(healthPromises);
  }

  /**
   * Get health status of a specific service with caching
   */
  async getServiceHealth(service: BaseAPIService): Promise<ServiceHealth> {
    const serviceName = service['serviceName'];
    const cached = this.healthCache.get(serviceName);
    
    // Return cached result if still valid
    if (cached && Date.now() - cached.lastChecked.getTime() < this.healthCacheTTL) {
      return cached;
    }

    // Check health
    try {
      const healthResult = await service.getHealthStatus();
      const health: ServiceHealth = {
        serviceName,
        healthy: healthResult.healthy,
        responseTime: healthResult.responseTime,
        error: healthResult.error,
        lastChecked: new Date()
      };
      
      this.healthCache.set(serviceName, health);
      return health;
    } catch (error) {
      const health: ServiceHealth = {
        serviceName,
        healthy: false,
        error: error instanceof Error ? error.message : 'Health check failed',
        lastChecked: new Date()
      };
      
      this.healthCache.set(serviceName, health);
      return health;
    }
  }

  /**
   * Get only healthy services
   */
  async getHealthyServices(): Promise<BaseAPIService[]> {
    const healthStatuses = await this.getServicesHealth();
    const healthyServiceNames = healthStatuses
      .filter(health => health.healthy)
      .map(health => health.serviceName);
    
    return healthyServiceNames
      .map(name => this.services.get(name))
      .filter((service): service is BaseAPIService => service !== undefined);
  }

  /**
   * Clear health cache
   */
  clearHealthCache(): void {
    this.healthCache.clear();
  }

  /**
   * Get registry statistics
   */
  getStats(): {
    totalServices: number;
    registeredServices: string[];
    healthCacheSize: number;
  } {
    return {
      totalServices: this.services.size,
      registeredServices: Array.from(this.services.keys()),
      healthCacheSize: this.healthCache.size
    };
  }
}

// Export singleton instance
export const apiServiceRegistry = new APIServiceRegistry();