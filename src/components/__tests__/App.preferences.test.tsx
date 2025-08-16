import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import App from '../../App';
import { searchController } from '../../services/SearchController';

// Mock the search controller
vi.mock('../../services/SearchController', () => ({
  searchController: {
    loadSearchPreferences: vi.fn(),
    saveSearchPreferences: vi.fn(),
    clearSearchPreferences: vi.fn(),
    performSearch: vi.fn()
  }
}));

// Mock the geocoding service
vi.mock('../../services/geocodingService', () => ({
  GeocodingService: vi.fn().mockImplementation(() => ({
    geocodeLocation: vi.fn().mockResolvedValue({
      latitude: 47.6062,
      longitude: -122.3321
    })
  }))
}));

// Mock the geolocation service
vi.mock('../../services/geolocationService', () => ({
  GeolocationService: vi.fn().mockImplementation(() => ({
    getCurrentLocationWithFallback: vi.fn(),
    isGeolocationAvailable: vi.fn().mockResolvedValue(true)
  }))
}));

// Mock the API service registry
vi.mock('../../services/api/APIServiceRegistry', () => ({
  apiServiceRegistry: {
    registerService: vi.fn()
  }
}));

// Mock the API adapters
vi.mock('../../services/api/adapters/VolunteerHubAdapter', () => ({
  VolunteerHubAdapter: vi.fn()
}));

vi.mock('../../services/api/adapters/JustServeAdapter', () => ({
  JustServeAdapter: vi.fn()
}));

vi.mock('../../services/api/adapters/IdealistAdapter', () => ({
  IdealistAdapter: vi.fn()
}));

