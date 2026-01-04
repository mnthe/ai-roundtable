import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  truncateIfNeeded,
  isDebugMode,
  isToolCallDebugEnabled,
} from '../../../src/config/response.js';

describe('Response Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('truncateIfNeeded', () => {
    it('should truncate long text at sentence boundary when possible', () => {
      const text = 'First sentence. Second sentence here. Third sentence here.';
      const result = truncateIfNeeded(text, 40);
      expect(result).toBe('First sentence. Second sentence here.');
    });

    it('should hard truncate with ellipsis if no sentence boundary found', () => {
      const text = 'This is a very long sentence without any breaks or periods';
      const result = truncateIfNeeded(text, 20);
      expect(result).toBe('This is a very long...');
    });

    it('should return original text if shorter than limit', () => {
      const text = 'Short text';
      const result = truncateIfNeeded(text, 100);
      expect(result).toBe('Short text');
    });

    it('should return original text if limit is 0 (unlimited)', () => {
      const text = 'a'.repeat(500);
      const result = truncateIfNeeded(text, 0);
      expect(result).toBe(text);
    });
  });

  describe('isDebugMode', () => {
    it('should default to false', () => {
      expect(isDebugMode()).toBe(false);
    });
  });

  describe('isToolCallDebugEnabled', () => {
    it('should default to false', () => {
      expect(isToolCallDebugEnabled()).toBe(false);
    });
  });
});
