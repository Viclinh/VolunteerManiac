import { Coordinates } from '../types/location';

export interface DistanceResult {
  distance: number;
  unit: 'miles' | 'kilometers';
}

export class DistanceCalculator {
  private static readonly EARTH_RADIUS_MILES = 3959;
  private static readonly EARTH_RADIUS_KM = 6371;
  private static readonly MILES_TO_KM = 1.60934;
  private static readonly KM_TO_MILES = 0.621371;

  /**
   * Calculate the distance between two coordinates using the Haversine formula
   * @param from - Starting coordinates
   * @param to - Destination coordinates
   * @param unit - Unit of measurement ('miles' or 'kilometers')
   * @returns Distance in the specified unit
   */
  static calculateDistance(
    from: Coordinates,
    to: Coordinates,
    unit: 'miles' | 'kilometers' = 'miles'
  ): number {
    // Validate coordinates
    this.validateCoordinates(from);
    this.validateCoordinates(to);

    // Convert degrees to radians
    const lat1Rad = this.degreesToRadians(from.latitude);
    const lon1Rad = this.degreesToRadians(from.longitude);
    const lat2Rad = this.degreesToRadians(to.latitude);
    const lon2Rad = this.degreesToRadians(to.longitude);

    // Calculate differences
    const deltaLat = lat2Rad - lat1Rad;
    const deltaLon = lon2Rad - lon1Rad;

    // Apply Haversine formula
    const a = 
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    // Calculate distance
    const earthRadius = unit === 'miles' ? this.EARTH_RADIUS_MILES : this.EARTH_RADIUS_KM;
    const distance = earthRadius * c;

    // Round to 2 decimal places
    return Math.round(distance * 100) / 100;
  }

  /**
   * Calculate distance and return detailed result object
   * @param from - Starting coordinates
   * @param to - Destination coordinates
   * @param unit - Unit of measurement ('miles' or 'kilometers')
   * @returns DistanceResult object with distance and unit
   */
  static calculateDistanceDetailed(
    from: Coordinates,
    to: Coordinates,
    unit: 'miles' | 'kilometers' = 'miles'
  ): DistanceResult {
    const distance = this.calculateDistance(from, to, unit);
    return { distance, unit };
  }

  /**
   * Calculate distances from one point to multiple destinations
   * @param from - Starting coordinates
   * @param destinations - Array of destination coordinates
   * @param unit - Unit of measurement ('miles' or 'kilometers')
   * @returns Array of distances in the same order as destinations
   */
  static calculateDistancesToMultiple(
    from: Coordinates,
    destinations: Coordinates[],
    unit: 'miles' | 'kilometers' = 'miles'
  ): number[] {
    this.validateCoordinates(from);
    
    return destinations.map(destination => {
      try {
        return this.calculateDistance(from, destination, unit);
      } catch (error) {
        console.warn('Failed to calculate distance to destination:', destination, error);
        return Infinity; // Return infinity for invalid destinations
      }
    });
  }

  /**
   * Find the closest coordinate from an array of coordinates
   * @param from - Starting coordinates
   * @param candidates - Array of candidate coordinates
   * @param unit - Unit of measurement ('miles' or 'kilometers')
   * @returns Object with the closest coordinate and its distance
   */
  static findClosest(
    from: Coordinates,
    candidates: Coordinates[],
    unit: 'miles' | 'kilometers' = 'miles'
  ): { coordinate: Coordinates; distance: number } | null {
    if (candidates.length === 0) {
      return null;
    }

    let closestCoordinate = candidates[0];
    let closestDistance = Infinity;

    for (const candidate of candidates) {
      try {
        const distance = this.calculateDistance(from, candidate, unit);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestCoordinate = candidate;
        }
      } catch (error) {
        console.warn('Failed to calculate distance to candidate:', candidate, error);
        continue;
      }
    }

