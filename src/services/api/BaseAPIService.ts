import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, AxiosError } from 'axios';
import { 
  VolunteerOpportunity, 
  SearchParameters, 
  APIResult, 
  APIError, 
  RetryConfig 
} from '../../types/volunteer';

export abstract class BaseAPIService {
  protected client: AxiosInstance;
  protected serviceName: string;
  protected retryConfig: RetryConfig;

  constructor(
    serviceName: string,
    baseURL: string,
    timeout: number = 10000,
    retryConfig?: Partial<RetryConfig>
  ) {
    this.serviceName = serviceName;
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      ...retryConfig
    };

    this.client = axios.create({
      baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'VolunteerManiac/1.0'
      }
    });

    this.setupInterceptors();
  }

  /**
   * Abstract method that each API adapter must implement
   */
  abstract searchOpportunities(params: SearchParameters): Promise<APIResult>;

  /**
   * Abstract method for getting opportunity details
   */
  abstract getOpportunityDetails(id: string): Promise<VolunteerOpportunity>;

  /**
   * Abstract method for normalizing API response to common format
   */
  protected abstract normalizeOpportunity(rawData: any): VolunteerOpportunity;

  /**
   * Setup request/response interceptors for logging and monitoring
   */
  private setupInterceptors(): void {
    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        const startTime = Date.now();
        config.metadata = { startTime };
        
        console.log(`[${this.serviceName}] Request:`, {
          method: config.method?.toUpperCase(),
          url: config.url,
          params: config.params,
          timestamp: new Date().toISOString()
        });
        
        return config;
      },
      (error) => {
        console.error(`[${this.serviceName}] Request Error:`, error);
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and error handling
    this.client.interceptors.response.use(
      (response) => {
        const endTime = Date.now();
        const startTime = response.config.metadata?.startTime || endTime;
        const duration = endTime - startTime;

        console.log(`[${this.serviceName}] Response:`, {
          status: response.status,
          url: response.config.url,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString()
        });

        return response;
      },
      (error) => {
        const endTime = Date.now();
        const startTime = error.config?.metadata?.startTime || endTime;
        const duration = endTime - startTime;

        console.error(`[${this.serviceName}] Response Error:`, {
          status: error.response?.status,
          url: error.config?.url,
          duration: `${duration}ms`,
          message: error.message,
          timestamp: new Date().toISOString()
        });

        return Promise.reject(error);
      }
    );
  }

  /**
   * Execute HTTP request with retry logic
   */
  protected async executeWithRetry<T>(
    requestFn: () => Promise<AxiosResponse<T>>,
    operation: string
  ): Promise<AxiosResponse<T>> {
    let lastError: AxiosError | Error;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as AxiosError | Error;
        
        // Don't retry on the last attempt
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (!this.isRetryableError(error as AxiosError)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
          this.retryConfig.maxDelay
        );

        console.warn(`[${this.serviceName}] ${operation} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, error);
        
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: AxiosError): boolean {
    // Network errors are retryable
    if (!error.response) {
      return true;
    }

    const status = error.response.status;
    
    // Retry on server errors (5xx) and some client errors
    return status >= 500 || status === 408 || status === 429;
  }

  /**
   * Convert axios error to APIError with user-friendly messages
   */
  protected handleError(error: AxiosError, operation: string): APIError {
    const apiError: APIError = {
      source: this.serviceName,
      type: 'network',
      message: `${operation} failed`,
      userMessage: 'Unable to connect to volunteer service',
      retryable: false,
      statusCode: error.response?.status,
      suggestions: []
    };

    if (!error.response) {
      // Network error
      apiError.type = 'network';
      apiError.message = `Network error during ${operation}: ${error.message}`;
      apiError.userMessage = `Unable to connect to ${this.serviceName}`;
      apiError.retryable = true;
      apiError.suggestions = [
        'Check your internet connection',
        'Try again in a few moments',
        'The service may be temporarily unavailable'
      ];
    } else {
      const status = error.response.status;
      
      if (status === 401 || status === 403) {
        apiError.type = 'authentication';
        apiError.message = `Authentication failed for ${operation}`;
        apiError.userMessage = `Access denied by ${this.serviceName}`;
        apiError.retryable = false;
        apiError.suggestions = [
          'This service may require authentication',
          'Try searching other sources',
          'Contact support if this persists'
        ];
      } else if (status === 429) {
        apiError.type = 'rate_limit';
        apiError.message = `Rate limit exceeded for ${operation}`;
        apiError.userMessage = `${this.serviceName} is temporarily limiting requests`;
        apiError.retryable = true;
        // Extract retry-after header if present
        const retryAfter = error.response.headers['retry-after'];
        if (retryAfter) {
          apiError.retryAfter = parseInt(retryAfter) * 1000; // Convert to milliseconds
          apiError.userMessage += `. Please wait ${retryAfter} seconds before trying again`;
        }
        apiError.suggestions = [
          'Wait a few minutes before searching again',
          'Try using fewer search filters',
          'Other sources may still be available'
        ];
      } else if (status === 503 || status === 502 || status === 504) {
        apiError.type = 'service_unavailable';
        apiError.message = `Service unavailable during ${operation}: ${status}`;
        apiError.userMessage = `${this.serviceName} is temporarily unavailable`;
        apiError.retryable = true;
        apiError.suggestions = [
          'The service may be under maintenance',
          'Try again in a few minutes',
          'Other volunteer sources are still being searched'
        ];
      } else if (status >= 500) {
        apiError.type = 'server_error';
        apiError.message = `Server error during ${operation}: ${status}`;
        apiError.userMessage = `${this.serviceName} encountered an internal error`;
        apiError.retryable = true;
        apiError.suggestions = [
          'This is a temporary server issue',
          'Try again in a few minutes',
          'Other sources may have results available'
        ];
      } else if (status === 404) {
        apiError.type = 'invalid_response';
        apiError.message = `Resource not found during ${operation}`;
        apiError.userMessage = `${this.serviceName} could not find matching opportunities`;
        apiError.retryable = false;
        apiError.suggestions = [
          'Try broadening your search criteria',
          'Check if your location is spelled correctly',
          'Other sources may have opportunities in your area'
        ];
      } else {
        apiError.message = `HTTP ${status} error during ${operation}`;
        apiError.userMessage = `${this.serviceName} returned an unexpected response`;
        apiError.suggestions = [
          'Try refreshing the page',
          'Check your search criteria',
          'Other volunteer sources are still available'
        ];
      }
    }

    if (error.code === 'ECONNABORTED') {
      apiError.type = 'timeout';
      apiError.message = `Request timeout during ${operation}`;
      apiError.userMessage = `${this.serviceName} is taking too long to respond`;
      apiError.retryable = true;
      apiError.suggestions = [
        'The service may be experiencing high traffic',
        'Try again with a smaller search radius',
        'Other sources are still being searched'
      ];
    }

    return apiError;
  }

  /**
   * Get user-friendly error message with suggestions
   */
  protected getErrorMessageWithSuggestions(error: APIError): { message: string; suggestions: string[] } {
    return {
      message: error.userMessage,
      suggestions: error.suggestions || []
    };
  }

  /**
   * Check if error indicates service is completely unavailable
   */
  protected isServiceUnavailable(error: APIError): boolean {
    return error.type === 'service_unavailable' || 
           error.type === 'network' || 
           (error.type === 'server_error' && error.statusCode && error.statusCode >= 500);
  }

  /**
   * Create successful API result
   */
  protected createSuccessResult(opportunities: VolunteerOpportunity[], responseTime?: number): APIResult {
    return {
      source: this.serviceName,
      opportunities,
      success: true,
      responseTime
    };
  }

  /**
   * Create failed API result
   */
  protected createErrorResult(error: APIError): APIResult {
    return {
      source: this.serviceName,
      opportunities: [],
      success: false,
      error: error.message
    };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate search parameters
   */
  protected validateSearchParameters(params: SearchParameters): void {
    if (!params.location) {
      throw new Error('Location coordinates are required');
    }
    
    if (params.radius <= 0 || params.radius > 500) {
      throw new Error('Radius must be between 1 and 500 miles');
    }

    if (params.limit && (params.limit <= 0 || params.limit > 100)) {
      throw new Error('Limit must be between 1 and 100');
    }
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<{ healthy: boolean; responseTime?: number; error?: string }> {
    try {
      const startTime = Date.now();
      await this.client.get('/health', { timeout: 5000 });
      const responseTime = Date.now() - startTime;
      
      return { healthy: true, responseTime };
    } catch (error) {
      return { 
        healthy: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }
}

// Extend AxiosRequestConfig to include metadata
declare module 'axios' {
  interface AxiosRequestConfig {
    metadata?: {
      startTime: number;
    };
  }
}