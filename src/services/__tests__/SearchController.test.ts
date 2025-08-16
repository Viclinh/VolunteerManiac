import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchController, SearchQuery, SearchResult, SearchPreferences, MultiLocationSearchResult } from '../SearchController';
import { APIServiceRegistry } from '../api/APIServiceRegistry';
import { BaseAPIService } from '../api/BaseAPIService';
import { MultiLocationService } from '../MultiLocationService';
import { SearchResultsCache } from '../SearchResultsCache';
import { VolunteerOpportunity, SearchParameters, APIResult } from '../../types/volunteer';
import { Coordinates } from '../../types/location';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock API Service
class MockAPIService extends BaseAPIService {
  public serviceName: string;
  private shouldSucceed: boolean;
  private mockOpportunities: VolunteerOpportunity[];
  private delay: number;

  constructor(
    serviceName: string,
    shouldSucceed: boolean = true,
    opportunities: VolunteerOpportunity[] = [],
    delay: number = 0
  ) {
    super(serviceName, 'http://mock.api', 5000);
    this.serviceName = serviceName;
    this.shouldSucceed = shouldSucceed;
    this.mockOpportunities = opportunities;
    this.delay = delay;
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    if (this.delay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.delay));
    }

    if (!this.shouldSucceed) {
      throw new Error('Mock API service failure');
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

describe('SearchController', () => {
  let searchController: SearchController;
  let mockRegistry: APIServiceRegistry;
  let mockCoordinates: Coordinates;
  let mockSearchParams: SearchParameters;

  beforeEach(() => {
    mockRegistry = new APIServiceRegistry();
    searchController = new SearchController(mockRegistry);
    
    mockCoordinates = { latitude: 40.7128, longitude: -74.0060 }; // NYC
    mockSearchParams = {
      location: mockCoordinates,
      radius: 25,
      keywords: 'environment',
      type: 'both',
      limit: 20
    };

    // Clear localStorage mocks
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('performSearch', () => {
    it('should successfully search with multiple services', async () => {
      // Setup mock opportunities
      const mockOpportunities1: VolunteerOpportunity[] = [
        {
          id: '1',
          source: 'service1',
          title: 'Beach Cleanup',
          organization: 'Ocean Org',
          description: 'Clean the beach',
          location: 'New York, NY',
          city: 'New York',
          country: 'USA',
          type: 'in-person',
          cause: 'environment',
          skills: ['teamwork'],
          timeCommitment: '4 hours',
          date: '2024-01-15',
          contactInfo: { email: 'contact@ocean.org' },
          externalUrl: 'https://ocean.org/volunteer/1',
          lastUpdated: new Date(),
          verified: true
        }
      ];

      const mockOpportunities2: VolunteerOpportunity[] = [
        {
          id: '2',
          source: 'service2',
          title: 'Tree Planting',
          organization: 'Green Earth',
          description: 'Plant trees in the park',
          location: 'Brooklyn, NY',
          city: 'Brooklyn',
          country: 'USA',
          type: 'in-person',
          cause: 'environment',
          skills: ['physical'],
          timeCommitment: '3 hours',
          date: '2024-01-20',
          contactInfo: { email: 'info@greenearth.org' },
          externalUrl: 'https://greenearth.org/volunteer/2',
          lastUpdated: new Date(),
          verified: true
        }
      ];

      // Register mock services
      const service1 = new MockAPIService('service1', true, mockOpportunities1);
      const service2 = new MockAPIService('service2', true, mockOpportunities2);
      
      mockRegistry.registerService(service1);
      mockRegistry.registerService(service2);

      // Perform search
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });

      // Verify results
      expect(result.opportunities).toHaveLength(2);
      expect(result.totalResults).toBe(2);
      expect(result.sources).toEqual(['service1', 'service2']);
      expect(result.errors).toBeUndefined();
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle service failures gracefully', async () => {
      // Setup one successful and one failing service
      const mockOpportunities: VolunteerOpportunity[] = [
        {
          id: '1',
          source: 'service1',
          title: 'Volunteer Opportunity',
          organization: 'Test Org',
          description: 'Test description',
          location: 'New York, NY',
          city: 'New York',
          country: 'USA',
          type: 'in-person',
          cause: 'education',
          skills: [],
          timeCommitment: '2 hours',
          date: '2024-01-15',
          contactInfo: {},
          externalUrl: 'https://test.org/1',
          lastUpdated: new Date(),
          verified: true
        }
      ];

      const successService = new MockAPIService('service1', true, mockOpportunities);
      const failService = new MockAPIService('service2', false, []);
      
      mockRegistry.registerService(successService);
      mockRegistry.registerService(failService);

      // Perform search
      const result = await searchController.performSearch(mockSearchParams, { 
        useHealthyServicesOnly: false 
      });

      // Verify results
      expect(result.opportunities).toHaveLength(1);
      expect(result.totalResults).toBe(1);
      expect(result.sources).toEqual(['service1', 'service2']);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].source).toBe('service2');
    });

    it('should handle timeout correctly', async () => {
      // Create a slow service that takes longer than timeout
      const slowService = new MockAPIService('slowService', true, [], 2000);
      mockRegistry.registerService(slowService);

      // Perform search with short timeout
      const result = await searchController.performSearch(mockSearchParams, { 
        timeout: 1000,
        useHealthyServicesOnly: false 
      });

      // Should return error result due to timeout
      expect(result.opportunities).toHaveLength(0);
      expect(result.totalResults).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('timeout');
    });

    it('should limit concurrent requests', async () => {
      // Register more services than the limit
      const services = [];
      for (let i = 1; i <= 10; i++) {
        const service = new MockAPIService(`service${i}`, true, []);
        services.push(service);
        mockRegistry.registerService(service);
      }

      // Perform search with limit of 3
      const result = await searchController.performSearch(mockSearchParams, { 
        maxConcurrentRequests: 3,
        useHealthyServicesOnly: false 
      });

      // Should only search first 3 services
      expect(result.sources).toHaveLength(3);
      expect(result.sources).toEqual(['service1', 'service2', 'service3']);
    });

    it('should handle no available services', async () => {
      // Don't register any services
      const result = await searchController.performSearch(mockSearchParams);

      // Should return error result
      expect(result.opportunities).toHaveLength(0);
      expect(result.totalResults).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('No available services');
    });
  });

  describe('search preferences', () => {
    it('should save search preferences to localStorage', () => {
      const preferences: SearchPreferences = {
        lastLocation: {
          city: 'New York',
          country: 'USA',
          formattedAddress: 'New York, NY, USA'
        },
        preferredRadius: 25,
        preferredCauses: ['environment', 'education'],
        preferredType: 'both'
      };

      searchController.saveSearchPreferences(preferences);

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'volunteerSearchPreferences',
        JSON.stringify(preferences)
      );
    });

    it('should load search preferences from localStorage', () => {
      const preferences: SearchPreferences = {
        lastLocation: {
          city: 'Boston',
          country: 'USA',
          formattedAddress: 'Boston, MA, USA'
        },
        preferredRadius: 50,
        preferredCauses: ['health'],
        preferredType: 'in-person'
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(preferences));

      const loaded = searchController.loadSearchPreferences();

      expect(localStorageMock.getItem).toHaveBeenCalledWith('volunteerSearchPreferences');
      expect(loaded).toEqual(preferences);
    });

    it('should return null when no preferences exist', () => {
      localStorageMock.getItem.mockReturnValue(null);

      const loaded = searchController.loadSearchPreferences();

      expect(loaded).toBeNull();
    });

    it('should handle localStorage errors gracefully', () => {
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage error');
      });

      const loaded = searchController.loadSearchPreferences();

      expect(loaded).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });

    it('should clear search preferences', () => {
      searchController.clearSearchPreferences();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('volunteerSearchPreferences');
    });
  });

  describe('connectivity testing', () => {
    it('should test connectivity to all services', async () => {
      // Create services with different health statuses
      const healthyService = new MockAPIService('healthy', true, []);
      const unhealthyService = new MockAPIService('unhealthy', false, []);
      
      // Mock health status methods
      vi.spyOn(healthyService, 'getHealthStatus').mockResolvedValue({ 
        healthy: true, 
        responseTime: 100 
      });
      vi.spyOn(unhealthyService, 'getHealthStatus').mockRejectedValue(
        new Error('Service unavailable')
      );

      mockRegistry.registerService(healthyService);
      mockRegistry.registerService(unhealthyService);

      const connectivity = await searchController.testConnectivity();

      expect(connectivity).toEqual({
        healthy: true,
        unhealthy: false
      });
    });
  });

  describe('search statistics', () => {
    it('should return search statistics', () => {
      const service1 = new MockAPIService('service1', true, []);
      const service2 = new MockAPIService('service2', true, []);
      
      mockRegistry.registerService(service1);
      mockRegistry.registerService(service2);

      const stats = searchController.getSearchStats();

      expect(stats.availableServices).toBe(2);
      expect(stats.healthyServices).toBe(0); // Not updated until health check
      expect(stats.lastSearchTime).toBeUndefined();
    });
  });

  describe('updateFilters', () => {
    it('should update filters without errors', () => {
      const filters = {
        causes: ['environment'],
        type: 'in-person' as const,
        timeCommitment: '2-4 hours',
        skills: ['teamwork']
      };

      expect(() => {
        searchController.updateFilters(filters);
      }).not.toThrow();

      expect(console.log).toHaveBeenCalledWith(
        '[SearchController] Filters updated:',
        filters
      );
    });
  });

  describe('multi-location search', () => {
    let mockMultiLocationService: vi.Mocked<MultiLocationService>;

    beforeEach(() => {
      // Mock MultiLocationService
      mockMultiLocationService = {
        parseLocationInput: vi.fn(),
        isMultiLocationInput: vi.fn(),
        geocodeMultipleLocations: vi.fn(),
        groupResultsByLocation: vi.fn(),
        mergeOpportunitiesWithLocationContext: vi.fn(),
        getSearchStatistics: vi.fn(),
        getLocationSummary: vi.fn(),
        validateLocationInput: vi.fn()
      } as any;

      searchController = new SearchController(mockRegistry, mockMultiLocationService);
    });

    describe('performMultiLocationSearch', () => {
      it('should perform multi-location search successfully', async () => {
        const locationInput = 'New York, Los Angeles';
        const radius = 25;
        const filters = { causes: ['environment'], type: 'both' as const };

        // Mock validation
        mockMultiLocationService.validateLocationInput.mockReturnValue({
          isValid: true,
          errors: [],
          suggestions: [],
          parsedCount: 2
        });

        // Mock location parsing
        mockMultiLocationService.parseLocationInput.mockReturnValue(['New York', 'Los Angeles']);

        // Mock geocoding
        const mockParsedLocations = [
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
          }
        ];
        mockMultiLocationService.geocodeMultipleLocations.mockResolvedValue(mockParsedLocations);

        // Mock opportunities
        const mockOpportunities1 = [
          {
            id: '1',
            source: 'service1',
            title: 'NYC Opportunity',
            organization: 'NYC Org',
            description: 'Help in NYC',
            location: 'New York, NY',
            city: 'New York',
            country: 'USA',
            type: 'in-person' as const,
            cause: 'environment',
            skills: [],
            timeCommitment: '2 hours',
            date: '2024-01-15',
            contactInfo: {},
            externalUrl: 'https://test.org/1',
            lastUpdated: new Date(),
            verified: true
          }
        ];

        const mockOpportunities2 = [
          {
            id: '2',
            source: 'service1',
            title: 'LA Opportunity',
            organization: 'LA Org',
            description: 'Help in LA',
            location: 'Los Angeles, CA',
            city: 'Los Angeles',
            country: 'USA',
            type: 'in-person' as const,
            cause: 'environment',
            skills: [],
            timeCommitment: '3 hours',
            date: '2024-01-20',
            contactInfo: {},
            externalUrl: 'https://test.org/2',
            lastUpdated: new Date(),
            verified: true
          }
        ];

        // Create mock search results that would be returned by performSearch
        const mockSearchResult1 = {
          opportunities: mockOpportunities1,
          searchLocation: mockParsedLocations[0].locationInfo,
          totalResults: 1,
          sources: ['service1'],
          responseTime: 100,
          partialResults: false,
          serviceStatuses: []
        };

        const mockSearchResult2 = {
          opportunities: mockOpportunities2,
          searchLocation: mockParsedLocations[1].locationInfo,
          totalResults: 1,
          sources: ['service1'],
          responseTime: 100,
          partialResults: false,
          serviceStatuses: []
        };

        // Mock performSearch to return location-specific results
        const performSearchSpy = vi.spyOn(searchController, 'performSearch')
          .mockImplementation(async (params) => {
            if (Math.abs(params.location.latitude - 40.7128) < 0.01) {
              return mockSearchResult1;
            } else if (Math.abs(params.location.latitude - 34.0522) < 0.01) {
              return mockSearchResult2;
            }
            return {
              opportunities: [],
              searchLocation: { city: 'Unknown', country: 'Unknown', formattedAddress: 'Unknown' },
              totalResults: 0,
              sources: [],
              responseTime: 100,
              partialResults: false,
              serviceStatuses: []
            };
          });

        // Mock location grouping
        const mockLocationGroups = [
          {
            location: mockParsedLocations[0],
            opportunities: mockOpportunities1,
            searchSuccess: true
          },
          {
            location: mockParsedLocations[1],
            opportunities: mockOpportunities2,
            searchSuccess: true
          }
        ];
        mockMultiLocationService.groupResultsByLocation.mockReturnValue(mockLocationGroups);

        // Mock merging opportunities with location context
        const allOpportunities = [
          { ...mockOpportunities1[0], searchLocation: mockParsedLocations[0].locationInfo, searchCoordinates: mockParsedLocations[0].coordinates, originalLocationInput: 'New York' },
          { ...mockOpportunities2[0], searchLocation: mockParsedLocations[1].locationInfo, searchCoordinates: mockParsedLocations[1].coordinates, originalLocationInput: 'Los Angeles' }
        ];
        mockMultiLocationService.mergeOpportunitiesWithLocationContext.mockReturnValue(allOpportunities);

        // Mock statistics
        const mockStatistics = {
          totalLocations: 2,
          successfulLocations: 2,
          failedLocations: 0,
          totalOpportunities: 2,
          averageOpportunitiesPerLocation: 1,
          locationBreakdown: [
            { location: 'New York', count: 1 },
            { location: 'Los Angeles', count: 1 }
          ]
        };
        mockMultiLocationService.getSearchStatistics.mockReturnValue(mockStatistics);

        // Mock location summary
        mockMultiLocationService.getLocationSummary.mockReturnValue('New York and Los Angeles');

        // Perform search
        const result = await searchController.performMultiLocationSearch(locationInput, radius, filters);
        
        // Verify results
        expect(result.totalResults).toBe(2);
        expect(result.locationGroups).toEqual(mockLocationGroups);
        expect(result.searchStatistics).toEqual(mockStatistics);
        expect(result.opportunities).toEqual(allOpportunities);
        expect(result.searchLocation.city).toBe('New York and Los Angeles');
        expect(result.searchLocation.country).toBe('Multiple');
        
        // Verify that performSearch was called twice (once for each location)
        expect(performSearchSpy).toHaveBeenCalledTimes(2);
      });

      it('should handle validation errors', async () => {
        const locationInput = '';
        const radius = 25;
        const filters = { causes: [], type: 'both' as const };

        // Mock validation failure
        mockMultiLocationService.validateLocationInput.mockReturnValue({
          isValid: false,
          errors: ['Location input cannot be empty'],
          suggestions: ['Enter at least one location'],
          parsedCount: 0
        });

        // Perform search
        const result = await searchController.performMultiLocationSearch(locationInput, radius, filters);

        // Should return error result
        expect(result.totalResults).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0].message).toContain('Invalid location input');
      });

      it('should handle geocoding failures', async () => {
        const locationInput = 'Invalid Location';
        const radius = 25;
        const filters = { causes: [], type: 'both' as const };

        // Mock validation success
        mockMultiLocationService.validateLocationInput.mockReturnValue({
          isValid: true,
          errors: [],
          suggestions: [],
          parsedCount: 1
        });

        // Mock location parsing
        mockMultiLocationService.parseLocationInput.mockReturnValue(['Invalid Location']);

        // Mock geocoding failure
        mockMultiLocationService.geocodeMultipleLocations.mockRejectedValue(
          new Error('Unable to geocode any of the provided locations')
        );

        // Perform search
        const result = await searchController.performMultiLocationSearch(locationInput, radius, filters);

        // Should return error result
        expect(result.totalResults).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0].message).toContain('Unable to geocode any of the provided locations');
      });

      it('should handle partial search failures', async () => {
        const locationInput = 'New York, Los Angeles';
        const radius = 25;
        const filters = { causes: [], type: 'both' as const };

        // Mock validation and parsing
        mockMultiLocationService.validateLocationInput.mockReturnValue({
          isValid: true,
          errors: [],
          suggestions: [],
          parsedCount: 2
        });
        mockMultiLocationService.parseLocationInput.mockReturnValue(['New York', 'Los Angeles']);

        const mockParsedLocations = [
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
          }
        ];
        mockMultiLocationService.geocodeMultipleLocations.mockResolvedValue(mockParsedLocations);

        // Register one successful and one failing service
        const successService = new MockAPIService('success', true, []);
        const failService = new MockAPIService('fail', false, []);
        mockRegistry.registerService(successService);
        mockRegistry.registerService(failService);

        // Mock location grouping with mixed results
        const mockLocationGroups = [
          {
            location: mockParsedLocations[0],
            opportunities: [],
            searchSuccess: true
          },
          {
            location: mockParsedLocations[1],
            opportunities: [],
            searchSuccess: true
          }
        ];
        mockMultiLocationService.groupResultsByLocation.mockReturnValue(mockLocationGroups);
        mockMultiLocationService.mergeOpportunitiesWithLocationContext.mockReturnValue([]);
        mockMultiLocationService.getSearchStatistics.mockReturnValue({
          totalLocations: 2,
          successfulLocations: 2,
          failedLocations: 0,
          totalOpportunities: 0,
          averageOpportunitiesPerLocation: 0,
          locationBreakdown: []
        });
        mockMultiLocationService.getLocationSummary.mockReturnValue('New York and Los Angeles');

        // Perform search
        const result = await searchController.performMultiLocationSearch(locationInput, radius, filters);

        // Should have partial results with errors
        expect(result.totalResults).toBe(0);
        expect(result.errors).toBeDefined();
        expect(result.errors!.length).toBeGreaterThan(0);
        // The partialResults flag is set based on individual search results, not overall success
        // Since both locations succeeded but had no opportunities, this should be false
        expect(result.partialResults).toBe(false);
      });
    });

    describe('performSmartSearch', () => {
      it('should detect and perform multi-location search', async () => {
        const locationInput = 'New York, Los Angeles';
        const radius = 25;
        const filters = { causes: [], type: 'both' as const };

        // Mock multi-location detection
        mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);

        // Mock the multi-location search method
        const mockResult = {
          opportunities: [],
          searchLocation: { city: 'Multiple', country: 'Multiple', formattedAddress: locationInput },
          totalResults: 0,
          sources: [],
          responseTime: 100,
          partialResults: false,
          serviceStatuses: [],
          locationGroups: [],
          searchStatistics: {
            totalLocations: 2,
            successfulLocations: 2,
            failedLocations: 0,
            totalOpportunities: 0,
            averageOpportunitiesPerLocation: 0,
            locationBreakdown: []
          }
        };

        // Spy on performMultiLocationSearch
        const multiLocationSearchSpy = vi.spyOn(searchController, 'performMultiLocationSearch')
          .mockResolvedValue(mockResult);

        // Perform smart search
        const result = await searchController.performSmartSearch(locationInput, radius, filters);

        // Verify multi-location search was called
        expect(mockMultiLocationService.isMultiLocationInput).toHaveBeenCalledWith(locationInput);
        expect(multiLocationSearchSpy).toHaveBeenCalledWith(locationInput, radius, filters, {});
        expect(result).toEqual(mockResult);
      });

      it('should detect and perform single-location search', async () => {
        const locationInput = 'New York';
        const radius = 25;
        const filters = { causes: [], type: 'both' as const };

        // Mock single-location detection
        mockMultiLocationService.isMultiLocationInput.mockReturnValue(false);

        // Register a mock service
        const service = new MockAPIService('service1', true, []);
        mockRegistry.registerService(service);

        // Mock geocoding for single location
        const mockGeocodingService = {
          geocodeLocation: vi.fn().mockResolvedValue({ latitude: 40.7128, longitude: -74.0060 })
        };

        // Mock the import
        vi.doMock('../geocodingService', () => ({
          GeocodingService: vi.fn().mockImplementation(() => mockGeocodingService)
        }));

        // Perform smart search
        const result = await searchController.performSmartSearch(locationInput, radius, filters);

        // Verify single-location search was performed
        expect(mockMultiLocationService.isMultiLocationInput).toHaveBeenCalledWith(locationInput);
        expect(result.totalResults).toBe(0); // No opportunities in mock service
        expect('locationGroups' in result).toBe(false); // Should not have location groups
      });
    });
  });
  });

  describe('Search Results Caching', () => {
    it('should provide cache management methods', () => {
      const stats = searchController.getCacheStats();
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('hitCount');
      expect(stats).toHaveProperty('missCount');
      expect(stats).toHaveProperty('hitRate');

      // Test cache clearing
      expect(() => searchController.clearCache()).not.toThrow();

      // Test cache configuration
      expect(() => searchController.configureCaching({
        defaultTTL: 60000,
        maxCacheSize: 50
      })).not.toThrow();
    });
  });
});