// Mock the LocationInput component to avoid geolocation complexities
vi.mock('../LocationInput', () => ({
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

describe('App Preferences Integration', () => {
  const mockSearchController = searchController as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should pre-populate location field with saved preferences on page load', async () => {
    // Mock saved preferences
    const mockPreferences = {
      lastLocation: {
        city: 'New York',
        state: 'NY',
        country: 'United States',
        formattedAddress: 'New York, NY, United States'
      },
      preferredRadius: 50,
      preferredCauses: ['Education'],
      preferredType: 'in-person' as const
    };

    mockSearchController.loadSearchPreferences.mockReturnValue(mockPreferences);

    render(<App />);

    // Wait for preferences to load
    await waitFor(() => {
      const locationInput = screen.getByTestId('location-input');
      expect(locationInput).toHaveValue('New York, NY, United States');
    });

    // Verify loadSearchPreferences was called
    expect(mockSearchController.loadSearchPreferences).toHaveBeenCalledTimes(1);
  });

  it('should handle missing state in saved location preferences', async () => {
    // Mock saved preferences without state
    const mockPreferences = {
      lastLocation: {
        city: 'London',
        country: 'United Kingdom',
        formattedAddress: 'London, United Kingdom'
      },
      preferredRadius: 25,
      preferredCauses: [],
      preferredType: 'both' as const
    };

    mockSearchController.loadSearchPreferences.mockReturnValue(mockPreferences);

    render(<App />);

    // Wait for preferences to load
    await waitFor(() => {
      const locationInput = screen.getByTestId('location-input');
      expect(locationInput).toHaveValue('London, United Kingdom');
    });
  });

  it('should save preferences when search parameters change after initial load', async () => {
    // Mock no initial preferences
    mockSearchController.loadSearchPreferences.mockReturnValue(null);

    render(<App />);

    // Wait for initial load to complete
    await waitFor(() => {
      expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
    });

    // Change location input
    const locationInput = screen.getByTestId('location-input');
    fireEvent.change(locationInput, { target: { value: 'San Francisco, CA, United States' } });

    // Change radius
    const radiusSelect = screen.getByDisplayValue('25 miles');
    fireEvent.change(radiusSelect, { target: { value: '50' } });

    // Wait for preferences to be saved
    await waitFor(() => {
      expect(mockSearchController.saveSearchPreferences).toHaveBeenCalled();
    });

    // Verify the saved preferences structure
    const savedPreferences = mockSearchController.saveSearchPreferences.mock.calls[0][0];
    expect(savedPreferences).toMatchObject({
      lastLocation: {
        city: 'San Francisco',
        state: 'CA',
        country: 'United States',
        formattedAddress: 'San Francisco, CA, United States'
      },
      preferredRadius: 50
    });
  });

  it('should clear preferences when location is explicitly cleared', async () => {
    // Mock initial preferences
    const mockPreferences = {
      lastLocation: {
        city: 'Boston',
        state: 'MA',
        country: 'United States',
        formattedAddress: 'Boston, MA, United States'
      },
      preferredRadius: 25,
      preferredCauses: [],
      preferredType: 'both' as const
    };

    mockSearchController.loadSearchPreferences.mockReturnValue(mockPreferences);

    render(<App />);

    // Wait for preferences to load
    await waitFor(() => {
      const locationInput = screen.getByTestId('location-input');
      expect(locationInput).toHaveValue('Boston, MA, United States');
    });

    // Clear the location input
    const locationInput = screen.getByTestId('location-input');
    fireEvent.change(locationInput, { target: { value: '' } });

    // Wait for preferences to be cleared
    await waitFor(() => {
      expect(mockSearchController.clearSearchPreferences).toHaveBeenCalledTimes(1);
    });
  });

  it('should clear preferences when filters are cleared', async () => {
    // Mock initial preferences
    const mockPreferences = {
      lastLocation: {
        city: 'Chicago',
        country: 'United States',
        formattedAddress: 'Chicago, United States'
      },
      preferredRadius: 50,
      preferredCauses: ['Education'],
      preferredType: 'in-person' as const
    };

    mockSearchController.loadSearchPreferences.mockReturnValue(mockPreferences);

    render(<App />);

    // Wait for preferences to load
    await waitFor(() => {
      expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
    });

    // Find and click the "Clear All Filters" button
    const clearFiltersButton = screen.getByText('Clear All Filters');
    fireEvent.click(clearFiltersButton);

    // Wait for preferences to be cleared
    await waitFor(() => {
      expect(mockSearchController.clearSearchPreferences).toHaveBeenCalledTimes(1);
    });
  });

  it('should save preferences when search button is clicked', async () => {
    // Mock no initial preferences
    mockSearchController.loadSearchPreferences.mockReturnValue(null);
    
    // Mock successful search
    mockSearchController.performSearch.mockResolvedValue({
      opportunities: [],
      searchLocation: { city: 'Seattle', state: 'WA', country: 'United States', formattedAddress: 'Seattle, WA, United States' },
      totalResults: 0,
      sources: [],
      responseTime: 100
    });

    render(<App />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
    });

    // Enter a location
    const locationInput = screen.getByTestId('location-input');
    fireEvent.change(locationInput, { target: { value: 'Seattle, WA, United States' } });

    // Click search button
    const searchButton = screen.getByRole('button', { name: /search/i });
    fireEvent.click(searchButton);

    // Wait for preferences to be saved (after geocoding and search)
    await waitFor(() => {
      expect(mockSearchController.saveSearchPreferences).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  it('should handle errors when loading preferences gracefully', async () => {
    // Mock error when loading preferences
    mockSearchController.loadSearchPreferences.mockImplementation(() => {
      throw new Error('localStorage error');
    });

    // Should not crash the app
    expect(() => render(<App />)).not.toThrow();

    // Should still call loadSearchPreferences
    await waitFor(() => {
      expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
    });
  });

  it('should handle errors when saving preferences gracefully', async () => {
    // Mock no initial preferences
    mockSearchController.loadSearchPreferences.mockReturnValue(null);
    
    // Mock error when saving preferences
    mockSearchController.saveSearchPreferences.mockImplementation(() => {
      throw new Error('localStorage error');
    });

    render(<App />);

    // Wait for initial load
    await waitFor(() => {
      expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
    });

    // Change location - this should trigger save but not crash
    const locationInput = screen.getByTestId('location-input');
    fireEvent.change(locationInput, { target: { value: 'Portland, OR, United States' } });

    // Change radius to trigger the save effect
    const radiusSelect = screen.getByDisplayValue('25 miles');
    fireEvent.change(radiusSelect, { target: { value: '50' } });

    // Should attempt to save preferences despite error
    await waitFor(() => {
      expect(mockSearchController.saveSearchPreferences).toHaveBeenCalled();
    });
  });
});