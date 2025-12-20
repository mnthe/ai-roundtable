/**
 * Tests for StoredSessionRowSchema enum validation
 *
 * Verifies that mode and status fields are validated against
 * proper enum schemas, not just as strings.
 */

import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  StoredSessionRowSchema,
  DebateModeSchema,
  SessionStatusSchema,
} from '../../../src/types/schemas.js';

describe('StoredSessionRowSchema', () => {
  const validStoredSession = {
    id: 'session-1',
    topic: 'Test topic',
    mode: 'collaborative',
    agent_ids: '["agent-1", "agent-2"]',
    status: 'active',
    current_round: 1,
    total_rounds: 3,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  describe('valid data', () => {
    it('should parse valid stored session', () => {
      const result = StoredSessionRowSchema.parse(validStoredSession);

      expect(result.id).toBe('session-1');
      expect(result.topic).toBe('Test topic');
      expect(result.mode).toBe('collaborative');
      expect(result.status).toBe('active');
    });

    it('should accept all valid debate modes', () => {
      const validModes = [
        'collaborative',
        'adversarial',
        'socratic',
        'expert-panel',
        'devils-advocate',
        'delphi',
        'red-team-blue-team',
      ];

      for (const mode of validModes) {
        const data = { ...validStoredSession, mode };
        const result = StoredSessionRowSchema.parse(data);
        expect(result.mode).toBe(mode);
      }
    });

    it('should accept all valid session statuses', () => {
      const validStatuses = ['active', 'paused', 'completed', 'error'];

      for (const status of validStatuses) {
        const data = { ...validStoredSession, status };
        const result = StoredSessionRowSchema.parse(data);
        expect(result.status).toBe(status);
      }
    });
  });

  describe('mode validation', () => {
    it('should reject invalid mode', () => {
      const data = { ...validStoredSession, mode: 'invalid-mode' };

      expect(() => StoredSessionRowSchema.parse(data)).toThrow(ZodError);
    });

    it('should reject empty mode', () => {
      const data = { ...validStoredSession, mode: '' };

      expect(() => StoredSessionRowSchema.parse(data)).toThrow(ZodError);
    });

    it('should reject mode with wrong case', () => {
      const data = { ...validStoredSession, mode: 'COLLABORATIVE' };

      expect(() => StoredSessionRowSchema.parse(data)).toThrow(ZodError);
    });

    it('should reject mode with typo', () => {
      const data = { ...validStoredSession, mode: 'colaborative' };

      expect(() => StoredSessionRowSchema.parse(data)).toThrow(ZodError);
    });
  });

  describe('status validation', () => {
    it('should reject invalid status', () => {
      const data = { ...validStoredSession, status: 'invalid-status' };

      expect(() => StoredSessionRowSchema.parse(data)).toThrow(ZodError);
    });

    it('should reject empty status', () => {
      const data = { ...validStoredSession, status: '' };

      expect(() => StoredSessionRowSchema.parse(data)).toThrow(ZodError);
    });

    it('should reject status with wrong case', () => {
      const data = { ...validStoredSession, status: 'ACTIVE' };

      expect(() => StoredSessionRowSchema.parse(data)).toThrow(ZodError);
    });

    it('should reject status with typo', () => {
      const data = { ...validStoredSession, status: 'actve' };

      expect(() => StoredSessionRowSchema.parse(data)).toThrow(ZodError);
    });
  });

  describe('type inference', () => {
    it('should infer correct mode type from schema', () => {
      const result = StoredSessionRowSchema.parse(validStoredSession);

      // TypeScript should infer mode as DebateMode enum type
      // This test verifies runtime that the value is a valid DebateMode
      const validModes = DebateModeSchema.options;
      expect(validModes).toContain(result.mode);
    });

    it('should infer correct status type from schema', () => {
      const result = StoredSessionRowSchema.parse(validStoredSession);

      // TypeScript should infer status as SessionStatus enum type
      const validStatuses = SessionStatusSchema.options;
      expect(validStatuses).toContain(result.status);
    });
  });

  describe('error messages', () => {
    it('should provide helpful error for invalid mode', () => {
      const data = { ...validStoredSession, mode: 'unknown' };

      try {
        StoredSessionRowSchema.parse(data);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        const modeIssue = zodError.issues.find((i) => i.path.includes('mode'));
        expect(modeIssue).toBeDefined();
        // Zod enum error message includes valid options
        expect(modeIssue?.message).toContain('Invalid');
        expect(modeIssue?.message).toContain('collaborative');
      }
    });

    it('should provide helpful error for invalid status', () => {
      const data = { ...validStoredSession, status: 'unknown' };

      try {
        StoredSessionRowSchema.parse(data);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        const zodError = error as ZodError;
        const statusIssue = zodError.issues.find((i) => i.path.includes('status'));
        expect(statusIssue).toBeDefined();
        // Zod enum error message includes valid options
        expect(statusIssue?.message).toContain('Invalid');
        expect(statusIssue?.message).toContain('active');
      }
    });
  });
});

describe('DebateModeSchema', () => {
  it('should list all valid modes', () => {
    const modes = DebateModeSchema.options;

    expect(modes).toContain('collaborative');
    expect(modes).toContain('adversarial');
    expect(modes).toContain('socratic');
    expect(modes).toContain('expert-panel');
    expect(modes).toContain('devils-advocate');
    expect(modes).toContain('delphi');
    expect(modes).toContain('red-team-blue-team');
    expect(modes).toHaveLength(7);
  });
});

describe('SessionStatusSchema', () => {
  it('should list all valid statuses', () => {
    const statuses = SessionStatusSchema.options;

    expect(statuses).toContain('active');
    expect(statuses).toContain('paused');
    expect(statuses).toContain('completed');
    expect(statuses).toContain('error');
    expect(statuses).toHaveLength(4);
  });
});
