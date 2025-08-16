import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import App from '../../App';
import { searchController } from '../../services/SearchController';
import { SearchPreferences } from '../../services/SearchController';

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

describe('Preference Management Integration Tests', () => {
  const mockSearchController = searchController as any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockSearchController.loadSearchPreferences.mockReturnValue(null);
    mockSearchController.saveSearchPreferences.mockImplementation(() => {});
    mockSearchController.clearSearchPreferences.mockImplementation(() => {});
    mockSearchController.performSmartSearch.mockResolvedValue({
      opportunities: [],
      searchLocation: { city: 'Test', country: 'Test', formattedAddress: 'Test Location' },
      totalResults: 0,
      sources: ['VolunteerHub'],
      responseTime: 500,
      partialResults: false,
      serviceStatuses: []
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading Preferences on Startup', () => {
    it('should load and apply complete preferences on app startup', async () => {
      const savedPreferences: SearchPreferences = {
        lastLocation: {
          city: 'San Francisco',
          state: 'CA',
          country: 'United States',
          formattedAddress: 'San Francisco, CA, United States'
        },
        preferredRadius: 75,
        preferredCauses: ['Environment', 'Education', 'Health & Medicine'],
        preferredType: 'in-person'
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(savedPreferences);

      render(<App />);

      // Wait for preferences to load and be applied
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('San Francisco, CA, United States');
      });

      // Verify radius is set
      expect(screen.getByDisplayValue('75 miles')).toBeInTheDocument();

      // Verify causes are selected
      expect(screen.getByLabelText('Environment')).toBeChecked();
      expect(screen.getByLabelText('Education')).toBeChecked();
      expect(screen.getByLabelText('Health & Medicine')).toBeChecked();

      // Verify other causes are not selected
      expect(screen.getByLabelText('Animals')).not.toBeChecked();
      expect(screen.getByLabelText('Arts & Culture')).not.toBeChecked();

      // Verify type is selected
      expect(screen.getByDisplayValue('In-Person')).toBeInTheDocument();

      // Verify loadSearchPreferences was called
      expect(mockSearchController.loadSearchPreferences).toHaveBeenCalledTimes(1);
    });

    it('should handle preferences with missing state', async () => {
      const savedPreferences: SearchPreferences = {
        lastLocation: {
          city: 'London',
          country: 'United Kingdom',
          formattedAddress: 'London, United Kingdom'
          // No state field
        },
        preferredRadius: 50,
        preferredCauses: ['Arts & Culture'],
        preferredType: 'virtual'
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(savedPreferences);

      render(<App />);

      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('London, United Kingdom');
      });

      expect(screen.getByDisplayValue('50 miles')).toBeInTheDocument();
      expect(screen.getByLabelText('Arts & Culture')).toBeChecked();
      expect(screen.getByDisplayValue('Virtual')).toBeInTheDocument();
    });

    it('should handle preferences with empty causes array', async () => {
      const savedPreferences: SearchPreferences = {
        lastLocation: {
          city: 'Toronto',
          state: 'ON',
          country: 'Canada',
          formattedAddress: 'Toronto, ON, Canada'
        },
        preferredRadius: 25,
        preferredCauses: [], // Empty array
        preferredType: 'both'
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(savedPreferences);

      render(<App />);

      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('Toronto, ON, Canada');
      });

      // Verify no causes are selected
      expect(screen.getByLabelText('Environment')).not.toBeChecked();
      expect(screen.getByLabelText('Education')).not.toBeChecked();
      expect(screen.getByLabelText('Health & Medicine')).not.toBeChecked();

      expect(screen.getByDisplayValue('All')).toBeInTheDocument();
    });

    it('should handle null preferences gracefully', async () => {
      mockSearchController.loadSearchPreferences.mockReturnValue(null);

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Verify default values are used
      const locationInput = screen.getByTestId('location-input');
      expect(locationInput).toHaveValue('');

      expect(screen.getByDisplayValue('25 miles')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All')).toBeInTheDocument();

      // Verify no causes are selected by default
      expect(screen.getByLabelText('Environment')).not.toBeChecked();
    });

    it('should handle corrupted preferences data', async () => {
      // Mock corrupted data that causes an error
      mockSearchController.loadSearchPreferences.mockImplementation(() => {
        throw new Error('Invalid JSON in localStorage');
      });

      // Should not crash the app
      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Should fall back to default values
      const locationInput = screen.getByTestId('location-input');
      expect(locationInput).toHaveValue('');
      expect(screen.getByDisplayValue('25 miles')).toBeInTheDocument();
    });
  });

  describe('Saving Preferences During Usage', () => {
    it('should save preferences when location changes after initial load', async () => {
      const user = userEvent.setup();
      
      // Start with no preferences
      mockSearchController.loadSearchPreferences.mockReturnValue(null);

      render(<App />);

      // Wait for initial load
      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Change location
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Boston, MA, United States');

      // Wait for preferences to be saved
      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            lastLocation: expect.objectContaining({
              city: 'Boston',
              state: 'MA',
              country: 'United States',
              formattedAddress: 'Boston, MA, United States'
            })
          })
        );
      });
    });

    it('should save preferences when radius changes', async () => {
      const user = userEvent.setup();
      
      mockSearchController.loadSearchPreferences.mockReturnValue(null);

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Set a location first
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Seattle, WA');

      // Change radius
      const radiusSelector = screen.getByDisplayValue('25 miles');
      await user.selectOptions(radiusSelector, '100');

      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            preferredRadius: 100
          })
        );
      });
    });

    it('should save preferences when causes change', async () => {
      const user = userEvent.setup();
      
      mockSearchController.loadSearchPreferences.mockReturnValue(null);

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Set a location first
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Denver, CO');

      // Select multiple causes
      const environmentFilter = screen.getByLabelText('Environment');
      const educationFilter = screen.getByLabelText('Education');
      const healthFilter = screen.getByLabelText('Health & Medicine');

      await user.click(environmentFilter);
      await user.click(educationFilter);
      await user.click(healthFilter);

      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            preferredCauses: expect.arrayContaining(['Environment', 'Education', 'Health & Medicine'])
          })
        );
      });
    });

    it('should save preferences when opportunity type changes', async () => {
      const user = userEvent.setup();
      
      mockSearchController.loadSearchPreferences.mockReturnValue(null);

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Set a location first
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Miami, FL');

      // Change opportunity type
      const typeSelector = screen.getByDisplayValue('All');
      await user.selectOptions(typeSelector, 'virtual');

      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            preferredType: 'virtual'
          })
        );
      });
    });

    it('should save preferences when performing a search', async () => {
      const user = userEvent.setup();
      
      mockSearchController.loadSearchPreferences.mockReturnValue(null);

      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Set up search parameters
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Portland, OR');

      const radiusSelector = screen.getByDisplayValue('25 miles');
      await user.selectOptions(radiusSelector, '50');

      const environmentFilter = screen.getByLabelText('Environment');
      await user.click(environmentFilter);

      // Perform search
      const searchButton = screen.getByRole('button', { name: /search/i });
      await user.click(searchButton);

      // Wait for search to complete and preferences to be saved
      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalledWith(
          expect.objectContaining({
            lastLocation: expect.objectContaining({
              city: 'Portland',
              state: 'OR',
              formattedAddress: 'Portland, OR'
            }),
            preferredRadius: 50,
            preferredCauses: ['Environment'],
            preferredType: 'both'
          })
        );
      });
    });

    it('should not save preferences before initial load completes', async () => {
      const user = userEvent.setup();
      
      // Mock slow preference loading
      let resolvePreferences: (value: any) => void;
      const preferencesPromise = new Promise(resolve => {
        resolvePreferences = resolve;
      });

      mockSearchController.loadSearchPreferences.mockImplementation(() => {
        throw preferencesPromise; // This will cause the effect to wait
      });

      render(<App />);

      // Try to change location before preferences load
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Quick Change');

      // Should not save preferences yet
      expect(mockSearchController.saveSearchPreferences).not.toHaveBeenCalled();

      // Complete preference loading
      resolvePreferences!(null);

      // Now changes should trigger saves
      await user.clear(locationInput);
      await user.type(locationInput, 'After Load');

      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalled();
      });
    });
  });

  describe('Clearing Preferences', () => {
    it('should clear preferences when location is explicitly cleared', async () => {
      const user = userEvent.setup();
      
      // Start with saved preferences
      const savedPreferences: SearchPreferences = {
        lastLocation: {
          city: 'Phoenix',
          state: 'AZ',
          country: 'United States',
          formattedAddress: 'Phoenix, AZ, United States'
        },
        preferredRadius: 50,
        preferredCauses: ['Environment'],
        preferredType: 'in-person'
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(savedPreferences);

      render(<App />);

      // Wait for preferences to load
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('Phoenix, AZ, United States');
      });

      // Clear the location
      const locationInput = screen.getByTestId('location-input');
      await user.clear(locationInput);

      // Wait for preferences to be cleared
      await waitFor(() => {
        expect(mockSearchController.clearSearchPreferences).toHaveBeenCalledTimes(1);
      });
    });

    it('should clear preferences when filters are reset', async () => {
      const user = userEvent.setup();
      
      // Start with saved preferences
      const savedPreferences: SearchPreferences = {
        lastLocation: {
          city: 'Austin',
          state: 'TX',
          country: 'United States',
          formattedAddress: 'Austin, TX, United States'
        },
        preferredRadius: 75,
        preferredCauses: ['Technology', 'Education'],
        preferredType: 'virtual'
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(savedPreferences);

      render(<App />);

      // Wait for preferences to load
      await waitFor(() => {
        expect(screen.getByLabelText('Technology')).toBeChecked();
        expect(screen.getByLabelText('Education')).toBeChecked();
      });

      // Click "Clear All Filters"
      const clearFiltersButton = screen.getByText('Clear All Filters');
      await user.click(clearFiltersButton);

      // Wait for preferences to be cleared
      await waitFor(() => {
        expect(mockSearchController.clearSearchPreferences).toHaveBeenCalledTimes(1);
      });

      // Verify filters are reset
      expect(screen.getByLabelText('Technology')).not.toBeChecked();
      expect(screen.getByLabelText('Education')).not.toBeChecked();
      expect(screen.getByDisplayValue('25 miles')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All')).toBeInTheDocument();
    });

    it('should not clear preferences when location is changed to another value', async () => {
      const user = userEvent.setup();
      
      // Start with saved preferences
      const savedPreferences: SearchPreferences = {
        lastLocation: {
          city: 'Nashville',
          state: 'TN',
          country: 'United States',
          formattedAddress: 'Nashville, TN, United States'
        },
        preferredRadius: 25,
        preferredCauses: [],
        preferredType: 'both'
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(savedPreferences);

      render(<App />);

      // Wait for preferences to load
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('Nashville, TN, United States');
      });

      // Change location to a different value (not clearing)
      const locationInput = screen.getByTestId('location-input');
      await user.clear(locationInput);
      await user.type(locationInput, 'Memphis, TN');

      // Should save new preferences, not clear them
      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalled();
      });

      // Should not clear preferences
      expect(mockSearchController.clearSearchPreferences).not.toHaveBeenCalled();
    });
  });

  describe('Preference Persistence Across Sessions', () => {
    it('should maintain preferences across app restarts', async () => {
      // First session - set preferences
      const initialPreferences: SearchPreferences = {
        lastLocation: {
          city: 'Atlanta',
          state: 'GA',
          country: 'United States',
          formattedAddress: 'Atlanta, GA, United States'
        },
        preferredRadius: 100,
        preferredCauses: ['Health & Medicine', 'Children & Youth'],
        preferredType: 'in-person'
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(initialPreferences);

      const { unmount } = render(<App />);

      // Wait for preferences to load
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('Atlanta, GA, United States');
      });

      // Verify preferences are applied
      expect(screen.getByDisplayValue('100 miles')).toBeInTheDocument();
      expect(screen.getByLabelText('Health & Medicine')).toBeChecked();
      expect(screen.getByLabelText('Children & Youth')).toBeChecked();
      expect(screen.getByDisplayValue('In-Person')).toBeInTheDocument();

      // Unmount (simulate app close)
      unmount();

      // Second session - preferences should be loaded again
      mockSearchController.loadSearchPreferences.mockReturnValue(initialPreferences);

      render(<App />);

      // Wait for preferences to load again
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('Atlanta, GA, United States');
      });

      // Verify preferences are still applied
      expect(screen.getByDisplayValue('100 miles')).toBeInTheDocument();
      expect(screen.getByLabelText('Health & Medicine')).toBeChecked();
      expect(screen.getByLabelText('Children & Youth')).toBeChecked();
      expect(screen.getByDisplayValue('In-Person')).toBeInTheDocument();

      // Verify loadSearchPreferences was called in both sessions
      expect(mockSearchController.loadSearchPreferences).toHaveBeenCalledTimes(2);
    });

    it('should handle preference evolution over time', async () => {
      const user = userEvent.setup();
      
      // Start with basic preferences
      const initialPreferences: SearchPreferences = {
        lastLocation: {
          city: 'Dallas',
          state: 'TX',
          country: 'United States',
          formattedAddress: 'Dallas, TX, United States'
        },
        preferredRadius: 25,
        preferredCauses: ['Environment'],
        preferredType: 'both'
      };

      mockSearchController.loadSearchPreferences.mockReturnValue(initialPreferences);

      render(<App />);

      // Wait for initial preferences to load
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('Dallas, TX, United States');
      });

      // Evolve preferences over time
      // 1. Change location
      const locationInput = screen.getByTestId('location-input');
      await user.clear(locationInput);
      await user.type(locationInput, 'Houston, TX');

      // 2. Add more causes
      const educationFilter = screen.getByLabelText('Education');
      const healthFilter = screen.getByLabelText('Health & Medicine');
      await user.click(educationFilter);
      await user.click(healthFilter);

      // 3. Change radius
      const radiusSelector = screen.getByDisplayValue('25 miles');
      await user.selectOptions(radiusSelector, '50');

      // 4. Change type
      const typeSelector = screen.getByDisplayValue('All');
      await user.selectOptions(typeSelector, 'in-person');

      // Verify final preferences are saved
      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenLastCalledWith(
          expect.objectContaining({
            lastLocation: expect.objectContaining({
              city: 'Houston',
              state: 'TX',
              formattedAddress: 'Houston, TX'
            }),
            preferredRadius: 50,
            preferredCauses: expect.arrayContaining(['Environment', 'Education', 'Health & Medicine']),
            preferredType: 'in-person'
          })
        );
      });
    });
  });

  describe('Error Handling in Preference Management', () => {
    it('should handle localStorage quota exceeded gracefully', async () => {
      const user = userEvent.setup();
      
      // Mock localStorage quota exceeded
      mockSearchController.saveSearchPreferences.mockImplementation(() => {
        throw new Error('QuotaExceededError: localStorage quota exceeded');
      });

      mockSearchController.loadSearchPreferences.mockReturnValue(null);

      // Should not crash the app
      render(<App />);

      await waitFor(() => {
        expect(mockSearchController.loadSearchPreferences).toHaveBeenCalled();
      });

      // Try to save preferences
      const locationInput = screen.getByTestId('location-input');
      await user.type(locationInput, 'Test Location');

      // Should attempt to save but handle error gracefully
      await waitFor(() => {
        expect(mockSearchController.saveSearchPreferences).toHaveBeenCalled();
      });

      // App should continue to function
      expect(locationInput).toHaveValue('Test Location');
    });

    it('should handle localStorage access denied gracefully', async () => {
      // Mock localStorage access denied
      mockSearchController.loadSearchPreferences.mockImplementation(() => {
        throw new Error('SecurityError: localStorage access denied');
      });

      // Should not crash the app
      render(<App />);

      // Should fall back to default behavior
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('');
      });

      expect(screen.getByDisplayValue('25 miles')).toBeInTheDocument();
    });

    it('should handle malformed preference data gracefully', async () => {
      // Mock malformed preferences that cause parsing errors
      mockSearchController.loadSearchPreferences.mockReturnValue({
        lastLocation: 'invalid-location-format', // Should be an object
        preferredRadius: 'not-a-number', // Should be a number
        preferredCauses: 'not-an-array', // Should be an array
        preferredType: 'invalid-type' // Should be a valid type
      } as any);

      // Should not crash the app
      render(<App />);

      // Should fall back to defaults for invalid data
      await waitFor(() => {
        const locationInput = screen.getByTestId('location-input');
        expect(locationInput).toHaveValue('');
      });

      expect(screen.getByDisplayValue('25 miles')).toBeInTheDocument();
      expect(screen.getByDisplayValue('All')).toBeInTheDocument();
    });
  });
});