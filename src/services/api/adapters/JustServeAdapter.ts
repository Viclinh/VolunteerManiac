import { BaseAPIService } from '../BaseAPIService';
import { 
  VolunteerOpportunity, 
  SearchParameters, 
  APIResult,
  ContactInfo 
} from '../../../types/volunteer';
import { getServiceConfig } from '../../../config/apiConfig';
import { rateLimiterManager } from '../RateLimiter';

// JustServe API response interfaces
interface JustServeOpportunity {
  id: number;
  title: string;
  description: string;
  organization: {
    id: number;
    name: string;
    website?: string;
    contact_email?: string;
    contact_phone?: string;
  };
  location: {
    street_address?: string;
    city: string;
    state?: string;
    zip_code?: string;
    country: string;
    latitude?: number;
    longitude?: number;
  };
  categories: string[];
  skills: string[];
  duration: string;
  start_date: string;
  end_date?: string;
  is_virtual: boolean;
  volunteer_count?: number;
  spots_available?: number;
  application_url: string;
  created_date: string;
  modified_date: string;
  status: 'active' | 'inactive' | 'full';
  requirements?: string[];
  age_requirement?: string;
}

interface JustServeSearchResponse {
  results: JustServeOpportunity[];
  total_results: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface JustServeSearchParams {
  latitude: number;
  longitude: number;
  radius: number; // in miles
  query?: string;
  categories?: string;
  is_virtual?: boolean;
  limit?: number;
  page?: number;
  status?: string;
}

export class JustServeAdapter extends BaseAPIService {
  private rateLimiter;

  constructor() {
    const config = getServiceConfig('justServe');
    super(
      config.name,
      config.baseURL,
      config.timeout,
      config.retryConfig
    );

    // Set up authentication if API key is provided
    if (config.apiKey) {
      this.client.defaults.headers.common['X-API-Key'] = config.apiKey;
    }

    // Initialize rate limiter
    this.rateLimiter = rateLimiterManager.getLimiter(
      'justServe',
      config.rateLimit!
    );
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    this.validateSearchParameters(params);

    try {
      // Check rate limits
      await this.rateLimiter.waitForAllowedRequest('justServe');

      const searchParams: JustServeSearchParams = {
        latitude: params.location.latitude,
        longitude: params.location.longitude,
        radius: params.radius,
        limit: params.limit || 50,
        status: 'active'
      };

      // Add optional parameters
      if (params.keywords) {
        searchParams.query = params.keywords;
      }

      if (params.causes && params.causes.length > 0) {
        searchParams.categories = params.causes.join(',');
      }

      if (params.type === 'virtual') {
        searchParams.is_virtual = true;
      } else if (params.type === 'in-person') {
        searchParams.is_virtual = false;
      }

      const startTime = Date.now();

      const response = await this.executeWithRetry(
        () => this.client.get<JustServeSearchResponse>('/opportunities', {
          params: searchParams
        }),
        'search opportunities'
      );

      // Record successful request
      this.rateLimiter.recordRequest('justServe');

      const responseTime = Date.now() - startTime;
      const opportunities = response.data.results
        .filter(item => item.status === 'active') // Additional filtering
        .map(item => this.normalizeOpportunity(item));

      return this.createSuccessResult(opportunities, responseTime);

    } catch (error) {
      const apiError = this.handleError(error as any, 'search opportunities');
      return this.createErrorResult(apiError);
    }
  }

  async getOpportunityDetails(id: string): Promise<VolunteerOpportunity> {
    // Check rate limits
    await this.rateLimiter.waitForAllowedRequest('justServe');

    const response = await this.executeWithRetry(
      () => this.client.get<JustServeOpportunity>(`/opportunities/${id}`),
      'get opportunity details'
    );

    // Record successful request
    this.rateLimiter.recordRequest('justServe');

    return this.normalizeOpportunity(response.data);
  }

  protected normalizeOpportunity(rawData: JustServeOpportunity): VolunteerOpportunity {
    const contactInfo: ContactInfo = {
      email: rawData.organization.contact_email,
      phone: rawData.organization.contact_phone,
      website: rawData.organization.website
    };

    // Build location string
    const locationParts: string[] = [];
    if (rawData.location.street_address) {
      locationParts.push(rawData.location.street_address);
    }
    locationParts.push(rawData.location.city);
    if (rawData.location.state) {
      locationParts.push(rawData.location.state);
    }
    if (rawData.location.zip_code) {
      locationParts.push(rawData.location.zip_code);
    }
    locationParts.push(rawData.location.country);

    // Determine primary category
    const primaryCategory = rawData.categories && rawData.categories.length > 0 
      ? rawData.categories[0] 
      : 'Community Service';

    // Format date - JustServe uses different date format
    const eventDate = rawData.start_date;

    return {
      id: rawData.id.toString(),
      source: 'JustServe',
      title: rawData.title,
      organization: rawData.organization.name,
      description: rawData.description,
      location: locationParts.join(', '),
      city: rawData.location.city,
      country: rawData.location.country,
      coordinates: (rawData.location.latitude && rawData.location.longitude) ? {
        latitude: rawData.location.latitude,
        longitude: rawData.location.longitude
      } : undefined,
      type: rawData.is_virtual ? 'virtual' : 'in-person',
      cause: primaryCategory,
      skills: rawData.skills || [],
      timeCommitment: rawData.duration,
      date: eventDate,
      participants: rawData.volunteer_count,
      contactInfo,
      externalUrl: rawData.application_url,
      lastUpdated: new Date(rawData.modified_date),
      verified: true, // JustServe opportunities are generally verified
      applicationDeadline: rawData.end_date ? new Date(rawData.end_date) : undefined,
      requirements: this.buildRequirements(rawData)
    };
  }

