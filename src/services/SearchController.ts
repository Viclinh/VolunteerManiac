import { APIServiceRegistry, apiServiceRegistry } from './api/APIServiceRegistry';
import { VolunteerOpportunity, SearchParameters, SearchFilters, APIResult, APIError, ServiceStatus, SearchProgress } from '../types/volunteer';
import { LocationInfo, Coordinates } from '../types/location';
import { MultiLocationService, ParsedLocation, LocationGroup } from './MultiLocationService';
import { SearchResultsCache, searchResultsCache } from './SearchResultsCache';

export interface SearchQuery {
  location: string;
  useCurrentLocation: boolean;
  radius: number;
  filters: SearchFilters;
  multiLocation?: boolean; // Flag to indicate multi-location search
}

export interface MultiLocationSearchResult extends SearchResult {
  locationGroups?: LocationGroup[];
  searchStatistics?: {
    totalLocations: number;
    successfulLocations: number;
    failedLocations: number;
    totalOpportunities: number;
    averageOpportunitiesPerLocation: number;
    locationBreakdown: { location: string; count: number }[];
  };
}

export interface SearchResult {
  opportunities: VolunteerOpportunity[];
  searchLocation: LocationInfo;
  totalResults: number;
  sources: string[];
  errors?: APIError[];
  responseTime: number;
  partialResults: boolean; // True if some sources failed but others succeeded
  serviceStatuses: ServiceStatus[]; // Status of each service
}

export interface SearchPreferences {
  lastLocation: LocationInfo;
  preferredRadius: number;
  preferredCauses: string[];
  preferredType: 'in-person' | 'virtual' | 'both';
}

export interface SearchOptions {
  timeout?: number;
  useHealthyServicesOnly?: boolean;
  maxConcurrentRequests?: number;
}

export class SearchController {
  private registry: APIServiceRegistry;
  private multiLocationService: MultiLocationService;
  private cache: SearchResultsCache;
  private defaultTimeout = 15000; // 15 seconds
  private maxConcurrentRequests = 5;

  constructor(
    registry?: APIServiceRegistry, 
    multiLocationService?: MultiLocationService,
    cache?: SearchResultsCache
  ) {
    this.registry = registry || apiServiceRegistry;
    this.multiLocationService = multiLocationService || new MultiLocationService();
    this.cache = cache || searchResultsCache;
  }

