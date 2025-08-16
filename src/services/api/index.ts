// Base API service architecture
export { BaseAPIService } from './BaseAPIService';
export { APIServiceRegistry, apiServiceRegistry } from './APIServiceRegistry';
export { RateLimiter, RateLimiterManager, rateLimiterManager } from './RateLimiter';

// API Adapters
export { VolunteerHubAdapter, JustServeAdapter, IdealistAdapter } from './adapters';

// Types
export type { ServiceHealth } from './APIServiceRegistry';
export type { RateLimitConfig } from './RateLimiter';

// Re-export volunteer types for convenience
export type {
  VolunteerOpportunity,
  SearchParameters,
  SearchFilters,
  APIResult,
  APIError,
  RetryConfig,
  ContactInfo
} from '../../types/volunteer';

// Re-export location types for convenience
export type {
  Coordinates,
  LocationInfo,
  GeolocationResult,
  LocationSuggestion,
  GeolocationError
} from '../../types/location';

// Re-export API configuration
export {
  defaultAPIConfig,
  getServiceConfig,
  getGlobalConfig,
  validateAPIConfig,
  isServiceConfigured
} from '../../config/apiConfig';

export type {
  APIServiceConfig,
  APIConfiguration
} from '../../config/apiConfig';