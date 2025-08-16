import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { VolunteerHubAdapter } from '../VolunteerHubAdapter';
import { SearchParameters } from '../../../../types/volunteer';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock the config
vi.mock('../../../../config/apiConfig', () => ({
  getServiceConfig: vi.fn(() => ({
    name: 'VolunteerHub',
    baseURL: 'https://api.volunteerhub.com/v1',
    apiKey: 'test-api-key',
    timeout: 10000,
    rateLimit: {
      requestsPerMinute: 60,
      requestsPerHour: 1000
    },
    retryConfig: {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
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
        requestsInLastMinute: 5,
        requestsInLastHour: 50,
        minuteLimit: 60,
        hourLimit: 1000,
        timeUntilReset: 0
      }))
    }))
  }
}));

describe('VolunteerHubAdapter', () => {
  let adapter: VolunteerHubAdapter;
  let mockAxiosInstance: any;

  const mockVolunteerHubOpportunity = {
    id: 'vh-123',
    title: 'Community Garden Volunteer',
    organization: {
      name: 'Green City Initiative',
      website: 'https://greencity.org',
      email: 'contact@greencity.org',
      phone: '+1-555-0123'
    },
    description: 'Help maintain our community garden',
    location: {
      address: '123 Garden St',
      city: 'New York',
      state: 'NY',
      country: 'United States',
      coordinates: {
        lat: 40.7128,
        lng: -74.0060
      }
    },
    category: 'Environment',
    skills_required: ['Gardening', 'Physical Labor'],
    time_commitment: '3 hours',
    event_date: '2024-03-15T10:00:00Z',
    max_participants: 20,
    current_participants: 5,
    is_virtual: false,
    external_url: 'https://greencity.org/volunteer',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-15T12:00:00Z',
    verified: true,
    application_deadline: '2024-03-10T23:59:59Z',
    requirements: ['Must be 18+', 'Bring water bottle']
  };

  const mockSearchResponse = {
    opportunities: [mockVolunteerHubOpportunity],
    total_count: 1,
    page: 1,
    per_page: 50,
    has_more: false
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

    adapter = new VolunteerHubAdapter();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.volunteerhub.com/v1',
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VolunteerManiac/1.0'
        }
      });
    });

    it('should set authorization header when API key is provided', () => {
      expect(mockAxiosInstance.defaults.headers.common['Authorization']).toBe('Bearer test-api-key');
    });
  });

  describe('searchOpportunities', () => {
    const validParams: SearchParameters = {
      location: { latitude: 40.7128, longitude: -74.0060 },
      radius: 25
    };

    it('should successfully search opportunities', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const result = await adapter.searchOpportunities(validParams);

      expect(result.success).toBe(true);
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].title).toBe('Community Garden Volunteer');
      expect(result.opportunities[0].source).toBe('VolunteerHub');
      expect(result.opportunities[0].organization).toBe('Green City Initiative');
    });

    it('should include search parameters in API call', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const searchParams: SearchParameters = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        keywords: 'environment',
        causes: ['Environment'],
        type: 'in-person',
        limit: 20
      };

      await adapter.searchOpportunities(searchParams);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/opportunities/search', {
        params: {
          lat: 40.7128,
          lng: -74.0060,
          radius: 25,
          limit: 20,
          q: 'environment',
          category: 'Environment',
          type: 'in-person'
        }
      });
    });

    it('should normalize opportunity data correctly', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: mockSearchResponse });

      const result = await adapter.searchOpportunities(validParams);
      const opportunity = result.opportunities[0];

      expect(opportunity).toEqual({
        id: 'vh-123',
        source: 'VolunteerHub',
        title: 'Community Garden Volunteer',
        organization: 'Green City Initiative',
        description: 'Help maintain our community garden',
        location: '123 Garden St, New York, NY, United States',
        city: 'New York',
        country: 'United States',
        coordinates: {
          latitude: 40.7128,
          longitude: -74.0060
        },
        type: 'in-person',
        cause: 'Environment',
        skills: ['Gardening', 'Physical Labor'],
        timeCommitment: '3 hours',
        date: '2024-03-15T10:00:00Z',
        participants: 5,
        contactInfo: {
          email: 'contact@greencity.org',
          phone: '+1-555-0123',
          website: 'https://greencity.org'
        },
        externalUrl: 'https://greencity.org/volunteer',
        lastUpdated: new Date('2024-01-15T12:00:00Z'),
        verified: true,
        applicationDeadline: new Date('2024-03-10T23:59:59Z'),
        requirements: ['Must be 18+', 'Bring water bottle']
      });
    });

    it('should handle virtual opportunities', async () => {
      const virtualOpportunity = {
        ...mockVolunteerHubOpportunity,
        is_virtual: true
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          opportunities: [virtualOpportunity]
        }
      });

      const result = await adapter.searchOpportunities(validParams);

      expect(result.opportunities[0].type).toBe('virtual');
    });

    it('should handle missing optional fields', async () => {
      const minimalOpportunity = {
        id: 'vh-456',
        title: 'Minimal Opportunity',
        organization: {
          name: 'Test Org'
        },
        description: 'Test description',
        location: {
          address: 'Test Address',
          city: 'Test City',
          country: 'Test Country'
        },
        category: 'Test Category',
        time_commitment: 'Test Time',
        event_date: '2024-03-15T10:00:00Z',
        is_virtual: false,
        external_url: 'https://test.com',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-15T12:00:00Z',
        verified: false
      };

      mockAxiosInstance.get.mockResolvedValue({
        data: {
          ...mockSearchResponse,
          opportunities: [minimalOpportunity]
        }
      });

      const result = await adapter.searchOpportunities(validParams);
      const opportunity = result.opportunities[0];

      expect(opportunity.skills).toEqual([]);
      expect(opportunity.coordinates).toBeUndefined();
      expect(opportunity.participants).toBeUndefined();
      expect(opportunity.applicationDeadline).toBeUndefined();
      expect(opportunity.requirements).toBeUndefined();
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
      mockAxiosInstance.get.mockResolvedValue({ data: mockVolunteerHubOpportunity });

      const opportunity = await adapter.getOpportunityDetails('vh-123');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/opportunities/vh-123');
      expect(opportunity.id).toBe('vh-123');
      expect(opportunity.title).toBe('Community Garden Volunteer');
    });
  });

  describe('getCategories', () => {
    it('should fetch available categories', async () => {
      const mockCategories = {
        categories: ['Environment', 'Education', 'Health']
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockCategories });

      const categories = await adapter.getCategories();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/categories');
      expect(categories).toEqual(['Environment', 'Education', 'Health']);
    });

    it('should return default categories on API failure', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('API Error'));

      const categoriesPromise = adapter.getCategories();
      await vi.runAllTimersAsync();
      const categories = await categoriesPromise;

      expect(categories).toContain('Education');
      expect(categories).toContain('Environment');
      expect(categories).toContain('Health');
    });
  });

  describe('getServiceStats', () => {
    it('should fetch service statistics', async () => {
      const mockStats = {
        total_opportunities: 1500,
        active_organizations: 250,
        categories_count: 12
      };

      mockAxiosInstance.get.mockResolvedValue({ data: mockStats });

      const stats = await adapter.getServiceStats();

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/stats');
      expect(stats).toEqual({
        totalOpportunities: 1500,
        activeOrganizations: 250,
        categoriesAvailable: 12
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
        requestsInLastMinute: 5,
        requestsInLastHour: 50,
        minuteLimit: 60,
        hourLimit: 1000,
        timeUntilReset: 0
      });
    });
  });

  describe('parameter validation', () => {
    it('should validate search parameters', async () => {
      const invalidParams = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 0 // Invalid radius
      };

      await expect(adapter.searchOpportunities(invalidParams)).rejects.toThrow(
        'Radius must be between 1 and 500 miles'
      );
    });
  });
});