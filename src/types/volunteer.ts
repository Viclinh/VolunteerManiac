import { Coordinates, LocationInfo } from './location';

export interface ContactInfo {
  email?: string;
  phone?: string;
  website?: string;
}

export interface VolunteerOpportunity {
  // Core identification
  id: string;
  source: string; // API source identifier
  
  // Basic information
  title: string;
  organization: string;
  description: string;
  
  // Location information
  location: string; // Human-readable location
  city: string;
  country: string;
  coordinates?: Coordinates;
  distance?: number; // miles from search location
  
  // Opportunity details
  type: 'in-person' | 'virtual';
  cause: string;
  skills: string[];
  timeCommitment: string;
  date: string;
  participants?: number;
  
  // Contact and external info
  contactInfo: ContactInfo;
  externalUrl: string;
  image?: string;
  
  // Metadata
  lastUpdated: Date;
  verified: boolean;
  applicationDeadline?: Date;
  requirements?: string[];
}

export interface SearchParameters {
  location: Coordinates;
  radius: number; // in miles
  keywords?: string;
  causes?: string[];
  type?: 'in-person' | 'virtual' | 'both';
  limit?: number;
}

export interface SearchFilters {
  causes: string[];
  type: 'in-person' | 'virtual' | 'both';
  timeCommitment?: string;
  skills?: string[];
}

export interface APIResult {
  source: string;
  opportunities: VolunteerOpportunity[];
  success: boolean;
  error?: string;
  responseTime?: number;
}

export interface APIError {
  source: string;
  type: 'network' | 'rate_limit' | 'authentication' | 'server_error' | 'timeout' | 'service_unavailable' | 'invalid_response';
  message: string;
  userMessage: string; // User-friendly message
  retryable: boolean;
  retryAfter?: number;
  statusCode?: number;
  suggestions?: string[]; // Helpful suggestions for the user
}

export interface ServiceStatus {
  serviceName: string;
  healthy: boolean;
  responseTime?: number;
  lastChecked: Date;
  error?: string;
  consecutiveFailures: number;
}

export interface SearchProgress {
  isSearching: boolean;
  currentStep: string;
  sourcesQueried: number;
  totalSources: number;
  completedSources: string[];
  failedSources: string[];
  partialResults: boolean; // True if some sources succeeded
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffMultiplier: number;
}