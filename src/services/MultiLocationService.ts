import { Coordinates, LocationInfo } from '../types/location';
import { GeocodingService } from './geocodingService';

export interface ParsedLocation {
  originalInput: string;
  locationInfo: LocationInfo;
  coordinates: Coordinates;
  index: number; // Order in the original input
}

export interface MultiLocationSearchParams {
  locations: ParsedLocation[];
  radius: number;
  causes?: string[];
  type?: 'in-person' | 'virtual' | 'both';
  limit?: number;
}

export interface LocationGroup {
  location: ParsedLocation;
  opportunities: any[]; // Will be typed as VolunteerOpportunity[]
  searchSuccess: boolean;
  error?: string;
}

export class MultiLocationService {
  private geocodingService: GeocodingService;

  constructor(geocodingService?: GeocodingService) {
    this.geocodingService = geocodingService || new GeocodingService();
  }

  /**
   * Parse comma-separated location input into individual locations
   * @param locationInput - Comma-separated location string (e.g., "New York, Los Angeles, Chicago")
   * @returns Array of location strings
   */
  parseLocationInput(locationInput: string): string[] {
    if (!locationInput.trim()) {
      return [];
    }

    // Split by comma and clean up each location
    const locations = locationInput
      .split(',')
      .map(location => location.trim())
      .filter(location => location.length > 0);

    // Remove duplicates (case-insensitive)
    const uniqueLocations = locations.filter((location, index) => {
      const lowerLocation = location.toLowerCase();
      return locations.findIndex(l => l.toLowerCase() === lowerLocation) === index;
    });

    return uniqueLocations;
  }

