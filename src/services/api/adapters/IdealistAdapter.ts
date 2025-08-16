import { BaseAPIService } from '../BaseAPIService';
import { 
  VolunteerOpportunity, 
  SearchParameters, 
  APIResult,
  ContactInfo 
} from '../../../types/volunteer';
import { getServiceConfig } from '../../../config/apiConfig';
import { rateLimiterManager } from '../RateLimiter';

// Idealist API response interfaces
interface IdealistOpportunity {
  id: string;
  title: string;
  description: string;
  organization: {
    id: string;
    name: string;
    url?: string;
    email?: string;
    phone?: string;
  };
  location: {
    address_lines?: string[];
    city: string;
    state?: string;
    postal_code?: string;
    country: string;
    latitude?: number;
    longitude?: number;
  };
  categories: Array<{
    id: string;
    name: string;
  }>;
  skills: Array<{
    id: string;
    name: string;
  }>;
  time_commitment: {
    duration: string;
    schedule?: string;
  };
  date_posted: string;
  date_updated: string;
  start_date?: string;
  end_date?: string;
  is_virtual: boolean;
  application_url: string;
  contact_info?: {
    email?: string;
    phone?: string;
    contact_name?: string;
  };
  requirements?: string[];
  min_age?: number;
  max_participants?: number;
  current_participants?: number;
  status: 'active' | 'inactive' | 'expired';
  featured: boolean;
}

interface IdealistSearchResponse {
  items: IdealistOpportunity[];
  num_items: number;
  page: number;
  page_size: number;
  total_pages: number;
  search_time: number;
}

interface IdealistSearchParams {
  lat: number;
  lon: number;
  radius: number; // in miles
  q?: string;
  category?: string;
  type?: 'volunteer' | 'virtual';
  limit?: number;
  page?: number;
  sort?: 'date' | 'distance' | 'relevance';
  status?: string;
}

export class IdealistAdapter extends BaseAPIService {
  private rateLimiter;

  constructor() {
    const config = getServiceConfig('idealist');
    super(
      config.name,
      config.baseURL,
      config.timeout,
      config.retryConfig
    );

    // Set up authentication if API key is provided
    if (config.apiKey) {
      this.client.defaults.headers.common['Authorization'] = `Token ${config.apiKey}`;
    }

    // Initialize rate limiter
    this.rateLimiter = rateLimiterManager.getLimiter(
      'idealist',
      config.rateLimit!
    );
  }

