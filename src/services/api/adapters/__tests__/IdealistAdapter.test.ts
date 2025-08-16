import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { IdealistAdapter } from '../IdealistAdapter';
import { SearchParameters } from '../../../../types/volunteer';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock the config
vi.mock('../../../../config/apiConfig', () => ({
  getServiceConfig: vi.fn(() => ({
    name: 'Idealist',
    baseURL: 'https://www.idealist.org/api/v1',
    apiKey: 'test-api-key',
    timeout: 10000,
    rateLimit: {
      requestsPerMinute: 100,
      requestsPerHour: 2000
    },
    retryConfig: {
      maxRetries: 3,
      baseDelay: 800,
      maxDelay: 5000,
      backoffMultiplier: 1.5
    }
  }))
}));

// Mock rate limiter
vi.mock('../../RateLimiter', () => ({
  rateLimiterManager: {
    getLimiter: vi.fn(() => ({
      waitForAllowedRequest: vi.fn().mockResolvedValue(undefined),
      recordRequest: vi.fn(),
      getRateLimitStatus: vi.fn(() => ({
        requestsInLastMinute: 25,
        requestsInLastHour: 250,
        minuteLimit: 100,
        hourLimit: 2000,
        timeUntilReset: 0
      }))
    }))
  }
}));

