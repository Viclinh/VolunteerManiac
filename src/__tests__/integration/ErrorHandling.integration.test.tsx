import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import App from '../../App';
import { searchController } from '../../services/SearchController';
import { GeocodingService } from '../../services/geocodingService';
import { GeolocationService } from '../../services/geolocationService';

// Mock all external services
vi.mock('../../services/SearchController');
vi.mock('../../services/geocodingService');
vi.mock('../../services/geolocationService');
vi.mock('../../services/api/APIServiceRegistry');
vi.mock('../../services/api/adapters/VolunteerHubAdapter');
vi.mock('../../services/api/adapters/JustServeAdapter');
vi.mock('../../services/api/adapters/IdealistAdapter');

// Mock LocationInput component
vi.mock('../../components/LocationInput', () => ({
  LocationInput: ({ value, onChange, placeholder, className }: any) => (
    <input
      data-testid="location-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  )
}));

describe('Error Handling Integration Tests', () => {
  const mockSearchController = searchController as any;
  const mockGeocodingService = new GeocodingService() as any;
  const mockGeolocationService = new GeolocationService() as any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockSearchController.loadSearchPreferences.mockReturnValue(null);
    mockSearchController.saveSearchPreferences.mockImplementation(() => {});
    mockSearchController.clearSearchPreferences.mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('API Service Failures', () => {
    it('should handle complete API service failure', async () => {
      const user = userEvent.setup();
      
      // Mock complete API failure
      mockSearchController.performSmartSearch.mockRejectedValue(
        new Error('All API services are currently unavailable')
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Perform search
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Wait for error display
      await waitFor(() => {
        expect(screen.getByText('Search Failed')).toBeInTheDocument();
      });

      expect(screen.getByText('All API services are currently unavailable')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();

      // Test retry functionality
      mockSearchController.performSmartSearch.mockResolvedValueOnce({
        opportunities: [],
        searchLocation: { city: 'New York', country: 'USA', formattedAddress: 'New York, USA' },
        totalResults: 0,
        sources: ['VolunteerHub'],
        responseTime: 500,
        partialResults: false,
        serviceStatuses: []
      });

      const retryButton = screen.getByText('Try Again');
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Found 0 opportunities from 1 sources')).toBeInTheDocument();
      });
    });

    it('should handle partial API service failures with graceful degradation', async () => {
      const user = userEvent.setup();
      
      // Mock partial failure with some results
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [
          {
            id: '1',
            source: 'VolunteerHub',
            title: 'Community Garden',
            organization: 'Green Thumb Society',
            description: 'Help maintain community garden',
            location: 'New York, NY',
            city: 'New York',
            country: 'USA',
            type: 'in-person',
            cause: 'Environment',
            skills: ['gardening'],
            timeCommitment: '3 hours',
            date: '2024-02-15',
            participants: 10,
            image: 'https://example.com/garden.jpg',
            contactInfo: { email: 'garden@greenthumb.org' },
            externalUrl: 'https://greenthumb.org/volunteer',
            lastUpdated: new Date(),
            verified: true,
            distance: 1.2
          }
        ],
        searchLocation: { city: 'New York', state: 'NY', country: 'USA', formattedAddress: 'New York, NY, USA' },
        totalResults: 1,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 2500,
        partialResults: true,
        serviceStatuses: [
          { service: 'VolunteerHub', status: 'healthy', responseTime: 800 },
          { service: 'JustServe', status: 'error', responseTime: null },
          { service: 'Idealist', status: 'timeout', responseTime: null }
        ],
        errors: [
          { source: 'JustServe', message: 'Service temporarily unavailable', type: 'server_error', retryable: true },
          { source: 'Idealist', message: 'Request timeout after 5000ms', type: 'timeout', retryable: true }
        ]
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Perform search
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Wait for partial results
      await waitFor(() => {
        expect(screen.getByText('Found 1 opportunities from 3 sources')).toBeInTheDocument();
      });

      // Verify partial results warning
      expect(screen.getByText(/2 source\(s\) had issues/)).toBeInTheDocument();
      
      // Verify service status indicators
      expect(screen.getByText('✓ VolunteerHub')).toBeInTheDocument();
      expect(screen.getByText('⚠ JustServe')).toBeInTheDocument();
      expect(screen.getByText('⚠ Idealist')).toBeInTheDocument();

      // Verify results are still displayed
      expect(screen.getByText('Community Garden')).toBeInTheDocument();

      // Test retry functionality for failed sources
      mockSearchController.retryFailedSources.mockResolvedValue({
        opportunities: [
          {
            id: '1',
            source: 'VolunteerHub',
            title: 'Community Garden',
            organization: 'Green Thumb Society',
            description: 'Help maintain community garden',
            location: 'New York, NY',
            city: 'New York',
            country: 'USA',
            type: 'in-person',
            cause: 'Environment',
            skills: ['gardening'],
            timeCommitment: '3 hours',
            date: '2024-02-15',
            participants: 10,
            image: 'https://example.com/garden.jpg',
            contactInfo: { email: 'garden@greenthumb.org' },
            externalUrl: 'https://greenthumb.org/volunteer',
            lastUpdated: new Date(),
            verified: true,
            distance: 1.2
          },
          {
            id: '2',
            source: 'JustServe',
            title: 'Food Drive',
            organization: 'Local Food Bank',
            description: 'Collect food donations',
            location: 'Brooklyn, NY',
            city: 'Brooklyn',
            country: 'USA',
            type: 'in-person',
            cause: 'Hunger',
            skills: ['organization'],
            timeCommitment: '4 hours',
            date: '2024-02-20',
            participants: 20,
            image: 'https://example.com/food-drive.jpg',
            contactInfo: { email: 'volunteer@foodbank.org' },
            externalUrl: 'https://foodbank.org/volunteer',
            lastUpdated: new Date(),
            verified: true,
            distance: 3.5
          }
        ],
        searchLocation: { city: 'New York', state: 'NY', country: 'USA', formattedAddress: 'New York, NY, USA' },
        totalResults: 2,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 1200,
        partialResults: false,
        serviceStatuses: []
      });

      const retryButton = screen.getByText('Retry Failed Sources');
      await user.click(retryButton);

      await waitFor(() => {
        expect(screen.getByText('Found 2 opportunities from 3 sources')).toBeInTheDocument();
      });

      expect(screen.getByText('Food Drive')).toBeInTheDocument();
    });

    it('should handle rate limiting errors with appropriate messaging', async () => {
      const user = userEvent.setup();
      
      // Mock rate limiting error
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: { city: 'New York', country: 'USA', formattedAddress: 'New York, USA' },
        totalResults: 0,
        sources: ['VolunteerHub', 'JustServe'],
        responseTime: 300,
        partialResults: true,
        serviceStatuses: [],
        errors: [
          { 
            source: 'VolunteerHub', 
            message: 'Rate limit exceeded. Please try again in 60 seconds.', 
            type: 'rate_limit', 
            retryable: true,
            retryAfter: 60000
          },
          { 
            source: 'JustServe', 
            message: 'Too many requests. Please wait before retrying.', 
            type: 'rate_limit', 
            retryable: true 
          }
        ]
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/2 source\(s\) had issues/)).toBeInTheDocument();
      });

      // Verify rate limit specific messaging
      expect(screen.getByText(/Rate limit exceeded/)).toBeInTheDocument();
      expect(screen.getByText(/Too many requests/)).toBeInTheDocument();
    });

    it('should handle authentication errors', async () => {
      const user = userEvent.setup();
      
      // Mock authentication error
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: { city: 'New York', country: 'USA', formattedAddress: 'New York, USA' },
        totalResults: 0,
        sources: ['VolunteerHub'],
        responseTime: 200,
        partialResults: true,
        serviceStatuses: [],
        errors: [
          { 
            source: 'VolunteerHub', 
            message: 'Invalid API key or authentication failed', 
            type: 'authentication', 
            retryable: false 
          }
        ]
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/1 source\(s\) had issues/)).toBeInTheDocument();
      });

      expect(screen.getByText(/Invalid API key or authentication failed/)).toBeInTheDocument();
      
      // Verify retry button is not shown for non-retryable errors
      expect(screen.queryByText('Retry Failed Sources')).not.toBeInTheDocument();
    });
  });

  describe('Geolocation Failures', () => {
    it('should handle geolocation permission denied', async () => {
      const user = userEvent.setup();
      
      // Mock geolocation permission denied
      mockGeolocationService.getCurrentLocationWithFallback.mockRejectedValue(
        new Error('User denied geolocation permission')
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const useLocationButton = screen.getByTitle('Use my current location');
      await user.click(useLocationButton);

      await waitFor(() => {
        expect(screen.getByText(/Unable to access your location/)).toBeInTheDocument();
      });

      expect(screen.getByText(/Please check your browser permissions/)).toBeInTheDocument();
      
      // Verify location input remains empty
      const locationInput = screen.getByTestId('location-input');
      expect(locationInput).toHaveValue('');
    });

    it('should handle geolocation timeout', async () => {
      const user = userEvent.setup();
      
      // Mock geolocation timeout
      mockGeolocationService.getCurrentLocationWithFallback.mockRejectedValue(
        new Error('Geolocation request timed out')
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const useLocationButton = screen.getByTitle('Use my current location');
      await user.click(useLocationButton);

      await waitFor(() => {
        expect(screen.getByText(/Unable to get your current location/)).toBeInTheDocument();
      });

      expect(screen.getByText(/Please enter a location manually/)).toBeInTheDocument();
    });

    it('should handle geolocation unavailable', async () => {
      const user = userEvent.setup();
      
      // Mock geolocation not supported
      mockGeolocationService.getCurrentLocationWithFallback.mockRejectedValue(
        new Error('Geolocation is not supported by this browser')
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const useLocationButton = screen.getByTitle('Use my current location');
      await user.click(useLocationButton);

      await waitFor(() => {
        expect(screen.getByText(/Unable to access your location/)).toBeInTheDocument();
      });
    });

    it('should handle reverse geocoding failure after successful geolocation', async () => {
      const user = userEvent.setup();
      
      // Mock successful geolocation but failed reverse geocoding
      mockGeolocationService.getCurrentLocationWithFallback.mockResolvedValue({
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
        address: { city: 'Unknown', country: 'Unknown', formattedAddress: 'Unknown Location' },
        accuracy: 100
      });

      mockGeocodingService.reverseGeocode.mockRejectedValue(
        new Error('Reverse geocoding failed')
      );

      // Mock successful search with coordinates
      mockSearchController.performSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: { city: 'Unknown', country: 'Unknown', formattedAddress: '40.7128, -74.0060' },
        totalResults: 0,
        sources: ['VolunteerHub'],
        responseTime: 500,
        partialResults: false,
        serviceStatuses: []
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const useLocationButton = screen.getByTitle('Use my current location');
      await user.click(useLocationButton);

      // Should still perform search with coordinates
      await waitFor(() => {
        expect(screen.getByText('Found 0 opportunities from 1 sources')).toBeInTheDocument();
      });

      // Location input should show coordinates as fallback
      const locationInput = screen.getByTestId('location-input');
      expect(locationInput).toHaveValue('40.7128, -74.0060');
    });
  });

  describe('Network and Connectivity Issues', () => {
    it('should handle network connectivity loss', async () => {
      const user = userEvent.setup();
      
      // Mock network error
      mockSearchController.performSmartSearch.mockRejectedValue(
        new Error('Network request failed: No internet connection')
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Search Failed')).toBeInTheDocument();
      });

      expect(screen.getByText(/Network request failed/)).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should handle DNS resolution failures', async () => {
      const user = userEvent.setup();
      
      // Mock DNS error
      mockSearchController.performSmartSearch.mockRejectedValue(
        new Error('DNS resolution failed for api.volunteer.org')
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Search Failed')).toBeInTheDocument();
      });

      expect(screen.getByText(/DNS resolution failed/)).toBeInTheDocument();
    });

    it('should handle slow network with timeout', async () => {
      const user = userEvent.setup();
      
      // Mock timeout error
      mockSearchController.performSmartSearch.mockRejectedValue(
        new Error('Request timeout: Search took longer than 30 seconds')
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Search Failed')).toBeInTheDocument();
      });

      expect(screen.getByText(/Request timeout/)).toBeInTheDocument();
    });
  });

  describe('Data Validation and Edge Cases', () => {
    it('should handle malformed API responses', async () => {
      const user = userEvent.setup();
      
      // Mock search with malformed data
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [
          {
            id: '1',
            source: 'VolunteerHub',
            title: '', // Empty title
            organization: null, // Null organization
            description: undefined, // Undefined description
            location: 'New York, NY',
            city: 'New York',
            country: 'USA',
            type: 'in-person',
            cause: 'Environment',
            skills: null, // Null skills array
            timeCommitment: '',
            date: 'invalid-date', // Invalid date
            participants: -1, // Invalid participant count
            image: 'not-a-url',
            contactInfo: null,
            externalUrl: '',
            lastUpdated: null,
            verified: undefined
          } as any
        ],
        searchLocation: { city: 'New York', country: 'USA', formattedAddress: 'New York, USA' },
        totalResults: 1,
        sources: ['VolunteerHub'],
        responseTime: 500,
        partialResults: false,
        serviceStatuses: []
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Found 1 opportunities from 1 sources')).toBeInTheDocument();
      });

      // App should handle malformed data gracefully
      // The opportunity should still be displayed with fallback values
      const opportunityCards = screen.getAllByTestId(/opportunity-card/);
      expect(opportunityCards).toHaveLength(1);
    });

    it('should handle empty location input gracefully', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Try to search with empty location
      const searchButton = screen.getByRole('button', { name: /search/i });
      expect(searchButton).toBeDisabled();

      // Enter whitespace only
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, '   ');

      // Button should still be disabled
      expect(searchButton).toBeDisabled();
    });

    it('should handle very long location names', async () => {
      const user = userEvent.setup();
      
      const veryLongLocation = 'A'.repeat(1000); // 1000 character location name
      
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: { city: veryLongLocation, country: 'Unknown', formattedAddress: veryLongLocation },
        totalResults: 0,
        sources: ['VolunteerHub'],
        responseTime: 500,
        partialResults: false,
        serviceStatuses: []
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, veryLongLocation);
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Found 0 opportunities from 1 sources')).toBeInTheDocument();
      });

      // Should handle long location names without crashing
      expect(mockSearchController.performSmartSearch).toHaveBeenCalledWith(
        veryLongLocation,
        25,
        expect.any(Object)
      );
    });

    it('should handle special characters in location input', async () => {
      const user = userEvent.setup();
      
      const specialCharLocation = 'São Paulo, Brasil (South America) - 2024!@#$%^&*()';
      
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: { city: 'São Paulo', country: 'Brasil', formattedAddress: specialCharLocation },
        totalResults: 0,
        sources: ['VolunteerHub'],
        responseTime: 500,
        partialResults: false,
        serviceStatuses: []
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, specialCharLocation);
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Found 0 opportunities from 1 sources')).toBeInTheDocument();
      });

      expect(mockSearchController.performSmartSearch).toHaveBeenCalledWith(
        specialCharLocation,
        25,
        expect.any(Object)
      );
    });
  });

  describe('Browser Compatibility Issues', () => {
    it('should handle localStorage unavailability', async () => {
      const user = userEvent.setup();
      
      // Mock localStorage errors
      mockSearchController.loadSearchPreferences.mockImplementation(() => {
        throw new Error('localStorage is not available');
      });
      
      mockSearchController.saveSearchPreferences.mockImplementation(() => {
        throw new Error('localStorage is not available');
      });

      // Should not crash the app
      render(<App />);

      // App should still function without preferences
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');

      // Should be able to search despite localStorage issues
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: { city: 'New York', country: 'USA', formattedAddress: 'New York, USA' },
        totalResults: 0,
        sources: ['VolunteerHub'],
        responseTime: 500,
        partialResults: false,
        serviceStatuses: []
      });

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Found 0 opportunities from 1 sources')).toBeInTheDocument();
      });
    });

    it('should handle fetch API unavailability', async () => {
      const user = userEvent.setup();
      
      // Mock fetch unavailable
      mockSearchController.performSmartSearch.mockRejectedValue(
        new Error('fetch is not defined')
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Search Failed')).toBeInTheDocument();
      });

      expect(screen.getByText(/fetch is not defined/)).toBeInTheDocument();
    });
  });
});