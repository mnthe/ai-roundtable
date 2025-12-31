import { describe, it, expect } from 'vitest';
import { StartRoundtableInputSchema } from '../../../src/types/schemas.js';

describe('StartRoundtableInputSchema', () => {
  describe('agentCount field', () => {
    it('should accept valid agentCount', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
        agentCount: 4,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentCount).toBe(4);
      }
    });

    it('should reject agentCount below 2', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
        agentCount: 1,
      });

      expect(result.success).toBe(false);
    });

    it('should reject agentCount above 10', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
        agentCount: 11,
      });

      expect(result.success).toBe(false);
    });

    it('should allow omitting agentCount', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentCount).toBeUndefined();
      }
    });
  });

  describe('agents field removal', () => {
    it('should not include agents field in output', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
        agents: ['claude', 'chatgpt'],
      });

      // With Zod schema without agents field, unknown keys are stripped
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).agents).toBeUndefined();
      }
    });
  });
});
