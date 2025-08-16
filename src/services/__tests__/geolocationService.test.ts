import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeolocationService } from '../geolocationService';
import { GeolocationResult, GeolocationError } from '../../types/location';

describe('GeolocationService', () => {
  let geolocationService: GeolocationService;
  let mockGeolocation: any;

  beforeEach(() => {
    geolocationService = new GeolocationService();
    
    // Create a fresh mock for each test
    mockGeolocation = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };

    // Mock navigator.geolocation
    Object.defineProperty(global.navigator, 'geolocation', {
      value: mockGeolocation,
      writable: true,
    });

    // Mock navigator.permissions
    Object.defineProperty(global.navigator, 'permissions', {
      value: {
        query: vi.fn(),
      },
      writable: true,
    });

    // Mock setTimeout to speed up tests
    vi.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
      fn();
      return 1 as any;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('getCurrentLocation', () => {
    it('should successfully get current location', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success: PositionCallback) => {
        success(mockPosition);
      });

      const result = await geolocationService.getCurrentLocation();

      expect(result).toEqual({
        coordinates: {
          latitude: 40.7128,
          longitude: -74.0060,
        },
        address: {
          city: 'Unknown',
          country: 'Unknown',
          formattedAddress: '40.7128, -74.0060',
        },
        accuracy: 10,
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        })
      );
    });

    it('should handle permission denied error', async () => {
      const mockError: GeolocationPositionError = {
        code: 1, // PERMISSION_DENIED
        message: 'User denied geolocation',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback) => {
          error(mockError);
        }
      );

      await expect(geolocationService.getCurrentLocation()).rejects.toEqual({
        code: 1,
        message: 'Location access denied by user',
        type: 'permission_denied',
      });
    });

    it('should handle position unavailable error', async () => {
      const mockError: GeolocationPositionError = {
        code: 2, // POSITION_UNAVAILABLE
        message: 'Position unavailable',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback) => {
          error(mockError);
        }
      );

      await expect(geolocationService.getCurrentLocation()).rejects.toEqual({
        code: 2,
        message: 'Location information is unavailable',
        type: 'position_unavailable',
      });
    });

    it('should handle timeout error', async () => {
      const mockError: GeolocationPositionError = {
        code: 3, // TIMEOUT
        message: 'Timeout',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback) => {
          error(mockError);
        }
      );

      await expect(geolocationService.getCurrentLocation()).rejects.toEqual({
        code: 3,
        message: 'Location request timed out',
        type: 'timeout',
      });
    });

    it('should handle unsupported geolocation', async () => {
      // Remove geolocation from navigator
      Object.defineProperty(global.navigator, 'geolocation', {
        value: undefined,
        writable: true,
      });

      await expect(geolocationService.getCurrentLocation()).rejects.toEqual({
        code: 0,
        message: 'Geolocation is not supported by this browser',
        type: 'not_supported',
      });
    });

    it('should use custom options when provided', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success: PositionCallback) => {
        success(mockPosition);
      });

      const customOptions: PositionOptions = {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 60000,
      };

      await geolocationService.getCurrentLocation(customOptions);

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining(customOptions)
      );
    });
  });

  describe('getCurrentLocationWithFallback', () => {
    it('should return result from first attempt when successful', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      mockGeolocation.getCurrentPosition.mockImplementation((success: PositionCallback) => {
        success(mockPosition);
      });

      const result = await geolocationService.getCurrentLocationWithFallback();

      expect(result).not.toBeNull();
      expect(result?.coordinates).toEqual({
        latitude: 40.7128,
        longitude: -74.0060,
      });
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    });

    it('should try multiple strategies when high accuracy fails', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 100,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      let callCount = 0;
      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback, options?: PositionOptions) => {
          callCount++;
          if (callCount <= 2) {
            // First two calls fail (high accuracy + retry, low accuracy first attempt)
            error({
              code: 3,
              message: 'Timeout',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          } else {
            // Third call succeeds
            success(mockPosition);
          }
        }
      );

      const result = await geolocationService.getCurrentLocationWithFallback();

      expect(result).not.toBeNull();
      expect(result?.coordinates).toEqual({
        latitude: 40.7128,
        longitude: -74.0060,
      });
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(3);
    });

    it('should return null when all strategies fail', async () => {
      const mockError: GeolocationPositionError = {
        code: 3,
        message: 'Timeout',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback) => {
          error(mockError);
        }
      );

      const result = await geolocationService.getCurrentLocationWithFallback();

      expect(result).toBeNull();
      // Should try multiple strategies with retries: high-accuracy (2), low-accuracy (3), basic (2)
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(7);
    }, 10000); // Increase timeout to 10 seconds

    it('should stop retrying for permission denied errors', async () => {
      const mockError: GeolocationPositionError = {
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback) => {
          error(mockError);
        }
      );

      const result = await geolocationService.getCurrentLocationWithFallback();

      expect(result).toBeNull();
      // Should only try once since permission denied is not recoverable
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCurrentLocationWithRetry', () => {
    it('should retry timeout errors up to maxRetries', async () => {
      const mockError: GeolocationPositionError = {
        code: 3,
        message: 'Timeout',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback) => {
          error(mockError);
        }
      );

      await expect(geolocationService.getCurrentLocationWithRetry(undefined, 2)).rejects.toEqual({
        code: 3,
        message: 'Location request timed out',
        type: 'timeout',
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-timeout errors', async () => {
      const mockError: GeolocationPositionError = {
        code: 1,
        message: 'Permission denied',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      };

      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback) => {
          error(mockError);
        }
      );

      await expect(geolocationService.getCurrentLocationWithRetry(undefined, 2)).rejects.toEqual({
        code: 1,
        message: 'Location access denied by user',
        type: 'permission_denied',
      });

      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(1); // No retries
    });

    it('should succeed on retry', async () => {
      const mockPosition: GeolocationPosition = {
        coords: {
          latitude: 40.7128,
          longitude: -74.0060,
          accuracy: 10,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      };

      let callCount = 0;
      mockGeolocation.getCurrentPosition.mockImplementation(
        (success: PositionCallback, error: PositionErrorCallback) => {
          callCount++;
          if (callCount === 1) {
            error({
              code: 3,
              message: 'Timeout',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          } else {
            success(mockPosition);
          }
        }
      );

      const result = await geolocationService.getCurrentLocationWithRetry();

      expect(result.coordinates).toEqual({
        latitude: 40.7128,
        longitude: -74.0060,
      });
      expect(mockGeolocation.getCurrentPosition).toHaveBeenCalledTimes(2);
    });
  });

  describe('isGeolocationAvailable', () => {
    it('should return false when geolocation is not supported', async () => {
      Object.defineProperty(global.navigator, 'geolocation', {
        value: undefined,
        writable: true,
      });

      const result = await geolocationService.isGeolocationAvailable();
      expect(result).toBe(false);
    });

    it('should return false when permission is denied', async () => {
      const mockPermissions = {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      };

      Object.defineProperty(global.navigator, 'permissions', {
        value: mockPermissions,
        writable: true,
      });

      const result = await geolocationService.isGeolocationAvailable();
      expect(result).toBe(false);
      expect(mockPermissions.query).toHaveBeenCalledWith({ name: 'geolocation' });
    });

    it('should return true when permission is granted', async () => {
      const mockPermissions = {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      };

      Object.defineProperty(global.navigator, 'permissions', {
        value: mockPermissions,
        writable: true,
      });

      const result = await geolocationService.isGeolocationAvailable();
      expect(result).toBe(true);
    });

    it('should return true when permission is prompt', async () => {
      const mockPermissions = {
        query: vi.fn().mockResolvedValue({ state: 'prompt' }),
      };

      Object.defineProperty(global.navigator, 'permissions', {
        value: mockPermissions,
        writable: true,
      });

      const result = await geolocationService.isGeolocationAvailable();
      expect(result).toBe(true);
    });

    it('should return true when permissions API is not available', async () => {
      Object.defineProperty(global.navigator, 'permissions', {
        value: undefined,
        writable: true,
      });

      const result = await geolocationService.isGeolocationAvailable();
      expect(result).toBe(true);
    });

    it('should return true when permissions query fails', async () => {
      const mockPermissions = {
        query: vi.fn().mockRejectedValue(new Error('Permissions API error')),
      };

      Object.defineProperty(global.navigator, 'permissions', {
        value: mockPermissions,
        writable: true,
      });

      const result = await geolocationService.isGeolocationAvailable();
      expect(result).toBe(true);
    });
  });

  describe('getErrorMessageWithSuggestions', () => {
    it('should return helpful message for permission denied error', () => {
      const error: GeolocationError = {
        code: 1,
        message: 'Permission denied',
        type: 'permission_denied',
      };

      const result = geolocationService.getErrorMessageWithSuggestions(error);

      expect(result.message).toContain('Location access was denied');
      expect(result.suggestions).toHaveLength(4);
      expect(result.suggestions[0]).toContain('Click the location icon');
    });

    it('should return helpful message for position unavailable error', () => {
      const error: GeolocationError = {
        code: 2,
        message: 'Position unavailable',
        type: 'position_unavailable',
      };

      const result = geolocationService.getErrorMessageWithSuggestions(error);

      expect(result.message).toContain('location is currently unavailable');
      expect(result.suggestions).toHaveLength(4);
      expect(result.suggestions[0]).toContain('connected to the internet');
    });

    it('should return helpful message for timeout error', () => {
      const error: GeolocationError = {
        code: 3,
        message: 'Timeout',
        type: 'timeout',
      };

      const result = geolocationService.getErrorMessageWithSuggestions(error);

      expect(result.message).toContain('timed out');
      expect(result.suggestions).toHaveLength(4);
      expect(result.suggestions[0]).toContain('Try again');
    });

    it('should return helpful message for not supported error', () => {
      const error: GeolocationError = {
        code: 0,
        message: 'Not supported',
        type: 'not_supported',
      };

      const result = geolocationService.getErrorMessageWithSuggestions(error);

      expect(result.message).toContain('doesn\'t support location services');
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0]).toContain('modern browser');
    });
  });

  describe('isRecoverableError', () => {
    it('should return true for timeout errors', () => {
      const error: GeolocationError = {
        code: 3,
        message: 'Timeout',
        type: 'timeout',
      };

      expect(geolocationService.isRecoverableError(error)).toBe(true);
    });

    it('should return true for position unavailable errors', () => {
      const error: GeolocationError = {
        code: 2,
        message: 'Position unavailable',
        type: 'position_unavailable',
      };

      expect(geolocationService.isRecoverableError(error)).toBe(true);
    });

    it('should return false for permission denied errors', () => {
      const error: GeolocationError = {
        code: 1,
        message: 'Permission denied',
        type: 'permission_denied',
      };

      expect(geolocationService.isRecoverableError(error)).toBe(false);
    });

    it('should return false for not supported errors', () => {
      const error: GeolocationError = {
        code: 0,
        message: 'Not supported',
        type: 'not_supported',
      };

      expect(geolocationService.isRecoverableError(error)).toBe(false);
    });
  });
});