  async searchOpportunities(params: SearchParameters): Promise<APIResult> {
    this.validateSearchParameters(params);

    try {
      // Check rate limits
      await this.rateLimiter.waitForAllowedRequest('idealist');

      const searchParams: IdealistSearchParams = {
        lat: params.location.latitude,
        lon: params.location.longitude,
        radius: params.radius,
        limit: params.limit || 50,
        sort: 'distance',
        status: 'active'
      };

      // Add optional parameters
      if (params.keywords) {
        searchParams.q = params.keywords;
      }

      if (params.causes && params.causes.length > 0) {
        // Idealist might support multiple categories, but we'll use the first one
        searchParams.category = params.causes[0];
      }

      if (params.type === 'virtual') {
        searchParams.type = 'virtual';
      } else if (params.type === 'in-person') {
        searchParams.type = 'volunteer';
      }

      const startTime = Date.now();

      const response = await this.executeWithRetry(
        () => this.client.get<IdealistSearchResponse>('/search/volunteering', {
          params: searchParams
        }),
        'search opportunities'
      );

      // Record successful request
      this.rateLimiter.recordRequest('idealist');

      const responseTime = Date.now() - startTime;
      const opportunities = response.data.items
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
    await this.rateLimiter.waitForAllowedRequest('idealist');

    const response = await this.executeWithRetry(
      () => this.client.get<IdealistOpportunity>(`/volunteering/${id}`),
      'get opportunity details'
    );

    // Record successful request
    this.rateLimiter.recordRequest('idealist');

    return this.normalizeOpportunity(response.data);
  }

  protected normalizeOpportunity(rawData: IdealistOpportunity): VolunteerOpportunity {
    // Build contact info from multiple sources
    const contactInfo: ContactInfo = {
      email: rawData.contact_info?.email || rawData.organization.email,
      phone: rawData.contact_info?.phone || rawData.organization.phone,
      website: rawData.organization.url
    };

    // Build location string
    const locationParts: string[] = [];
    if (rawData.location.address_lines && rawData.location.address_lines.length > 0) {
      locationParts.push(...rawData.location.address_lines);
    }
    locationParts.push(rawData.location.city);
    if (rawData.location.state) {
      locationParts.push(rawData.location.state);
    }
    if (rawData.location.postal_code) {
      locationParts.push(rawData.location.postal_code);
    }
    locationParts.push(rawData.location.country);

    // Determine primary category
    const primaryCategory = rawData.categories && rawData.categories.length > 0 
      ? rawData.categories[0].name 
      : 'Social Impact';

    // Extract skills
    const skills = rawData.skills ? rawData.skills.map(skill => skill.name) : [];

    // Build time commitment string
    let timeCommitment = rawData.time_commitment.duration;
    if (rawData.time_commitment.schedule) {
      timeCommitment += ` (${rawData.time_commitment.schedule})`;
    }

    // Determine event date
    const eventDate = rawData.start_date || rawData.date_posted;

    return {
      id: rawData.id,
      source: 'Idealist',
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
      skills,
      timeCommitment,
      date: eventDate,
      participants: rawData.current_participants,
      contactInfo,
      externalUrl: rawData.application_url,
      lastUpdated: new Date(rawData.date_updated),
      verified: rawData.featured, // Featured opportunities are typically more verified
      applicationDeadline: rawData.end_date ? new Date(rawData.end_date) : undefined,
      requirements: this.buildRequirements(rawData)
    };
  }

  /**
   * Build requirements array from various Idealist fields
   */
  private buildRequirements(rawData: IdealistOpportunity): string[] {
    const requirements: string[] = [];

    if (rawData.requirements) {
      requirements.push(...rawData.requirements);
    }

    if (rawData.min_age) {
      requirements.push(`Minimum age: ${rawData.min_age}`);
    }

    if (rawData.max_participants) {
      const spotsLeft = rawData.max_participants - (rawData.current_participants || 0);
      if (spotsLeft > 0) {
        requirements.push(`${spotsLeft} spots remaining`);
      } else {
        requirements.push('Currently full - check for waitlist');
      }
    }

    if (rawData.contact_info?.contact_name) {
      requirements.push(`Contact: ${rawData.contact_info.contact_name}`);
    }

    return requirements;
  }

  /**
   * Get available categories from Idealist
   */
  async getCategories(): Promise<string[]> {
    try {
      await this.rateLimiter.waitForAllowedRequest('idealist');

      const response = await this.executeWithRetry(
        () => this.client.get<{ categories: Array<{ id: string; name: string; count: number }> }>('/categories/volunteering'),
        'get categories'
      );

      this.rateLimiter.recordRequest('idealist');
      return response.data.categories
        .sort((a, b) => b.count - a.count) // Sort by popularity
        .map(cat => cat.name);

    } catch (error) {
      console.warn('[Idealist] Failed to fetch categories:', error);
      // Return default categories if API fails
      return [
        'Social Impact',
        'Education',
        'Environment',
        'Health & Medicine',
        'Community Development',
        'Arts & Culture',
        'Human Rights',
        'International Development',
        'Animals & Wildlife',
        'Disaster Relief',
        'Technology',
        'Sports & Recreation'
      ];
    }
  }

  /**
   * Search featured opportunities (typically higher quality)
   */
  async searchFeaturedOpportunities(params: SearchParameters): Promise<APIResult> {
    this.validateSearchParameters(params);

    try {
      await this.rateLimiter.waitForAllowedRequest('idealist');

      const searchParams: IdealistSearchParams & { featured: boolean } = {
        lat: params.location.latitude,
        lon: params.location.longitude,
        radius: params.radius,
        limit: params.limit || 20,
        sort: 'relevance',
        status: 'active',
        featured: true
      };

      if (params.keywords) {
        searchParams.q = params.keywords;
      }

      if (params.causes && params.causes.length > 0) {
        searchParams.category = params.causes[0];
      }

      const startTime = Date.now();

      const response = await this.executeWithRetry(
        () => this.client.get<IdealistSearchResponse>('/search/volunteering/featured', {
          params: searchParams
        }),
        'search featured opportunities'
      );

      this.rateLimiter.recordRequest('idealist');

      const responseTime = Date.now() - startTime;
      const opportunities = response.data.items
        .filter(item => item.status === 'active')
        .map(item => this.normalizeOpportunity(item));

      return this.createSuccessResult(opportunities, responseTime);

    } catch (error) {
      const apiError = this.handleError(error as any, 'search featured opportunities');
      return this.createErrorResult(apiError);
    }
  }

  /**
   * Get opportunities by organization
   */
  async getOpportunitiesByOrganization(organizationId: string, limit: number = 20): Promise<VolunteerOpportunity[]> {
    try {
      await this.rateLimiter.waitForAllowedRequest('idealist');

      const response = await this.executeWithRetry(
        () => this.client.get<IdealistSearchResponse>(`/organizations/${organizationId}/volunteering`, {
          params: { limit, status: 'active' }
        }),
        'get organization opportunities'
      );

      this.rateLimiter.recordRequest('idealist');

      return response.data.items
        .filter(item => item.status === 'active')
        .map(item => this.normalizeOpportunity(item));

    } catch (error) {
      console.warn(`[Idealist] Failed to fetch opportunities for organization ${organizationId}:`, error);
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
      await this.rateLimiter.waitForAllowedRequest('idealist');

      const response = await this.executeWithRetry(
        () => this.client.get<{
          total_volunteering_opportunities: number;
          active_organizations: number;
          available_categories: number;
          last_updated: string;
        }>('/stats/volunteering'),
        'get service stats'
      );

      this.rateLimiter.recordRequest('idealist');

      return {
        totalOpportunities: response.data.total_volunteering_opportunities,
        activeOrganizations: response.data.active_organizations,
        categoriesAvailable: response.data.available_categories
      };

    } catch (error) {
      console.warn('[Idealist] Failed to fetch service stats:', error);
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
    return this.rateLimiter.getRateLimitStatus('idealist');
  }

  /**
   * Search opportunities with cause-specific filters
   */
  async searchByCause(params: SearchParameters & {
    cause: string;
    subcategories?: string[];
    impactArea?: string;
    skillLevel?: 'beginner' | 'intermediate' | 'advanced';
  }): Promise<APIResult> {
    this.validateSearchParameters(params);

    try {
      await this.rateLimiter.waitForAllowedRequest('idealist');

      const searchParams: IdealistSearchParams & {
        subcategories?: string;
        impact_area?: string;
        skill_level?: string;
      } = {
        lat: params.location.latitude,
        lon: params.location.longitude,
        radius: params.radius,
        limit: params.limit || 50,
        sort: 'relevance',
        status: 'active',
        category: params.cause
      };

      if (params.subcategories && params.subcategories.length > 0) {
        searchParams.subcategories = params.subcategories.join(',');
      }

      if (params.impactArea) {
        searchParams.impact_area = params.impactArea;
      }

      if (params.skillLevel) {
        searchParams.skill_level = params.skillLevel;
      }

      if (params.keywords) {
        searchParams.q = params.keywords;
      }

      const startTime = Date.now();

      const response = await this.executeWithRetry(
        () => this.client.get<IdealistSearchResponse>('/search/volunteering/by-cause', {
          params: searchParams
        }),
        'search by cause'
      );

      this.rateLimiter.recordRequest('idealist');

      const responseTime = Date.now() - startTime;
      const opportunities = response.data.items
        .filter(item => item.status === 'active')
        .map(item => this.normalizeOpportunity(item));

      return this.createSuccessResult(opportunities, responseTime);

    } catch (error) {
      const apiError = this.handleError(error as any, 'search by cause');
      return this.createErrorResult(apiError);
    }
  }

  /**
   * Get trending opportunities in a location
   */
  async getTrendingOpportunities(params: {
    location: { latitude: number; longitude: number };
    radius: number;
    limit?: number;
  }): Promise<VolunteerOpportunity[]> {
    try {
      await this.rateLimiter.waitForAllowedRequest('idealist');

      const response = await this.executeWithRetry(
        () => this.client.get<IdealistSearchResponse>('/trending/volunteering', {
          params: {
            lat: params.location.latitude,
            lon: params.location.longitude,
            radius: params.radius,
            limit: params.limit || 10
          }
        }),
        'get trending opportunities'
      );

      this.rateLimiter.recordRequest('idealist');

      return response.data.items
        .filter(item => item.status === 'active')
        .map(item => this.normalizeOpportunity(item));

    } catch (error) {
      console.warn('[Idealist] Failed to fetch trending opportunities:', error);
      return [];
    }
  }
}