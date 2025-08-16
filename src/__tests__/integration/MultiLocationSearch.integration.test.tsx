import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import App from '../../App';
import { searchController } from '../../services/SearchController';
import { MultiLocationService } from '../../services/MultiLocationService';
import { VolunteerOpportunity } from '../../types/volunteer';
import { LocationInfo } from '../../types/location';

// Mock all external services
vi.mock('../../services/SearchController');
vi.mock('../../services/MultiLocationService');
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

describe('Multi-Location Search Integration Tests', () => {
  const mockSearchController = searchController as any;
  const mockMultiLocationService = new MultiLocationService() as any;

  // Mock data for different locations
  const newYorkOpportunities: VolunteerOpportunity[] = [
    {
      id: 'ny1',
      source: 'VolunteerHub',
      title: 'NYC Beach Cleanup',
      organization: 'NYC Environmental Group',
      description: 'Clean up Coney Island beach',
      location: 'Brooklyn, NY',
      city: 'Brooklyn',
      country: 'United States',
      type: 'in-person',
      cause: 'Environment',
      skills: ['teamwork'],
      timeCommitment: '4 hours',
      date: '2024-02-15',
      participants: 30,
      image: 'https://example.com/nyc-beach.jpg',
      contactInfo: { email: 'volunteer@nycenv.org' },
      externalUrl: 'https://nycenv.org/beach-cleanup',
      lastUpdated: new Date(),
      verified: true,
      distance: 2.1
    },
    {
      id: 'ny2',
      source: 'JustServe',
      title: 'Manhattan Food Bank',
      organization: 'NYC Food Bank',
      description: 'Sort and distribute food in Manhattan',
      location: 'Manhattan, NY',
      city: 'Manhattan',
      country: 'United States',
      type: 'in-person',
      cause: 'Hunger',
      skills: ['organization'],
      timeCommitment: '3 hours',
      date: '2024-02-20',
      participants: 15,
      image: 'https://example.com/manhattan-food.jpg',
      contactInfo: { email: 'help@nycfoodbank.org' },
      externalUrl: 'https://nycfoodbank.org/volunteer',
      lastUpdated: new Date(),
      verified: true,
      distance: 1.5
    }
  ];

  const losAngelesOpportunities: VolunteerOpportunity[] = [
    {
      id: 'la1',
      source: 'Idealist',
      title: 'LA Community Garden',
      organization: 'LA Green Spaces',
      description: 'Maintain community garden in downtown LA',
      location: 'Los Angeles, CA',
      city: 'Los Angeles',
      country: 'United States',
      type: 'in-person',
      cause: 'Environment',
      skills: ['gardening', 'physical activity'],
      timeCommitment: '5 hours',
      date: '2024-02-18',
      participants: 20,
      image: 'https://example.com/la-garden.jpg',
      contactInfo: { email: 'garden@lagreenspaces.org' },
      externalUrl: 'https://lagreenspaces.org/garden',
      lastUpdated: new Date(),
      verified: true,
      distance: 3.2
    }
  ];

  const chicagoOpportunities: VolunteerOpportunity[] = [
    {
      id: 'chi1',
      source: 'VolunteerHub',
      title: 'Chicago Literacy Program',
      organization: 'Chicago Education Alliance',
      description: 'Tutor adults in reading and writing',
      location: 'Chicago, IL',
      city: 'Chicago',
      country: 'United States',
      type: 'in-person',
      cause: 'Education',
      skills: ['teaching', 'patience'],
      timeCommitment: '2 hours/week',
      date: '2024-02-12',
      participants: 25,
      image: 'https://example.com/chicago-literacy.jpg',
      contactInfo: { email: 'tutor@chicagoedu.org' },
      externalUrl: 'https://chicagoedu.org/literacy',
      lastUpdated: new Date(),
      verified: true,
      distance: 4.1
    }
  ];

  const mockLocationInfo = {
    newYork: { city: 'New York', state: 'NY', country: 'United States', formattedAddress: 'New York, NY, United States' },
    losAngeles: { city: 'Los Angeles', state: 'CA', country: 'United States', formattedAddress: 'Los Angeles, CA, United States' },
    chicago: { city: 'Chicago', state: 'IL', country: 'United States', formattedAddress: 'Chicago, IL, United States' }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockSearchController.loadSearchPreferences.mockReturnValue(null);
    mockSearchController.saveSearchPreferences.mockImplementation(() => {});
    mockSearchController.clearSearchPreferences.mockImplementation(() => {});
    
    // Default to single location
    mockMultiLocationService.isMultiLocationInput.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Two Location Search', () => {
    it('should successfully search across two locations', async () => {
      const user = userEvent.setup();
      
      // Setup multi-location mocks
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      const allOpportunities = [
        ...newYorkOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.newYork,
          searchCoordinates: { latitude: 40.7128, longitude: -74.0060 },
          originalLocationInput: 'New York'
        })),
        ...losAngelesOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.losAngeles,
          searchCoordinates: { latitude: 34.0522, longitude: -118.2437 },
          originalLocationInput: 'Los Angeles'
        }))
      ];

      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: allOpportunities,
        searchLocation: { city: 'New York and Los Angeles', country: 'Multiple', formattedAddress: 'New York, Los Angeles' },
        totalResults: 3,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 2500,
        partialResults: false,
        serviceStatuses: [],
        locationGroups: [
          {
            location: {
              originalInput: 'New York',
              locationInfo: mockLocationInfo.newYork,
              coordinates: { latitude: 40.7128, longitude: -74.0060 },
              index: 0
            },
            opportunities: newYorkOpportunities,
            searchSuccess: true
          },
          {
            location: {
              originalInput: 'Los Angeles',
              locationInfo: mockLocationInfo.losAngeles,
              coordinates: { latitude: 34.0522, longitude: -118.2437 },
              index: 1
            },
            opportunities: losAngelesOpportunities,
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

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Enter multiple locations
      const locationInput = screen.getByTestId('location-input');
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

      // Verify location groups are displayed
      expect(screen.getByText('New York')).toBeInTheDocument();
      expect(screen.getByText('Los Angeles')).toBeInTheDocument();

      // Verify opportunities from both locations are shown
      expect(screen.getByText('NYC Beach Cleanup')).toBeInTheDocument();
      expect(screen.getByText('Manhattan Food Bank')).toBeInTheDocument();
      expect(screen.getByText('LA Community Garden')).toBeInTheDocument();

      // Verify location context is shown for each opportunity
      const nyBeachCleanup = screen.getByText('NYC Beach Cleanup').closest('[data-testid*="opportunity-card"]');
      expect(within(nyBeachCleanup!).getByText(/New York/)).toBeInTheDocument();

      const laGarden = screen.getByText('LA Community Garden').closest('[data-testid*="opportunity-card"]');
      expect(within(laGarden!).getByText(/Los Angeles/)).toBeInTheDocument();
    });

    it('should handle partial failures in multi-location search', async () => {
      const user = userEvent.setup();
      
      // Setup multi-location with one failure
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: newYorkOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.newYork,
          searchCoordinates: { latitude: 40.7128, longitude: -74.0060 },
          originalLocationInput: 'New York'
        })),
        searchLocation: { city: 'New York and Invalid Location', country: 'Multiple', formattedAddress: 'New York, Invalid Location' },
        totalResults: 2,
        sources: ['VolunteerHub', 'JustServe'],
        responseTime: 3000,
        partialResults: true,
        serviceStatuses: [],
        locationGroups: [
          {
            location: {
              originalInput: 'New York',
              locationInfo: mockLocationInfo.newYork,
              coordinates: { latitude: 40.7128, longitude: -74.0060 },
              index: 0
            },
            opportunities: newYorkOpportunities,
            searchSuccess: true
          },
          {
            location: {
              originalInput: 'Invalid Location',
              locationInfo: { city: 'Invalid', country: 'Unknown', formattedAddress: 'Invalid Location' },
              coordinates: { latitude: 0, longitude: 0 },
              index: 1
            },
            opportunities: [],
            searchSuccess: false,
            error: 'Unable to geocode location: Invalid Location'
          }
        ],
        searchStatistics: {
          totalLocations: 2,
          successfulLocations: 1,
          failedLocations: 1,
          totalOpportunities: 2,
          averageOpportunitiesPerLocation: 2,
          locationBreakdown: [
            { location: 'New York', count: 2 },
            { location: 'Invalid', count: 0 }
          ]
        },
        errors: [
          { source: 'geocoding', message: 'Unable to geocode location: Invalid Location', type: 'geocoding_error', retryable: false }
        ]
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York, Invalid Location');

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/Found 2 opportunities across 1 locations/)).toBeInTheDocument();
      });

      // Verify partial results are shown
      expect(screen.getByText('NYC Beach Cleanup')).toBeInTheDocument();
      expect(screen.getByText('Manhattan Food Bank')).toBeInTheDocument();

      // Verify error information is displayed
      expect(screen.getByText(/1 source\(s\) had issues/)).toBeInTheDocument();
      expect(screen.getByText(/Unable to geocode location: Invalid Location/)).toBeInTheDocument();

      // Verify successful location is still shown
      expect(screen.getByText('New York')).toBeInTheDocument();
    });
  });

  describe('Three Location Search', () => {
    it('should successfully search across three locations', async () => {
      const user = userEvent.setup();
      
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      const allOpportunities = [
        ...newYorkOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.newYork,
          searchCoordinates: { latitude: 40.7128, longitude: -74.0060 },
          originalLocationInput: 'New York'
        })),
        ...losAngelesOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.losAngeles,
          searchCoordinates: { latitude: 34.0522, longitude: -118.2437 },
          originalLocationInput: 'Los Angeles'
        })),
        ...chicagoOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.chicago,
          searchCoordinates: { latitude: 41.8781, longitude: -87.6298 },
          originalLocationInput: 'Chicago'
        }))
      ];

      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: allOpportunities,
        searchLocation: { city: 'New York, Los Angeles, and Chicago', country: 'Multiple', formattedAddress: 'New York, Los Angeles, Chicago' },
        totalResults: 4,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 3500,
        partialResults: false,
        serviceStatuses: [],
        locationGroups: [
          {
            location: {
              originalInput: 'New York',
              locationInfo: mockLocationInfo.newYork,
              coordinates: { latitude: 40.7128, longitude: -74.0060 },
              index: 0
            },
            opportunities: newYorkOpportunities,
            searchSuccess: true
          },
          {
            location: {
              originalInput: 'Los Angeles',
              locationInfo: mockLocationInfo.losAngeles,
              coordinates: { latitude: 34.0522, longitude: -118.2437 },
              index: 1
            },
            opportunities: losAngelesOpportunities,
            searchSuccess: true
          },
          {
            location: {
              originalInput: 'Chicago',
              locationInfo: mockLocationInfo.chicago,
              coordinates: { latitude: 41.8781, longitude: -87.6298 },
              index: 2
            },
            opportunities: chicagoOpportunities,
            searchSuccess: true
          }
        ],
        searchStatistics: {
          totalLocations: 3,
          successfulLocations: 3,
          failedLocations: 0,
          totalOpportunities: 4,
          averageOpportunitiesPerLocation: 1.33,
          locationBreakdown: [
            { location: 'New York', count: 2 },
            { location: 'Los Angeles', count: 1 },
            { location: 'Chicago', count: 1 }
          ]
        }
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York, Los Angeles, Chicago');

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/Found 4 opportunities across 3 locations/)).toBeInTheDocument();
      });

      // Verify all three locations are displayed
      expect(screen.getByText('New York')).toBeInTheDocument();
      expect(screen.getByText('Los Angeles')).toBeInTheDocument();
      expect(screen.getByText('Chicago')).toBeInTheDocument();

      // Verify opportunities from all locations
      expect(screen.getByText('NYC Beach Cleanup')).toBeInTheDocument();
      expect(screen.getByText('Manhattan Food Bank')).toBeInTheDocument();
      expect(screen.getByText('LA Community Garden')).toBeInTheDocument();
      expect(screen.getByText('Chicago Literacy Program')).toBeInTheDocument();

      // Verify statistics
      expect(screen.getByText(/3 locations/)).toBeInTheDocument();
    });
  });

  describe('Multi-Location Filtering and Sorting', () => {
    it('should filter multi-location results by cause', async () => {
      const user = userEvent.setup();
      
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      const allOpportunities = [
        ...newYorkOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.newYork,
          searchCoordinates: { latitude: 40.7128, longitude: -74.0060 },
          originalLocationInput: 'New York'
        })),
        ...losAngelesOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.losAngeles,
          searchCoordinates: { latitude: 34.0522, longitude: -118.2437 },
          originalLocationInput: 'Los Angeles'
        }))
      ];

      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: allOpportunities,
        searchLocation: { city: 'New York and Los Angeles', country: 'Multiple', formattedAddress: 'New York, Los Angeles' },
        totalResults: 3,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 2000,
        partialResults: false,
        serviceStatuses: [],
        locationGroups: [
          {
            location: {
              originalInput: 'New York',
              locationInfo: mockLocationInfo.newYork,
              coordinates: { latitude: 40.7128, longitude: -74.0060 },
              index: 0
            },
            opportunities: newYorkOpportunities,
            searchSuccess: true
          },
          {
            location: {
              originalInput: 'Los Angeles',
              locationInfo: mockLocationInfo.losAngeles,
              coordinates: { latitude: 34.0522, longitude: -118.2437 },
              index: 1
            },
            opportunities: losAngelesOpportunities,
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

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York, Los Angeles');

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/Found 3 opportunities across 2 locations/)).toBeInTheDocument();
      });

      // Apply Environment filter
      const environmentFilter = screen.getByLabelText('Environment');
      await user.click(environmentFilter);

      // Should show only environment opportunities from both locations
      expect(screen.getByText('NYC Beach Cleanup')).toBeInTheDocument(); // Environment from NY
      expect(screen.getByText('LA Community Garden')).toBeInTheDocument(); // Environment from LA
      expect(screen.queryByText('Manhattan Food Bank')).not.toBeInTheDocument(); // Hunger from NY, should be filtered out
    });

    it('should sort multi-location results by distance', async () => {
      const user = userEvent.setup();
      
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      // Create opportunities with different distances
      const mixedOpportunities = [
        {
          ...newYorkOpportunities[0], // distance: 2.1
          searchLocation: mockLocationInfo.newYork,
          searchCoordinates: { latitude: 40.7128, longitude: -74.0060 },
          originalLocationInput: 'New York'
        },
        {
          ...newYorkOpportunities[1], // distance: 1.5
          searchLocation: mockLocationInfo.newYork,
          searchCoordinates: { latitude: 40.7128, longitude: -74.0060 },
          originalLocationInput: 'New York'
        },
        {
          ...losAngelesOpportunities[0], // distance: 3.2
          searchLocation: mockLocationInfo.losAngeles,
          searchCoordinates: { latitude: 34.0522, longitude: -118.2437 },
          originalLocationInput: 'Los Angeles'
        }
      ];

      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: mixedOpportunities,
        searchLocation: { city: 'New York and Los Angeles', country: 'Multiple', formattedAddress: 'New York, Los Angeles' },
        totalResults: 3,
        sources: ['VolunteerHub', 'JustServe', 'Idealist'],
        responseTime: 2000,
        partialResults: false,
        serviceStatuses: [],
        locationGroups: [
          {
            location: {
              originalInput: 'New York',
              locationInfo: mockLocationInfo.newYork,
              coordinates: { latitude: 40.7128, longitude: -74.0060 },
              index: 0
            },
            opportunities: newYorkOpportunities,
            searchSuccess: true
          },
          {
            location: {
              originalInput: 'Los Angeles',
              locationInfo: mockLocationInfo.losAngeles,
              coordinates: { latitude: 34.0522, longitude: -118.2437 },
              index: 1
            },
            opportunities: losAngelesOpportunities,
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

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York, Los Angeles');

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/Found 3 opportunities across 2 locations/)).toBeInTheDocument();
      });

      // Verify default distance sorting (closest first across all locations)
      const opportunityCards = screen.getAllByTestId(/opportunity-card/);
      
      // First should be Manhattan Food Bank (1.5 miles)
      expect(within(opportunityCards[0]).getByText('Manhattan Food Bank')).toBeInTheDocument();
      expect(within(opportunityCards[0]).getByText('1.5 miles away')).toBeInTheDocument();
      
      // Second should be NYC Beach Cleanup (2.1 miles)
      expect(within(opportunityCards[1]).getByText('NYC Beach Cleanup')).toBeInTheDocument();
      expect(within(opportunityCards[1]).getByText('2.1 miles away')).toBeInTheDocument();
      
      // Third should be LA Community Garden (3.2 miles)
      expect(within(opportunityCards[2]).getByText('LA Community Garden')).toBeInTheDocument();
      expect(within(opportunityCards[2]).getByText('3.2 miles away')).toBeInTheDocument();
    });
  });

  describe('Multi-Location Edge Cases', () => {
    it('should handle duplicate locations in input', async () => {
      const user = userEvent.setup();
      
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      // Mock that duplicate locations are handled by the service
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: newYorkOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.newYork,
          searchCoordinates: { latitude: 40.7128, longitude: -74.0060 },
          originalLocationInput: 'New York'
        })),
        searchLocation: { city: 'New York', country: 'United States', formattedAddress: 'New York, NY, United States' },
        totalResults: 2,
        sources: ['VolunteerHub', 'JustServe'],
        responseTime: 1500,
        partialResults: false,
        serviceStatuses: [],
        locationGroups: [
          {
            location: {
              originalInput: 'New York',
              locationInfo: mockLocationInfo.newYork,
              coordinates: { latitude: 40.7128, longitude: -74.0060 },
              index: 0
            },
            opportunities: newYorkOpportunities,
            searchSuccess: true
          }
        ],
        searchStatistics: {
          totalLocations: 1, // Duplicates removed
          successfulLocations: 1,
          failedLocations: 0,
          totalOpportunities: 2,
          averageOpportunitiesPerLocation: 2,
          locationBreakdown: [
            { location: 'New York', count: 2 }
          ]
        }
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Enter duplicate locations
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York, New York, NYC');

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/Found 2 opportunities across 1 locations/)).toBeInTheDocument();
      });

      // Should only show New York once
      const newYorkHeaders = screen.getAllByText('New York');
      expect(newYorkHeaders).toHaveLength(1); // Only one location header
    });

    it('should handle very long multi-location input', async () => {
      const user = userEvent.setup();
      
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      // Mock handling of many locations (should be limited)
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: { city: 'Multiple locations', country: 'Multiple', formattedAddress: 'Too many locations' },
        totalResults: 0,
        sources: [],
        responseTime: 500,
        partialResults: false,
        serviceStatuses: [],
        errors: [
          { source: 'validation', message: 'Too many locations specified (maximum 10)', type: 'validation_error', retryable: false }
        ]
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Enter many locations
      const manyLocations = Array.from({length: 15}, (_, i) => `Location${i}`).join(', ');
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, manyLocations);

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/Too many locations specified/)).toBeInTheDocument();
      });
    });

    it('should handle mixed valid and invalid locations', async () => {
      const user = userEvent.setup();
      
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: newYorkOpportunities.map(opp => ({
          ...opp,
          searchLocation: mockLocationInfo.newYork,
          searchCoordinates: { latitude: 40.7128, longitude: -74.0060 },
          originalLocationInput: 'New York'
        })),
        searchLocation: { city: 'New York and Invalid Location', country: 'Multiple', formattedAddress: 'New York, Invalid Location' },
        totalResults: 2,
        sources: ['VolunteerHub', 'JustServe'],
        responseTime: 2000,
        partialResults: true,
        serviceStatuses: [],
        locationGroups: [
          {
            location: {
              originalInput: 'New York',
              locationInfo: mockLocationInfo.newYork,
              coordinates: { latitude: 40.7128, longitude: -74.0060 },
              index: 0
            },
            opportunities: newYorkOpportunities,
            searchSuccess: true
          },
          {
            location: {
              originalInput: 'XYZ123Invalid',
              locationInfo: { city: 'Unknown', country: 'Unknown', formattedAddress: 'XYZ123Invalid' },
              coordinates: { latitude: 0, longitude: 0 },
              index: 1
            },
            opportunities: [],
            searchSuccess: false,
            error: 'Unable to geocode location: XYZ123Invalid'
          }
        ],
        searchStatistics: {
          totalLocations: 2,
          successfulLocations: 1,
          failedLocations: 1,
          totalOpportunities: 2,
          averageOpportunitiesPerLocation: 2,
          locationBreakdown: [
            { location: 'New York', count: 2 },
            { location: 'Unknown', count: 0 }
          ]
        },
        errors: [
          { source: 'geocoding', message: 'Unable to geocode location: XYZ123Invalid', type: 'geocoding_error', retryable: false }
        ]
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York, XYZ123Invalid');

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/Found 2 opportunities across 1 locations/)).toBeInTheDocument();
      });

      // Should show results from valid location
      expect(screen.getByText('NYC Beach Cleanup')).toBeInTheDocument();
      expect(screen.getByText('Manhattan Food Bank')).toBeInTheDocument();

      // Should show error for invalid location
      expect(screen.getByText(/Unable to geocode location: XYZ123Invalid/)).toBeInTheDocument();
    });
  });

  describe('Multi-Location Preferences', () => {
    it('should save multi-location search preferences', async () => {
      const user = userEvent.setup();
      
      mockMultiLocationService.isMultiLocationInput.mockReturnValue(true);
      
      mockSearchController.performSmartSearch.mockResolvedValue({
        opportunities: [],
        searchLocation: { city: 'New York and Los Angeles', country: 'Multiple', formattedAddress: 'New York, Los Angeles' },
        totalResults: 0,
        sources: ['VolunteerHub'],
        responseTime: 1000,
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
      });

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'New York, Los Angeles');

      // Change some preferences
      const radiusSelector = screen.getByDisplayValue('25 miles');
      await user.selectOptions(radiusSelector, '50');

      const environmentFilter = screen.getByLabelText('Environment');
      await user.click(environmentFilter);

      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      await waitFor(() => {
        expect(screen.getByText(/Found 0 opportunities across 2 locations/)).toBeInTheDocument();
      });

      // Verify preferences were saved with multi-location context
      expect(mockSearchController.saveSearchPreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          lastLocation: expect.objectContaining({
            formattedAddress: 'New York, Los Angeles'
          }),
          preferredRadius: 50,
          preferredCauses: ['Environment']
        })
      );
    });
  });
});