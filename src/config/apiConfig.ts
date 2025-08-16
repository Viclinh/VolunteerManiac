export interface APIServiceConfig {
  name: string;
  baseURL: string;
  apiKey?: string;
  timeout: number;
  enabled: boolean;
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
  retryConfig?: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
}

export interface APIConfiguration {
  services: {
    volunteerHub: APIServiceConfig;
    justServe: APIServiceConfig;
    idealist: APIServiceConfig;
  };
  global: {
    defaultTimeout: number;
    maxConcurrentRequests: number;
    enableLogging: boolean;
    enableHealthChecks: boolean;
    healthCheckInterval: number; // milliseconds
  };
}

// Default configuration
export const defaultAPIConfig: APIConfiguration = {
  services: {
    volunteerHub: {
      name: 'VolunteerHub',
      baseURL: process.env.VITE_VOLUNTEERHUB_API_URL || 'https://api.volunteerhub.com/v1',
      apiKey: process.env.VITE_VOLUNTEERHUB_API_KEY,
      timeout: 15000,
      enabled: true,
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
    },
    justServe: {
      name: 'JustServe',
      baseURL: process.env.VITE_JUSTSERVE_API_URL || 'https://api.justserve.org/v2',
      apiKey: process.env.VITE_JUSTSERVE_API_KEY,
      timeout: 12000,
      enabled: true,
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
    },
    idealist: {
      name: 'Idealist',
      baseURL: process.env.VITE_IDEALIST_API_URL || 'https://www.idealist.org/api/v1',
      apiKey: process.env.VITE_IDEALIST_API_KEY,
      timeout: 10000,
      enabled: true,
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
    }
  },
  global: {
    defaultTimeout: 10000,
    maxConcurrentRequests: 5,
    enableLogging: process.env.NODE_ENV === 'development',
    enableHealthChecks: true,
    healthCheckInterval: 300000 // 5 minutes
  }
};

/**
 * Get configuration for a specific service
 */
export function getServiceConfig(serviceName: keyof APIConfiguration['services']): APIServiceConfig {
  return defaultAPIConfig.services[serviceName];
}

/**
 * Get global configuration
 */
export function getGlobalConfig(): APIConfiguration['global'] {
  return defaultAPIConfig.global;
}

/**
 * Validate API configuration
 */
export function validateAPIConfig(config: APIConfiguration): string[] {
  const errors: string[] = [];

  // Validate service configurations
  Object.entries(config.services).forEach(([serviceName, serviceConfig]) => {
    if (!serviceConfig.baseURL) {
      errors.push(`${serviceName}: baseURL is required`);
    }
    
    if (serviceConfig.timeout <= 0) {
      errors.push(`${serviceName}: timeout must be positive`);
    }
    
    if (serviceConfig.rateLimit) {
      if (serviceConfig.rateLimit.requestsPerMinute <= 0) {
        errors.push(`${serviceName}: requestsPerMinute must be positive`);
      }
      if (serviceConfig.rateLimit.requestsPerHour <= 0) {
        errors.push(`${serviceName}: requestsPerHour must be positive`);
      }
    }
    
    if (serviceConfig.retryConfig) {
      const retry = serviceConfig.retryConfig;
      if (retry.maxRetries < 0) {
        errors.push(`${serviceName}: maxRetries cannot be negative`);
      }
      if (retry.baseDelay <= 0) {
        errors.push(`${serviceName}: baseDelay must be positive`);
      }
      if (retry.maxDelay <= retry.baseDelay) {
        errors.push(`${serviceName}: maxDelay must be greater than baseDelay`);
      }
      if (retry.backoffMultiplier <= 1) {
        errors.push(`${serviceName}: backoffMultiplier must be greater than 1`);
      }
    }
  });

  // Validate global configuration
  if (config.global.defaultTimeout <= 0) {
    errors.push('global: defaultTimeout must be positive');
  }
  
  if (config.global.maxConcurrentRequests <= 0) {
    errors.push('global: maxConcurrentRequests must be positive');
  }
  
  if (config.global.healthCheckInterval <= 0) {
    errors.push('global: healthCheckInterval must be positive');
  }

  return errors;
}

/**
 * Check if a service is properly configured
 */
export function isServiceConfigured(serviceName: keyof APIConfiguration['services']): boolean {
  const config = getServiceConfig(serviceName);
  return config.enabled && !!config.baseURL && (config.apiKey !== undefined || !requiresApiKey(serviceName));
}

/**
 * Check if a service requires an API key
 */
function requiresApiKey(serviceName: keyof APIConfiguration['services']): boolean {
  // Most services require API keys, but some might not
  // This can be configured based on actual API requirements
  return true;
}