    return closestDistance === Infinity 
      ? null 
      : { coordinate: closestCoordinate, distance: closestDistance };
  }

  /**
   * Filter coordinates within a specified radius
   * @param center - Center coordinates
   * @param candidates - Array of candidate coordinates
   * @param radius - Maximum distance from center
   * @param unit - Unit of measurement ('miles' or 'kilometers')
   * @returns Array of coordinates within the radius with their distances
   */
  static filterWithinRadius(
    center: Coordinates,
    candidates: Coordinates[],
    radius: number,
    unit: 'miles' | 'kilometers' = 'miles'
  ): Array<{ coordinate: Coordinates; distance: number }> {
    if (radius <= 0) {
      throw new Error('Radius must be greater than 0');
    }

    const results: Array<{ coordinate: Coordinates; distance: number }> = [];

    for (const candidate of candidates) {
      try {
        const distance = this.calculateDistance(center, candidate, unit);
        if (distance <= radius) {
          results.push({ coordinate: candidate, distance });
        }
      } catch (error) {
        console.warn('Failed to calculate distance to candidate:', candidate, error);
        continue;
      }
    }

    // Sort by distance (closest first)
    return results.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Convert miles to kilometers
   * @param miles - Distance in miles
   * @returns Distance in kilometers
   */
  static milesToKilometers(miles: number): number {
    if (miles < 0) {
      throw new Error('Distance cannot be negative');
    }
    return Math.round(miles * this.MILES_TO_KM * 100) / 100;
  }

  /**
   * Convert kilometers to miles
   * @param kilometers - Distance in kilometers
   * @returns Distance in miles
   */
  static kilometersToMiles(kilometers: number): number {
    if (kilometers < 0) {
      throw new Error('Distance cannot be negative');
    }
    return Math.round(kilometers * this.KM_TO_MILES * 100) / 100;
  }

  /**
   * Get a human-readable distance string
   * @param distance - Distance value
   * @param unit - Unit of measurement
   * @returns Formatted distance string
   */
  static formatDistance(distance: number, unit: 'miles' | 'kilometers' = 'miles'): string {
    if (distance < 0) {
      return 'Invalid distance';
    }

    if (distance === 0) {
      return '0 ' + (unit === 'miles' ? 'miles' : 'km');
    }

    if (distance < 0.1) {
      return '< 0.1 ' + (unit === 'miles' ? 'miles' : 'km');
    }

    if (distance < 1) {
      return distance.toFixed(1) + ' ' + (unit === 'miles' ? 'miles' : 'km');
    }

    return distance.toFixed(1) + ' ' + (unit === 'miles' ? 'miles' : 'km');
  }

  /**
   * Calculate the bearing (direction) from one coordinate to another
   * @param from - Starting coordinates
   * @param to - Destination coordinates
   * @returns Bearing in degrees (0-360)
   */
  static calculateBearing(from: Coordinates, to: Coordinates): number {
    this.validateCoordinates(from);
    this.validateCoordinates(to);

    const lat1Rad = this.degreesToRadians(from.latitude);
    const lat2Rad = this.degreesToRadians(to.latitude);
    const deltaLonRad = this.degreesToRadians(to.longitude - from.longitude);

    const y = Math.sin(deltaLonRad) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(deltaLonRad);

    const bearingRad = Math.atan2(y, x);
    const bearingDeg = this.radiansToDegrees(bearingRad);

    // Normalize to 0-360 degrees
    return (bearingDeg + 360) % 360;
  }

  /**
   * Get compass direction from bearing
   * @param bearing - Bearing in degrees
   * @returns Compass direction (N, NE, E, SE, S, SW, W, NW)
   */
  static getCompassDirection(bearing: number): string {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const index = Math.round(bearing / 45) % 8;
    return directions[index];
  }

  /**
   * Validate coordinate values
   * @param coordinates - Coordinates to validate
   * @throws Error if coordinates are invalid
   */
  private static validateCoordinates(coordinates: Coordinates): void {
    const { latitude, longitude } = coordinates;

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      throw new Error('Coordinates must be numbers');
    }

    if (isNaN(latitude) || isNaN(longitude)) {
      throw new Error('Coordinates cannot be NaN');
    }

    if (latitude < -90 || latitude > 90) {
      throw new Error('Latitude must be between -90 and 90 degrees');
    }

    if (longitude < -180 || longitude > 180) {
      throw new Error('Longitude must be between -180 and 180 degrees');
    }
  }

  /**
   * Convert degrees to radians
   * @param degrees - Angle in degrees
   * @returns Angle in radians
   */
  private static degreesToRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Convert radians to degrees
   * @param radians - Angle in radians
   * @returns Angle in degrees
   */
  private static radiansToDegrees(radians: number): number {
    return radians * (180 / Math.PI);
  }
}