  /**
   * Geocode multiple locations in parallel
   * @param locations - Array of location strings
   * @returns Promise resolving to array of ParsedLocation objects
   */
  async geocodeMultipleLocations(locations: string[]): Promise<ParsedLocation[]> {
    if (locations.length === 0) {
      return [];
    }

    console.log(`[MultiLocationService] Geocoding ${locations.length} locations:`, locations);

    // Create geocoding promises for all locations
    const geocodingPromises = locations.map(async (location, index) => {
      try {
        const coordinates = await this.geocodingService.geocodeLocation(location);
        const locationInfo = await this.geocodingService.reverseGeocode(coordinates);
        
        return {
          originalInput: location,
          locationInfo,
          coordinates,
          index
        };
      } catch (error) {
        console.warn(`[MultiLocationService] Failed to geocode "${location}":`, error);
        throw new Error(`Unable to find location: ${location}`);
      }
    });

    // Execute all geocoding requests in parallel
    try {
      const results = await Promise.all(geocodingPromises);
      console.log(`[MultiLocationService] Successfully geocoded ${results.length} locations`);
      return results;
    } catch (error) {
      // If any location fails, we still want to provide partial results
      // Use Promise.allSettled for more graceful handling
      const settledResults = await Promise.allSettled(geocodingPromises);
      
      const successfulResults: ParsedLocation[] = [];
      const failedLocations: string[] = [];

      settledResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          successfulResults.push(result.value);
        } else {
          failedLocations.push(locations[index]);
        }
      });

      if (successfulResults.length === 0) {
        throw new Error(`Unable to geocode any of the provided locations: ${failedLocations.join(', ')}`);
      }

      if (failedLocations.length > 0) {
        console.warn(`[MultiLocationService] Some locations failed to geocode:`, failedLocations);
        // We could throw a partial error here, but for now we'll continue with successful ones
      }

      return successfulResults;
    }
  }

  /**
   * Validate if input contains multiple locations
   * @param locationInput - Location input string
   * @returns True if input appears to contain multiple locations
   */
  isMultiLocationInput(locationInput: string): boolean {
    if (!locationInput.trim()) {
      return false;
    }

    const locations = this.parseLocationInput(locationInput);
    return locations.length > 1;
  }

  /**
   * Get a summary of parsed locations for display
   * @param parsedLocations - Array of ParsedLocation objects
   * @returns Human-readable summary string
   */
  getLocationSummary(parsedLocations: ParsedLocation[]): string {
    if (parsedLocations.length === 0) {
      return 'No locations';
    }

    if (parsedLocations.length === 1) {
      const location = parsedLocations[0].locationInfo;
      return location.state 
        ? `${location.city}, ${location.state}, ${location.country}`
        : `${location.city}, ${location.country}`;
    }

    if (parsedLocations.length === 2) {
      const cities = parsedLocations.map(p => p.locationInfo.city);
      return `${cities[0]} and ${cities[1]}`;
    }

    const cities = parsedLocations.map(p => p.locationInfo.city);
    const lastCity = cities.pop();
    return `${cities.join(', ')}, and ${lastCity}`;
  }

  /**
   * Group search results by location
   * @param searchResults - Array of search results from different locations
   * @param parsedLocations - Array of ParsedLocation objects
   * @returns Array of LocationGroup objects
   */
  groupResultsByLocation(
    searchResults: any[], // Will be typed as SearchResult[]
    parsedLocations: ParsedLocation[]
  ): LocationGroup[] {
    return parsedLocations.map((location, index) => {
      const result = searchResults[index];
      
      return {
        location,
        opportunities: result?.opportunities || [],
        searchSuccess: result?.success !== false,
        error: result?.error
      };
    });
  }

  /**
   * Merge opportunities from multiple locations while preserving location context
   * @param locationGroups - Array of LocationGroup objects
   * @returns Flattened array of opportunities with location context
   */
  mergeOpportunitiesWithLocationContext(locationGroups: LocationGroup[]): any[] {
    const allOpportunities: any[] = [];

    locationGroups.forEach(group => {
      if (group.searchSuccess && group.opportunities.length > 0) {
        // Add location context to each opportunity
        const opportunitiesWithContext = group.opportunities.map(opportunity => ({
          ...opportunity,
          searchLocation: group.location.locationInfo,
          searchCoordinates: group.location.coordinates,
          originalLocationInput: group.location.originalInput
        }));

        allOpportunities.push(...opportunitiesWithContext);
      }
    });

    return allOpportunities;
  }

  /**
   * Get statistics about multi-location search results
   * @param locationGroups - Array of LocationGroup objects
   * @returns Statistics object
   */
  getSearchStatistics(locationGroups: LocationGroup[]): {
    totalLocations: number;
    successfulLocations: number;
    failedLocations: number;
    totalOpportunities: number;
    averageOpportunitiesPerLocation: number;
    locationBreakdown: { location: string; count: number }[];
  } {
    const totalLocations = locationGroups.length;
    const successfulLocations = locationGroups.filter(g => g.searchSuccess).length;
    const failedLocations = totalLocations - successfulLocations;
    
    const totalOpportunities = locationGroups.reduce(
      (sum, group) => sum + (group.opportunities?.length || 0), 
      0
    );
    
    const averageOpportunitiesPerLocation = successfulLocations > 0 
      ? Math.round(totalOpportunities / successfulLocations)
      : 0;

    const locationBreakdown = locationGroups.map(group => ({
      location: group.location.locationInfo.city,
      count: group.opportunities?.length || 0
    }));

    return {
      totalLocations,
      successfulLocations,
      failedLocations,
      totalOpportunities,
      averageOpportunitiesPerLocation,
      locationBreakdown
    };
  }

  /**
   * Validate location input format
   * @param locationInput - Location input string
   * @returns Validation result with suggestions
   */
  validateLocationInput(locationInput: string): {
    isValid: boolean;
    errors: string[];
    suggestions: string[];
    parsedCount: number;
  } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (!locationInput.trim()) {
      errors.push('Location input cannot be empty');
      suggestions.push('Enter at least one location');
      return { isValid: false, errors, suggestions, parsedCount: 0 };
    }

    const locations = this.parseLocationInput(locationInput);
    
    if (locations.length === 0) {
      errors.push('No valid locations found in input');
      suggestions.push('Check your location format');
      return { isValid: false, errors, suggestions, parsedCount: 0 };
    }

    // Check for very short location names
    const shortLocations = locations.filter(loc => loc.length < 2);
    if (shortLocations.length > 0) {
      errors.push(`Some locations are too short: ${shortLocations.join(', ')}`);
      suggestions.push('Use full city names or add state/country information');
    }

    // Check for too many locations (performance consideration)
    if (locations.length > 10) {
      errors.push('Too many locations specified (maximum 10)');
      suggestions.push('Reduce the number of locations for better performance');
    }

    // Provide helpful suggestions for multi-location input
    if (locations.length > 1) {
      suggestions.push('Multi-location search will find opportunities in all specified areas');
      suggestions.push('Results will be grouped by location');
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions,
      parsedCount: locations.length
    };
  }
}