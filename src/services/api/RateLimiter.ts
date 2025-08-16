export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
}

interface RequestRecord {
  timestamp: number;
}

export class RateLimiter {
  private requests: Map<string, RequestRecord[]> = new Map();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if a request is allowed under rate limits
   */
  async isRequestAllowed(serviceKey: string): Promise<boolean> {
    const now = Date.now();
    const requests = this.getServiceRequests(serviceKey);
    
    // Clean up old requests
    this.cleanupOldRequests(requests, now);
    
    // Check minute limit
    const requestsInLastMinute = requests.filter(
      req => now - req.timestamp < 60000
    ).length;
    
    if (requestsInLastMinute >= this.config.requestsPerMinute) {
      return false;
    }
    
    // Check hour limit
    const requestsInLastHour = requests.filter(
      req => now - req.timestamp < 3600000
    ).length;
    
    if (requestsInLastHour >= this.config.requestsPerHour) {
      return false;
    }
    
    return true;
  }

  /**
   * Record a request
   */
  recordRequest(serviceKey: string): void {
    const requests = this.getServiceRequests(serviceKey);
    requests.push({ timestamp: Date.now() });
  }

  /**
   * Wait until a request is allowed
   */
  async waitForAllowedRequest(serviceKey: string): Promise<void> {
    while (!(await this.isRequestAllowed(serviceKey))) {
      // Calculate wait time based on rate limits
      const waitTime = this.calculateWaitTime(serviceKey);
      await this.sleep(waitTime);
    }
  }

  /**
   * Get time until next request is allowed (in milliseconds)
   */
  getTimeUntilNextRequest(serviceKey: string): number {
    const now = Date.now();
    const requests = this.getServiceRequests(serviceKey);
    
    // Clean up old requests
    this.cleanupOldRequests(requests, now);
    
    // Check minute limit
    const requestsInLastMinute = requests.filter(
      req => now - req.timestamp < 60000
    );
    
    if (requestsInLastMinute.length >= this.config.requestsPerMinute) {
      // Find oldest request in the last minute
      const oldestInMinute = Math.min(...requestsInLastMinute.map(req => req.timestamp));
      return 60000 - (now - oldestInMinute);
    }
    
    // Check hour limit
    const requestsInLastHour = requests.filter(
      req => now - req.timestamp < 3600000
    );
    
    if (requestsInLastHour.length >= this.config.requestsPerHour) {
      // Find oldest request in the last hour
      const oldestInHour = Math.min(...requestsInLastHour.map(req => req.timestamp));
      return 3600000 - (now - oldestInHour);
    }
    
    return 0; // Request can be made immediately
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(serviceKey: string): {
    requestsInLastMinute: number;
    requestsInLastHour: number;
    minuteLimit: number;
    hourLimit: number;
    timeUntilReset: number;
  } {
    const now = Date.now();
    const requests = this.getServiceRequests(serviceKey);
    
    this.cleanupOldRequests(requests, now);
    
    const requestsInLastMinute = requests.filter(
      req => now - req.timestamp < 60000
    ).length;
    
    const requestsInLastHour = requests.filter(
      req => now - req.timestamp < 3600000
    ).length;
    
    return {
      requestsInLastMinute,
      requestsInLastHour,
      minuteLimit: this.config.requestsPerMinute,
      hourLimit: this.config.requestsPerHour,
      timeUntilReset: this.getTimeUntilNextRequest(serviceKey)
    };
  }

  /**
   * Reset rate limit for a service (useful for testing)
   */
  resetRateLimit(serviceKey: string): void {
    this.requests.delete(serviceKey);
  }

  /**
   * Reset all rate limits
   */
  resetAllRateLimits(): void {
    this.requests.clear();
  }

  /**
   * Get requests for a specific service
   */
  private getServiceRequests(serviceKey: string): RequestRecord[] {
    if (!this.requests.has(serviceKey)) {
      this.requests.set(serviceKey, []);
    }
    return this.requests.get(serviceKey)!;
  }

  /**
   * Clean up old requests that are outside the tracking window
   */
  private cleanupOldRequests(requests: RequestRecord[], now: number): void {
    // Keep only requests from the last hour
    const cutoff = now - 3600000;
    const validRequests = requests.filter(req => req.timestamp > cutoff);
    
    // Update the array in place
    requests.length = 0;
    requests.push(...validRequests);
  }

  /**
   * Calculate optimal wait time
   */
  private calculateWaitTime(serviceKey: string): number {
    const timeUntilNext = this.getTimeUntilNextRequest(serviceKey);
    // Add a small buffer to avoid edge cases
    return Math.max(timeUntilNext + 100, 1000);
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Global rate limiter instances for each service
 */
export class RateLimiterManager {
  private limiters: Map<string, RateLimiter> = new Map();

  /**
   * Get or create rate limiter for a service
   */
  getLimiter(serviceKey: string, config: RateLimitConfig): RateLimiter {
    if (!this.limiters.has(serviceKey)) {
      this.limiters.set(serviceKey, new RateLimiter(config));
    }
    return this.limiters.get(serviceKey)!;
  }

  /**
   * Remove rate limiter for a service
   */
  removeLimiter(serviceKey: string): void {
    this.limiters.delete(serviceKey);
  }

  /**
   * Get all rate limit statuses
   */
  getAllStatuses(): Record<string, ReturnType<RateLimiter['getRateLimitStatus']>> {
    const statuses: Record<string, ReturnType<RateLimiter['getRateLimitStatus']>> = {};
    
    this.limiters.forEach((limiter, serviceKey) => {
      statuses[serviceKey] = limiter.getRateLimitStatus(serviceKey);
    });
    
    return statuses;
  }

  /**
   * Reset all rate limiters
   */
  resetAll(): void {
    this.limiters.forEach(limiter => limiter.resetAllRateLimits());
  }
}

// Export singleton instance
export const rateLimiterManager = new RateLimiterManager();