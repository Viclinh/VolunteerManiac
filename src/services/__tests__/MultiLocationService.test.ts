import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiLocationService, ParsedLocation, LocationGroup } from '../MultiLocationService';
import { GeocodingService } from '../geocodingService';
import { Coordinates, LocationInfo } from '../../types/location';

// Mock the GeocodingService
vi.mock('../geocodingService');

describe('MultiLocationService', () => {
  let multiLocationService: MultiLocationService;
  let mockGeocodingService: vi.Mocked<GeocodingService>;

  beforeEach(() => {
    mockGeocodingService = {
      geocodeLocation: vi.fn(),
      reverseGeocode: vi.fn(),
      getLocationSuggestions: vi.fn(),
      clearExpiredCache: vi.fn(),
      clearCache: vi.fn(),
      getCacheStats: vi.fn()
    } as any;

    multiLocationService = new MultiLocationService(mockGeocodingService);
  });

  describe('parseLocationInput', () => {
    it('should parse comma-separated locations correctly', () => {
      const input = 'New York, Los Angeles, Chicago';
      const result = multiLocationService.parseLocationInput(input);
      
      expect(result).toEqual(['New York', 'Los Angeles', 'Chicago']);
    });

    it('should handle locations with extra whitespace', () => {
      const input = ' New York , Los Angeles,  Chicago ';
      const result = multiLocationService.parseLocationInput(input);
      
      expect(result).toEqual(['New York', 'Los Angeles', 'Chicago']);
    });

    it('should remove empty locations', () => {
      const input = 'New York,, Los Angeles, , Chicago';
      const result = multiLocationService.parseLocationInput(input);
      
      expect(result).toEqual(['New York', 'Los Angeles', 'Chicago']);
    });

    it('should remove duplicate locations (case-insensitive)', () => {
      const input = 'New York, new york, Los Angeles, NEW YORK';
      const result = multiLocationService.parseLocationInput(input);
      
      expect(result).toEqual(['New York', 'Los Angeles']);
    });

    it('should return empty array for empty input', () => {
      const result = multiLocationService.parseLocationInput('');
      expect(result).toEqual([]);
    });

    it('should return empty array for whitespace-only input', () => {
      const result = multiLocationService.parseLocationInput('   ');
      expect(result).toEqual([]);
    });

    it('should handle single location', () => {
      const input = 'New York';
      const result = multiLocationService.parseLocationInput(input);
      
      expect(result).toEqual(['New York']);
    });
  });

  describe('isMultiLocationInput', () => {
    it('should return true for multiple locations', () => {
      const input = 'New York, Los Angeles';
      const result = multiLocationService.isMultiLocationInput(input);
      
      expect(result).toBe(true);
    });

    it('should return false for single location', () => {
      const input = 'New York';
      const result = multiLocationService.isMultiLocationInput(input);
      
      expect(result).toBe(false);
    });

    it('should return false for empty input', () => {
      const input = '';
      const result = multiLocationService.isMultiLocationInput(input);
      
      expect(result).toBe(false);
    });

    it('should return false for locations that become single after parsing', () => {
      const input = 'New York, , ';
      const result = multiLocationService.isMultiLocationInput(input);
      
      expect(result).toBe(false);
    });
  });

  describe('geocodeMultipleLocations', () => {
    const mockCoordinates1: Coordinates = { latitude: 40.7128, longitude: -74.0060 };
    const mockCoordinates2: Coordinates = { latitude: 34.0522, longitude: -118.2437 };
    const mockLocationInfo1: LocationInfo = {
      city: 'New York',
      state: 'NY',
      country: 'USA',
      formattedAddress: 'New York, NY, USA'
    };
    const mockLocationInfo2: LocationInfo = {
      city: 'Los Angeles',
      state: 'CA',
      country: 'USA',
      formattedAddress: 'Los Angeles, CA, USA'
    };

    beforeEach(() => {
      mockGeocodingService.geocodeLocation.mockImplementation((location: string) => {
        if (location === 'New York') {
          return Promise.resolve(mockCoordinates1);
        } else if (location === 'Los Angeles') {
          return Promise.resolve(mockCoordinates2);
        }
        return Promise.reject(new Error('Location not found'));
      });

      mockGeocodingService.reverseGeocode.mockImplementation((coordinates: Coordinates) => {
        if (coordinates.latitude === mockCoordinates1.latitude) {
          return Promise.resolve(mockLocationInfo1);
        } else if (coordinates.latitude === mockCoordinates2.latitude) {
          return Promise.resolve(mockLocationInfo2);
        }
        return Promise.reject(new Error('Coordinates not found'));
      });
    });

    it('should geocode multiple locations successfully', async () => {
      const locations = ['New York', 'Los Angeles'];
      const result = await multiLocationService.geocodeMultipleLocations(locations);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        originalInput: 'New York',
        locationInfo: mockLocationInfo1,
        coordinates: mockCoordinates1,
        index: 0
      });
      expect(result[1]).toEqual({
        originalInput: 'Los Angeles',
        locationInfo: mockLocationInfo2,
        coordinates: mockCoordinates2,
        index: 1
      });
    });

    it('should return empty array for empty input', async () => {
      const result = await multiLocationService.geocodeMultipleLocations([]);
      expect(result).toEqual([]);
    });

    it('should handle partial failures gracefully', async () => {
      const locations = ['New York', 'Invalid Location'];
      
      // Mock one success and one failure
      mockGeocodingService.geocodeLocation.mockImplementation((location: string) => {
        if (location === 'New York') {
          return Promise.resolve(mockCoordinates1);
        }
        return Promise.reject(new Error('Location not found'));
      });

      const result = await multiLocationService.geocodeMultipleLocations(locations);

      expect(result).toHaveLength(1);
      expect(result[0].originalInput).toBe('New York');
    });

    it('should throw error when all locations fail', async () => {
      const locations = ['Invalid Location 1', 'Invalid Location 2'];
      
      mockGeocodingService.geocodeLocation.mockRejectedValue(new Error('Location not found'));

      await expect(multiLocationService.geocodeMultipleLocations(locations))
        .rejects.toThrow('Unable to geocode any of the provided locations');
    });
  });

  describe('getLocationSummary', () => {
    const mockParsedLocation1: ParsedLocation = {
      originalInput: 'New York',
      locationInfo: { city: 'New York', state: 'NY', country: 'USA', formattedAddress: 'New York, NY, USA' },
      coordinates: { latitude: 40.7128, longitude: -74.0060 },
      index: 0
    };

    const mockParsedLocation2: ParsedLocation = {
      originalInput: 'Los Angeles',
      locationInfo: { city: 'Los Angeles', state: 'CA', country: 'USA', formattedAddress: 'Los Angeles, CA, USA' },
      coordinates: { latitude: 34.0522, longitude: -118.2437 },
      index: 1
    };

    const mockParsedLocation3: ParsedLocation = {
      originalInput: 'Chicago',
      locationInfo: { city: 'Chicago', state: 'IL', country: 'USA', formattedAddress: 'Chicago, IL, USA' },
      coordinates: { latitude: 41.8781, longitude: -87.6298 },
      index: 2
    };

    it('should return "No locations" for empty array', () => {
      const result = multiLocationService.getLocationSummary([]);
      expect(result).toBe('No locations');
    });

    it('should return formatted single location', () => {
      const result = multiLocationService.getLocationSummary([mockParsedLocation1]);
      expect(result).toBe('New York, NY, USA');
    });

    it('should return "X and Y" for two locations', () => {
      const result = multiLocationService.getLocationSummary([mockParsedLocation1, mockParsedLocation2]);
      expect(result).toBe('New York and Los Angeles');
    });

    it('should return "X, Y, and Z" for three or more locations', () => {
      const result = multiLocationService.getLocationSummary([
        mockParsedLocation1, 
        mockParsedLocation2, 
        mockParsedLocation3
      ]);
      expect(result).toBe('New York, Los Angeles, and Chicago');
    });

    it('should handle location without state', () => {
      const locationWithoutState: ParsedLocation = {
        originalInput: 'London',
        locationInfo: { city: 'London', country: 'UK', formattedAddress: 'London, UK' },
        coordinates: { latitude: 51.5074, longitude: -0.1278 },
        index: 0
      };

      const result = multiLocationService.getLocationSummary([locationWithoutState]);
      expect(result).toBe('London, UK');
    });
  });

  describe('groupResultsByLocation', () => {
    const mockParsedLocations: ParsedLocation[] = [
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

    it('should group results by location correctly', () => {
      const searchResults = [
        { opportunities: ['opp1', 'opp2'], success: true },
        { opportunities: ['opp3'], success: true }
      ];

      const result = multiLocationService.groupResultsByLocation(searchResults, mockParsedLocations);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        location: mockParsedLocations[0],
        opportunities: ['opp1', 'opp2'],
        searchSuccess: true,
        error: undefined
      });
      expect(result[1]).toEqual({
        location: mockParsedLocations[1],
        opportunities: ['opp3'],
        searchSuccess: true,
        error: undefined
      });
    });

    it('should handle failed searches', () => {
      const searchResults = [
        { opportunities: [], success: false, error: 'Search failed' },
        { opportunities: ['opp1'], success: true }
      ];

      const result = multiLocationService.groupResultsByLocation(searchResults, mockParsedLocations);

      expect(result[0]).toEqual({
        location: mockParsedLocations[0],
        opportunities: [],
        searchSuccess: false,
        error: 'Search failed'
      });
    });
  });

  describe('mergeOpportunitiesWithLocationContext', () => {
    const mockLocationGroups: LocationGroup[] = [
      {
        location: {
          originalInput: 'New York',
          locationInfo: { city: 'New York', state: 'NY', country: 'USA', formattedAddress: 'New York, NY, USA' },
          coordinates: { latitude: 40.7128, longitude: -74.0060 },
          index: 0
        },
        opportunities: [
          { id: '1', title: 'Opportunity 1' },
          { id: '2', title: 'Opportunity 2' }
        ] as any[],
        searchSuccess: true
      },
      {
        location: {
          originalInput: 'Los Angeles',
          locationInfo: { city: 'Los Angeles', state: 'CA', country: 'USA', formattedAddress: 'Los Angeles, CA, USA' },
          coordinates: { latitude: 34.0522, longitude: -118.2437 },
          index: 1
        },
        opportunities: [
          { id: '3', title: 'Opportunity 3' }
        ] as any[],
        searchSuccess: true
      }
    ];

    it('should merge opportunities with location context', () => {
      const result = multiLocationService.mergeOpportunitiesWithLocationContext(mockLocationGroups);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: '1',
        title: 'Opportunity 1',
        searchLocation: mockLocationGroups[0].location.locationInfo,
        searchCoordinates: mockLocationGroups[0].location.coordinates,
        originalLocationInput: 'New York'
      });
      expect(result[2]).toEqual({
        id: '3',
        title: 'Opportunity 3',
        searchLocation: mockLocationGroups[1].location.locationInfo,
        searchCoordinates: mockLocationGroups[1].location.coordinates,
        originalLocationInput: 'Los Angeles'
      });
    });

    it('should skip failed searches', () => {
      const locationGroupsWithFailure: LocationGroup[] = [
        ...mockLocationGroups,
        {
          location: {
            originalInput: 'Invalid Location',
            locationInfo: { city: 'Invalid', country: 'Unknown', formattedAddress: 'Invalid Location' },
            coordinates: { latitude: 0, longitude: 0 },
            index: 2
          },
          opportunities: [],
          searchSuccess: false,
          error: 'Search failed'
        }
      ];

      const result = multiLocationService.mergeOpportunitiesWithLocationContext(locationGroupsWithFailure);

      expect(result).toHaveLength(3); // Should still be 3, not 4
    });
  });

  describe('getSearchStatistics', () => {
    const mockLocationGroups: LocationGroup[] = [
      {
        location: {
          originalInput: 'New York',
          locationInfo: { city: 'New York', state: 'NY', country: 'USA', formattedAddress: 'New York, NY, USA' },
          coordinates: { latitude: 40.7128, longitude: -74.0060 },
          index: 0
        },
        opportunities: [{ id: '1' }, { id: '2' }] as any[],
        searchSuccess: true
      },
      {
        location: {
          originalInput: 'Los Angeles',
          locationInfo: { city: 'Los Angeles', state: 'CA', country: 'USA', formattedAddress: 'Los Angeles, CA, USA' },
          coordinates: { latitude: 34.0522, longitude: -118.2437 },
          index: 1
        },
        opportunities: [{ id: '3' }] as any[],
        searchSuccess: true
      },
      {
        location: {
          originalInput: 'Invalid Location',
          locationInfo: { city: 'Invalid', country: 'Unknown', formattedAddress: 'Invalid Location' },
          coordinates: { latitude: 0, longitude: 0 },
          index: 2
        },
        opportunities: [],
        searchSuccess: false
      }
    ];

    it('should calculate statistics correctly', () => {
      const result = multiLocationService.getSearchStatistics(mockLocationGroups);

      expect(result).toEqual({
        totalLocations: 3,
        successfulLocations: 2,
        failedLocations: 1,
        totalOpportunities: 3,
        averageOpportunitiesPerLocation: 2, // 3 opportunities / 2 successful locations = 1.5, rounded to 2
        locationBreakdown: [
          { location: 'New York', count: 2 },
          { location: 'Los Angeles', count: 1 },
          { location: 'Invalid', count: 0 }
        ]
      });
    });

    it('should handle all failed searches', () => {
      const allFailedGroups: LocationGroup[] = [
        {
          location: {
            originalInput: 'Invalid 1',
            locationInfo: { city: 'Invalid1', country: 'Unknown', formattedAddress: 'Invalid 1' },
            coordinates: { latitude: 0, longitude: 0 },
            index: 0
          },
          opportunities: [],
          searchSuccess: false
        }
      ];

      const result = multiLocationService.getSearchStatistics(allFailedGroups);

      expect(result.averageOpportunitiesPerLocation).toBe(0);
      expect(result.successfulLocations).toBe(0);
      expect(result.failedLocations).toBe(1);
    });
  });

  describe('validateLocationInput', () => {
    it('should validate correct multi-location input', () => {
      const input = 'New York, Los Angeles, Chicago';
      const result = multiLocationService.validateLocationInput(input);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.parsedCount).toBe(3);
      expect(result.suggestions).toContain('Multi-location search will find opportunities in all specified areas');
    });

    it('should validate single location input', () => {
      const input = 'New York';
      const result = multiLocationService.validateLocationInput(input);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.parsedCount).toBe(1);
      expect(result.suggestions).not.toContain('Multi-location search will find opportunities in all specified areas');
    });

    it('should reject empty input', () => {
      const input = '';
      const result = multiLocationService.validateLocationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Location input cannot be empty');
      expect(result.suggestions).toContain('Enter at least one location');
    });

    it('should reject input with only short locations', () => {
      const input = 'A, B';
      const result = multiLocationService.validateLocationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('Some locations are too short');
      expect(result.suggestions).toContain('Use full city names or add state/country information');
    });

    it('should reject too many locations', () => {
      const input = Array(12).fill('New York').join(', ');
      const result = multiLocationService.validateLocationInput(input);

      // The validation should fail because of duplicates being removed, leaving only 1 location
      // Let's create truly unique locations
      const uniqueInput = Array.from({length: 12}, (_, i) => `Location${i}`).join(', ');
      const uniqueResult = multiLocationService.validateLocationInput(uniqueInput);

      expect(uniqueResult.isValid).toBe(false);
      expect(uniqueResult.errors).toContain('Too many locations specified (maximum 10)');
      expect(uniqueResult.suggestions).toContain('Reduce the number of locations for better performance');
    });

    it('should handle mixed valid and invalid locations', () => {
      const input = 'New York, A, Los Angeles';
      const result = multiLocationService.validateLocationInput(input);

      expect(result.isValid).toBe(false);
      expect(result.parsedCount).toBe(3);
      expect(result.errors[0]).toContain('Some locations are too short: A');
    });
  });
});