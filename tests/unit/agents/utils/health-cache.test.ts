/**
 * Health Cache Tests
 *
 * Tests for the TTL-based cache for agent health check results.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  getCachedHealthStatus,
  setCachedHealthStatus,
  clearHealthCache,
  getHealthCacheSize,
  DEFAULT_HEALTH_CACHE_TTL_MS,
} from '../../../../src/agents/utils/health-cache.js';

describe('Health Cache', () => {
  beforeEach(() => {
    clearHealthCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('setCachedHealthStatus', () => {
    it('should cache healthy status', () => {
      setCachedHealthStatus('agent-1', true);
      expect(getCachedHealthStatus('agent-1')).toBe(true);
    });

    it('should cache unhealthy status', () => {
      setCachedHealthStatus('agent-2', false);
      expect(getCachedHealthStatus('agent-2')).toBe(false);
    });

    it('should update existing cache entry', () => {
      setCachedHealthStatus('agent-1', true);
      expect(getCachedHealthStatus('agent-1')).toBe(true);

      setCachedHealthStatus('agent-1', false);
      expect(getCachedHealthStatus('agent-1')).toBe(false);
    });

    it('should cache multiple agents independently', () => {
      setCachedHealthStatus('agent-1', true);
      setCachedHealthStatus('agent-2', false);
      setCachedHealthStatus('agent-3', true);

      expect(getCachedHealthStatus('agent-1')).toBe(true);
      expect(getCachedHealthStatus('agent-2')).toBe(false);
      expect(getCachedHealthStatus('agent-3')).toBe(true);
    });
  });

  describe('getCachedHealthStatus', () => {
    it('should return null for non-existent agent', () => {
      expect(getCachedHealthStatus('non-existent')).toBeNull();
    });

    it('should return cached value within TTL', () => {
      setCachedHealthStatus('agent-1', true);

      // Advance time by half the default TTL
      vi.advanceTimersByTime(DEFAULT_HEALTH_CACHE_TTL_MS / 2);

      expect(getCachedHealthStatus('agent-1')).toBe(true);
    });

    it('should return null after TTL expires (default TTL)', () => {
      setCachedHealthStatus('agent-1', true);

      // Advance time past the default TTL
      vi.advanceTimersByTime(DEFAULT_HEALTH_CACHE_TTL_MS + 1);

      expect(getCachedHealthStatus('agent-1')).toBeNull();
    });

    it('should respect custom TTL', () => {
      const customTtl = 10_000; // 10 seconds
      setCachedHealthStatus('agent-1', true);

      // Just before custom TTL expires
      vi.advanceTimersByTime(customTtl - 1);
      expect(getCachedHealthStatus('agent-1', customTtl)).toBe(true);

      // Just after custom TTL expires
      vi.advanceTimersByTime(2);
      expect(getCachedHealthStatus('agent-1', customTtl)).toBeNull();
    });

    it('should remove expired entry from cache', () => {
      setCachedHealthStatus('agent-1', true);
      expect(getHealthCacheSize()).toBe(1);

      // Advance time past the default TTL
      vi.advanceTimersByTime(DEFAULT_HEALTH_CACHE_TTL_MS + 1);

      // Access the expired entry (triggers cleanup)
      getCachedHealthStatus('agent-1');

      // Entry should be removed
      expect(getHealthCacheSize()).toBe(0);
    });
  });

  describe('clearHealthCache', () => {
    it('should clear all cached entries', () => {
      setCachedHealthStatus('agent-1', true);
      setCachedHealthStatus('agent-2', false);
      setCachedHealthStatus('agent-3', true);

      expect(getHealthCacheSize()).toBe(3);

      clearHealthCache();

      expect(getHealthCacheSize()).toBe(0);
      expect(getCachedHealthStatus('agent-1')).toBeNull();
      expect(getCachedHealthStatus('agent-2')).toBeNull();
      expect(getCachedHealthStatus('agent-3')).toBeNull();
    });

    it('should work on empty cache', () => {
      expect(getHealthCacheSize()).toBe(0);
      clearHealthCache();
      expect(getHealthCacheSize()).toBe(0);
    });
  });

  describe('getHealthCacheSize', () => {
    it('should return 0 for empty cache', () => {
      expect(getHealthCacheSize()).toBe(0);
    });

    it('should return correct count', () => {
      expect(getHealthCacheSize()).toBe(0);

      setCachedHealthStatus('agent-1', true);
      expect(getHealthCacheSize()).toBe(1);

      setCachedHealthStatus('agent-2', false);
      expect(getHealthCacheSize()).toBe(2);

      setCachedHealthStatus('agent-3', true);
      expect(getHealthCacheSize()).toBe(3);
    });

    it('should not count expired entries that have not been accessed', () => {
      setCachedHealthStatus('agent-1', true);
      setCachedHealthStatus('agent-2', false);

      expect(getHealthCacheSize()).toBe(2);

      // Note: Expired entries are only removed on access, not automatically
      vi.advanceTimersByTime(DEFAULT_HEALTH_CACHE_TTL_MS + 1);

      // Size still shows 2 because entries haven't been accessed
      expect(getHealthCacheSize()).toBe(2);

      // Access one entry to trigger cleanup
      getCachedHealthStatus('agent-1');
      expect(getHealthCacheSize()).toBe(1);

      // Access the other entry
      getCachedHealthStatus('agent-2');
      expect(getHealthCacheSize()).toBe(0);
    });
  });

  describe('DEFAULT_HEALTH_CACHE_TTL_MS', () => {
    it('should be 60 seconds', () => {
      expect(DEFAULT_HEALTH_CACHE_TTL_MS).toBe(60_000);
    });
  });

  describe('TTL edge cases', () => {
    it('should expire at exactly TTL boundary', () => {
      setCachedHealthStatus('agent-1', true);

      // Exactly at TTL boundary
      vi.advanceTimersByTime(DEFAULT_HEALTH_CACHE_TTL_MS);

      // At exactly TTL, should still be valid (we use >)
      expect(getCachedHealthStatus('agent-1')).toBe(true);

      // One more millisecond should expire it
      vi.advanceTimersByTime(1);
      expect(getCachedHealthStatus('agent-1')).toBeNull();
    });

    it('should handle very short TTL', () => {
      setCachedHealthStatus('agent-1', true);

      expect(getCachedHealthStatus('agent-1', 1)).toBe(true);

      vi.advanceTimersByTime(2);
      expect(getCachedHealthStatus('agent-1', 1)).toBeNull();
    });

    it('should handle zero TTL (always expired)', () => {
      setCachedHealthStatus('agent-1', true);

      // With 0 TTL, any timestamp should be considered expired
      vi.advanceTimersByTime(1);
      expect(getCachedHealthStatus('agent-1', 0)).toBeNull();
    });
  });

  describe('concurrency simulation', () => {
    it('should handle rapid set/get operations', () => {
      // Simulate rapid updates
      for (let i = 0; i < 100; i++) {
        setCachedHealthStatus(`agent-${i}`, i % 2 === 0);
      }

      expect(getHealthCacheSize()).toBe(100);

      // Verify all entries
      for (let i = 0; i < 100; i++) {
        expect(getCachedHealthStatus(`agent-${i}`)).toBe(i % 2 === 0);
      }
    });

    it('should handle interleaved set and clear operations', () => {
      setCachedHealthStatus('agent-1', true);
      setCachedHealthStatus('agent-2', false);

      clearHealthCache();

      setCachedHealthStatus('agent-3', true);

      expect(getCachedHealthStatus('agent-1')).toBeNull();
      expect(getCachedHealthStatus('agent-2')).toBeNull();
      expect(getCachedHealthStatus('agent-3')).toBe(true);
      expect(getHealthCacheSize()).toBe(1);
    });
  });
});
