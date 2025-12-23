/**
 * Tests for zodToToolParameters utility
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { zodToToolParameters } from '../../../../src/tools/utils/zod-to-tool-params.js';
import {
  FactCheckInputSchema,
  RequestContextInputSchema,
} from '../../../../src/tools/schemas.js';

describe('zodToToolParameters', () => {
  describe('basic type conversion', () => {
    it('should convert string properties', () => {
      const schema = z.object({
        name: z.string(),
      });

      const result = zodToToolParameters(schema);

      expect(result).toHaveProperty('name');
      expect((result.name as Record<string, unknown>).type).toBe('string');
    });

    it('should convert number properties', () => {
      const schema = z.object({
        count: z.number(),
      });

      const result = zodToToolParameters(schema);

      expect(result).toHaveProperty('count');
      expect((result.count as Record<string, unknown>).type).toBe('number');
    });

    it('should convert boolean properties', () => {
      const schema = z.object({
        enabled: z.boolean(),
      });

      const result = zodToToolParameters(schema);

      expect(result).toHaveProperty('enabled');
      expect((result.enabled as Record<string, unknown>).type).toBe('boolean');
    });

    it('should convert enum properties', () => {
      const schema = z.object({
        priority: z.enum(['low', 'medium', 'high']),
      });

      const result = zodToToolParameters(schema);

      expect(result).toHaveProperty('priority');
      expect((result.priority as Record<string, unknown>).enum).toEqual(['low', 'medium', 'high']);
    });
  });

  describe('descriptions', () => {
    it('should preserve descriptions from .describe()', () => {
      const schema = z.object({
        query: z.string().describe('The search query'),
      });

      const result = zodToToolParameters(schema);

      expect((result.query as Record<string, unknown>).description).toBe('The search query');
    });
  });

  describe('defaults', () => {
    it('should include default values', () => {
      const schema = z.object({
        limit: z.number().default(10),
      });

      const result = zodToToolParameters(schema);

      expect((result.limit as Record<string, unknown>).default).toBe(10);
    });

    it('should include default string values', () => {
      const schema = z.object({
        status: z.string().default('pending'),
      });

      const result = zodToToolParameters(schema);

      expect((result.status as Record<string, unknown>).default).toBe('pending');
    });
  });

  describe('optional properties', () => {
    it('should handle optional properties', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });

      const result = zodToToolParameters(schema);

      expect(result).toHaveProperty('required');
      expect(result).toHaveProperty('optional');
    });
  });

  describe('actual schemas', () => {
    it('should convert FactCheckInputSchema correctly', () => {
      const result = zodToToolParameters(FactCheckInputSchema);

      // Should have claim property
      expect(result).toHaveProperty('claim');
      expect((result.claim as Record<string, unknown>).type).toBe('string');

      // Should have source_agent property
      expect(result).toHaveProperty('source_agent');
      expect((result.source_agent as Record<string, unknown>).type).toBe('string');
    });

    it('should convert RequestContextInputSchema correctly', () => {
      const result = zodToToolParameters(RequestContextInputSchema);

      // Should have query property with description
      expect(result).toHaveProperty('query');
      expect((result.query as Record<string, unknown>).type).toBe('string');
      expect((result.query as Record<string, unknown>).description).toBe(
        'Natural language description of what information is needed'
      );

      // Should have reason property with description
      expect(result).toHaveProperty('reason');
      expect((result.reason as Record<string, unknown>).type).toBe('string');
      expect((result.reason as Record<string, unknown>).description).toBe(
        'Why this information is needed for the debate'
      );

      // Should have priority property with enum values
      expect(result).toHaveProperty('priority');
      expect((result.priority as Record<string, unknown>).enum).toEqual(['required', 'optional']);
      expect((result.priority as Record<string, unknown>).description).toBe(
        'Whether this information is required to continue'
      );
    });
  });

  describe('edge cases', () => {
    it('should return empty object for empty schema', () => {
      const schema = z.object({});

      const result = zodToToolParameters(schema);

      expect(result).toEqual({});
    });

    it('should handle complex nested schemas', () => {
      const schema = z.object({
        name: z.string().min(1).max(100).describe('User name'),
        age: z.number().min(0).max(150).optional(),
      });

      const result = zodToToolParameters(schema);

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('age');
      expect((result.name as Record<string, unknown>).description).toBe('User name');
    });
  });
});
