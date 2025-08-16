import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { JustServeAdapter } from '../JustServeAdapter';
import { SearchParameters } from '../../../../types/volunteer';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock the config
vi.mock('../../../../config/apiConfig', () => ({
  getServiceConfig: vi.fn(() => ({
    name: 'JustServe',
    baseURL: 'https://api.justserve.org/v2',
    apiKey: 'test-api-key',
    timeout: 12000,
    rateLimit: {
      requestsPerMinute: 30,
      requestsPerHour: 500
    },
    retryConfig: {
      maxRetries: 2,
      baseDelay: 1500,
      maxDelay: 8000,
      backoffMultiplier: 2
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
        requestsInLastMinute: 10,
        requestsInLastHour: 100,
        minuteLimit: 30,
        hourLimit: 500,
        timeUntilReset: 0
      }))
    }))
  }
}));

describe('JustServeAdapter', () => {
  let adapter: JustServeAdapter;
  let mockAxiosInstance: any;

  const mockJustServeOpportunity = {
    id: 12345,
    title: 'Food Bank Volunteer',
    description: 'Help sort and distribute food to families in need',
    organization: {
      id: 678,
      name: 'City Food Bank',
      website: 'https://cityfoodbank.org',
      contact_email: 'volunteer@cityfoodbank.org',
      contact_phone: '+1-555-0456'
    },
    location: {
      street_address: '456 Main St',
      city: 'Springfield',
      state: 'IL',
      zip_code: '62701',
      country: 'United States',
      latitude: 39.7817,
      longitude: -89.6501
    },
    categories: ['Human Services', 'Community Service'],
    skills: ['Customer Service', 'Physical Labor'],
    duration: '4 hours',
    start_date: '2024-03-20T09:00:00Z',
    end_date: '2024-03-20T13:00:00Z',
    is_virtual: false,
    volunteer_count: 12,
    spots_available: 8,
    application_url: 'https://justserve.org/opportunity/12345',
    created_date: '2024-01-05T10:00:00Z',
    modified_date: '2024-01-20T15:30:00Z',
    status: 'active',
    requirements: ['Must be 16+', 'Comfortable standing for long periods'],
    age_requirement: '16+'
  };

  const mockSearchResponse = {
    results: [mockJustServeOpportunity],
    total_results: 1,
    page: 1,
    page_size: 50,
    total_pages: 1
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

    adapter = new JustServeAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.justserve.org/v2',
        timeout: 12000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VolunteerManiac/1.0'
        }
      });
    });

    it('should set API key header when provided', () => {
      expect(mockAxiosInstance.defaults.headers.common['X-API-Key']).toBe('test-api-key');
    });
  });

  describe('searchOpportunities', () => {
    const validParams: SearchParameters = {
      location: { latitude: 39.7817, longitude: -89.6501 },
      radius: 25
    };

    it('should successfully search opportunities', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const result = await adapter.searchOpportunities(validParams);

      expect(result.success).toBe(true);
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].title).toBe('Food Bank Volunteer');
      expect(result.opportunities[0].source).toBe('JustServe');
      expect(result.opportunities[0].organization).toBe('City Food Bank');
    });

    it('should include search parameters in API call', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const searchParams: SearchParameters = {
        location: { latitude: 39.7817, longitude: -89.6501 },
        radius: 25,
        keywords: 'food bank',
        causes: ['Human Services', 'Community Service'],
        type: 'in-person',
        limit: 20
      };

      await adapter.searchOpportunities(searchParams);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/opportunities', {
        params: {
          latitude: 39.7817,
          longitude: -89.6501,
          radius: 25,
          limit: 20,
          status: 'active',
          query: 'food bank',
          categories: 'Human Services,Community Service',
          is_virtual: false
        }
      });
    });

    it('should normalize opportunity data correctly', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const result = await adapter.searchOpportunities(validParams);
      const opportunity = result.opportunities[0];

      expect(opportunity).toEqual({
        id: '12345',
        source: 'JustServe',
        title: 'Food Bank Volunteer',
        organization: 'City Food Bank',
        description: 'Help sort and distribute food to families in need',
        location: '456 Main St, Springfield, IL, 62701, United States',
        city: 'Springfield',
        country: 'United States',
        coordinates: {
          latitude: 39.7817,
          longitude: -89.6501
        },
        type: 'in-person',
        cause: 'Human Services',
        skills: ['Customer Service', 'Physical Labor'],
        timeCommitment: '4 hours',
        date: '2024-03-20T09:00:00Z',
        participants: 12,
        contactInfo: {
          email: 'volunteer@cityfoodbank.org',
          phone: '+1-555-0456',
          website: 'https://cityfoodbank.org'
        },
        externalUrl: 'https://justserve.org/opportunity/12345',
        lastUpdated: new Date('2024-01-20T15:30:00Z'),
        verified: true,
        applicationDeadline: new Date('2024-03-20T13:00:00Z'),
        requirements: [
          'Must be 16+',
          'Comfortable standing for long periods',
          'Age requirement: 16+',
          '8 spots available'
        ]
      });
    });

    it('should handle virtual opportunities', async () => {
      const virtualOpportunity = {
        ...mockJustServeOpportunity,
        is_virtual: true
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          results: [virtualOpportunity]
        }
      });

      const result = await adapter.searchOpportunities(validParams);

      expect(result.opportunities[0].type).toBe('virtual');
    });

    it('should handle missing optional fields', async () => {
      const minimalOpportunity = {
        id: 67890,
        title: 'Minimal Opportunity',
        description: 'Test description',
        organization: {
          id: 999,
          name: 'Test Org'
        },
        location: {
          city: 'Test City',
          country: 'Test Country'
        },
        categories: [],
        duration: 'Test Duration',
        start_date: '2024-03-20T09:00:00Z',
        is_virtual: false,
        application_url: 'https://test.com',
        created_date: '2024-01-01T00:00:00Z',
        modified_date: '2024-01-15T12:00:00Z',
        status: 'active'
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          results: [minimalOpportunity]
        }
      });

      const result = await adapter.searchOpportunities(validParams);
      const opportunity = result.opportunities[0];

      expect(opportunity.skills).toEqual([]);
      expect(opportunity.coordinates).toBeUndefined();
      expect(opportunity.participants).toBeUndefined();
      expect(opportunity.applicationDeadline).toBeUndefined();
      expect(opportunity.cause).toBe('Community Service'); // Default category
    });

    it('should filter out inactive opportunities', async () => {
      const inactiveOpportunity = {
        ...mockJustServeOpportunity,
        status: 'inactive'
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          results: [mockJustServeOpportunity, inactiveOpportunity]
        }
      });

      const result = await adapter.searchOpportunities(validParams);

      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].id).toBe('12345');
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
      mockAxiosInstance.get.mockResolvedValue({ data: mockJustServeOpportunity });

      const opportunity = await adapter.getOpportunityDetails('12345');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/opportunities/12345');
      expect(opportunity.id).toBe('12345');
      expect(opportunity.title).toBe('Food Bank Volunteer');
    });
  });

  describe('getCategories', () => {
    it('should fetch available categories', async () => {
      const mockCategories = {
        categories: [
          { id: 1, name: 'Human Services' },
          { id: 2, name: 'Education & Literacy' },
          { id: 3, name: 'Environment' }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockCategories });

      const categories = await adapter.getCategories();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/categories');
      expect(categories).toEqual(['Human Services', 'Education & Literacy', 'Environment']);
    });

    it('should return default categories on API failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const categoriesPromise = adapter.getCategories();
      await vi.runAllTimersAsync();
      const categories = await categoriesPromise;

      expect(categories).toContain('Community Service');
      expect(categories).toContain('Education & Literacy');
      expect(categories).toContain('Environment');
    });
  });

  describe('getOpportunitiesByOrganization', () => {
    it('should fetch opportunities by organization', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const opportunities = await adapter.getOpportunitiesByOrganization(678, 10);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/organizations/678/opportunities', {
        params: { limit: 10, status: 'active' }
      });
      expect(opportunities).toHaveLength(1);
      expect(opportunities[0].organization).toBe('City Food Bank');
    });

    it('should return empty array on API failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const opportunitiesPromise = adapter.getOpportunitiesByOrganization(678);
      await vi.runAllTimersAsync();
      const opportunities = await opportunitiesPromise;

      expect(opportunities).toEqual([]);
    });
  });

  describe('getServiceStats', () => {
    it('should fetch service statistics', async () => {
      const mockStats = {
        total_opportunities: 2500,
        active_organizations: 400,
        total_categories: 15
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockStats });

      const stats = await adapter.getServiceStats();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/stats');
      expect(stats).toEqual({
        totalOpportunities: 2500,
        activeOrganizations: 400,
        categoriesAvailable: 15
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

  describe('searchWithAdvancedFilters', () => {
    it('should perform advanced search with additional filters', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const advancedParams = {
        location: { latitude: 39.7817, longitude: -89.6501 },
        radius: 25,
        ageRequirement: '18+',
        spotsAvailable: true,
        organizationId: 678,
        dateRange: {
          start: new Date('2024-03-01'),
          end: new Date('2024-03-31')
        }
      };

      const result = await adapter.searchWithAdvancedFilters(advancedParams);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/opportunities/advanced', {
        params: {
          latitude: 39.7817,
          longitude: -89.6501,
          radius: 25,
          limit: 50,
          status: 'active',
          age_requirement: '18+',
          has_spots: true,
          organization_id: 678,
          start_date_after: '2024-03-01T00:00:00.000Z',
          start_date_before: '2024-03-31T00:00:00.000Z'
        }
      });

      expect(result.success).toBe(true);
      expect(result.opportunities).toHaveLength(1);
    });
  });

  describe('feature support', () => {
    it('should report supported features correctly', () => {
      expect(adapter.supportsFeature('virtual_opportunities')).toBe(true);
      expect(adapter.supportsFeature('skill_matching')).toBe(true);
      expect(adapter.supportsFeature('real_time_updates')).toBe(true);
      expect(adapter.supportsFeature('bulk_search')).toBe(false);
    });
  });

  describe('rate limiting', () => {
    it('should provide rate limit status', () => {
      const status = adapter.getRateLimitStatus();

      expect(status).toEqual({
        requestsInLastMinute: 10,
        requestsInLastHour: 100,
        minuteLimit: 30,
        hourLimit: 500,
        timeUntilReset: 0
      });
    });
  });

  describe('parameter validation', () => {
    it('should validate search parameters', async () => {
      const invalidParams = {
        location: { latitude: 39.7817, longitude: -89.6501 },
        radius: -5 // Invalid radius
      };

      await expect(adapter.searchOpportunities(invalidParams)).rejects.toThrow(
        'Radius must be between 1 and 500 miles'
      );
    });
  });

  describe('buildRequirements', () => {
    it('should build requirements from various fields', async () => {
      const opportunityWithRequirements = {
        ...mockJustServeOpportunity,
        requirements: ['Background check required'],
        age_requirement: '21+',
        spots_available: 5
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          results: [opportunityWithRequirements]
        }
      });

      const result = await adapter.searchOpportunities({
        location: { latitude: 39.7817, longitude: -89.6501 },
        radius: 25
      });

      const requirements = result.opportunities[0].requirements;
      expect(requirements).toContain('Background check required');
      expect(requirements).toContain('Age requirement: 21+');
      expect(requirements).toContain('5 spots available');
    });
  });
});