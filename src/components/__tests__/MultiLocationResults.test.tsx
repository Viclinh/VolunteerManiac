import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiLocationResults } from '../MultiLocationResults';
import { LocationGroup } from '../../services/MultiLocationService';
import { VolunteerOpportunity } from '../../types/volunteer';

// Mock Lucide React icons
vi.mock('lucide-react', () => ({
  MapPin: () => <div data-testid="map-pin-icon" />,
  Calendar: () => <div data-testid="calendar-icon" />,
  Users: () => <div data-testid="users-icon" />,
  Heart: () => <div data-testid="heart-icon" />,
  ChevronDown: () => <div data-testid="chevron-down-icon" />,
  ChevronUp: () => <div data-testid="chevron-up-icon" />
}));

describe('MultiLocationResults', () => {
  const mockOpportunity1: VolunteerOpportunity = {
    id: '1',
    source: 'TestSource',
    title: 'Beach Cleanup NYC',
    organization: 'Ocean Org',
    description: 'Help clean up the beach in NYC',
    location: 'New York, NY',
    city: 'New York',
    country: 'USA',
    type: 'in-person',
    cause: 'environment',
    skills: ['teamwork'],
    timeCommitment: '4 hours',
    date: '2024-01-15',
    participants: 20,
    contactInfo: { email: 'contact@ocean.org' },
    externalUrl: 'https://ocean.org/volunteer/1',
    lastUpdated: new Date(),
    verified: true,
    distance: 2.5
  };

  const mockOpportunity2: VolunteerOpportunity = {
    id: '2',
    source: 'TestSource',
    title: 'Tree Planting LA',
    organization: 'Green Earth',
    description: 'Plant trees in Los Angeles parks',
    location: 'Los Angeles, CA',
    city: 'Los Angeles',
    country: 'USA',
    type: 'virtual',
    cause: 'environment',
    skills: ['planning'],
    timeCommitment: '2 hours',
    date: '2024-01-20',
    participants: 15,
    contactInfo: { email: 'info@greenearth.org' },
    externalUrl: 'https://greenearth.org/volunteer/2',
    lastUpdated: new Date(),
    verified: true
  };

  const mockLocationGroups: LocationGroup[] = [
    {
      location: {
        originalInput: 'New York',
        locationInfo: {
          city: 'New York',
          state: 'NY',
          country: 'USA',
          formattedAddress: 'New York, NY, USA'
        },
        coordinates: { latitude: 40.7128, longitude: -74.0060 },
        index: 0
      },
      opportunities: [mockOpportunity1],
      searchSuccess: true
    },
    {
      location: {
        originalInput: 'Los Angeles',
        locationInfo: {
          city: 'Los Angeles',
          state: 'CA',
          country: 'USA',
          formattedAddress: 'Los Angeles, CA, USA'
        },
        coordinates: { latitude: 34.0522, longitude: -118.2437 },
        index: 1
      },
      opportunities: [mockOpportunity2],
      searchSuccess: true
    }
  ];

  const mockSearchStatistics = {
    totalLocations: 2,
    successfulLocations: 2,
    failedLocations: 0,
    totalOpportunities: 2,
    averageOpportunitiesPerLocation: 1,
    locationBreakdown: [
      { location: 'New York', count: 1 },
      { location: 'Los Angeles', count: 1 }
    ]
  };

  it('should render multi-location search summary', () => {
    render(
      <MultiLocationResults
        locationGroups={mockLocationGroups}
        searchStatistics={mockSearchStatistics}
      />
    );

    expect(screen.getByText('Multi-Location Search Results')).toBeInTheDocument();
    expect(screen.getByText('Total Locations:')).toBeInTheDocument();
    expect(screen.getByText('Total Opportunities:')).toBeInTheDocument();
    expect(screen.getByText('Avg per Location:')).toBeInTheDocument();
  });

  it('should render location groups with correct information', () => {
    render(
      <MultiLocationResults
        locationGroups={mockLocationGroups}
        searchStatistics={mockSearchStatistics}
      />
    );

    // Check location headers
    expect(screen.getByText('New York, NY, USA')).toBeInTheDocument();
    expect(screen.getByText('Los Angeles, CA, USA')).toBeInTheDocument();
    
    // Check original input display
    expect(screen.getByText('Original input: "New York"')).toBeInTheDocument();
    expect(screen.getByText('Original input: "Los Angeles"')).toBeInTheDocument();
    
    // Check success indicators
    expect(screen.getAllByText('✓ Success')).toHaveLength(2);
    expect(screen.getAllByText(/\d+ opportunities/)).toHaveLength(2);
  });

  it('should render opportunity cards correctly', () => {
    render(
      <MultiLocationResults
        locationGroups={mockLocationGroups}
        searchStatistics={mockSearchStatistics}
      />
    );

    // Check opportunity titles
    expect(screen.getByText('Beach Cleanup NYC')).toBeInTheDocument();
    expect(screen.getByText('Tree Planting LA')).toBeInTheDocument();
    
    // Check organizations
    expect(screen.getByText('Ocean Org')).toBeInTheDocument();
    expect(screen.getByText('Green Earth')).toBeInTheDocument();
    
    // Check opportunity types
    expect(screen.getByText('In Person')).toBeInTheDocument();
    expect(screen.getByText('Virtual')).toBeInTheDocument();
    
    // Check distance display for in-person opportunity
    expect(screen.getByText('• 2.5 mi')).toBeInTheDocument();
    
    // Check virtual opportunity indicator
    expect(screen.getByText('• No travel required')).toBeInTheDocument();
    
    // Check apply buttons
    expect(screen.getAllByText('Apply Now')).toHaveLength(2);
  });

  it('should handle expand/collapse functionality', () => {
    render(
      <MultiLocationResults
        locationGroups={mockLocationGroups}
        searchStatistics={mockSearchStatistics}
      />
    );

    // Initially, all locations should be expanded (opportunities visible)
    expect(screen.getByText('Beach Cleanup NYC')).toBeInTheDocument();
    expect(screen.getByText('Tree Planting LA')).toBeInTheDocument();

    // Click collapse all button
    const collapseAllButton = screen.getByText('Collapse All');
    fireEvent.click(collapseAllButton);

    // Opportunities should be hidden (but headers still visible)
    expect(screen.queryByText('Beach Cleanup NYC')).not.toBeInTheDocument();
    expect(screen.queryByText('Tree Planting LA')).not.toBeInTheDocument();
    expect(screen.getByText('New York, NY, USA')).toBeInTheDocument(); // Headers still visible

    // Click expand all button
    const expandAllButton = screen.getByText('Expand All');
    fireEvent.click(expandAllButton);

    // Opportunities should be visible again
    expect(screen.getByText('Beach Cleanup NYC')).toBeInTheDocument();
    expect(screen.getByText('Tree Planting LA')).toBeInTheDocument();
  });

  it('should handle individual location expand/collapse', () => {
    render(
      <MultiLocationResults
        locationGroups={mockLocationGroups}
        searchStatistics={mockSearchStatistics}
      />
    );

    // Click on first location header to collapse it
    const firstLocationHeader = screen.getByText('New York, NY, USA');
    fireEvent.click(firstLocationHeader);

    // First location opportunities should be hidden, second should still be visible
    expect(screen.queryByText('Beach Cleanup NYC')).not.toBeInTheDocument();
    expect(screen.getByText('Tree Planting LA')).toBeInTheDocument();

    // Click again to expand
    fireEvent.click(firstLocationHeader);

    // Both should be visible again
    expect(screen.getByText('Beach Cleanup NYC')).toBeInTheDocument();
    expect(screen.getByText('Tree Planting LA')).toBeInTheDocument();
  });

  it('should handle failed searches', () => {
    const locationGroupsWithFailure: LocationGroup[] = [
      ...mockLocationGroups,
      {
        location: {
          originalInput: 'Invalid Location',
          locationInfo: {
            city: 'Invalid',
            country: 'Unknown',
            formattedAddress: 'Invalid Location'
          },
          coordinates: { latitude: 0, longitude: 0 },
          index: 2
        },
        opportunities: [],
        searchSuccess: false,
        error: 'Location not found'
      }
    ];

    const statisticsWithFailure = {
      ...mockSearchStatistics,
      totalLocations: 3,
      failedLocations: 1,
      locationBreakdown: [
        ...mockSearchStatistics.locationBreakdown,
        { location: 'Invalid', count: 0 }
      ]
    };

    render(
      <MultiLocationResults
        locationGroups={locationGroupsWithFailure}
        searchStatistics={statisticsWithFailure}
      />
    );

    // Check failed location display
    expect(screen.getByText('Invalid, Unknown')).toBeInTheDocument();
    expect(screen.getByText('✗ Error')).toBeInTheDocument();
    expect(screen.getByText('Search failed')).toBeInTheDocument();
    expect(screen.getByText('Location not found')).toBeInTheDocument();
  });

  it('should handle empty results for successful searches', () => {
    const emptyLocationGroups: LocationGroup[] = [
      {
        location: {
          originalInput: 'Empty Location',
          locationInfo: {
            city: 'Empty',
            state: 'ST',
            country: 'USA',
            formattedAddress: 'Empty, ST, USA'
          },
          coordinates: { latitude: 0, longitude: 0 },
          index: 0
        },
        opportunities: [],
        searchSuccess: true
      }
    ];

    const emptyStatistics = {
      totalLocations: 1,
      successfulLocations: 1,
      failedLocations: 0,
      totalOpportunities: 0,
      averageOpportunitiesPerLocation: 0,
      locationBreakdown: [{ location: 'Empty', count: 0 }]
    };

    render(
      <MultiLocationResults
        locationGroups={emptyLocationGroups}
        searchStatistics={emptyStatistics}
      />
    );

    // Should show success status but no opportunities message
    expect(screen.getByText('✓ Success')).toBeInTheDocument();
    expect(screen.getByText('0 opportunities')).toBeInTheDocument();
    expect(screen.getByText('No opportunities found in this location')).toBeInTheDocument();
    expect(screen.getByText('Try expanding your search radius or adjusting filters')).toBeInTheDocument();
  });

  it('should render location breakdown summary', () => {
    render(
      <MultiLocationResults
        locationGroups={mockLocationGroups}
        searchStatistics={mockSearchStatistics}
      />
    );

    expect(screen.getByText('Opportunities by Location')).toBeInTheDocument();
    
    // Check breakdown counts
    const breakdownSection = screen.getByText('Opportunities by Location').closest('div');
    expect(breakdownSection).toBeInTheDocument();
    
    // Should show counts for each location
    expect(screen.getByText('New York')).toBeInTheDocument();
    expect(screen.getByText('Los Angeles')).toBeInTheDocument();
  });

  it('should handle opportunity images correctly', () => {
    const opportunityWithImage = {
      ...mockOpportunity1,
      image: 'https://example.com/image.jpg'
    };

    const locationGroupsWithImage: LocationGroup[] = [
      {
        ...mockLocationGroups[0],
        opportunities: [opportunityWithImage]
      }
    ];

    render(
      <MultiLocationResults
        locationGroups={locationGroupsWithImage}
        searchStatistics={mockSearchStatistics}
      />
    );

    const image = screen.getByAltText('Beach Cleanup NYC');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
  });

  it('should apply custom className', () => {
    const { container } = render(
      <MultiLocationResults
        locationGroups={mockLocationGroups}
        searchStatistics={mockSearchStatistics}
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('should handle locations without state', () => {
    const locationGroupsWithoutState: LocationGroup[] = [
      {
        location: {
          originalInput: 'London',
          locationInfo: {
            city: 'London',
            country: 'UK',
            formattedAddress: 'London, UK'
          },
          coordinates: { latitude: 51.5074, longitude: -0.1278 },
          index: 0
        },
        opportunities: [mockOpportunity1],
        searchSuccess: true
      }
    ];

    render(
      <MultiLocationResults
        locationGroups={locationGroupsWithoutState}
        searchStatistics={mockSearchStatistics}
      />
    );

    // Should display city and country without state
    expect(screen.getByText('London, UK')).toBeInTheDocument();
  });
});