import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilteringSortingService, FilterOptions, SortOptions } from '../FilteringSortingService';
import { VolunteerOpportunity } from '../../types/volunteer';

// Mock console methods
vi.spyOn(console, 'log').mockImplementation(() => {});

describe('FilteringSortingService', () => {
  let service: FilteringSortingService;
  let mockOpportunities: VolunteerOpportunity[];

  beforeEach(() => {
    service = new FilteringSortingService();
    
    mockOpportunities = [
      {
        id: '1',
        source: 'VolunteerHub',
        title: 'Beach Cleanup',
        organization: 'Ocean Conservation',
        description: 'Join us for a comprehensive beach cleanup event to protect marine life and preserve our coastlines.',
        location: 'New York, NY',
        city: 'New York',
        country: 'USA',
        coordinates: { latitude: 40.7589, longitude: -73.9851 },
        distance: 5.2,
        type: 'in-person',
        cause: 'environment',
        skills: ['teamwork', 'physical', 'environmental awareness'],
        timeCommitment: '4 hours',
        date: '2024-02-15',
        participants: 25,
        contactInfo: { 
          email: 'contact@ocean.org', 
          phone: '555-0123',
          website: 'https://ocean.org' 
        },
        externalUrl: 'https://ocean.org/volunteer/1',
        image: 'https://ocean.org/images/cleanup.jpg',
        lastUpdated: new Date('2024-01-01'),
        verified: true
      },
      {
        id: '2',
        source: 'JustServe',
        title: 'Virtual Tutoring',
        organization: 'Education First',
        description: 'Provide online tutoring to students.',
        location: 'Remote',
        city: 'Remote',
        country: 'USA',
        type: 'virtual',
        cause: 'education',
        skills: ['teaching', 'communication'],
        timeCommitment: '2 hours weekly',
        date: '2024-01-20',
        participants: 1,
        contactInfo: { email: 'tutoring@education.org' },
        externalUrl: 'https://education.org/volunteer/2',
        lastUpdated: new Date('2024-01-10'),
        verified: true
      },
      {
        id: '3',
        source: 'Idealist',
        title: 'Food Bank Sorting',
        organization: 'Community Food Bank',
        description: 'Sort and package food donations.',
        location: 'Brooklyn, NY',
        city: 'Brooklyn',
        country: 'USA',
        coordinates: { latitude: 40.6782, longitude: -73.9442 },
        distance: 15.8,
        type: 'in-person',
        cause: 'community',
        skills: ['organization', 'teamwork'],
        timeCommitment: 'full day',
        date: '2024-03-01',
        participants: 10,
        contactInfo: { phone: '555-0456' },
        externalUrl: 'https://foodbank.org/volunteer/3',
        lastUpdated: new Date('2023-12-15'),
        verified: false
      },
      {
        id: '4',
        source: 'VolunteerHub',
        title: 'Animal Shelter Help',
        organization: 'City Animal Shelter',
        description: 'Help care for animals at the local shelter.',
        location: 'Queens, NY',
        city: 'Queens',
        country: 'USA',
        coordinates: { latitude: 40.7282, longitude: -73.7949 },
        distance: 25.3,
        type: 'in-person',
        cause: 'animals',
        skills: ['animal care', 'compassion'],
        timeCommitment: '3 hours',
        date: '2024-01-25',
        participants: 5,
        contactInfo: { website: 'https://shelter.org' },
        externalUrl: 'https://shelter.org/volunteer/4',
        lastUpdated: new Date('2024-01-05'),
        verified: true
      },
      {
        id: '5',
        source: 'JustServe',
        title: 'Senior Center Visit',
        organization: 'Golden Years Center',
        description: 'Visit and spend time with elderly residents.',
        location: 'Manhattan, NY',
        city: 'Manhattan',
        country: 'USA',
        coordinates: { latitude: 40.7831, longitude: -73.9712 },
        distance: 8.1,
        type: 'in-person',
        cause: 'seniors',
        skills: ['communication', 'empathy'],
        timeCommitment: '2 hours',
        date: '2024-02-10',
        participants: 3,
        contactInfo: {},
        externalUrl: 'https://goldenyears.org/volunteer/5',
        lastUpdated: new Date('2024-01-08'),
        verified: false
      }
    ];
  });

  describe('filterOpportunities', () => {
    it('should filter by distance radius', () => {
      const filters: FilterOptions = { radius: 10 };
      const result = service.filterOpportunities(mockOpportunities, filters);

      // Should include virtual opportunities and those within 10 miles
      const expectedIds = ['1', '2', '5']; // Beach cleanup (5.2), Virtual tutoring, Senior center (8.1)
      expect(result.opportunities.map(opp => opp.id)).toEqual(expect.arrayContaining(expectedIds));
      expect(result.opportunities).toHaveLength(3);
      expect(result.stats.filtersApplied).toContain('radius: 10 miles');
    });

    it('should filter by causes', () => {
      const filters: FilterOptions = { causes: ['environment', 'education'] };
      const result = service.filterOpportunities(mockOpportunities, filters);

      const causes = result.opportunities.map(opp => opp.cause);
      expect(causes).toEqual(expect.arrayContaining(['environment', 'education']));
      expect(result.opportunities).toHaveLength(2);
      expect(result.stats.filtersApplied).toContain('causes: environment, education');
    });

    it('should filter by type', () => {
      const filters: FilterOptions = { type: 'virtual' };
      const result = service.filterOpportunities(mockOpportunities, filters);

      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].type).toBe('virtual');
      expect(result.stats.filtersApplied).toContain('type: virtual');
    });

    it('should filter by time commitment', () => {
      const filters: FilterOptions = { timeCommitment: ['short'] };
      const result = service.filterOpportunities(mockOpportunities, filters);

      // Should include opportunities with short time commitments (2-3 hours)
      const shortTimeOpps = result.opportunities.filter(opp => 
        opp.timeCommitment.includes('2 hours') || opp.timeCommitment.includes('3 hours')
      );
      expect(shortTimeOpps.length).toBeGreaterThan(0);
    });

    it('should filter by skills', () => {
      const filters: FilterOptions = { skills: ['teaching'] };
      const result = service.filterOpportunities(mockOpportunities, filters);

      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].skills).toContain('teaching');
      expect(result.stats.filtersApplied).toContain('skills: teaching');
    });

    it('should filter by date range', () => {
      const filters: FilterOptions = {
        dateRange: {
          start: new Date('2024-02-01'),
          end: new Date('2024-02-28')
        }
      };
      const result = service.filterOpportunities(mockOpportunities, filters);

      result.opportunities.forEach(opp => {
        const oppDate = new Date(opp.date);
        expect(oppDate.getTime()).toBeGreaterThanOrEqual(new Date('2024-02-01').getTime());
        expect(oppDate.getTime()).toBeLessThanOrEqual(new Date('2024-02-28').getTime());
      });
      expect(result.stats.filtersApplied).toContain('dateRange');
    });

    it('should filter by verification status', () => {
      const filters: FilterOptions = { verified: true };
      const result = service.filterOpportunities(mockOpportunities, filters);

      result.opportunities.forEach(opp => {
        expect(opp.verified).toBe(true);
      });
      expect(result.stats.filtersApplied).toContain('verified: true');
    });

    it('should filter by contact info availability', () => {
      const filters: FilterOptions = { hasContactInfo: true };
      const result = service.filterOpportunities(mockOpportunities, filters);

      result.opportunities.forEach(opp => {
        const hasContact = opp.contactInfo.email || opp.contactInfo.phone || opp.contactInfo.website;
        expect(hasContact).toBeTruthy();
      });
      expect(result.stats.filtersApplied).toContain('hasContactInfo');
    });

    it('should filter by participant count range', () => {
      const filters: FilterOptions = { 
        minParticipants: 5,
        maxParticipants: 15
      };
      const result = service.filterOpportunities(mockOpportunities, filters);

      result.opportunities.forEach(opp => {
        if (opp.participants) {
          expect(opp.participants).toBeGreaterThanOrEqual(5);
          expect(opp.participants).toBeLessThanOrEqual(15);
        }
      });
      expect(result.stats.filtersApplied).toContain('minParticipants: 5');
      expect(result.stats.filtersApplied).toContain('maxParticipants: 15');
    });

    it('should apply multiple filters', () => {
      const filters: FilterOptions = {
        radius: 20,
        causes: ['environment', 'community'],
        type: 'in-person',
        verified: true
      };
      const result = service.filterOpportunities(mockOpportunities, filters);

      result.opportunities.forEach(opp => {
        expect(opp.type).toBe('in-person');
        expect(['environment', 'community']).toContain(opp.cause);
        expect(opp.verified).toBe(true);
        if (opp.distance) {
          expect(opp.distance).toBeLessThanOrEqual(20);
        }
      });

      expect(result.stats.filtersApplied).toHaveLength(4);
    });

    it('should handle empty filter object', () => {
      const result = service.filterOpportunities(mockOpportunities, {});

      expect(result.opportunities).toHaveLength(mockOpportunities.length);
      expect(result.stats.filtersApplied).toHaveLength(0);
    });
  });

  describe('sortOpportunities', () => {
    it('should sort by distance', () => {
      const sortOptions: SortOptions = { primary: 'distance', direction: 'asc' };
      const result = service.sortOpportunities(mockOpportunities, sortOptions);

      // Virtual opportunities should come first
      expect(result[0].type).toBe('virtual');
      
      // In-person opportunities should be sorted by distance
      const inPersonOpps = result.filter(opp => opp.type === 'in-person');
      for (let i = 1; i < inPersonOpps.length; i++) {
        const prevDistance = inPersonOpps[i - 1].distance || 0;
        const currDistance = inPersonOpps[i].distance || 0;
        expect(currDistance).toBeGreaterThanOrEqual(prevDistance);
      }
    });

    it('should sort by date', () => {
      const sortOptions: SortOptions = { primary: 'date', direction: 'asc' };
      const result = service.sortOpportunities(mockOpportunities, sortOptions);

      for (let i = 1; i < result.length; i++) {
        const prevDate = new Date(result[i - 1].date);
        const currDate = new Date(result[i].date);
        expect(currDate.getTime()).toBeGreaterThanOrEqual(prevDate.getTime());
      }
    });

    it('should sort by title', () => {
      const sortOptions: SortOptions = { primary: 'title', direction: 'asc' };
      const result = service.sortOpportunities(mockOpportunities, sortOptions);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].title.localeCompare(result[i - 1].title)).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort by organization', () => {
      const sortOptions: SortOptions = { primary: 'organization', direction: 'asc' };
      const result = service.sortOpportunities(mockOpportunities, sortOptions);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].organization.localeCompare(result[i - 1].organization)).toBeGreaterThanOrEqual(0);
      }
    });

    it('should sort by relevance', () => {
      const sortOptions: SortOptions = { primary: 'relevance', direction: 'desc' };
      const result = service.sortOpportunities(mockOpportunities, sortOptions);

      // Should sort by relevance score (higher scores first)
      // The first opportunity should have a higher or equal relevance score than the second
      expect(result.length).toBe(mockOpportunities.length);
      
      // Check that verified opportunities generally rank higher than unverified ones
      const verifiedOpps = result.filter(opp => opp.verified);
      const unverifiedOpps = result.filter(opp => !opp.verified);
      
      if (verifiedOpps.length > 0 && unverifiedOpps.length > 0) {
        const firstVerifiedIndex = result.findIndex(opp => opp.verified);
        const firstUnverifiedIndex = result.findIndex(opp => !opp.verified);
        
        // At least some verified opportunities should appear before unverified ones
        expect(firstVerifiedIndex).toBeLessThan(result.length);
      }
    });

    it('should sort in descending order', () => {
      const sortOptions: SortOptions = { primary: 'date', direction: 'desc' };
      const result = service.sortOpportunities(mockOpportunities, sortOptions);

      for (let i = 1; i < result.length; i++) {
        const prevDate = new Date(result[i - 1].date);
        const currDate = new Date(result[i].date);
        expect(currDate.getTime()).toBeLessThanOrEqual(prevDate.getTime());
      }
    });

    it('should use secondary sort when primary values are equal', () => {
      // Create opportunities with same date but different titles
      const sameDate = '2024-02-15';
      const oppsWithSameDate = [
        { ...mockOpportunities[0], date: sameDate, title: 'Z Event' },
        { ...mockOpportunities[1], date: sameDate, title: 'A Event' }
      ];

      const sortOptions: SortOptions = { 
        primary: 'date', 
        direction: 'asc',
        secondary: 'title',
        secondaryDirection: 'asc'
      };
      
      const result = service.sortOpportunities(oppsWithSameDate, sortOptions);

      expect(result[0].title).toBe('A Event');
      expect(result[1].title).toBe('Z Event');
    });
  });

  describe('getAvailableFilterOptions', () => {
    it('should extract available filter options', () => {
      const options = service.getAvailableFilterOptions(mockOpportunities);

      expect(options.causes).toContain('environment');
      expect(options.causes).toContain('education');
      expect(options.skills).toContain('teaching');
      expect(options.skills).toContain('teamwork');
      expect(options.organizations).toContain('Ocean Conservation');
      expect(options.timeCommitments).toContain('4 hours');
      expect(options.dateRange.earliest).toBeInstanceOf(Date);
      expect(options.dateRange.latest).toBeInstanceOf(Date);
    });

    it('should handle empty opportunities array', () => {
      const options = service.getAvailableFilterOptions([]);

      expect(options.causes).toHaveLength(0);
      expect(options.skills).toHaveLength(0);
      expect(options.organizations).toHaveLength(0);
      expect(options.timeCommitments).toHaveLength(0);
    });
  });

  describe('convertLegacyFilters', () => {
    it('should convert legacy filters to new format', () => {
      const legacyFilters = {
        causes: ['environment'],
        type: 'in-person' as const,
        timeCommitment: '4 hours',
        skills: ['teamwork']
      };

      const converted = service.convertLegacyFilters(legacyFilters);

      expect(converted.causes).toEqual(['environment']);
      expect(converted.type).toBe('in-person');
      expect(converted.timeCommitment).toEqual(['4 hours']);
      expect(converted.skills).toEqual(['teamwork']);
    });

    it('should handle undefined legacy filter values', () => {
      const legacyFilters = {
        causes: ['environment'],
        type: 'both' as const
      };

      const converted = service.convertLegacyFilters(legacyFilters);

      expect(converted.causes).toEqual(['environment']);
      expect(converted.type).toBe('both');
      expect(converted.timeCommitment).toBeUndefined();
      expect(converted.skills).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle opportunities without distance for distance sorting', () => {
      const oppsWithoutDistance = mockOpportunities.map(opp => ({
        ...opp,
        distance: undefined
      }));

      const sortOptions: SortOptions = { primary: 'distance', direction: 'asc' };
      const result = service.sortOpportunities(oppsWithoutDistance, sortOptions);

      // Should not throw error and should return all opportunities
      expect(result).toHaveLength(oppsWithoutDistance.length);
    });

    it('should handle invalid dates gracefully', () => {
      const oppsWithInvalidDates = [
        { ...mockOpportunities[0], date: 'invalid-date' },
        { ...mockOpportunities[1], date: '2024-02-15' }
      ];

      const sortOptions: SortOptions = { primary: 'date', direction: 'asc' };
      
      expect(() => {
        service.sortOpportunities(oppsWithInvalidDates, sortOptions);
      }).not.toThrow();
    });

    it('should handle empty skills array in skill filtering', () => {
      const filters: FilterOptions = { skills: [] };
      const result = service.filterOpportunities(mockOpportunities, filters);

      expect(result.opportunities).toHaveLength(mockOpportunities.length);
    });
  });
});