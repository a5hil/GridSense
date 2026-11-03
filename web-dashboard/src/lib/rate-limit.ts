/**
 * GridSense In-Memory Sliding-Window Rate Limiter
 * 
 * Provides brute-force and credential stuffing defense for SCADA endpoints.
 */

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const globalForRateLimit = globalThis as unknown as {
  __gridsense_rate_limit?: Map<string, RateLimitRecord>;
};

if (!globalForRateLimit.__gridsense_rate_limit) {
  globalForRateLimit.__gridsense_rate_limit = new Map<string, RateLimitRecord>();
}

const rateLimitStore = globalForRateLimit.__gridsense_rate_limit;

// Periodic garbage collection for expired keys (every 5 minutes)
if (typeof setInterval !== "undefined") {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  if (timer.unref) timer.unref();
}

/**
 * Check whether a given key has exceeded the allowed number of requests in the sliding window.
 * 
 * @param key Unique identifier (e.g., client IP or username)
 * @param limit Maximum allowed requests in the time window (default: 5)
 * @param windowMs Time window in milliseconds (default: 15 minutes)
 */
export function checkRateLimit(
  key: string,
  limit: number = 5,
  windowMs: number = 15 * 60 * 1000
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  if (record.count >= limit) {
    const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) };
  }

  record.count += 1;
  return { allowed: true, remaining: limit - record.count, retryAfterSec: 0 };
}

/**
 * Reset the rate limit counter for a specific key upon successful action.
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key);
}
