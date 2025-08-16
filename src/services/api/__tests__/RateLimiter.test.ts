import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, RateLimiterManager } from '../RateLimiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.useFakeTimers();
    rateLimiter = new RateLimiter({
      requestsPerMinute: 5,
      requestsPerHour: 20
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('request allowance', () => {
    it('should allow requests under the limit', async () => {
      const allowed = await rateLimiter.isRequestAllowed('test-service');
      expect(allowed).toBe(true);
    });

    it('should record requests', () => {
      rateLimiter.recordRequest('test-service');
      
      const status = rateLimiter.getRateLimitStatus('test-service');
      expect(status.requestsInLastMinute).toBe(1);
      expect(status.requestsInLastHour).toBe(1);
    });

    it('should enforce minute limit', async () => {
      // Make 5 requests (at the limit)
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest('test-service');
      }

      const allowed = await rateLimiter.isRequestAllowed('test-service');
      expect(allowed).toBe(false);
    });

    it('should enforce hour limit', async () => {
      // Make 20 requests (at the hour limit)
      for (let i = 0; i < 20; i++) {
        rateLimiter.recordRequest('test-service');
      }

      const allowed = await rateLimiter.isRequestAllowed('test-service');
      expect(allowed).toBe(false);
    });

    it('should allow requests after time window expires', async () => {
      // Fill up the minute limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest('test-service');
      }

      expect(await rateLimiter.isRequestAllowed('test-service')).toBe(false);

      // Advance time by 61 seconds
      vi.advanceTimersByTime(61000);

      expect(await rateLimiter.isRequestAllowed('test-service')).toBe(true);
    });
  });

  describe('rate limit status', () => {
    it('should provide accurate status', () => {
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordRequest('test-service');
      }

      const status = rateLimiter.getRateLimitStatus('test-service');
      
      expect(status.requestsInLastMinute).toBe(3);
      expect(status.requestsInLastHour).toBe(3);
      expect(status.minuteLimit).toBe(5);
      expect(status.hourLimit).toBe(20);
    });

    it('should calculate time until reset', () => {
      // Fill up the minute limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest('test-service');
      }

      const timeUntilReset = rateLimiter.getTimeUntilNextRequest('test-service');
      expect(timeUntilReset).toBeGreaterThan(0);
      expect(timeUntilReset).toBeLessThanOrEqual(60000);
    });
  });

  describe('cleanup', () => {
    it('should clean up old requests', () => {
      // Make requests
      for (let i = 0; i < 3; i++) {
        rateLimiter.recordRequest('test-service');
      }

      // Advance time by 2 hours
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      const status = rateLimiter.getRateLimitStatus('test-service');
      expect(status.requestsInLastMinute).toBe(0);
      expect(status.requestsInLastHour).toBe(0);
    });
  });

  describe('waiting for allowed requests', () => {
    it('should wait until request is allowed', async () => {
      // Fill up the minute limit
      for (let i = 0; i < 5; i++) {
        rateLimiter.recordRequest('test-service');
      }

      const waitPromise = rateLimiter.waitForAllowedRequest('test-service');
      
      // Should be waiting
      expect(await rateLimiter.isRequestAllowed('test-service')).toBe(false);

      // Advance time to allow request
      vi.advanceTimersByTime(61000);

      await waitPromise;
      expect(await rateLimiter.isRequestAllowed('test-service')).toBe(true);
    });
  });

  describe('reset functionality', () => {
    it('should reset rate limit for specific service', () => {
      rateLimiter.recordRequest('test-service');
      rateLimiter.recordRequest('other-service');

      rateLimiter.resetRateLimit('test-service');

      const testStatus = rateLimiter.getRateLimitStatus('test-service');
      const otherStatus = rateLimiter.getRateLimitStatus('other-service');

      expect(testStatus.requestsInLastMinute).toBe(0);
      expect(otherStatus.requestsInLastMinute).toBe(1);
    });

    it('should reset all rate limits', () => {
      rateLimiter.recordRequest('test-service');
      rateLimiter.recordRequest('other-service');

      rateLimiter.resetAllRateLimits();

      const testStatus = rateLimiter.getRateLimitStatus('test-service');
      const otherStatus = rateLimiter.getRateLimitStatus('other-service');

      expect(testStatus.requestsInLastMinute).toBe(0);
      expect(otherStatus.requestsInLastMinute).toBe(0);
    });
  });
});

describe('RateLimiterManager', () => {
  let manager: RateLimiterManager;

  beforeEach(() => {
    manager = new RateLimiterManager();
  });

  describe('limiter management', () => {
    it('should create and return rate limiters', () => {
      const config = { requestsPerMinute: 10, requestsPerHour: 100 };
      
      const limiter1 = manager.getLimiter('service1', config);
      const limiter2 = manager.getLimiter('service1', config); // Same service
      const limiter3 = manager.getLimiter('service2', config); // Different service

      expect(limiter1).toBe(limiter2); // Should return same instance
      expect(limiter1).not.toBe(limiter3); // Should be different instances
    });

    it('should remove limiters', () => {
      const config = { requestsPerMinute: 10, requestsPerHour: 100 };
      
      manager.getLimiter('service1', config);
      manager.removeLimiter('service1');

      // Getting limiter again should create new instance
      const newLimiter = manager.getLimiter('service1', config);
      expect(newLimiter).toBeDefined();
    });
  });

  describe('status reporting', () => {
    it('should get all statuses', () => {
      const config = { requestsPerMinute: 10, requestsPerHour: 100 };
      
      const limiter1 = manager.getLimiter('service1', config);
      const limiter2 = manager.getLimiter('service2', config);

      limiter1.recordRequest('service1');
      limiter2.recordRequest('service2');

      const statuses = manager.getAllStatuses();

      expect(statuses).toHaveProperty('service1');
      expect(statuses).toHaveProperty('service2');
      expect(statuses.service1.requestsInLastMinute).toBe(1);
      expect(statuses.service2.requestsInLastMinute).toBe(1);
    });

    it('should reset all limiters', () => {
      const config = { requestsPerMinute: 10, requestsPerHour: 100 };
      
      const limiter1 = manager.getLimiter('service1', config);
      const limiter2 = manager.getLimiter('service2', config);

      limiter1.recordRequest('service1');
      limiter2.recordRequest('service2');

      manager.resetAll();

      const statuses = manager.getAllStatuses();
      expect(statuses.service1.requestsInLastMinute).toBe(0);
      expect(statuses.service2.requestsInLastMinute).toBe(0);
    });
  });
});