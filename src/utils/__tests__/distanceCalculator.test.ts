import { describe, it, expect } from 'vitest';
import { DistanceCalculator } from '../distanceCalculator';
import { Coordinates } from '../../types/location';

describe('DistanceCalculator', () => {
  // Test coordinates
  const newYork: Coordinates = { latitude: 40.7128, longitude: -74.0060 };
  const losAngeles: Coordinates = { latitude: 34.0522, longitude: -118.2437 };
  const london: Coordinates = { latitude: 51.5074, longitude: -0.1278 };
  const paris: Coordinates = { latitude: 48.8566, longitude: 2.3522 };
  const sydney: Coordinates = { latitude: -33.8688, longitude: 151.2093 };

  describe('calculateDistance', () => {
    it('should calculate distance between New York and Los Angeles in miles', () => {
      const distance = DistanceCalculator.calculateDistance(newYork, losAngeles, 'miles');
      
      // Expected distance is approximately 2445.71 miles
      expect(distance).toBeCloseTo(2445.71, 0);
    });

    it('should calculate distance between New York and Los Angeles in kilometers', () => {
      const distance = DistanceCalculator.calculateDistance(newYork, losAngeles, 'kilometers');
      
      // Expected distance is approximately 3935.75 kilometers
      expect(distance).toBeCloseTo(3935.75, 0);
    });

    it('should calculate distance between London and Paris', () => {
      const distance = DistanceCalculator.calculateDistance(london, paris, 'miles');
      
      // Expected distance is approximately 213.49 miles
      expect(distance).toBeCloseTo(213.49, 0);
    });

    it('should return 0 for identical coordinates', () => {
      const distance = DistanceCalculator.calculateDistance(newYork, newYork);
      expect(distance).toBe(0);
    });

    it('should handle coordinates across the international date line', () => {
      const tokyo: Coordinates = { latitude: 35.6762, longitude: 139.6503 };
      const honolulu: Coordinates = { latitude: 21.3099, longitude: -157.8581 };
      
      const distance = DistanceCalculator.calculateDistance(tokyo, honolulu, 'miles');
      
      // Expected distance is approximately 3858.5 miles
      expect(distance).toBeCloseTo(3858.5, 0);
    });

    it('should handle coordinates in southern hemisphere', () => {
      const distance = DistanceCalculator.calculateDistance(newYork, sydney, 'miles');
      
      // Expected distance is approximately 9935.56 miles
      expect(distance).toBeCloseTo(9935.56, 0);
    });

    it('should default to miles when no unit specified', () => {
      const distanceDefault = DistanceCalculator.calculateDistance(newYork, losAngeles);
      const distanceMiles = DistanceCalculator.calculateDistance(newYork, losAngeles, 'miles');
      
      expect(distanceDefault).toBe(distanceMiles);
    });

    it('should throw error for invalid latitude', () => {
      const invalidCoord: Coordinates = { latitude: 91, longitude: 0 };
      
      expect(() => {
        DistanceCalculator.calculateDistance(newYork, invalidCoord);
      }).toThrow('Latitude must be between -90 and 90 degrees');
    });

    it('should throw error for invalid longitude', () => {
      const invalidCoord: Coordinates = { latitude: 0, longitude: 181 };
      
      expect(() => {
        DistanceCalculator.calculateDistance(newYork, invalidCoord);
      }).toThrow('Longitude must be between -180 and 180 degrees');
    });

    it('should throw error for NaN coordinates', () => {
      const invalidCoord: Coordinates = { latitude: NaN, longitude: 0 };
      
      expect(() => {
        DistanceCalculator.calculateDistance(newYork, invalidCoord);
      }).toThrow('Coordinates cannot be NaN');
    });

    it('should throw error for non-number coordinates', () => {
      const invalidCoord: Coordinates = { latitude: '40.7128' as any, longitude: -74.0060 };
      
      expect(() => {
        DistanceCalculator.calculateDistance(newYork, invalidCoord);
      }).toThrow('Coordinates must be numbers');
    });
  });

  describe('calculateDistanceDetailed', () => {
    it('should return detailed distance result', () => {
      const result = DistanceCalculator.calculateDistanceDetailed(newYork, losAngeles, 'miles');
      
      expect(result).toEqual({
        distance: expect.any(Number),
        unit: 'miles'
      });
      expect(result.distance).toBeCloseTo(2445.71, 0);
    });

    it('should return detailed result in kilometers', () => {
      const result = DistanceCalculator.calculateDistanceDetailed(newYork, losAngeles, 'kilometers');
      
      expect(result).toEqual({
        distance: expect.any(Number),
        unit: 'kilometers'
      });
      expect(result.distance).toBeCloseTo(3935.75, 0);
    });
  });

  describe('calculateDistancesToMultiple', () => {
    it('should calculate distances to multiple destinations', () => {
      const destinations = [losAngeles, london, paris];
      const distances = DistanceCalculator.calculateDistancesToMultiple(newYork, destinations, 'miles');
      
      expect(distances).toHaveLength(3);
      expect(distances[0]).toBeCloseTo(2445.71, 0); // NY to LA
      expect(distances[1]).toBeCloseTo(3461.39, 0); // NY to London
      expect(distances[2]).toBeCloseTo(3627.32, 0); // NY to Paris
    });

    it('should handle invalid destinations gracefully', () => {
      const destinations = [
        losAngeles,
        { latitude: 91, longitude: 0 }, // Invalid
        london
      ];
      const distances = DistanceCalculator.calculateDistancesToMultiple(newYork, destinations, 'miles');
      
      expect(distances).toHaveLength(3);
      expect(distances[0]).toBeCloseTo(2445.71, 0);
      expect(distances[1]).toBe(Infinity);
      expect(distances[2]).toBeCloseTo(3461.39, 0);
    });

    it('should return empty array for empty destinations', () => {
      const distances = DistanceCalculator.calculateDistancesToMultiple(newYork, [], 'miles');
      expect(distances).toEqual([]);
    });
  });

  describe('findClosest', () => {
    it('should find the closest coordinate', () => {
      const candidates = [losAngeles, london, paris];
      const result = DistanceCalculator.findClosest(newYork, candidates, 'miles');
      
      expect(result).not.toBeNull();
      expect(result!.coordinate).toEqual(losAngeles);
      expect(result!.distance).toBeCloseTo(2445.71, 0);
    });

    it('should return null for empty candidates array', () => {
      const result = DistanceCalculator.findClosest(newYork, [], 'miles');
      expect(result).toBeNull();
    });

    it('should handle invalid candidates gracefully', () => {
      const candidates = [
        { latitude: 91, longitude: 0 }, // Invalid
        { latitude: 92, longitude: 0 }, // Invalid
        london // Valid
      ];
      const result = DistanceCalculator.findClosest(newYork, candidates, 'miles');
      
      expect(result).not.toBeNull();
      expect(result!.coordinate).toEqual(london);
    });

    it('should return null when all candidates are invalid', () => {
      const candidates = [
        { latitude: 91, longitude: 0 },
        { latitude: 92, longitude: 0 }
      ];
      const result = DistanceCalculator.findClosest(newYork, candidates, 'miles');
      expect(result).toBeNull();
    });
  });

  describe('filterWithinRadius', () => {
    it('should filter coordinates within radius', () => {
      const candidates = [losAngeles, london, paris];
      const result = DistanceCalculator.filterWithinRadius(newYork, candidates, 3000, 'miles');
      
      // Only LA should be within 3000 miles of NY
      expect(result).toHaveLength(1);
      expect(result[0].coordinate).toEqual(losAngeles);
      expect(result[0].distance).toBeCloseTo(2445.71, 0);
    });

    it('should return results sorted by distance', () => {
      const candidates = [paris, london, losAngeles]; // Unsorted order
      const result = DistanceCalculator.filterWithinRadius(newYork, candidates, 4000, 'miles');
      
      expect(result).toHaveLength(3);
      // Should be sorted: LA (closest), London, Paris (farthest)
      expect(result[0].coordinate).toEqual(losAngeles);
      expect(result[1].coordinate).toEqual(london);
      expect(result[2].coordinate).toEqual(paris);
    });

    it('should return empty array when no coordinates within radius', () => {
      const candidates = [london, paris];
      const result = DistanceCalculator.filterWithinRadius(newYork, candidates, 1000, 'miles');
      
      expect(result).toEqual([]);
    });

    it('should throw error for negative radius', () => {
      expect(() => {
        DistanceCalculator.filterWithinRadius(newYork, [losAngeles], -10, 'miles');
      }).toThrow('Radius must be greater than 0');
    });

    it('should throw error for zero radius', () => {
      expect(() => {
        DistanceCalculator.filterWithinRadius(newYork, [losAngeles], 0, 'miles');
      }).toThrow('Radius must be greater than 0');
    });

    it('should handle invalid candidates gracefully', () => {
      const candidates = [
        { latitude: 91, longitude: 0 }, // Invalid
        losAngeles, // Valid
        london // Valid
      ];
      const result = DistanceCalculator.filterWithinRadius(newYork, candidates, 3000, 'miles');
      
      expect(result).toHaveLength(1);
      expect(result[0].coordinate).toEqual(losAngeles);
    });
  });

  describe('unit conversion', () => {
    it('should convert miles to kilometers', () => {
      const km = DistanceCalculator.milesToKilometers(100);
      expect(km).toBeCloseTo(160.93, 2);
    });

    it('should convert kilometers to miles', () => {
      const miles = DistanceCalculator.kilometersToMiles(100);
      expect(miles).toBeCloseTo(62.14, 2);
    });

    it('should handle zero distance conversion', () => {
      expect(DistanceCalculator.milesToKilometers(0)).toBe(0);
      expect(DistanceCalculator.kilometersToMiles(0)).toBe(0);
    });

    it('should throw error for negative distances', () => {
      expect(() => {
        DistanceCalculator.milesToKilometers(-10);
      }).toThrow('Distance cannot be negative');

      expect(() => {
        DistanceCalculator.kilometersToMiles(-10);
      }).toThrow('Distance cannot be negative');
    });
  });

  describe('formatDistance', () => {
    it('should format distance in miles', () => {
      expect(DistanceCalculator.formatDistance(0)).toBe('0 miles');
      expect(DistanceCalculator.formatDistance(0.05)).toBe('< 0.1 miles');
      expect(DistanceCalculator.formatDistance(0.5)).toBe('0.5 miles');
      expect(DistanceCalculator.formatDistance(1.5)).toBe('1.5 miles');
      expect(DistanceCalculator.formatDistance(100.7)).toBe('100.7 miles');
    });

    it('should format distance in kilometers', () => {
      expect(DistanceCalculator.formatDistance(0, 'kilometers')).toBe('0 km');
      expect(DistanceCalculator.formatDistance(0.05, 'kilometers')).toBe('< 0.1 km');
      expect(DistanceCalculator.formatDistance(0.5, 'kilometers')).toBe('0.5 km');
      expect(DistanceCalculator.formatDistance(1.5, 'kilometers')).toBe('1.5 km');
      expect(DistanceCalculator.formatDistance(100.7, 'kilometers')).toBe('100.7 km');
    });

    it('should handle invalid distances', () => {
      expect(DistanceCalculator.formatDistance(-10)).toBe('Invalid distance');
    });
  });

  describe('calculateBearing', () => {
    it('should calculate bearing from New York to Los Angeles', () => {
      const bearing = DistanceCalculator.calculateBearing(newYork, losAngeles);
      
      // Expected bearing is approximately 273.69 degrees (west-southwest)
      expect(bearing).toBeCloseTo(273.69, 0);
    });

    it('should calculate bearing from New York to London', () => {
      const bearing = DistanceCalculator.calculateBearing(newYork, london);
      
      // Expected bearing is approximately 51 degrees (northeast)
      expect(bearing).toBeCloseTo(51, 0);
    });

    it('should return 0 for identical coordinates', () => {
      const bearing = DistanceCalculator.calculateBearing(newYork, newYork);
      expect(bearing).toBe(0);
    });

    it('should handle coordinates across international date line', () => {
      const tokyo: Coordinates = { latitude: 35.6762, longitude: 139.6503 };
      const honolulu: Coordinates = { latitude: 21.3099, longitude: -157.8581 };
      
      const bearing = DistanceCalculator.calculateBearing(tokyo, honolulu);
      expect(bearing).toBeGreaterThanOrEqual(0);
      expect(bearing).toBeLessThan(360);
    });

    it('should throw error for invalid coordinates', () => {
      const invalidCoord: Coordinates = { latitude: 91, longitude: 0 };
      
      expect(() => {
        DistanceCalculator.calculateBearing(newYork, invalidCoord);
      }).toThrow('Latitude must be between -90 and 90 degrees');
    });
  });

  describe('getCompassDirection', () => {
    it('should return correct compass directions', () => {
      expect(DistanceCalculator.getCompassDirection(0)).toBe('N');
      expect(DistanceCalculator.getCompassDirection(45)).toBe('NE');
      expect(DistanceCalculator.getCompassDirection(90)).toBe('E');
      expect(DistanceCalculator.getCompassDirection(135)).toBe('SE');
      expect(DistanceCalculator.getCompassDirection(180)).toBe('S');
      expect(DistanceCalculator.getCompassDirection(225)).toBe('SW');
      expect(DistanceCalculator.getCompassDirection(270)).toBe('W');
      expect(DistanceCalculator.getCompassDirection(315)).toBe('NW');
    });

    it('should handle bearings near boundaries', () => {
      expect(DistanceCalculator.getCompassDirection(22)).toBe('N');
      expect(DistanceCalculator.getCompassDirection(23)).toBe('NE');
      expect(DistanceCalculator.getCompassDirection(67)).toBe('NE');
      expect(DistanceCalculator.getCompassDirection(68)).toBe('E');
    });

    it('should handle bearings over 360 degrees', () => {
      expect(DistanceCalculator.getCompassDirection(360)).toBe('N');
      expect(DistanceCalculator.getCompassDirection(405)).toBe('NE');
    });
  });

  describe('accuracy tests', () => {
    it('should be accurate for known distances', () => {
      // Test with well-known distances
      const chicago: Coordinates = { latitude: 41.8781, longitude: -87.6298 };
      const detroit: Coordinates = { latitude: 42.3314, longitude: -83.0458 };
      
      // Chicago to Detroit is approximately 237.05 miles
      const distance = DistanceCalculator.calculateDistance(chicago, detroit, 'miles');
      expect(distance).toBeCloseTo(237.05, 0);
    });

    it('should maintain precision for small distances', () => {
      const coord1: Coordinates = { latitude: 40.7128, longitude: -74.0060 };
      const coord2: Coordinates = { latitude: 40.7129, longitude: -74.0061 };
      
      const distance = DistanceCalculator.calculateDistance(coord1, coord2, 'miles');
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(0.1);
    });

    it('should be consistent between units', () => {
      const distanceMiles = DistanceCalculator.calculateDistance(newYork, losAngeles, 'miles');
      const distanceKm = DistanceCalculator.calculateDistance(newYork, losAngeles, 'kilometers');
      
      const convertedDistance = DistanceCalculator.milesToKilometers(distanceMiles);
      expect(convertedDistance).toBeCloseTo(distanceKm, 0);
    });
  });
});