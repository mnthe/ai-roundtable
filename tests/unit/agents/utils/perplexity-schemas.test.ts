/**
 * Tests for Perplexity Zod schema validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  PerplexityExtendedResponseSchema,
  parsePerplexityExtensions,
  isCitationString,
} from '../../../../src/agents/utils/perplexity-schemas.js';

describe('PerplexityExtendedResponseSchema', () => {
  describe('citations field (deprecated format)', () => {
    it('should parse valid string citations', () => {
      const data = {
        citations: ['https://example.com/1', 'https://example.com/2'],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.citations).toHaveLength(2);
        expect(result.data.citations?.[0]).toBe('https://example.com/1');
      }
    });

    it('should parse valid object citations', () => {
      const data = {
        citations: [
          { url: 'https://example.com/1', title: 'Title 1' },
          { url: 'https://example.com/2' },
        ],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.citations).toHaveLength(2);
        expect(result.data.citations?.[0]).toEqual({ url: 'https://example.com/1', title: 'Title 1' });
        expect(result.data.citations?.[1]).toEqual({ url: 'https://example.com/2' });
      }
    });

    it('should parse mixed string and object citations', () => {
      const data = {
        citations: [
          'https://example.com/1',
          { url: 'https://example.com/2', title: 'Title' },
        ],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.citations).toHaveLength(2);
      }
    });

    it('should reject citations with invalid structure', () => {
      const data = {
        citations: [{ title: 'Missing URL' }],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject non-array citations', () => {
      const data = {
        citations: 'not an array',
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });

  describe('search_results field (new format)', () => {
    it('should parse valid search_results with all fields', () => {
      const data = {
        search_results: [
          { url: 'https://example.com/1', title: 'Title 1', date: '2025-01-15' },
          { url: 'https://example.com/2', title: 'Title 2', date: '2025-01-10' },
        ],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search_results).toHaveLength(2);
        expect(result.data.search_results?.[0]).toEqual({
          url: 'https://example.com/1',
          title: 'Title 1',
          date: '2025-01-15',
        });
      }
    });

    it('should parse search_results with only url', () => {
      const data = {
        search_results: [{ url: 'https://example.com/1' }],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.search_results?.[0]).toEqual({ url: 'https://example.com/1' });
      }
    });

    it('should parse search_results with optional title', () => {
      const data = {
        search_results: [{ url: 'https://example.com/1', title: 'Title Only' }],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should parse search_results with optional date', () => {
      const data = {
        search_results: [{ url: 'https://example.com/1', date: '2025-01-15' }],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should reject search_results missing url', () => {
      const data = {
        search_results: [{ title: 'Missing URL', date: '2025-01-15' }],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(false);
    });

    it('should reject non-array search_results', () => {
      const data = {
        search_results: 'not an array',
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(false);
    });
  });

  describe('empty/missing fields', () => {
    it('should parse object with neither field', () => {
      const data = {};

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
    });

    it('should parse object with both fields', () => {
      const data = {
        citations: ['https://example.com/old'],
        search_results: [{ url: 'https://example.com/new' }],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.citations).toHaveLength(1);
        expect(result.data.search_results).toHaveLength(1);
      }
    });

    it('should parse object with empty arrays', () => {
      const data = {
        citations: [],
        search_results: [],
      };

      const result = PerplexityExtendedResponseSchema.safeParse(data);

      expect(result.success).toBe(true);
    });
  });
});

describe('parsePerplexityExtensions', () => {
  it('should return extensions for valid search_results', () => {
    const response = {
      search_results: [{ url: 'https://example.com/1', title: 'Test' }],
    };

    const result = parsePerplexityExtensions(response);

    expect(result).toBeDefined();
    expect(result?.search_results).toHaveLength(1);
  });

  it('should return extensions for valid citations', () => {
    const response = {
      citations: ['https://example.com/1'],
    };

    const result = parsePerplexityExtensions(response);

    expect(result).toBeDefined();
    expect(result?.citations).toHaveLength(1);
  });

  it('should return undefined for invalid structure', () => {
    const response = {
      citations: 'not an array',
    };

    const result = parsePerplexityExtensions(response);

    expect(result).toBeUndefined();
  });

  it('should return undefined for empty object', () => {
    const response = {};

    const result = parsePerplexityExtensions(response);

    expect(result).toBeUndefined();
  });

  it('should return undefined for empty arrays', () => {
    const response = {
      citations: [],
      search_results: [],
    };

    const result = parsePerplexityExtensions(response);

    expect(result).toBeUndefined();
  });

  it('should return undefined for null', () => {
    const result = parsePerplexityExtensions(null);

    expect(result).toBeUndefined();
  });

  it('should return undefined for non-object', () => {
    const result = parsePerplexityExtensions('string');

    expect(result).toBeUndefined();
  });

  it('should handle OpenAI response with additional fields', () => {
    const response = {
      id: 'resp-123',
      choices: [{ message: { content: 'test' } }],
      search_results: [{ url: 'https://example.com/1' }],
    };

    const result = parsePerplexityExtensions(response);

    expect(result).toBeDefined();
    expect(result?.search_results).toHaveLength(1);
  });
});

describe('isCitationString', () => {
  it('should return true for string citation', () => {
    const citation = 'https://example.com/1';

    expect(isCitationString(citation)).toBe(true);
  });

  it('should return false for object citation', () => {
    const citation = { url: 'https://example.com/1', title: 'Test' };

    expect(isCitationString(citation)).toBe(false);
  });

  it('should return false for object citation without title', () => {
    const citation = { url: 'https://example.com/1' };

    expect(isCitationString(citation)).toBe(false);
  });
});
