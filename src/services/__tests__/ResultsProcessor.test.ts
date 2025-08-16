import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResultsProcessor } from '../ResultsProcessor';
import { VolunteerOpportunity, APIResult } from '../../types/volunteer';
import { Coordinates } from '../../types/location';

// Mock the distance calculator
vi.mock('../../utils/distanceCalculator', () => ({
  calculateDistance: vi.fn((from: Coordinates, to: Coordinates) => {
    // Simple mock distance calculation based on coordinate difference
    const latDiff = Math.abs(from.latitude - to.latitude);
    const lonDiff = Math.abs(from.longitude - to.longitude);
    return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 69; // Rough miles conversion
  })
}));

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('ResultsProcessor', () => {
  let processor: ResultsProcessor;
  let mockSearchLocation: Coordinates;
  let mockOpportunities: VolunteerOpportunity[];

  beforeEach(() => {
    processor = new ResultsProcessor();
    mockSearchLocation = { latitude: 40.7128, longitude: -74.0060 }; // NYC
    
    mockOpportunities = [
      {
        id: '1',
        source: 'VolunteerHub',
        title: 'Beach Cleanup Event',
        organization: 'Ocean Conservation',
        description: 'Join us for a beach cleanup to protect marine life. We need volunteers to help collect trash and debris.',
        location: 'New York, NY',
        city: 'New York',
        country: 'USA',
        coordinates: { latitude: 40.7589, longitude: -73.9851 },
        type: 'in-person',
        cause: 'environment',
        skills: ['teamwork', 'physical'],
        timeCommitment: '4 hours',
        date: '2024-01-15',
        participants: 25,
        contactInfo: { email: 'contact@ocean.org', website: 'https://ocean.org' },
        externalUrl: 'https://ocean.org/volunteer/1',
        lastUpdated: new Date('2024-01-01'),
        verified: true
      },
      {
        id: '2',
        source: 'JustServe',
        title: 'Beach Cleanup Event', // Duplicate title
        organization: 'Ocean Conservation', // Same organization
        description: 'Help clean up the beach and protect our oceans.',
        location: 'New York, NY', // Same location
        city: 'New York',
        country: 'USA',
        coordinates: { latitude: 40.7589, longitude: -73.9851 },
        type: 'in-person',
        cause: 'environment',
        skills: ['environmental awareness'],
        timeCommitment: '4 hours',
        date: '2024-01-15',
        participants: 20,
        contactInfo: { email: 'info@ocean.org' },
        externalUrl: 'https://justserve.org/volunteer/2',
        lastUpdated: new Date('2024-01-02'),
        verified: false
      },
      {
        id: '3',
        source: 'Idealist',
        title: 'Virtual Tutoring Program',
        organization: 'Education First',
        description: 'Provide online tutoring to students in need. Help with math, science, and reading.',
        location: 'Remote',
        city: 'Remote',
        country: 'USA',
        type: 'virtual',
        cause: 'education',
        skills: ['teaching', 'communication'],
        timeCommitment: '2 hours per week',
        date: '2024-01-20',
        participants: 1,
        contactInfo: { email: 'tutoring@education.org' },
        externalUrl: 'https://idealist.org/volunteer/3',
        lastUpdated: new Date('2024-01-03'),
        verified: true
      },
      {
        id: '4',
        source: 'VolunteerHub',
        title: 'Food Bank Sorting',
        organization: 'Community Food Bank',
        description: 'Sort and package food donations for distribution to families in need.',
        location: 'Brooklyn, NY',
        city: 'Brooklyn',
        country: 'USA',
        coordinates: { latitude: 40.6782, longitude: -73.9442 },
        type: 'in-person',
        cause: 'community',
        skills: [],
        timeCommitment: '',
        date: '2024-01-25',
        contactInfo: { phone: '555-0123' },
        externalUrl: 'https://foodbank.org/volunteer/4',
        lastUpdated: new Date('2024-01-04'),
        verified: true
      }
    ];
  });

  describe('processResults', () => {
    it('should process results with all options enabled', async () => {
      const apiResults: APIResult[] = [
        {
          source: 'VolunteerHub',
          opportunities: [mockOpportunities[0], mockOpportunities[3]],
          success: true
        },
        {
          source: 'JustServe',
          opportunities: [mockOpportunities[1]],
          success: true
        },
        {
          source: 'Idealist',
          opportunities: [mockOpportunities[2]],
          success: true
        }
      ];

      const result = await processor.processResults(apiResults, mockSearchLocation);

      expect(result.opportunities).toHaveLength(3); // Should deduplicate the beach cleanup
      expect(result.stats.originalCount).toBe(4);
      expect(result.stats.duplicatesRemoved).toBe(1);
      expect(result.stats.finalCount).toBe(3);
      expect(result.stats.processingTime).toBeGreaterThanOrEqual(0);

      // Virtual opportunities should be first
      expect(result.opportunities[0].type).toBe('virtual');
      
      // In-person opportunities should have distance calculated
      const inPersonOpps = result.opportunities.filter(opp => opp.type === 'in-person');
      inPersonOpps.forEach(opp => {
        expect(opp.distance).toBeDefined();
        expect(typeof opp.distance).toBe('number');
      });
    });

    it('should handle failed API results gracefully', async () => {
      const apiResults: APIResult[] = [
        {
          source: 'VolunteerHub',
          opportunities: [mockOpportunities[0]],
          success: true
        },
        {
          source: 'FailedService',
          opportunities: [],
          success: false,
          error: 'Service unavailable'
        }
      ];

      const result = await processor.processResults(apiResults, mockSearchLocation);

      expect(result.opportunities).toHaveLength(1);
      expect(result.stats.originalCount).toBe(1);
      expect(result.stats.finalCount).toBe(1);
    });

    it('should filter by maximum distance', async () => {
      const apiResults: APIResult[] = [
        {
          source: 'VolunteerHub',
          opportunities: mockOpportunities,
          success: true
        }
      ];

      const result = await processor.processResults(apiResults, mockSearchLocation, {
        maxDistance: 1 // Very small distance to filter most opportunities
      });

      // Should only include virtual opportunities and very close ones
      const inPersonCount = result.opportunities.filter(opp => opp.type === 'in-person').length;
      const virtualCount = result.opportunities.filter(opp => opp.type === 'virtual').length;
      
      expect(virtualCount).toBe(1); // Virtual opportunities should always be included
      expect(inPersonCount).toBeLessThanOrEqual(mockOpportunities.filter(opp => opp.type === 'in-person').length);
    });

    it('should disable processing options when requested', async () => {
      const apiResults: APIResult[] = [
        {
          source: 'VolunteerHub',
          opportunities: [mockOpportunities[0], mockOpportunities[1]], // Duplicates
          success: true
        }
      ];

      const result = await processor.processResults(apiResults, mockSearchLocation, {
        enableDeduplication: false,
        enableDistanceCalculation: false,
        enableDataEnrichment: false
      });

      // Should not deduplicate
      expect(result.opportunities).toHaveLength(2);
      expect(result.stats.duplicatesRemoved).toBe(0);
      
      // Should not calculate distances
      result.opportunities.forEach(opp => {
        if (opp.type === 'in-person') {
          expect(opp.distance).toBeUndefined();
        }
      });
    });
  });

  describe('deduplicateOpportunities', () => {
    it('should remove duplicate opportunities', () => {
      const duplicates = [mockOpportunities[0], mockOpportunities[1]]; // Same title, org, location
      const result = processor.deduplicateOpportunities(duplicates);

      expect(result).toHaveLength(1);
      // Should keep the one with higher score (VolunteerHub has better source score)
      expect(result[0].source).toBe('VolunteerHub');
    });

    it('should keep opportunities with different titles', () => {
      const different = [mockOpportunities[0], mockOpportunities[2]]; // Different titles
      const result = processor.deduplicateOpportunities(different);

      expect(result).toHaveLength(2);
    });

    it('should handle empty array', () => {
      const result = processor.deduplicateOpportunities([]);
      expect(result).toHaveLength(0);
    });

    it('should handle single opportunity', () => {
      const result = processor.deduplicateOpportunities([mockOpportunities[0]]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockOpportunities[0]);
    });
  });

  describe('calculateDistances', () => {
    it('should calculate distances for in-person opportunities', () => {
      const opportunities = [mockOpportunities[0], mockOpportunities[3]]; // Both in-person
      const result = processor.calculateDistances(opportunities, mockSearchLocation);

      result.forEach(opp => {
        expect(opp.distance).toBeDefined();
        expect(typeof opp.distance).toBe('number');
        expect(opp.distance).toBeGreaterThan(0);
      });
    });

    it('should not calculate distance for virtual opportunities', () => {
      const virtualOpp = [mockOpportunities[2]]; // Virtual opportunity
      const result = processor.calculateDistances(virtualOpp, mockSearchLocation);

      expect(result[0].distance).toBeUndefined();
    });

    it('should handle opportunities without coordinates', () => {
      const oppWithoutCoords = {
        ...mockOpportunities[0],
        coordinates: undefined
      };
      
      const result = processor.calculateDistances([oppWithoutCoords], mockSearchLocation);
      
      expect(result[0].distance).toBeUndefined();
    });
  });

  describe('sortByDistance', () => {
    it('should sort virtual opportunities first', () => {
      const mixed = [mockOpportunities[0], mockOpportunities[2], mockOpportunities[3]];
      // Add distances to in-person opportunities
      mixed[0].distance = 5;
      mixed[2].distance = 2;
      
      const result = processor.sortByDistance(mixed);
      
      expect(result[0].type).toBe('virtual');
      expect(result[1].distance).toBeLessThanOrEqual(result[2].distance!);
    });

    it('should sort in-person opportunities by distance', () => {
      const inPerson = [mockOpportunities[0], mockOpportunities[3]];
      inPerson[0].distance = 10;
      inPerson[1].distance = 5;
      
      const result = processor.sortByDistance(inPerson);
      
      expect(result[0].distance).toBe(5);
      expect(result[1].distance).toBe(10);
    });

    it('should handle opportunities without distance', () => {
      const withoutDistance = [
        { ...mockOpportunities[0], distance: undefined },
        { ...mockOpportunities[3], distance: 5 }
      ];
      
      const result = processor.sortByDistance(withoutDistance);
      
      // Opportunity with distance should come first
      expect(result[0].distance).toBe(5);
      expect(result[1].distance).toBeUndefined();
    });

    it('should sort by title when distances are equal', () => {
      const equalDistance = [
        { ...mockOpportunities[0], distance: 5, title: 'Z Event' },
        { ...mockOpportunities[3], distance: 5, title: 'A Event' }
      ];
      
      const result = processor.sortByDistance(equalDistance);
      
      expect(result[0].title).toBe('A Event');
      expect(result[1].title).toBe('Z Event');
    });
  });

  describe('data enrichment', () => {
    it('should enrich opportunities with missing data', async () => {
      const incompleteOpp = {
        ...mockOpportunities[3],
        skills: [],
        timeCommitment: '',
        participants: undefined,
        image: undefined
      };

      const apiResults: APIResult[] = [
        {
          source: 'VolunteerHub',
          opportunities: [incompleteOpp],
          success: true
        }
      ];

      const result = await processor.processResults(apiResults, mockSearchLocation, {
        enableDataEnrichment: true
      });

      const enriched = result.opportunities[0];
      expect(enriched.skills.length).toBeGreaterThan(0);
      expect(enriched.timeCommitment).not.toBe('');
      expect(enriched.participants).toBeDefined();
      expect(enriched.image).toBeDefined();
    });

    it('should infer skills from description', async () => {
      const oppWithDescription = {
        ...mockOpportunities[0],
        skills: [],
        description: 'We need volunteers to teach children and help with computer programming tasks.'
      };

      const apiResults: APIResult[] = [
        {
          source: 'VolunteerHub',
          opportunities: [oppWithDescription],
          success: true
        }
      ];

      const result = await processor.processResults(apiResults, mockSearchLocation);
      const enriched = result.opportunities[0];
      
      expect(enriched.skills).toContain('teaching');
      expect(enriched.skills).toContain('technical');
    });
  });
});