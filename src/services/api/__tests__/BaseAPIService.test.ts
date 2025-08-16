import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios, { AxiosError } from 'axios';
import { BaseAPIService } from '../BaseAPIService';
import { SearchParameters, VolunteerOpportunity, APIResult } from '../../../types/volunteer';

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Test implementation of BaseAPIService
class TestAPIService extends BaseAPIService {
  constructor() {
    super('TestService', 'https://api.test.com', 5000);
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    this.validateSearchParameters(params);
    
    try {
      const response = await this.executeWithRetry(
        () => this.client.get('/opportunities', { params }),
        'search opportunities'
      );
      
      const opportunities = response.data.map((item: any) => this.normalizeOpportunity(item));
      return this.createSuccessResult(opportunities);
    } catch (error) {
      const apiError = this.handleError(error as AxiosError, 'search opportunities');
      return this.createErrorResult(apiError);
    }
  }

  async getOpportunityDetails(id: string): Promise<VolunteerOpportunity> {
    const response = await this.client.get(`/opportunities/${id}`);
    return this.normalizeOpportunity(response.data);
  }

  protected normalizeOpportunity(rawData: any): VolunteerOpportunity {
    return {
      id: rawData.id || 'test-id',
      source: 'TestService',
      title: rawData.title || 'Test Opportunity',
      organization: rawData.organization || 'Test Org',
      description: rawData.description || 'Test description',
      location: rawData.location || 'Test Location',
      city: rawData.city || 'Test City',
      country: rawData.country || 'Test Country',
      type: rawData.type || 'in-person',
      cause: rawData.cause || 'Test Cause',
      skills: rawData.skills || [],
      timeCommitment: rawData.timeCommitment || 'Test Time',
      date: rawData.date || '2024-01-01',
      contactInfo: rawData.contactInfo || {},
      externalUrl: rawData.externalUrl || 'https://test.com',
      lastUpdated: new Date(),
      verified: rawData.verified || false
    };
  }
}

describe('BaseAPIService', () => {
  let service: TestAPIService;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Use fake timers for retry mechanism
    vi.useFakeTimers();
    
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock axios.create
    mockAxiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
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
    
    service = new TestAPIService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: 'https://api.test.com',
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'VolunteerManiac/1.0'
        }
      });
    });

    it('should setup request and response interceptors', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('searchOpportunities', () => {
    const validParams: SearchParameters = {
      location: { latitude: 40.7128, longitude: -74.0060 },
      radius: 25
    };

    it('should successfully search opportunities', async () => {
      const mockResponse = {
        data: [
          {
            id: '1',
            title: 'Test Opportunity',
            organization: 'Test Org'
          }
        ]
      };

      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await service.searchOpportunities(validParams);

      expect(result.success).toBe(true);
      expect(result.opportunities).toHaveLength(1);
      expect(result.opportunities[0].title).toBe('Test Opportunity');
      expect(result.source).toBe('TestService');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      mockAxiosInstance.get.mockRejectedValue(networkError);

      const searchPromise = service.searchOpportunities(validParams);
      
      // Fast-forward through retry delays
      await vi.runAllTimersAsync();
      
      const result = await searchPromise;

      expect(result.success).toBe(false);
      expect(result.opportunities).toHaveLength(0);
      expect(result.error).toContain('Network error');
    });

    it('should handle HTTP errors', async () => {
      const httpError = {
        response: {
          status: 404,
          data: { message: 'Not found' }
        },
        message: 'Request failed with status code 404'
      } as AxiosError;

      mockAxiosInstance.get.mockRejectedValue(httpError);

      const result = await service.searchOpportunities(validParams);

      expect(result.success).toBe(false);
      expect(result.opportunities).toHaveLength(0);
      expect(result.error).toContain('Resource not found');
    });

    it('should validate search parameters', async () => {
      const invalidParams = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 0 // Invalid radius
      };

      await expect(service.searchOpportunities(invalidParams)).rejects.toThrow(
        'Radius must be between 1 and 500 miles'
      );
    });
  });

  describe('parameter validation', () => {
    it('should reject missing location', async () => {
      const invalidParams = {
        radius: 25
      } as any;

      await expect(service.searchOpportunities(invalidParams)).rejects.toThrow(
        'Location coordinates are required'
      );
    });

    it('should reject invalid radius', async () => {
      const invalidParams = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 600 // Too large
      };

      await expect(service.searchOpportunities(invalidParams)).rejects.toThrow(
        'Radius must be between 1 and 500 miles'
      );
    });

    it('should reject invalid limit', async () => {
      const invalidParams = {
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25,
        limit: 150 // Too large
      };

      await expect(service.searchOpportunities(invalidParams)).rejects.toThrow(
        'Limit must be between 1 and 100'
      );
    });
  });

  describe('error handling', () => {
    it('should handle authentication errors', async () => {
      const authError = {
        response: {
          status: 401,
          data: { message: 'Unauthorized' }
        }
      } as AxiosError;

      mockAxiosInstance.get.mockRejectedValue(authError);

      const result = await service.searchOpportunities({
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          headers: { 'retry-after': '60' },
          data: { message: 'Rate limit exceeded' }
        }
      } as AxiosError;

      mockAxiosInstance.get.mockRejectedValue(rateLimitError);

      const searchPromise = service.searchOpportunities({
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25
      });

      // Fast-forward through retry delays
      await vi.runAllTimersAsync();
      
      const result = await searchPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 5000ms exceeded'
      } as AxiosError;

      mockAxiosInstance.get.mockRejectedValue(timeoutError);

      const searchPromise = service.searchOpportunities({
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25
      });

      // Fast-forward through retry delays
      await vi.runAllTimersAsync();
      
      const result = await searchPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain('Request timeout');
    });
  });

  describe('health check', () => {
    it('should return healthy status when service is available', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      const health = await service.getHealthStatus();

      expect(health.healthy).toBe(true);
      expect(health.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health', { timeout: 5000 });
    });

    it('should return unhealthy status when service is unavailable', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Service unavailable'));

      const health = await service.getHealthStatus();

      expect(health.healthy).toBe(false);
      expect(health.error).toBe('Service unavailable');
    });
  });

  describe('retry mechanism', () => {
    it('should retry on retryable errors', async () => {
      const serverError = {
        response: {
          status: 500,
          data: { message: 'Internal server error' }
        }
      } as AxiosError;

      // Fail twice, then succeed
      mockAxiosInstance.get
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValue({ data: [] });

      const searchPromise = service.searchOpportunities({
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25
      });

      // Fast-forward through retry delays
      await vi.runAllTimersAsync();

      const result = await searchPromise;

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors', async () => {
      const clientError = {
        response: {
          status: 400,
          data: { message: 'Bad request' }
        }
      } as AxiosError;

      mockAxiosInstance.get.mockRejectedValue(clientError);

      const result = await service.searchOpportunities({
        location: { latitude: 40.7128, longitude: -74.0060 },
        radius: 25
      });

      expect(result.success).toBe(false);
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });
  });
});