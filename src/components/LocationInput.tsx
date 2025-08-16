import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Navigation, Loader2, AlertCircle } from 'lucide-react';
import { GeolocationService } from '../services/geolocationService';
import { GeocodingService } from '../services/geocodingService';
import { LocationSuggestion, GeolocationError } from '../types/location';

interface LocationInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  geocodingService?: GeocodingService;
}

export const LocationInput: React.FC<LocationInputProps> = ({
  value,
  onChange,
  placeholder = "Enter city, country",
  className = "",
  geocodingService: externalGeocodingService
}) => {
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [isUsingGeolocation, setIsUsingGeolocation] = useState(false);
  const [geolocationError, setGeolocationError] = useState<string | null>(null);
  const [geolocationSuggestions, setGeolocationSuggestions] = useState<string[]>([]);
  const [isGeolocationAvailable, setIsGeolocationAvailable] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const geolocationService = useRef(new GeolocationService());
  const geocodingService = useRef(externalGeocodingService || new GeocodingService());
  const debounceTimer = useRef<NodeJS.Timeout>();

  // Check geolocation availability on mount
  useEffect(() => {
    const checkGeolocationAvailability = async () => {
      const available = await geolocationService.current.isGeolocationAvailable();
      setIsGeolocationAvailable(available);
    };
    
    checkGeolocationAvailability();
  }, []);

  // Handle input changes with debounced suggestions
  const handleInputChange = (inputValue: string) => {
    onChange(inputValue);
    setGeolocationError(null);

    // Clear existing timer
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    // Don't show suggestions for very short queries
    if (inputValue.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Debounce the suggestions request
    debounceTimer.current = setTimeout(async () => {
      setIsLoadingSuggestions(true);
      try {
        const locationSuggestions = await geocodingService.current.getLocationSuggestions(inputValue, 5);
        setSuggestions(locationSuggestions);
        setShowSuggestions(locationSuggestions.length > 0);
      } catch (error) {
        console.warn('Failed to get location suggestions:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }, 300);
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: LocationSuggestion) => {
    const locationText = suggestion.details.state 
      ? `${suggestion.details.city}, ${suggestion.details.state}, ${suggestion.details.country}`
      : `${suggestion.details.city}, ${suggestion.details.country}`;
    
    onChange(locationText);
    setShowSuggestions(false);
    setSuggestions([]);
    inputRef.current?.blur();
  };

  // Handle geolocation button click with enhanced error handling
  const handleUseCurrentLocation = async () => {
    if (!isGeolocationAvailable) {
      const errorInfo = geolocationService.current.getErrorMessageWithSuggestions({
        code: 0,
        message: 'Geolocation not supported',
        type: 'not_supported'
      });
      setGeolocationError(errorInfo.message);
      setGeolocationSuggestions(errorInfo.suggestions);
      return;
    }

    setIsUsingGeolocation(true);
    setGeolocationError(null);
    setGeolocationSuggestions([]);

    try {
      const result = await geolocationService.current.getCurrentLocationWithFallback();
      
      if (!result) {
        setGeolocationError('Unable to determine your location after trying multiple methods.');
        setGeolocationSuggestions([
          'Check that location services are enabled on your device',
          'Make sure you have a stable internet connection',
          'Try refreshing the page and allowing location access',
          'Enter your location manually in the search box'
        ]);
        return;
      }

      // Reset retry count on success
      setRetryCount(0);

      // Reverse geocode to get readable address
      try {
        const locationInfo = await geocodingService.current.reverseGeocode(result.coordinates);
        const locationText = locationInfo.state 
          ? `${locationInfo.city}, ${locationInfo.state}, ${locationInfo.country}`
          : `${locationInfo.city}, ${locationInfo.country}`;
        
        onChange(locationText);
      } catch (reverseGeocodeError) {
        // Fallback to coordinates if reverse geocoding fails
        const coordText = `${result.coordinates.latitude.toFixed(4)}, ${result.coordinates.longitude.toFixed(4)}`;
        onChange(coordText);
      }
    } catch (error) {
      const geolocationError = error as GeolocationError;
      const errorInfo = geolocationService.current.getErrorMessageWithSuggestions(geolocationError);
      
      setGeolocationError(errorInfo.message);
      setGeolocationSuggestions(errorInfo.suggestions);
      
      // Track retry attempts for timeout errors
      if (geolocationError.type === 'timeout') {
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setIsUsingGeolocation(false);
    }
  };

  // Handle retry for recoverable errors
  const handleRetryGeolocation = async () => {
    if (retryCount < 3) { // Limit retries to prevent infinite loops
      await handleUseCurrentLocation();
    }
  };

  // Handle clicks outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex">
        <div className="flex-1 relative">
          <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
          <input
            ref={inputRef}
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (suggestions.length > 0) {
                setShowSuggestions(true);
              }
            }}
            className="w-full pl-10 pr-4 py-3 text-gray-900 placeholder-gray-500 rounded-l-lg border-0 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          
          {/* Loading indicator for suggestions */}
          {isLoadingSuggestions && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
            </div>
          )}
        </div>

        {/* Use My Location Button */}
        {isGeolocationAvailable && (
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isUsingGeolocation}
            className="px-4 py-3 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:cursor-not-allowed border-l border-gray-200 rounded-r-lg transition-colors flex items-center justify-center"
            title="Use my current location"
          >
            {isUsingGeolocation ? (
              <Loader2 className="h-5 w-5 text-gray-600 animate-spin" />
            ) : (
              <Navigation className="h-5 w-5 text-gray-600" />
            )}
          </button>
        )}
      </div>

      {/* Geolocation Error with Suggestions */}
      {geolocationError && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start space-x-2 text-sm text-red-800">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">{geolocationError}</p>
              {geolocationSuggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-red-700 mb-1">Try these solutions:</p>
                  <ul className="text-xs text-red-700 space-y-1">
                    {geolocationSuggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start space-x-1">
                        <span className="text-red-400 mt-0.5">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Retry button for recoverable errors */}
              {geolocationError.includes('timed out') && retryCount < 3 && (
                <button
                  onClick={handleRetryGeolocation}
                  className="mt-2 text-xs text-red-700 hover:text-red-900 underline focus:outline-none"
                >
                  Try again ({3 - retryCount} attempts remaining)
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto"
        >
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSuggestionSelect(suggestion)}
              className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-start space-x-3">
                <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {suggestion.details.city}
                    {suggestion.details.state && `, ${suggestion.details.state}`}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {suggestion.details.country}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};