describe('IdealistAdapter', () => {
  let adapter: IdealistAdapter;
  let mockAxiosInstance: any;

  const mockIdealistOpportunity = {
    id: 'idealist-789',
    title: 'Environmental Cleanup Volunteer',
    description: 'Join us for a community environmental cleanup event',
    organization: {
      id: 'org-123',
      name: 'Green Earth Initiative',
      url: 'https://greenearth.org',
      email: 'info@greenearth.org',
      phone: '+1-555-0789'
    },
    location: {
      address_lines: ['789 Green St', 'Suite 100'],
      city: 'Portland',
      state: 'OR',
      postal_code: '97201',
      country: 'United States',
      latitude: 45.5152,
      longitude: -122.6784
    },
    categories: [
      { id: 'env-1', name: 'Environment' },
      { id: 'comm-1', name: 'Community' }
    ],
    skills: [
      { id: 'skill-1', name: 'Outdoor Work' },
      { id: 'skill-2', name: 'Teamwork' }
    ],
    time_commitment: {
      duration: '6 hours',
      schedule: 'Weekends'
    },
    date_posted: '2024-01-10T08:00:00Z',
    date_updated: '2024-01-25T14:30:00Z',
    start_date: '2024-03-25T09:00:00Z',
    end_date: '2024-03-25T15:00:00Z',
    is_virtual: false,
    application_url: 'https://idealist.org/volunteer/idealist-789',
    contact_info: {
      email: 'volunteer@greenearth.org',
      phone: '+1-555-0790',
      contact_name: 'Sarah Johnson'
    },
    requirements: ['Must be comfortable working outdoors', 'Bring work gloves'],
    min_age: 16,
    max_participants: 30,
    current_participants: 18,
    status: 'active',
    featured: true
  };

  const mockSearchResponse = {
    items: [mockIdealistOpportunity],
    num_items: 1,
    page: 1,
    page_size: 50,
    total_pages: 1,
    search_time: 0.15
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Mock axios.create
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      defaults: {
        headers: {
          common: {}
        }
      },
      interceptors: {
        request: {
          use: vi.fn()
        },
        response: {
          use: vi.fn()
        }
      }
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);

    adapter = new IdealistAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://www.idealist.org/api/v1',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VolunteerManiac/1.0'
        }
      });
    });

    it('should set authorization header when API key is provided', () => {
      expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBe('Token test-api-key');
    });
  });

  describe('searchOpportunities', () => {
    const validParams: SearchParameters = {
      location: { latitude: 45.5152, longitude: -122.6784 },
      radius: 25
    };

    it('should successfully search opportunities', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const result = await adapter.searchOpportunities(validParams);

      expect(result.success).toBe(true);
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].title).toBe('Environmental Cleanup Volunteer');
      expect(result.opportunities[0].source).toBe('Idealist');
      expect(result.opportunities[0].organization).toBe('Green Earth Initiative');
    });

    it('should include search parameters in API call', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const searchParams: SearchParameters = {
        location: { latitude: 45.5152, longitude: -122.6784 },
        radius: 25,
        keywords: 'environment',
        causes: ['Environment'],
        type: 'in-person',
        limit: 20
      };

      await adapter.searchOpportunities(searchParams);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search/volunteering', {
        params: {
          lat: 45.5152,
          lon: -122.6784,
          radius: 25,
          limit: 20,
          sort: 'distance',
          status: 'active',
          q: 'environment',
          category: 'Environment',
          type: 'volunteer'
        }
      });
    });

    it('should normalize opportunity data correctly', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const result = await adapter.searchOpportunities(validParams);
      const opportunity = result.opportunities[0];

      expect(opportunity).toEqual({
        id: 'idealist-789',
        source: 'Idealist',
        title: 'Environmental Cleanup Volunteer',
        organization: 'Green Earth Initiative',
        description: 'Join us for a community environmental cleanup event',
        location: '789 Green St, Suite 100, Portland, OR, 97201, United States',
        city: 'Portland',
        country: 'United States',
        coordinates: {
          latitude: 45.5152,
          longitude: -122.6784
        },
        type: 'in-person',
        cause: 'Environment',
        skills: ['Outdoor Work', 'Teamwork'],
        timeCommitment: '6 hours (Weekends)',
        date: '2024-03-25T09:00:00Z',
        participants: 18,
        contactInfo: {
          email: 'volunteer@greenearth.org',
          phone: '+1-555-0790',
          website: 'https://greenearth.org'
        },
        externalUrl: 'https://idealist.org/volunteer/idealist-789',
        lastUpdated: new Date('2024-01-25T14:30:00Z'),
        verified: true,
        applicationDeadline: new Date('2024-03-25T15:00:00Z'),
        requirements: [
          'Must be comfortable working outdoors',
          'Bring work gloves',
          'Minimum age: 16',
          '12 spots remaining',
          'Contact: Sarah Johnson'
        ]
      });
    });

    it('should handle virtual opportunities', async () => {
      const virtualOpportunity = {
        ...mockIdealistOpportunity,
        is_virtual: true
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          items: [virtualOpportunity]
        }
      });

      const result = await adapter.searchOpportunities(validParams);

      expect(result.opportunities[0].type).toBe('virtual');
    });

    it('should handle missing optional fields', async () => {
      const minimalOpportunity = {
        id: 'idealist-minimal',
        title: 'Minimal Opportunity',
        description: 'Test description',
        organization: {
          id: 'org-minimal',
          name: 'Test Org'
        },
        location: {
          city: 'Test City',
          country: 'Test Country'
        },
        categories: [],
        skills: [],
        time_commitment: {
          duration: 'Test Duration'
        },
        date_posted: '2024-01-01T00:00:00Z',
        date_updated: '2024-01-15T12:00:00Z',
        is_virtual: false,
        application_url: 'https://test.com',
        status: 'active',
        featured: false
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          items: [minimalOpportunity]
        }
      });

      const result = await adapter.searchOpportunities(validParams);
      const opportunity = result.opportunities[0];

      expect(opportunity.skills).toEqual([]);
      expect(opportunity.coordinates).toBeUndefined();
      expect(opportunity.participants).toBeUndefined();
      expect(opportunity.applicationDeadline).toBeUndefined();
      expect(opportunity.cause).toBe('Social Impact'); // Default category
      expect(opportunity.verified).toBe(false); // Not featured
    });

    it('should filter out inactive opportunities', async () => {
      const inactiveOpportunity = {
        ...mockIdealistOpportunity,
        status: 'inactive'
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          items: [mockIdealistOpportunity, inactiveOpportunity]
        }
      });

      const result = await adapter.searchOpportunities(validParams);

      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].id).toBe('idealist-789');
    });

    it('should handle API errors', async () => {
      const apiError = {
        response: {
          status: 500,
          data: { message: 'Internal server error' }
        }
      };

      mockAxiosInstance.get.mockRejectedValue(apiError);

      const searchPromise = adapter.searchOpportunities(validParams);
      await vi.runAllTimersAsync();
      const result = await searchPromise;

      expect(result.success).toBe(false);
      expect(result.opportunities).toHaveLength(0);
      expect(result.error).toContain('Server error');
    });
  });

  describe('getOpportunityDetails', () => {
    it('should fetch opportunity details', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockIdealistOpportunity });

      const opportunity = await adapter.getOpportunityDetails('idealist-789');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/volunteering/idealist-789');
      expect(opportunity.id).toBe('idealist-789');
      expect(opportunity.title).toBe('Environmental Cleanup Volunteer');
    });
  });

  describe('getCategories', () => {
    it('should fetch available categories', async () => {
      const mockCategories = {
        categories: [
          { id: 'env-1', name: 'Environment', count: 150 },
          { id: 'edu-1', name: 'Education', count: 200 },
          { id: 'health-1', name: 'Health', count: 100 }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockCategories });

      const categories = await adapter.getCategories();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/categories/volunteering');
      expect(categories).toEqual(['Education', 'Environment', 'Health']); // Sorted by count
    });

    it('should return default categories on API failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const categoriesPromise = adapter.getCategories();
      await vi.runAllTimersAsync();
      const categories = await categoriesPromise;

      expect(categories).toContain('Social Impact');
      expect(categories).toContain('Education');
      expect(categories).toContain('Environment');
    });
  });

  describe('searchFeaturedOpportunities', () => {
    it('should search featured opportunities', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const result = await adapter.searchFeaturedOpportunities({
        location: { latitude: 45.5152, longitude: -122.6784 },
        radius: 25
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search/volunteering/featured', {
        params: {
          lat: 45.5152,
          lon: -122.6784,
          radius: 25,
          limit: 20,
          sort: 'relevance',
          status: 'active',
          featured: true
        }
      });

      expect(result.success).toBe(true);
      expect(result.opportunities).toHaveLength(1);
    });
  });

  describe('getOpportunitiesByOrganization', () => {
    it('should fetch opportunities by organization', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const opportunities = await adapter.getOpportunitiesByOrganization('org-123', 10);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/organizations/org-123/volunteering', {
        params: { limit: 10, status: 'active' }
      });
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].organization).toBe('Green Earth Initiative');
    });

    it('should return empty array on API failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const opportunitiesPromise = adapter.getOpportunitiesByOrganization('org-123');
      await vi.runAllTimersAsync();
      const opportunities = await opportunitiesPromise;

      expect(opportunities).toEqual([]);
    });
  });

  describe('getServiceStats', () => {
    it('should fetch service statistics', async () => {
      const mockStats = {
        total_volunteering_opportunities: 5000,
        active_organizations: 800,
        available_categories: 25,
        last_updated: '2024-01-25T12:00:00Z'
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockStats });

      const stats = await adapter.getServiceStats();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/stats/volunteering');
      expect(stats).toEqual({
        totalOpportunities: 5000,
        activeOrganizations: 800,
        categoriesAvailable: 25
      });
    });

    it('should return zero stats on API failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const statsPromise = adapter.getServiceStats();
      await vi.runAllTimersAsync();
      const stats = await statsPromise;

      expect(stats).toEqual({
        totalOpportunities: 0,
        activeOrganizations: 0,
        categoriesAvailable: 0
      });
    });
  });

  describe('searchByCause', () => {
    it('should perform cause-specific search', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const causeParams = {
        location: { latitude: 45.5152, longitude: -122.6784 },
        radius: 25,
        cause: 'Environment',
        subcategories: ['Wildlife', 'Conservation'],
        impactArea: 'Local',
        skillLevel: 'beginner' as const
      };

      const result = await adapter.searchByCause(causeParams);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/search/volunteering/by-cause', {
        params: {
          lat: 45.5152,
          lon: -122.6784,
          radius: 25,
          limit: 50,
          sort: 'relevance',
          status: 'active',
          category: 'Environment',
          subcategories: 'Wildlife,Conservation',
          impact_area: 'Local',
          skill_level: 'beginner'
        }
      });

      expect(result.success).toBe(true);
      expect(result.opportunities).toHaveLength(1);
    });
  });

  describe('getTrendingOpportunities', () => {
    it('should fetch trending opportunities', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const opportunities = await adapter.getTrendingOpportunities({
        location: { latitude: 45.5152, longitude: -122.6784 },
        radius: 25,
        limit: 5
      });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/trending/volunteering', {
        params: {
          lat: 45.5152,
          lon: -122.6784,
          radius: 25,
          limit: 5
        }
      });

      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].title).toBe('Environmental Cleanup Volunteer');
    });

    it('should return empty array on API failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const opportunitiesPromise = adapter.getTrendingOpportunities({
        location: { latitude: 45.5152, longitude: -122.6784 },
        radius: 25
      });
      await vi.runAllTimersAsync();
      const opportunities = await opportunitiesPromise;

      expect(opportunities).toEqual([]);
    });
  });

  describe('feature support', () => {
    it('should report supported features correctly', () => {
      expect(adapter.supportsFeature('virtual_opportunities')).toBe(true);
      expect(adapter.supportsFeature('skill_matching')).toBe(true);
      expect(adapter.supportsFeature('real_time_updates')).toBe(false);
      expect(adapter.supportsFeature('bulk_search')).toBe(true);
    });
  });

  describe('rate limiting', () => {
    it('should provide rate limit status', () => {
      const status = adapter.getRateLimitStatus();

      expect(status).toEqual({
        requestsInLastMinute: 25,
        requestsInLastHour: 250,
        minuteLimit: 100,
        hourLimit: 2000,
        timeUntilReset: 0
      });
    });
  });

  describe('parameter validation', () => {
    it('should validate search parameters', async () => {
      const invalidParams = {
        location: { latitude: 45.5152, longitude: -122.6784 },
        radius: 1000 // Invalid radius (too large)
      };

      await expect(adapter.searchOpportunities(invalidParams)).rejects.toThrow(
        'Radius must be between 1 and 500 miles'
      );
    });
  });

  describe('buildRequirements', () => {
    it('should handle full participants scenario', async () => {
      const fullOpportunity = {
        ...mockIdealistOpportunity,
        max_participants: 20,
        current_participants: 20
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          items: [fullOpportunity]
        }
      });

      const result = await adapter.searchOpportunities({
        location: { latitude: 45.5152, longitude: -122.6784 },
        radius: 25
      });

      const requirements = result.opportunities[0].requirements;
      expect(requirements).toContain('Currently full - check for waitlist');
    });

    it('should build requirements from various fields', async () => {
      const opportunityWithRequirements = {
        ...mockIdealistOpportunity,
        requirements: ['Background check required'],
        min_age: 21,
        max_participants: 25,
        current_participants: 15,
        contact_info: {
          ...mockIdealistOpportunity.contact_info,
          contact_name: 'John Doe'
        }
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          items: [opportunityWithRequirements]
        }
      });

      const result = await adapter.searchOpportunities({
        location: { latitude: 45.5152, longitude: -122.6784 },
        radius: 25
      });

      const requirements = result.opportunities[0].requirements;
      expect(requirements).toContain('Background check required');
      expect(requirements).toContain('Minimum age: 21');
      expect(requirements).toContain('10 spots remaining');
      expect(requirements).toContain('Contact: John Doe');
    });
  });
});