  /**
   * Perform multi-location search across multiple volunteer opportunity APIs
   */
  async performMultiLocationSearch(
    locationInput: string,
    radius: number,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<MultiLocationSearchResult> {
    const startTime = Date.now();

    try {
      // Validate and parse location input
      const validation = this.multiLocationService.validateLocationInput(locationInput);
      if (!validation.isValid) {
        throw new Error(`Invalid location input: ${validation.errors.join(', ')}`);
      }

      // Parse locations from input
      const locationStrings = this.multiLocationService.parseLocationInput(locationInput);
      console.log(`[SearchController] Parsed ${locationStrings.length} locations:`, locationStrings);

      // Geocode all locations in parallel
      const parsedLocations = await this.multiLocationService.geocodeMultipleLocations(locationStrings);
      console.log(`[SearchController] Successfully geocoded ${parsedLocations.length} locations`);

      // Perform searches for each location in parallel
      const searchPromises = parsedLocations.map(async (parsedLocation) => {
        const searchParams: SearchParameters = {
          location: parsedLocation.coordinates,
          radius,
          causes: filters.causes.length > 0 ? filters.causes : undefined,
          type: filters.type === '' ? 'both' : filters.type,
          limit: 50
        };

        try {
          const result = await this.performSearch(searchParams, options);
          return {
            ...result,
            success: true,
            parsedLocation
          };
        } catch (error) {
          console.warn(`[SearchController] Search failed for ${parsedLocation.originalInput}:`, error);
          return {
            opportunities: [],
            searchLocation: parsedLocation.locationInfo,
            totalResults: 0,
            sources: [],
            errors: [{
              source: 'SearchController',
              type: 'server_error' as const,
              message: error instanceof Error ? error.message : 'Search failed',
              userMessage: `Search failed for ${parsedLocation.originalInput}`,
              retryable: true
            }],
            responseTime: 0,
            partialResults: false,
            serviceStatuses: [],
            success: false,
            parsedLocation
          };
        }
      });

      // Wait for all searches to complete
      const searchResults = await Promise.all(searchPromises);

      // Group results by location
      const locationGroups = this.multiLocationService.groupResultsByLocation(
        searchResults,
        parsedLocations
      );

      // Merge all opportunities with location context
      const allOpportunities = this.multiLocationService.mergeOpportunitiesWithLocationContext(locationGroups);

      // Calculate statistics
      const searchStatistics = this.multiLocationService.getSearchStatistics(locationGroups);

      // Aggregate errors from all searches
      const allErrors: APIError[] = [];
      const allSources: string[] = [];
      const allServiceStatuses: ServiceStatus[] = [];
      let totalResponseTime = 0;

      searchResults.forEach(result => {
        if (result.errors) {
          allErrors.push(...result.errors);
        }
        allSources.push(...result.sources);
        allServiceStatuses.push(...result.serviceStatuses);
        totalResponseTime += result.responseTime;
      });

      const responseTime = Date.now() - startTime;
      const uniqueSources = [...new Set(allSources)];
      const hasPartialResults = searchResults.some(r => r.partialResults);

      // Create summary location info
      const searchLocation: LocationInfo = {
        city: this.multiLocationService.getLocationSummary(parsedLocations),
        country: 'Multiple',
        formattedAddress: locationInput
      };

      const result: MultiLocationSearchResult = {
        opportunities: allOpportunities,
        searchLocation,
        totalResults: allOpportunities.length,
        sources: uniqueSources,
        errors: allErrors.length > 0 ? allErrors : undefined,
        responseTime,
        partialResults: hasPartialResults,
        serviceStatuses: allServiceStatuses,
        locationGroups,
        searchStatistics
      };

      console.log(`[SearchController] Multi-location search completed:`, {
        totalLocations: searchStatistics.totalLocations,
        successfulLocations: searchStatistics.successfulLocations,
        totalOpportunities: searchStatistics.totalOpportunities,
        responseTime
      });

      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[SearchController] Multi-location search failed:', error);
      
      return {
        opportunities: [],
        searchLocation: { city: 'Unknown', country: 'Unknown', formattedAddress: locationInput },
        totalResults: 0,
        sources: [],
        errors: [{
          source: 'SearchController',
          type: 'server_error',
          message: error instanceof Error ? error.message : 'Multi-location search failed',
          userMessage: 'Multi-location search failed',
          retryable: true
        }],
        responseTime,
        partialResults: false,
        serviceStatuses: [],
        locationGroups: [],
        searchStatistics: {
          totalLocations: 0,
          successfulLocations: 0,
          failedLocations: 0,
          totalOpportunities: 0,
          averageOpportunitiesPerLocation: 0,
          locationBreakdown: []
        }
      };
    }
  }

  /**
   * Perform search across multiple volunteer opportunity APIs
   */
  async performSearch(
    searchParams: SearchParameters,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    const startTime = Date.now();
    const {
      timeout = this.defaultTimeout,
      useHealthyServicesOnly = true,
      maxConcurrentRequests = this.maxConcurrentRequests
    } = options;

    try {
      // Check cache first
      const cachedResults = this.cache.get(searchParams);
      if (cachedResults) {
        console.log(`[SearchController] Cache hit - returning ${cachedResults.length} cached opportunities`);
        return {
          opportunities: cachedResults,
          searchLocation: this.createLocationFromCoordinates(searchParams.location),
          totalResults: cachedResults.length,
          sources: [...new Set(cachedResults.map(opp => opp.source))],
          responseTime: Date.now() - startTime,
          partialResults: false,
          serviceStatuses: []
        };
      }

      // Get services to search
      const services = useHealthyServicesOnly 
        ? await this.registry.getHealthyServices()
        : this.registry.getServices();

      if (services.length === 0) {
        throw new Error('No available services for search');
      }

      // Limit concurrent requests
      const servicesToSearch = services.slice(0, maxConcurrentRequests);
      
      console.log(`[SearchController] Starting search with ${servicesToSearch.length} services`, {
        location: searchParams.location,
        radius: searchParams.radius,
        timeout
      });

      // Execute searches with timeout
      const searchPromise = this.executeParallelSearch(servicesToSearch, searchParams);
      const timeoutPromise = this.createTimeoutPromise(timeout);
      
      const results = await Promise.race([searchPromise, timeoutPromise]);
      
      // Process and aggregate results
      const searchResult = this.aggregateResults(results, startTime);
      
      // Cache successful results
      if (searchResult.opportunities.length > 0) {
        this.cache.set(searchParams, searchResult.opportunities, {
          totalResults: searchResult.totalResults,
          sources: searchResult.sources,
          responseTime: searchResult.responseTime
        });
      }
      
      console.log(`[SearchController] Search completed`, {
        totalResults: searchResult.totalResults,
        sources: searchResult.sources,
        responseTime: searchResult.responseTime,
        errors: searchResult.errors?.length || 0
      });

      return searchResult;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.error('[SearchController] Search failed:', error);
      
      return {
        opportunities: [],
        searchLocation: this.createLocationFromCoordinates(searchParams.location),
        totalResults: 0,
        sources: [],
        errors: [{
          source: 'SearchController',
          type: 'server_error',
          message: error instanceof Error ? error.message : 'Search failed',
          retryable: true
        }],
        responseTime,
        partialResults: false,
        serviceStatuses: []
      };
    }
  }

  /**
   * Execute parallel searches across multiple services
   */
  private async executeParallelSearch(
    services: any[],
    searchParams: SearchParameters
  ): Promise<APIResult[]> {
    const searchPromises = services.map(service => 
      this.searchWithGracefulDegradation(service, searchParams)
    );

    // Use Promise.allSettled to handle individual service failures
    const settledResults = await Promise.allSettled(searchPromises);
    
    return settledResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        // Create error result for failed service
        const serviceName = services[index].serviceName || `Service${index}`;
        return {
          source: serviceName,
          opportunities: [],
          success: false,
          error: result.reason?.message || 'Service search failed'
        };
      }
    });
  }

  /**
   * Search with individual service with graceful degradation
   */
  private async searchWithGracefulDegradation(
    service: any,
    searchParams: SearchParameters
  ): Promise<APIResult> {
    const serviceName = service.serviceName || 'Unknown';
    
    try {
      console.log(`[SearchController] Searching ${serviceName}...`);
      const result = await service.searchOpportunities(searchParams);
      
      console.log(`[SearchController] ${serviceName} returned ${result.opportunities.length} opportunities`);
      return result;
      
    } catch (error) {
      console.warn(`[SearchController] ${serviceName} search failed:`, error);
      
      return {
        source: serviceName,
        opportunities: [],
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create timeout promise for search operations
   */
  private createTimeoutPromise(timeout: number): Promise<APIResult[]> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Search timeout after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Aggregate results from multiple API sources with enhanced error handling
   */
  private aggregateResults(results: APIResult[], startTime: number): SearchResult {
    const responseTime = Date.now() - startTime;
    const allOpportunities: VolunteerOpportunity[] = [];
    const sources: string[] = [];
    const errors: APIError[] = [];
    const serviceStatuses: ServiceStatus[] = [];

    let successfulSources = 0;
    let failedSources = 0;

    for (const result of results) {
      sources.push(result.source);
      
      // Create service status
      const serviceStatus: ServiceStatus = {
        serviceName: result.source,
        healthy: result.success,
        responseTime: result.responseTime,
        lastChecked: new Date(),
        consecutiveFailures: result.success ? 0 : 1
      };

      if (result.success) {
        successfulSources++;
        if (result.opportunities.length > 0) {
          allOpportunities.push(...result.opportunities);
        }
      } else {
        failedSources++;
        serviceStatus.error = result.error;
        
        if (result.error) {
          // Try to parse existing APIError or create a new one
          let apiError: APIError;
          try {
            // If result.error is already an APIError object
            if (typeof result.error === 'object' && 'type' in result.error) {
              apiError = result.error as APIError;
            } else {
              // Create APIError from string message
              apiError = {
                source: result.source,
                type: 'server_error',
                message: result.error,
                userMessage: `${result.source} encountered an error`,
                retryable: true,
                suggestions: [
                  'This service may be temporarily unavailable',
                  'Other sources are still being searched',
                  'Try again in a few minutes'
                ]
              };
            }
          } catch {
            // Fallback error creation
            apiError = {
              source: result.source,
              type: 'server_error',
              message: result.error || 'Unknown error',
              userMessage: `${result.source} is currently unavailable`,
              retryable: true,
              suggestions: ['Try again later', 'Other sources may have results']
            };
          }
          
          errors.push(apiError);
        }
      }
      
      serviceStatuses.push(serviceStatus);
    }

    // Create search location from first opportunity or use default
    const searchLocation = allOpportunities.length > 0 && allOpportunities[0].coordinates
      ? this.createLocationFromCoordinates(allOpportunities[0].coordinates)
      : { city: 'Unknown', country: 'Unknown', formattedAddress: 'Unknown Location' };

    const partialResults = successfulSources > 0 && failedSources > 0;

    return {
      opportunities: allOpportunities,
      searchLocation,
      totalResults: allOpportunities.length,
      sources: [...new Set(sources)], // Remove duplicates
      errors: errors.length > 0 ? errors : undefined,
      responseTime,
      partialResults,
      serviceStatuses
    };
  }

  /**
   * Get user-friendly error summary for display
   */
  getErrorSummary(searchResult: SearchResult): {
    hasErrors: boolean;
    errorCount: number;
    criticalErrors: APIError[];
    minorErrors: APIError[];
    userMessage: string;
    suggestions: string[];
  } {
    if (!searchResult.errors || searchResult.errors.length === 0) {
      return {
        hasErrors: false,
        errorCount: 0,
        criticalErrors: [],
        minorErrors: [],
        userMessage: '',
        suggestions: []
      };
    }

    const criticalErrors = searchResult.errors.filter(error => 
      !error.retryable || error.type === 'authentication'
    );
    const minorErrors = searchResult.errors.filter(error => 
      error.retryable && error.type !== 'authentication'
    );

    let userMessage = '';
    const suggestions: string[] = [];

    if (searchResult.totalResults > 0) {
      // Partial results
      if (searchResult.errors.length === 1) {
        userMessage = `Found ${searchResult.totalResults} opportunities, but ${searchResult.errors[0].source} was unavailable`;
      } else {
        userMessage = `Found ${searchResult.totalResults} opportunities, but ${searchResult.errors.length} sources had issues`;
      }
      suggestions.push('Results shown are from available sources');
      suggestions.push('Try again later for complete results');
    } else {
      // No results due to errors
      if (criticalErrors.length > 0) {
        userMessage = 'Unable to search volunteer opportunities due to service issues';
        suggestions.push('Try again in a few minutes');
        suggestions.push('Check your internet connection');
      } else {
        userMessage = 'All volunteer services are temporarily unavailable';
        suggestions.push('Services may be under maintenance');
        suggestions.push('Try again later');
      }
    }

    return {
      hasErrors: true,
      errorCount: searchResult.errors.length,
      criticalErrors,
      minorErrors,
      userMessage,
      suggestions
    };
  }

  /**
   * Create LocationInfo from coordinates
   */
  private createLocationFromCoordinates(coordinates: Coordinates): LocationInfo {
    return {
      city: 'Unknown',
      country: 'Unknown',
      formattedAddress: `${coordinates.latitude}, ${coordinates.longitude}`
    };
  }

  /**
   * Update search filters (for future use with UI)
   */
  updateFilters(filters: SearchFilters): void {
    // This method will be used by UI components to update active filters
    console.log('[SearchController] Filters updated:', filters);
  }

  /**
   * Save search preferences to local storage
   */
  saveSearchPreferences(preferences: SearchPreferences): void {
    try {
      const preferencesJson = JSON.stringify(preferences);
      localStorage.setItem('volunteerSearchPreferences', preferencesJson);
      console.log('[SearchController] Search preferences saved');
    } catch (error) {
      console.error('[SearchController] Failed to save search preferences:', error);
    }
  }

  /**
   * Load search preferences from local storage
   */
  loadSearchPreferences(): SearchPreferences | null {
    try {
      const preferencesJson = localStorage.getItem('volunteerSearchPreferences');
      if (preferencesJson) {
        const preferences = JSON.parse(preferencesJson);
        console.log('[SearchController] Search preferences loaded');
        return preferences;
      }
    } catch (error) {
      console.error('[SearchController] Failed to load search preferences:', error);
    }
    return null;
  }

  /**
   * Clear search preferences
   */
  clearSearchPreferences(): void {
    try {
      localStorage.removeItem('volunteerSearchPreferences');
      console.log('[SearchController] Search preferences cleared');
    } catch (error) {
      console.error('[SearchController] Failed to clear search preferences:', error);
    }
  }

  /**
   * Get search statistics
   */
  getSearchStats(): {
    availableServices: number;
    healthyServices: number;
    lastSearchTime?: Date;
  } {
    const stats = this.registry.getStats();
    return {
      availableServices: stats.totalServices,
      healthyServices: 0, // Will be updated when health check is called
      lastSearchTime: undefined // Could be tracked in future
    };
  }

  /**
   * Retry failed searches for recoverable errors
   */
  async retryFailedSources(
    searchParams: SearchParameters,
    previousResult: SearchResult,
    options: SearchOptions = {}
  ): Promise<SearchResult> {
    if (!previousResult.errors) {
      return previousResult;
    }

    const retryableErrors = previousResult.errors.filter(error => error.retryable);
    if (retryableErrors.length === 0) {
      return previousResult;
    }

    console.log(`[SearchController] Retrying ${retryableErrors.length} failed sources`);

    const startTime = Date.now();
    const services = this.registry.getServices();
    const servicesToRetry = services.filter(service => 
      retryableErrors.some(error => error.source === service.serviceName)
    );

    if (servicesToRetry.length === 0) {
      return previousResult;
    }

    try {
      const retryResults = await this.executeParallelSearch(servicesToRetry, searchParams);
      
      // Merge retry results with previous successful results
      const allResults = [
        ...previousResult.serviceStatuses
          .filter(status => status.healthy)
          .map(status => ({
            source: status.serviceName,
            opportunities: previousResult.opportunities.filter(opp => opp.source === status.serviceName),
            success: true,
            responseTime: status.responseTime
          })),
        ...retryResults
      ];

      return this.aggregateResults(allResults, startTime);
    } catch (error) {
      console.error('[SearchController] Retry failed:', error);
      return previousResult;
    }
  }

  /**
   * Perform search with automatic detection of single vs multi-location input
   */
  async performSmartSearch(
    locationInput: string,
    radius: number,
    filters: SearchFilters,
    options: SearchOptions = {}
  ): Promise<SearchResult | MultiLocationSearchResult> {
    // Check if input contains multiple locations
    if (this.multiLocationService.isMultiLocationInput(locationInput)) {
      console.log('[SearchController] Detected multi-location input, using multi-location search');
      return this.performMultiLocationSearch(locationInput, radius, filters, options);
    } else {
      console.log('[SearchController] Detected single location input, using standard search');
      // For single location, we need to geocode first
      const geocodingService = new (await import('./geocodingService')).GeocodingService();
      const coordinates = await geocodingService.geocodeLocation(locationInput);
      
      const searchParams: SearchParameters = {
        location: coordinates,
        radius,
        causes: filters.causes.length > 0 ? filters.causes : undefined,
        type: filters.type === '' ? 'both' : filters.type,
        limit: 50
      };

      return this.performSearch(searchParams, options);
    }
  }

  /**
   * Test connectivity to all services
   */
  async testConnectivity(): Promise<{ [serviceName: string]: boolean }> {
    const services = this.registry.getServices();
    const healthPromises = services.map(async service => {
      try {
        const health = await service.getHealthStatus();
        return { name: service.serviceName, healthy: health.healthy };
      } catch {
        return { name: service.serviceName, healthy: false };
      }
    });

    const healthResults = await Promise.all(healthPromises);
    const connectivity: { [serviceName: string]: boolean } = {};
    
    healthResults.forEach(result => {
      connectivity[result.name] = result.healthy;
    });

    return connectivity;
  }

  /**
   * Get service health status with detailed information
   */
  async getDetailedServiceStatus(): Promise<ServiceStatus[]> {
    const services = this.registry.getServices();
    const statusPromises = services.map(async service => {
      const startTime = Date.now();
      try {
        const health = await service.getHealthStatus();
        const responseTime = Date.now() - startTime;
        
        return {
          serviceName: service.serviceName,
          healthy: health.healthy,
          responseTime,
          lastChecked: new Date(),
          error: health.error,
          consecutiveFailures: health.healthy ? 0 : 1
        };
      } catch (error) {
        const responseTime = Date.now() - startTime;
        return {
          serviceName: service.serviceName,
          healthy: false,
          responseTime,
          lastChecked: new Date(),
          error: error instanceof Error ? error.message : 'Unknown error',
          consecutiveFailures: 1
        };
      }
    });

    return Promise.all(statusPromises);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear search results cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidate cache entries matching specific criteria
   */
  invalidateCache(criteria: {
    location?: Coordinates;
    radius?: number;
    causes?: string[];
    type?: string;
  }): number {
    return this.cache.invalidate(criteria);
  }

  /**
   * Warm cache with popular locations
   */
  async warmCache(popularLocations: { coordinates: Coordinates; radius: number }[]): Promise<void> {
    const searchFunction = async (params: SearchParameters) => {
      // Temporarily disable cache to avoid recursive caching during warmup
      const originalCache = this.cache;
      this.cache = new SearchResultsCache(); // Use empty cache for warmup
      
      try {
        const result = await this.performSearch(params);
        return {
          opportunities: result.opportunities,
          metadata: {
            totalResults: result.totalResults,
            sources: result.sources,
            responseTime: result.responseTime
          }
        };
      } finally {
        // Restore original cache
        this.cache = originalCache;
      }
    };

    await this.cache.warmCache(popularLocations, searchFunction);
  }

  /**
   * Set cache configuration
   */
  configureCaching(options: {
    defaultTTL?: number;
    maxCacheSize?: number;
  }): void {
    if (options.defaultTTL) {
      this.cache.setDefaultTTL(options.defaultTTL);
    }
    if (options.maxCacheSize) {
      this.cache.setMaxCacheSize(options.maxCacheSize);
    }
  }
}

// Export singleton instance
export const searchController = new SearchController();