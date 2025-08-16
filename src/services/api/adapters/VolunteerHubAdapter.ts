import { BaseAPIService } from '../BaseAPIService';
import { 
  VolunteerOpportunity, 
  SearchParameters, 
  APIResult,
  ContactInfo 
} from '../../../types/volunteer';
import { getServiceConfig } from '../../../config/apiConfig';
import { rateLimiterManager } from '../RateLimiter';

// VolunteerHub API response interfaces
interface VolunteerHubOpportunity {
  id: string;
  title: string;
  organization: {
    name: string;
    website?: string;
    email?: string;
    phone?: string;
  };
  description: string;
  location: {
    address: string;
    city: string;
    state?: string;
    country: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  };
  category: string;
  skills_required: string[];
  time_commitment: string;
  event_date: string;
  max_participants?: number;
  current_participants?: number;
  is_virtual: boolean;
  external_url: string;
  created_at: string;
  updated_at: string;
  verified: boolean;
  application_deadline?: string;
  requirements?: string[];
}

interface VolunteerHubSearchResponse {
  opportunities: VolunteerHubOpportunity[];
  total_count: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

interface VolunteerHubSearchParams {
  lat: number;
  lng: number;
  radius: number; // in miles
  q?: string; // search query
  category?: string;
  skills?: string;
  type?: 'in-person' | 'virtual' | 'both';
  limit?: number;
  page?: number;
}

export class VolunteerHubAdapter extends BaseAPIService {
  private rateLimiter;

  constructor() {
    const config = getServiceConfig('volunteerHub');
    super(
      config.name,
      config.baseURL,
      config.timeout,
      config.retryConfig
    );

    // Set up authentication if API key is provided
    if (config.apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Bearer ${config.apiKey}`;
    }

    // Initialize rate limiter
    this.rateLimiter = rateLimiterManager.getLimiter(
      'volunteerHub',
      config.rateLimit!
    );
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    this.validateSearchParameters(params);

    try {
      // Check rate limits
      await this.rateLimiter.waitForAllowedRequest('volunteerHub');

      const searchParams: VolunteerHubSearchParams = {
        lat: params.location.latitude,
        lng: params.location.longitude,
        radius: params.radius,
        limit: params.limit || 50
      };

      // Add optional parameters
      if (params.keywords) {
        searchParams.q = params.keywords;
      }

      if (params.causes && params.causes.length > 0) {
        searchParams.category = params.causes[0]; // VolunteerHub might only support one category
      }

      if (params.type && params.type !== 'both') {
        searchParams.type = params.type;
      }

      const startTime = Date.now();

      const response = await this.executeWithRetry(
        () => this.client.get<VolunteerHubSearchResponse>('/opportunities/search', {
          params: searchParams
        }),
        'search opportunities'
      );

      // Record successful request
      this.rateLimiter.recordRequest('volunteerHub');

      const responseTime = Date.now() - startTime;
      const opportunities = response.data.opportunities.map(item => 
        this.normalizeOpportunity(item)
      );

      return this.createSuccessResult(opportunities, responseTime);

    } catch (error) {
      const apiError = this.handleError(error as any, 'search opportunities');
      return this.createErrorResult(apiError);
    }
  }

  async getOpportunityDetails(id: string): Promise<VolunteerOpportunity> {
    // Check rate limits
    await this.rateLimiter.waitForAllowedRequest('volunteerHub');

    const response = await this.executeWithRetry(
      () => this.client.get<VolunteerHubOpportunity>(`/opportunities/${id}`),
      'get opportunity details'
    );

    // Record successful request
    this.rateLimiter.recordRequest('volunteerHub');

    return this.normalizeOpportunity(response.data);
  }

  protected normalizeOpportunity(rawData: VolunteerHubOpportunity): VolunteerOpportunity {
    const contactInfo: ContactInfo = {
      email: rawData.organization.email,
      phone: rawData.organization.phone,
      website: rawData.organization.website
    };

    // Build location string
    const locationParts = [rawData.location.address, rawData.location.city];
    if (rawData.location.state) {
      locationParts.push(rawData.location.state);
    }
    locationParts.push(rawData.location.country);

    return {
      id: rawData.id,
      source: 'VolunteerHub',
      title: rawData.title,
      organization: rawData.organization.name,
      description: rawData.description,
      location: locationParts.join(', '),
      city: rawData.location.city,
      country: rawData.location.country,
      coordinates: rawData.location.coordinates ? {
        latitude: rawData.location.coordinates.lat,
        longitude: rawData.location.coordinates.lng
      } : undefined,
      type: rawData.is_virtual ? 'virtual' : 'in-person',
      cause: rawData.category,
      skills: rawData.skills_required || [],
      timeCommitment: rawData.time_commitment,
      date: rawData.event_date,
      participants: rawData.current_participants,
      contactInfo,
      externalUrl: rawData.external_url,
      lastUpdated: new Date(rawData.updated_at),
      verified: rawData.verified,
      applicationDeadline: rawData.application_deadline ? 
        new Date(rawData.application_deadline) : undefined,
      requirements: rawData.requirements
    };
  }

  /**
   * Get available categories from VolunteerHub
   */
  async getCategories(): Promise<string[]> {
    try {
      await this.rateLimiter.waitForAllowedRequest('volunteerHub');

      const response = await this.executeWithRetry(
        () => this.client.get<{ categories: string[] }>('/categories'),
        'get categories'
      );

      this.rateLimiter.recordRequest('volunteerHub');
      return response.data.categories;

    } catch (error) {
      console.warn('[VolunteerHub] Failed to fetch categories:', error);
      // Return default categories if API fails
      return [
        'Education',
        'Environment',
        'Health',
        'Community',
        'Animals',
        'Arts & Culture',
        'Disaster Relief',
        'Elderly Care',
        'Youth Development',
        'Homelessness'
      ];
    }
  }

  /**
   * Get service statistics
   */
  async getServiceStats(): Promise<{
    totalOpportunities: number;
    activeOrganizations: number;
    categoriesAvailable: number;
  }> {
    try {
      await this.rateLimiter.waitForAllowedRequest('volunteerHub');

      const response = await this.executeWithRetry(
        () => this.client.get<{
          total_opportunities: number;
          active_organizations: number;
          categories_count: number;
        }>('/stats'),
        'get service stats'
      );

      this.rateLimiter.recordRequest('volunteerHub');

      return {
        totalOpportunities: response.data.total_opportunities,
        activeOrganizations: response.data.active_organizations,
        categoriesAvailable: response.data.categories_count
      };

    } catch (error) {
      console.warn('[VolunteerHub] Failed to fetch service stats:', error);
      return {
        totalOpportunities: 0,
        activeOrganizations: 0,
        categoriesAvailable: 0
      };
    }
  }

  /**
   * Check if the service supports a specific feature
   */
  supportsFeature(feature: 'virtual_opportunities' | 'skill_matching' | 'real_time_updates' | 'bulk_search'): boolean {
    const supportedFeatures = {
      virtual_opportunities: true,
      skill_matching: true,
      real_time_updates: false,
      bulk_search: true
    };

    return supportedFeatures[feature] || false;
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getRateLimitStatus('volunteerHub');
  }
}