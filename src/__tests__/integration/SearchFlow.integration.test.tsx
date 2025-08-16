import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import App from '../../App';
import { searchController } from '../../services/SearchController';
import { GeocodingService } from '../../services/geocodingService';
import { GeolocationService } from '../../services/geolocationService';
import { MultiLocationService } from '../../services/MultiLocationService';
import { VolunteerOpportunity } from '../../types/volunteer';
import { Coordinates, LocationInfo } from '../../types/location';

// Mock all external services
vi.mock('../../services/SearchController');
vi.mock('../../services/geocodingService');
vi.mock('../../services/geolocationService');
vi.mock('../../services/MultiLocationService');
vi.mock('../../services/api/APIServiceRegistry');
vi.mock('../../services/api/adapters/VolunteerHubAdapter');
vi.mock('../../services/api/adapters/JustServeAdapter');
vi.mock('../../services/api/adapters/IdealistAdapter');

// Mock LocationInput component to avoid complex geolocation setup
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

describe('End-to-End Search Flow Integration Tests', () => {
  const mockSearchController = searchController as any;
  const mockGeocodingService = new GeocodingService() as any;
  const mockGeolocationService = new GeolocationService() as any;
  const mockMultiLocationService = new MultiLocationService() as any;

  // Mock data
  const mockCoordinates: Coordinates = { latitude: 40.7128, longitude: -74.0060 };
  const mockLocationInfo: LocationInfo = {
    city: 'New York',
    state: 'NY',
    country: 'United States',
    formattedAddress: 'New York, NY, United States'
  };

  const mockOpportunities: VolunteerOpportunity[] = [
    {
      id: '1',
      source: 'VolunteerHub',
      title: 'Beach Cleanup Volunteer',
      organization: 'Ocean Conservation Society',
      description: 'Help clean up our local beaches and protect marine life.',
      location: 'New York, NY',
      city: 'New York',
      country: 'United States',
      type: 'in-person',
      cause: 'Environment',
      skills: ['teamwork', 'physical activity'],
      timeCommitment: '4 hours',
      date: '2024-02-15',
      participants: 25,
      image: 'https://example.com/beach-cleanup.jpg',
      contactInfo: { email: 'volunteer@ocean.org', website: 'https://ocean.org' },
      externalUrl: 'https://ocean.org/volunteer/beach-cleanup',
      lastUpdated: new Date('2024-01-01'),
      verified: true,
      distance: 2.5
    },
    {
      id: '2',
      source: 'JustServe',
      title: 'Food Bank Assistant',
      organization: 'Community Food Bank',
      description: 'Sort and distribute food to families in need.',
      location: 'Brooklyn, NY',
      city: 'Brooklyn',
      country: 'United States',
      type: 'in-person',
      cause: 'Hunger',
      skills: ['organization', 'customer service'],
      timeCommitment: '3 hours',
      date: '2024-02-20',
      participants: 15,
      image: 'https://example.com/food-bank.jpg',
      contactInfo: { email: 'help@foodbank.org', phone: '555-0123' },
      externalUrl: 'https://foodbank.org/volunteer',
      lastUpdated: new Date('2024-01-02'),
      verified: true,
      distance: 5.2
    },
    {
      id: '3',
      source: 'Idealist',
      title: 'Virtual Tutoring',
      organization: 'Education for All',
      description: 'Provide online tutoring for students in math and science.',
      location: 'Virtual',
      city: 'Virtual',
      country: 'Virtual',
      type: 'virtual',
      cause: 'Education',
      skills: ['teaching', 'math', 'science'],
      timeCommitment: '2 hours/week',
      date: '2024-02-10',
      participants: 50,
      image: 'https://example.com/tutoring.jpg',
      contactInfo: { email: 'tutor@education.org' },
      externalUrl: 'https://education.org/virtual-tutoring',
      lastUpdated: new Date('2024-01-03'),
      verified: true
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock implementations
    mockSearchController.loadSearchPreferences.mockReturnValue(null);
    mockSearchController.saveSearchPreferences.mockImplementation(() => {});
    mockSearchController.clearSearchPreferences.mockImplementation(() => {});
    mockSearchController.performSearch.mockResolvedValue({
      opportunities: mockOpportunities,
      searchLocation: mockLocationInfo,
      totalResults: mockOpportunities.length,
      sources: ['VolunteerHub', 'JustServe', 'Idealist'],
      responseTime: 1500,
      partialResults: false,
      serviceStatuses: []
    });
    mockSearchController.performSmartSearch.mockResolvedValue({
      opportunities: mockOpportunities,
      searchLocation: mockLocationInfo,
      totalResults: mockOpportunities.length,
      sources: ['VolunteerHub', 'JustServe', 'Idealist'],
      responseTime: 1500,
      partialResults: false,
      serviceStatuses: []
    });

    mockGeocodingService.geocodeLocation.mockResolvedValue(mockCoordinates);
    mockGeocodingService.reverseGeocode.mockResolvedValue(mockLocationInfo);
    
    mockGeolocationService.getCurrentLocationWithFallback.mockResolvedValue({
      coordinates: mockCoordinates,
      address: mockLocationInfo,
      accuracy: 100
    });

    mockMultiLocationService.isMultiLocationInput.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Complete Search Flow', () => {
    it('should complete full search flow from location input to results display', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Wait for app to initialize
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Step 1: Enter location
      const locationInput = screen.getByTestId('location-input');
      await user.clear(locationInput);
      await user.type(locationInput, 'New York, NY');

      // Step 2: Select search radius
      const radiusSelector = screen.getByDisplayValue('25 miles');
      await user.selectOptions(radiusSelector, '50');

      // Step 3: Apply filters
      const environmentFilter = screen.getByLabelText('Environment');
      await user.click(environmentFilter);

      // Step 4: Perform search
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Step 5: Verify loading state
      expect(screen.getByText(/searching/i)).toBeInTheDocument();

      // Step 6: Wait for results
      await waitFor(() => {
        expect(screen.getByText('Found 3 opportunities from 3 sources')).toBeInTheDocument();
      }, { timeout: 5000 });

      // Step 7: Verify search was called with correct parameters
      expect(mockSearchController.performSmartSearch).toHaveBeenCalledWith(
        'New York, NY',
        50,
        expect.objectContaining({
          causes: ['Environment'],
          type: 'both'
        })
      );

      // Step 8: Verify results are displayed
      expect(screen.getByText('Beach Cleanup Volunteer')).toBeInTheDocument();
      expect(screen.getByText('Food Bank Assistant')).toBeInTheDocument();
      expect(screen.getByText('Virtual Tutoring')).toBeInTheDocument();

      // Step 9: Verify distance information is shown
      expect(screen.getByText('2.5 miles away')).toBeInTheDocument();
      expect(screen.getByText('5.2 miles away')).toBeInTheDocument();

      // Step 10: Verify preferences were saved
      expect(mockSearchController.saveSearchPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          lastLocation: expect.objectContaining({
            city: 'New York',
            state: 'NY',
            country: 'United States'
          }),
          preferredRadius: 50,
          preferredCauses: ['Environment']
        })
      );
    });

    it('should handle geolocation-based search flow', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Wait for app initialization
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Click "Use My Location" button
      const useLocationButton = screen.getByTitle('Use my current location');
      await user.click(useLocationButton);

      // Verify loading state
      expect(screen.getByText(/searching/i)).toBeInTheDocument();

      // Wait for geolocation and search to complete
      await waitFor(() => {
        expect(screen.getByText('Found 3 opportunities from 3 sources')).toBeInTheDocument();
      }, { timeout: 5000 });

      // Verify geolocation was called
      expect(mockGeolocationService.getCurrentLocationWithFallback).toHaveBeenCalled();

      // Verify location was populated
      const locationInput = screen.getByTestId('location-input');
      expect(locationInput).toHaveValue('New York, NY, United States');

      // Verify search was performed with coordinates
      expect(mockSearchController.performSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          location: mockCoordinates
        })
      );
    });

    it('should handle multi-location search flow', async () => {
      const user = userEvent.setup();
      
      // Setup multi-location mocks
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: mockOpportunities,
        searchLocation: { city: 'New York and Los Angeles', country: 'Multiple', formattedAddress: 'New York, Los Angeles' },
        totalResults: mockOpportunities.length,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 2000,
        partialResults: false,
        serviceStatuses: [],
        locationGroups: [
          {
            location: {
              originalInput: 'New York',
              locationInfo: mockLocationInfo,
              coordinates: mockCoordinates,
              index: 0
            },
            opportunities: [mockOpportunities[0], mockOpportunities[1]],
            searchSuccess: true
          },
          {
            location: {
              originalInput: 'Los Angeles',
              locationInfo: { city: 'Los Angeles', state: 'CA', country: 'United States', formattedAddress: 'Los Angeles, CA, United States' },
              coordinates: { latitude: 34.0522, longitude: -118.2437 },
              index: 1
            },
            opportunities: [mockOpportunities[2]],
            searchSuccess: true
          }
        ],
        searchStatistics: {
          totalLocations: 2,
          successfulLocations: 2,
          failedLocations: 0,
          totalOpportunities: 3,
          averageOpportunitiesPerLocation: 1.5,
          locationBreakdown: [
            { location: 'New York', count: 2 },
            { location: 'Los Angeles', count: 1 }
          ]
        }
      });

      render(<App />);

      // Wait for initialization
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Enter multiple locations
      const locationInput = screen.getByTestId('location-input');
      await user.clear(locationInput);
      await user.type(locationInput, 'New York, Los Angeles');

      // Perform search
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText(/Found 3 opportunities across 2 locations/)).toBeInTheDocument();
      }, { timeout: 5000 });

      // Verify multi-location search was called
      expect(mockSearchController.performSmartSearch).toHaveBeenCalledWith(
        'New York, Los Angeles',
        25,
        expect.objectContaining({
          causes: [],
          type: 'both'
        })
      );

      // Verify location grouping is displayed
      expect(screen.getByText('New York')).toBeInTheDocument();
      expect(screen.getByText('Los Angeles')).toBeInTheDocument();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle API failures gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock API failure
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: mockLocationInfo,
        totalResults: 0,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 1000,
        partialResults: true,
        serviceStatuses: [],
        errors: [
          { source: 'VolunteerHub', message: 'Service temporarily unavailable', type: 'server_error', retryable: true },
          { source: 'JustServe', message: 'Rate limit exceeded', type: 'rate_limit', retryable: true }
        ]
      });

      render(<App />);

      // Wait for initialization
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
        expect(screen.getByText(/2 source\(s\) had issues/)).toBeInTheDocument();
      });

      // Verify error details are shown
      expect(screen.getByText('⚠ VolunteerHub')).toBeInTheDocument();
      expect(screen.getByText('⚠ JustServe')).toBeInTheDocument();
      expect(screen.getByText('✓ Idealist')).toBeInTheDocument();

      // Test retry functionality
      mockSearchController.retryFailedSources.mockResolvedValue({
        opportunities: mockOpportunities,
        searchLocation: mockLocationInfo,
        totalResults: mockOpportunities.length,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 800,
        partialResults: false,
        serviceStatuses: []
      });

      const retryButton = screen.getByText('Retry Failed Sources');
      await user.click(retryButton);

      // Wait for retry to complete
      await waitFor(() => {
        expect(screen.getByText('Found 3 opportunities from 3 sources')).toBeInTheDocument();
      });

      expect(mockSearchController.retryFailedSources).toHaveBeenCalled();
    });

    it('should handle geolocation failures', async () => {
      const user = userEvent.setup();
      
      // Mock geolocation failure
      mockGeolocationService.getCurrentLocationWithFallback.mockRejectedValue(
        new Error('Geolocation permission denied')
      );

      render(<App />);

      // Wait for initialization
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Try to use current location
      const useLocationButton = screen.getByTitle('Use my current location');
      await user.click(useLocationButton);

      // Wait for error message
      await waitFor(() => {
        expect(screen.getByText(/Unable to access your location/)).toBeInTheDocument();
      });

      // Verify error message provides guidance
      expect(screen.getByText(/Please check your browser permissions/)).toBeInTheDocument();
    });

    it('should handle network connectivity issues', async () => {
      const user = userEvent.setup();
      
      // Mock network failure
      mockSearchController.performSmartSearch.mockRejectedValue(
        new Error('Network request failed')
      );

      render(<App />);

      // Wait for initialization
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

      expect(screen.getByText('Network request failed')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('should handle empty search results', async () => {
      const user = userEvent.setup();
      
      // Mock empty results
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: mockLocationInfo,
        totalResults: 0,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 500,
        partialResults: false,
        serviceStatuses: []
      });

      render(<App />);

      // Wait for initialization
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Perform search
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Remote Location');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('Found 0 opportunities from 3 sources')).toBeInTheDocument();
      });

      // Verify no results message
      expect(screen.getByText(/No volunteer opportunities found/)).toBeInTheDocument();
    });
  });

  describe('Preference Management', () => {
    it('should load and apply saved preferences on startup', async () => {
      // Mock saved preferences
      const savedPreferences = {
        lastLocation: {
          city: 'Boston',
          state: 'MA',
          country: 'United States',
          formattedAddress: 'Boston, MA, United States'
        },
        preferredRadius: 50,
        preferredCauses: ['Education', 'Health & Medicine'],
        preferredType: 'in-person' as const
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(savedPreferences);

      render(<App />);

      // Wait for preferences to load and be applied
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('Boston, MA, United States');
      });

      // Verify radius is set
      expect(screen.getByDisplayValue('50 miles')).toBeInTheDocument();

      // Verify causes are selected
      expect(screen.getByLabelText('Education')).toBeChecked();
      expect(screen.getByLabelText('Health & Medicine')).toBeChecked();

      // Verify type is selected
      expect(screen.getByDisplayValue('In-Person')).toBeInTheDocument();
    });

    it('should save preferences when search parameters change', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Wait for initialization
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Change location
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Seattle, WA');

      // Change radius
      const radiusSelector = screen.getByDisplayValue('25 miles');
      await user.selectOptions(radiusSelector, '100');

      // Change cause filter
      const healthFilter = screen.getByLabelText('Health & Medicine');
      await user.click(healthFilter);

      // Wait for preferences to be saved
      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            lastLocation: expect.objectContaining({
              city: 'Seattle',
              state: 'WA',
              country: 'United States'
            }),
            preferredRadius: 100,
            preferredCauses: ['Health & Medicine']
          })
        );
      });
    });

    it('should clear preferences when location is cleared', async () => {
      const user = userEvent.setup();
      
      // Start with saved preferences
      mockSearchController.loadSearchPreferences.mockReturnValue({
        lastLocation: mockLocationInfo,
        preferredRadius: 25,
        preferredCauses: [],
        preferredType: 'both'
      });

      render(<App />);

      // Wait for preferences to load
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('New York, NY, United States');
      });

      // Clear location
      const locationInput = screen.getByTestId('location-input');
      await user.clear(locationInput);

      // Wait for preferences to be cleared
      await waitFor(() => {
        expect(mockSearchController.clearSearchPreferences).toHaveBeenCalled();
      });
    });

    it('should clear preferences when filters are reset', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Wait for initialization
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Set some filters first
      const environmentFilter = screen.getByLabelText('Environment');
      await user.click(environmentFilter);

      // Clear all filters
      const clearFiltersButton = screen.getByText('Clear All Filters');
      await user.click(clearFiltersButton);

      // Wait for preferences to be cleared
      await waitFor(() => {
        expect(mockSearchController.clearSearchPreferences).toHaveBeenCalled();
      });

      // Verify filters are reset
      expect(environmentFilter).not.toBeChecked();
      expect(screen.getByDisplayValue('25 miles')).toBeInTheDocument();
    });
  });

  describe('Filter and Sort Functionality', () => {
    it('should filter results by cause', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Wait for initialization
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Perform initial search
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Wait for results
      await waitFor(() => {
        expect(screen.getByText('Beach Cleanup Volunteer')).toBeInTheDocument();
      });

      // Apply environment filter
      const environmentFilter = screen.getByLabelText('Environment');
      await user.click(environmentFilter);

      // Verify only environment opportunities are shown
      expect(screen.getByText('Beach Cleanup Volunteer')).toBeInTheDocument();
      expect(screen.queryByText('Food Bank Assistant')).not.toBeInTheDocument();
      expect(screen.queryByText('Virtual Tutoring')).not.toBeInTheDocument();
    });

    it('should filter results by opportunity type', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Wait for initialization and perform search
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Virtual Tutoring')).toBeInTheDocument();
      });

      // Filter to only virtual opportunities
      const virtualTypeFilter = screen.getByDisplayValue('All');
      await user.selectOptions(virtualTypeFilter, 'virtual');

      // Verify only virtual opportunities are shown
      expect(screen.getByText('Virtual Tutoring')).toBeInTheDocument();
      expect(screen.queryByText('Beach Cleanup Volunteer')).not.toBeInTheDocument();
      expect(screen.queryByText('Food Bank Assistant')).not.toBeInTheDocument();
    });

    it('should sort results by distance', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Wait for initialization and perform search
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Beach Cleanup Volunteer')).toBeInTheDocument();
      });

      // Verify default distance sorting (closest first)
      const opportunityCards = screen.getAllByTestId(/opportunity-card/);
      const firstCard = opportunityCards[0];
      const secondCard = opportunityCards[1];

      expect(within(firstCard).getByText('Beach Cleanup Volunteer')).toBeInTheDocument();
      expect(within(firstCard).getByText('2.5 miles away')).toBeInTheDocument();
      
      expect(within(secondCard).getByText('Food Bank Assistant')).toBeInTheDocument();
      expect(within(secondCard).getByText('5.2 miles away')).toBeInTheDocument();
    });

    it('should sort results by date', async () => {
      const user = userEvent.setup();
      render(<App />);

      // Wait for initialization and perform search
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText('Beach Cleanup Volunteer')).toBeInTheDocument();
      });

      // Change sort to date
      const dateSortOption = screen.getByLabelText('Date');
      await user.click(dateSortOption);

      // Verify sorting by date (earliest first)
      const opportunityCards = screen.getAllByTestId(/opportunity-card/);
      const firstCard = opportunityCards[0];
      
      // Virtual Tutoring has the earliest date (2024-02-10)
      expect(within(firstCard).getByText('Virtual Tutoring')).toBeInTheDocument();
    });
  });

  describe('Responsive Behavior', () => {
    it('should handle rapid consecutive searches', async () => {
      const user = userEvent.setup();
      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      const searchButton = screen.getByRole('button', { name: /search/i });

      // Perform multiple rapid searches
      await user.type(locationInput, 'New York');
      await user.click(searchButton);
      
      await user.clear(locationInput);
      await user.type(locationInput, 'Los Angeles');
      await user.click(searchButton);
      
      await user.clear(locationInput);
      await user.type(locationInput, 'Chicago');
      await user.click(searchButton);

      // Wait for final search to complete
      await waitFor(() => {
        expect(screen.getByText('Found 3 opportunities from 3 sources')).toBeInTheDocument();
      });

      // Verify the last search was called with Chicago
      expect(mockSearchController.performSmartSearch).toHaveBeenLastCalledWith(
        'Chicago',
        25,
        expect.any(Object)
      );
    });

    it('should disable search button when location is empty', async () => {
      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const searchButton = screen.getByRole('button', { name: /search/i });
      expect(searchButton).toBeDisabled();

      // Enable when location is entered
      const locationInput = screen.getByTestId('location-input');
      await userEvent.type(locationInput, 'New York');

      expect(searchButton).not.toBeDisabled();
    });

    it('should show appropriate loading states during search', async () => {
      const user = userEvent.setup();
      
      // Mock delayed search response
      mockSearchController.performSmartSearch.mockImplementation(() => 
        new Promise(resolve => 
          setTimeout(() => resolve({
            opportunities: mockOpportunities,
            searchLocation: mockLocationInfo,
            totalResults: mockOpportunities.length,
            sources: ['VolunteerHub'],
            responseTime: 2000,
            partialResults: false,
            serviceStatuses: []
          }), 1000)
        )
      );

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York');
      
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Verify loading state
      expect(screen.getByText(/searching/i)).toBeInTheDocument();
      expect(searchButton).toBeDisabled();

      // Wait for search to complete
      await waitFor(() => {
        expect(screen.getByText('Found 3 opportunities from 1 sources')).toBeInTheDocument();
      }, { timeout: 3000 });

      // Verify loading state is cleared
      expect(screen.queryByText(/searching/i)).not.toBeInTheDocument();
      expect(searchButton).not.toBeDisabled();
    });
  });
});