  /**
   * Build requirements array from various JustServe fields
   */
  private buildRequirements(rawData: JustServeOpportunity): string[] {
    const requirements: string[] = [];

    if (rawData.requirements) {
      requirements.push(...rawData.requirements);
    }

    if (rawData.age_requirement) {
      requirements.push(`Age requirement: ${rawData.age_requirement}`);
    }

    if (rawData.spots_available) {
      requirements.push(`${rawData.spots_available} spots available`);
    }

    return requirements;
  }

  /**
   * Get available categories from JustServe
   */
  async getCategories(): Promise<string[]> {
    try {
      await this.rateLimiter.waitForAllowedRequest('justServe');

      const response = await this.executeWithRetry(
        () => this.client.get<{ categories: Array<{ id: number; name: string }> }>('/categories'),
        'get categories'
      );

      this.rateLimiter.recordRequest('justServe');
      return response.data.categories.map(cat => cat.name);

    } catch (error) {
      console.warn('[JustServe] Failed to fetch categories:', error);
      // Return default categories if API fails
      return [
        'Community Service',
        'Education & Literacy',
        'Environment',
        'Health & Medicine',
        'Human Services',
        'Arts & Culture',
        'Animals',
        'Disaster Relief',
        'International',
        'Public Safety',
        'Religion',
        'Sports & Recreation'
      ];
    }
  }

  /**
   * Get opportunities by organization
   */
  async getOpportunitiesByOrganization(organizationId: number, limit: number = 20): Promise<VolunteerOpportunity[]> {
    try {
      await this.rateLimiter.waitForAllowedRequest('justServe');

      const response = await this.executeWithRetry(
        () => this.client.get<JustServeSearchResponse>(`/organizations/${organizationId}/opportunities`, {
          params: { limit, status: 'active' }
        }),
        'get organization opportunities'
      );

      this.rateLimiter.recordRequest('justServe');

      return response.data.results.map(item => this.normalizeOpportunity(item));

    } catch (error) {
      console.warn(`[JustServe] Failed to fetch opportunities for organization ${organizationId}:`, error);
      return [];
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
      await this.rateLimiter.waitForAllowedRequest('justServe');

      const response = await this.executeWithRetry(
        () => this.client.get<{
          total_opportunities: number;
          active_organizations: number;
          total_categories: number;
        }>('/stats'),
        'get service stats'
      );

      this.rateLimiter.recordRequest('justServe');

      return {
        totalOpportunities: response.data.total_opportunities,
        activeOrganizations: response.data.active_organizations,
        categoriesAvailable: response.data.total_categories
      };

    } catch (error) {
      console.warn('[JustServe] Failed to fetch service stats:', error);
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
      real_time_updates: true,
      bulk_search: false
    };

    return supportedFeatures[feature] || false;
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.rateLimiter.getRateLimitStatus('justServe');
  }

  /**
   * Search opportunities with advanced filters specific to JustServe
   */
  async searchWithAdvancedFilters(params: SearchParameters & {
    ageRequirement?: string;
    spotsAvailable?: boolean;
    organizationId?: number;
    dateRange?: {
      start: Date;
      end: Date;
    };
  }): Promise<APIResult> {
    this.validateSearchParameters(params);

    try {
      await this.rateLimiter.waitForAllowedRequest('justServe');

      const searchParams: JustServeSearchParams & {
        age_requirement?: string;
        has_spots?: boolean;
        organization_id?: number;
        start_date_after?: string;
        start_date_before?: string;
      } = {
        latitude: params.location.latitude,
        longitude: params.location.longitude,
        radius: params.radius,
        limit: params.limit || 50,
        status: 'active'
      };

      // Add JustServe-specific parameters
      if (params.ageRequirement) {
        searchParams.age_requirement = params.ageRequirement;
      }

      if (params.spotsAvailable) {
        searchParams.has_spots = true;
      }

      if (params.organizationId) {
        searchParams.organization_id = params.organizationId;
      }

      if (params.dateRange) {
        searchParams.start_date_after = params.dateRange.start.toISOString();
        searchParams.start_date_before = params.dateRange.end.toISOString();
      }

      // Add standard parameters
      if (params.keywords) {
        searchParams.query = params.keywords;
      }

      if (params.causes && params.causes.length > 0) {
        searchParams.categories = params.causes.join(',');
      }

      if (params.type === 'virtual') {
        searchParams.is_virtual = true;
      } else if (params.type === 'in-person') {
        searchParams.is_virtual = false;
      }

      const startTime = Date.now();

      const response = await this.executeWithRetry(
        () => this.client.get<JustServeSearchResponse>('/opportunities/advanced', {
          params: searchParams
        }),
        'advanced search opportunities'
      );

      this.rateLimiter.recordRequest('justServe');

      const responseTime = Date.now() - startTime;
      const opportunities = response.data.results
        .filter(item => item.status === 'active')
        .map(item => this.normalizeOpportunity(item));

      return this.createSuccessResult(opportunities, responseTime);

    } catch (error) {
      const apiError = this.handleError(error as any, 'advanced search opportunities');
      return this.createErrorResult(apiError);
    }
  }
}