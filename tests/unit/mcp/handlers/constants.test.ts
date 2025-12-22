/**
 * Tests for MCP handler constants
 */

import { describe, it, expect } from 'vitest';
import { ERROR_MESSAGES } from '../../../../src/mcp/handlers/constants.js';

describe('ERROR_MESSAGES', () => {
  describe('static messages', () => {
    it('should have AI_ANALYZER_NOT_AVAILABLE message', () => {
      expect(ERROR_MESSAGES.AI_ANALYZER_NOT_AVAILABLE).toBe(
        'AI consensus analyzer not available. Ensure API keys are configured.'
      );
    });

    it('should have NO_AGENTS_AVAILABLE message', () => {
      expect(ERROR_MESSAGES.NO_AGENTS_AVAILABLE).toBe(
        'No agents available. Please register agents first.'
      );
    });

    it('should have NO_ROUND_RESULTS message', () => {
      expect(ERROR_MESSAGES.NO_ROUND_RESULTS).toBe('No round results available');
    });

    it('should have SESSION_ALREADY_COMPLETED message', () => {
      expect(ERROR_MESSAGES.SESSION_ALREADY_COMPLETED).toBe('Session is already completed');
    });

    it('should have NO_ROUNDS_EXECUTED message', () => {
      expect(ERROR_MESSAGES.NO_ROUNDS_EXECUTED).toBe('No rounds have been executed yet');
    });

    it('should have SESSION_NO_RESPONSES message', () => {
      expect(ERROR_MESSAGES.SESSION_NO_RESPONSES).toBe(
        'No responses found in this session. Cannot synthesize an empty debate.'
      );
    });

    it('should have NO_ACTIVE_AGENTS message', () => {
      expect(ERROR_MESSAGES.NO_ACTIVE_AGENTS).toBe('No active agents available for synthesis');
    });
  });

  describe('parameterized messages', () => {
    it('should generate SESSION_NOT_FOUND message with sessionId', () => {
      expect(ERROR_MESSAGES.SESSION_NOT_FOUND('test-session-123')).toBe(
        'Session "test-session-123" not found'
      );
    });

    it('should generate AGENT_NOT_FOUND message with agentId', () => {
      expect(ERROR_MESSAGES.AGENT_NOT_FOUND('claude-1')).toBe('Agent "claude-1" not found');
    });

    it('should generate SESSION_NOT_ACTIVE message with sessionId and status', () => {
      expect(ERROR_MESSAGES.SESSION_NOT_ACTIVE('session-1', 'paused')).toBe(
        'Session "session-1" is not active (status: paused)'
      );
    });

    it('should generate CANNOT_PAUSE message with status', () => {
      expect(ERROR_MESSAGES.CANNOT_PAUSE('completed')).toBe(
        'Cannot pause session in status "completed". Only active sessions can be paused.'
      );
    });

    it('should generate CANNOT_RESUME message with status', () => {
      expect(ERROR_MESSAGES.CANNOT_RESUME('active')).toBe(
        'Cannot resume session in status "active". Only paused sessions can be resumed.'
      );
    });

    it('should generate UNKNOWN_ACTION message with action', () => {
      expect(ERROR_MESSAGES.UNKNOWN_ACTION('invalid')).toBe('Unknown action: invalid');
    });

    it('should generate ROUND_NOT_EXIST message with round and current', () => {
      expect(ERROR_MESSAGES.ROUND_NOT_EXIST(5, 3)).toBe(
        'Round 5 does not exist. Current round is 3'
      );
    });

    it('should generate ROUND_NOT_EXECUTED message with round and current', () => {
      expect(ERROR_MESSAGES.ROUND_NOT_EXECUTED(4, 2)).toBe(
        'Round 4 has not been executed yet. Current round: 2'
      );
    });

    it('should generate NO_RESPONSES_FOR_ROUND message with round', () => {
      expect(ERROR_MESSAGES.NO_RESPONSES_FOR_ROUND(3)).toBe('No responses found for round 3');
    });

    it('should generate AGENT_NOT_PARTICIPATE message with agentId and sessionId', () => {
      expect(ERROR_MESSAGES.AGENT_NOT_PARTICIPATE('agent-1', 'session-2')).toBe(
        'Agent "agent-1" did not participate in session "session-2"'
      );
    });

    it('should generate NO_AGENT_RESPONSES_IN_SESSION message with agentId', () => {
      expect(ERROR_MESSAGES.NO_AGENT_RESPONSES_IN_SESSION('claude')).toBe(
        'No responses found for agent "claude" in this session'
      );
    });

    it('should generate NO_AGENT_RESPONSES_IN_ROUND message with agentId and round', () => {
      expect(ERROR_MESSAGES.NO_AGENT_RESPONSES_IN_ROUND('gemini', 2)).toBe(
        'No responses found for agent "gemini" in round 2'
      );
    });

    it('should generate SYNTHESIZER_NOT_FOUND message with synthesizerId', () => {
      expect(ERROR_MESSAGES.SYNTHESIZER_NOT_FOUND('custom-synth')).toBe(
        'Synthesizer agent "custom-synth" not found'
      );
    });
  });
});
