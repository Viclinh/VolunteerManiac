import { Coordinates, GeolocationResult, LocationInfo, GeolocationError } from '../types/location';

export class GeolocationService {
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds
  private static readonly RETRY_TIMEOUT = 15000; // 15 seconds for retries
  private static readonly MAX_RETRIES = 2;
  private static readonly HIGH_ACCURACY_OPTIONS: PositionOptions = {
    enableHighAccuracy: true,
    timeout: GeolocationService.DEFAULT_TIMEOUT,
    maximumAge: 300000, // 5 minutes
  };
  
  private static readonly LOW_ACCURACY_OPTIONS: PositionOptions = {
    enableHighAccuracy: false,
    timeout: GeolocationService.RETRY_TIMEOUT,
    maximumAge: 600000, // 10 minutes
  };

  /**
   * Get the user's current location using the browser's geolocation API
   * @param options - Optional geolocation options
   * @returns Promise resolving to GeolocationResult
   */
  async getCurrentLocation(options?: PositionOptions): Promise<GeolocationResult> {
    return new Promise((resolve, reject) => {
      // Check if geolocation is supported
      if (!navigator.geolocation) {
        reject(this.createGeolocationError(
          0,
          'Geolocation is not supported by this browser',
          'not_supported'
        ));
        return;
      }

      const positionOptions: PositionOptions = {
        ...GeolocationService.HIGH_ACCURACY_OPTIONS,
        ...options,
      };

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const coordinates: Coordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };

            // For now, create a basic address from coordinates
            // This will be enhanced when we implement reverse geocoding
            const address: LocationInfo = {
              city: 'Unknown',
              country: 'Unknown',
              formattedAddress: `${coordinates.latitude.toFixed(4)}, ${coordinates.longitude.toFixed(4)}`,
            };

            const result: GeolocationResult = {
              coordinates,
              address,
              accuracy: position.coords.accuracy,
            };

            resolve(result);
          } catch (error) {
            reject(this.createGeolocationError(
              0,
              'Failed to process location data',
              'position_unavailable'
            ));
          }
        },
        (error) => {
          reject(this.mapGeolocationError(error));
        },
        positionOptions
      );
    });
  }

  /**
   * Get current location with comprehensive fallback mechanisms and retry logic
   * @returns Promise resolving to GeolocationResult or null if all methods fail
   */
  async getCurrentLocationWithFallback(): Promise<GeolocationResult | null> {
    const strategies = [
      {
        name: 'high-accuracy',
        options: GeolocationService.HIGH_ACCURACY_OPTIONS,
        retries: 1
      },
      {
        name: 'low-accuracy',
        options: GeolocationService.LOW_ACCURACY_OPTIONS,
        retries: GeolocationService.MAX_RETRIES
      },
      {
        name: 'basic',
        options: {
          enableHighAccuracy: false,
          timeout: 20000,
          maximumAge: 900000, // 15 minutes
        },
        retries: 1
      }
    ];

    for (const strategy of strategies) {
      console.log(`Attempting geolocation with ${strategy.name} strategy`);
      
      for (let attempt = 0; attempt <= strategy.retries; attempt++) {
        try {
          const result = await this.getCurrentLocation(strategy.options);
          console.log(`Geolocation successful with ${strategy.name} strategy on attempt ${attempt + 1}`);
          return result;
        } catch (error) {
          const geolocationError = error as GeolocationError;
          console.warn(`${strategy.name} geolocation attempt ${attempt + 1} failed:`, geolocationError);
          
          // Don't retry for permission denied or not supported errors
          if (geolocationError.type === 'permission_denied' || geolocationError.type === 'not_supported') {
            console.log('Stopping retries due to non-recoverable error');
            return null;
          }
          
          // If this is not the last attempt for this strategy, wait before retrying
          if (attempt < strategy.retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
            console.log(`Waiting ${delay}ms before retry`);
            await this.delay(delay);
          }
        }
      }
    }
    
    console.warn('All geolocation strategies failed');
    return null;
  }

  /**
   * Get current location with retry mechanism for timeout errors
   * @param options - Geolocation options
   * @param maxRetries - Maximum number of retries for timeout errors
   * @returns Promise resolving to GeolocationResult
   */
  async getCurrentLocationWithRetry(options?: PositionOptions, maxRetries: number = GeolocationService.MAX_RETRIES): Promise<GeolocationResult> {
    let lastError: GeolocationError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.getCurrentLocation(options);
      } catch (error) {
        lastError = error as GeolocationError;
        
        // Only retry for timeout errors
        if (lastError.type !== 'timeout' || attempt === maxRetries) {
          throw lastError;
        }
        
        // Wait before retrying with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`Geolocation timeout, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
        await this.delay(delay);
      }
    }
    
    throw lastError!;
  }

  /**
   * Check if geolocation is supported and permissions are likely to be granted
   * @returns Promise resolving to boolean indicating availability
   */
  async isGeolocationAvailable(): Promise<boolean> {
    if (!navigator.geolocation) {
      return false;
    }

    // Check if permissions API is available
    if ('permissions' in navigator) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        return permission.state !== 'denied';
      } catch (error) {
        // Permissions API might not be supported, assume available
        return true;
      }
    }

    return true;
  }

  /**
   * Get user-friendly error message with helpful suggestions
   * @param error - GeolocationError
   * @returns Object with user message and suggested actions
   */
  getErrorMessageWithSuggestions(error: GeolocationError): { message: string; suggestions: string[] } {
    switch (error.type) {
      case 'permission_denied':
        return {
          message: 'Location access was denied. To use this feature, please enable location permissions.',
          suggestions: [
            'Click the location icon in your browser\'s address bar',
            'Select "Allow" for location access',
            'Refresh the page and try again',
            'Or enter your location manually in the search box'
          ]
        };
      case 'position_unavailable':
        return {
          message: 'Your location is currently unavailable. This might be due to poor GPS signal or network issues.',
          suggestions: [
            'Make sure you\'re connected to the internet',
            'Try moving to an area with better signal',
            'Check if location services are enabled on your device',
            'Enter your location manually as an alternative'
          ]
        };
      case 'timeout':
        return {
          message: 'Location request timed out. Your device is taking longer than expected to determine your location.',
          suggestions: [
            'Try again - sometimes it works on the second attempt',
            'Make sure you have a stable internet connection',
            'Check if other apps can access your location',
            'Enter your location manually if the issue persists'
          ]
        };
      case 'not_supported':
        return {
          message: 'Your browser doesn\'t support location services.',
          suggestions: [
            'Try using a modern browser like Chrome, Firefox, or Safari',
            'Make sure your browser is up to date',
            'Enter your location manually in the search box'
          ]
        };
      default:
        return {
          message: 'Unable to determine your location due to an unexpected error.',
          suggestions: [
            'Try refreshing the page',
            'Check your internet connection',
            'Enter your location manually'
          ]
        };
    }
  }

  /**
   * Check if an error is recoverable (can be retried)
   * @param error - GeolocationError
   * @returns boolean indicating if the error is recoverable
   */
  isRecoverableError(error: GeolocationError): boolean {
    return error.type === 'timeout' || error.type === 'position_unavailable';
  }

  /**
   * Map browser GeolocationPositionError to our custom error format with enhanced messaging
   */
  private mapGeolocationError(error: GeolocationPositionError): GeolocationError {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return this.createGeolocationError(
          error.code,
          'Location access denied by user',
          'permission_denied'
        );
      case error.POSITION_UNAVAILABLE:
        return this.createGeolocationError(
          error.code,
          'Location information is unavailable',
          'position_unavailable'
        );
      case error.TIMEOUT:
        return this.createGeolocationError(
          error.code,
          'Location request timed out',
          'timeout'
        );
      default:
        return this.createGeolocationError(
          error.code,
          error.message || 'Unknown geolocation error',
          'position_unavailable'
        );
    }
  }

  /**
   * Create a standardized geolocation error
   */
  private createGeolocationError(
    code: number,
    message: string,
    type: GeolocationError['type']
  ): GeolocationError {
    return {
      code,
      message,
      type,
    };
  }

  /**
   * Utility method to create a delay
   * @param ms - Milliseconds to delay
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}