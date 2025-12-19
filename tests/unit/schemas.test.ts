import { describe, it, expect } from 'vitest';
import {
  AgentConfigSchema,
  AgentResponseSchema,
  DebateConfigSchema,
  SessionSchema,
  ConsensusResultSchema,
  StartRoundtableInputSchema,
  ContinueRoundtableInputSchema,
  SearchOptionsSchema,
  CitationSchema,
} from '../../src/types/schemas.js';

describe('Zod Schemas', () => {
  describe('AgentConfigSchema', () => {
    it('should validate valid agent config', () => {
      const config = {
        id: 'claude-1',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        temperature: 0.7,
      };

      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject invalid provider', () => {
      const config = {
        id: 'test',
        name: 'Test',
        provider: 'invalid-provider',
        model: 'test-model',
      };

      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject temperature out of range', () => {
      const config = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        model: 'gpt-4',
        temperature: 3.0, // Max is 2
      };

      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject empty id', () => {
      const config = {
        id: '',
        name: 'Test',
        provider: 'openai',
        model: 'gpt-4',
      };

      const result = AgentConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('AgentResponseSchema', () => {
    it('should validate valid response', () => {
      const response = {
        agentId: 'claude-1',
        agentName: 'Claude',
        position: 'AI is beneficial',
        reasoning: 'Because it helps solve problems',
        confidence: 0.85,
        timestamp: new Date(),
      };

      const result = AgentResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });

    it('should coerce string timestamp to Date', () => {
      const response = {
        agentId: 'claude-1',
        agentName: 'Claude',
        position: 'Test',
        reasoning: 'Test reasoning',
        confidence: 0.5,
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = AgentResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.timestamp).toBeInstanceOf(Date);
      }
    });

    it('should reject confidence below 0', () => {
      const response = {
        agentId: 'test',
        agentName: 'Test',
        position: 'Test',
        reasoning: 'Test',
        confidence: -0.1,
        timestamp: new Date(),
      };

      const result = AgentResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should reject confidence above 1', () => {
      const response = {
        agentId: 'test',
        agentName: 'Test',
        position: 'Test',
        reasoning: 'Test',
        confidence: 1.5,
        timestamp: new Date(),
      };

      const result = AgentResponseSchema.safeParse(response);
      expect(result.success).toBe(false);
    });

    it('should validate response with citations', () => {
      const response = {
        agentId: 'gpt4-1',
        agentName: 'GPT-4',
        position: 'Test position',
        reasoning: 'Test reasoning',
        confidence: 0.9,
        citations: [
          {
            title: 'Source',
            url: 'https://example.com',
            snippet: 'Example text',
          },
        ],
        timestamp: new Date(),
      };

      const result = AgentResponseSchema.safeParse(response);
      expect(result.success).toBe(true);
    });
  });

  describe('CitationSchema', () => {
    it('should validate valid citation', () => {
      const citation = {
        title: 'Test Article',
        url: 'https://example.com/article',
      };

      const result = CitationSchema.safeParse(citation);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const citation = {
        title: 'Test',
        url: 'not-a-valid-url',
      };

      const result = CitationSchema.safeParse(citation);
      expect(result.success).toBe(false);
    });
  });

  describe('DebateConfigSchema', () => {
    it('should validate valid config with defaults', () => {
      const config = {
        topic: 'Should AI be regulated?',
        mode: 'collaborative',
        agents: ['claude-1', 'gpt4-1'],
      };

      const result = DebateConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rounds).toBe(3); // default
      }
    });

    it('should reject empty topic', () => {
      const config = {
        topic: '',
        mode: 'collaborative',
        agents: ['claude-1'],
      };

      const result = DebateConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject empty agents array', () => {
      const config = {
        topic: 'Test',
        mode: 'collaborative',
        agents: [],
      };

      const result = DebateConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid mode', () => {
      const config = {
        topic: 'Test',
        mode: 'invalid-mode',
        agents: ['agent-1'],
      };

      const result = DebateConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });
  });

  describe('SessionSchema', () => {
    it('should validate complete session', () => {
      const session = {
        id: 'session-123',
        topic: 'Test topic',
        mode: 'collaborative',
        agentIds: ['claude-1', 'gpt4-1'],
        status: 'active',
        currentRound: 1,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });

    it('should validate session with consensus', () => {
      const session = {
        id: 'session-456',
        topic: 'Test topic',
        mode: 'adversarial',
        agentIds: ['agent-1'],
        status: 'completed',
        currentRound: 3,
        totalRounds: 3,
        responses: [],
        consensus: {
          agreementLevel: 0.75,
          commonPoints: ['Point A'],
          disagreementPoints: ['Point B'],
          summary: 'Summary text',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = SessionSchema.safeParse(session);
      expect(result.success).toBe(true);
    });
  });

  describe('ConsensusResultSchema', () => {
    it('should validate valid consensus', () => {
      const consensus = {
        agreementLevel: 0.8,
        commonPoints: ['Point 1', 'Point 2'],
        disagreementPoints: ['Point 3'],
        summary: 'The agents agree on most points.',
      };

      const result = ConsensusResultSchema.safeParse(consensus);
      expect(result.success).toBe(true);
    });

    it('should reject agreement level above 1', () => {
      const consensus = {
        agreementLevel: 1.5,
        commonPoints: [],
        disagreementPoints: [],
        summary: 'Test',
      };

      const result = ConsensusResultSchema.safeParse(consensus);
      expect(result.success).toBe(false);
    });
  });

  describe('StartRoundtableInputSchema', () => {
    it('should validate with defaults', () => {
      const input = {
        topic: 'Climate change',
      };

      const result = StartRoundtableInputSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mode).toBe('collaborative');
        expect(result.data.rounds).toBe(3);
      }
    });

    it('should validate with all fields', () => {
      const input = {
        topic: 'AI Ethics',
        mode: 'adversarial',
        agents: ['claude-1', 'gpt4-1'],
        rounds: 5,
      };

      const result = StartRoundtableInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty topic', () => {
      const input = {
        topic: '',
      };

      const result = StartRoundtableInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('ContinueRoundtableInputSchema', () => {
    it('should validate with sessionId only', () => {
      const input = {
        sessionId: 'session-123',
      };

      const result = ContinueRoundtableInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate with optional fields', () => {
      const input = {
        sessionId: 'session-123',
        rounds: 2,
        focusQuestion: 'What about privacy?',
      };

      const result = ContinueRoundtableInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  describe('SearchOptionsSchema', () => {
    it('should validate with defaults', () => {
      const options = {};

      const result = SearchOptionsSchema.safeParse(options);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxResults).toBe(5);
      }
    });

    it('should reject maxResults above 20', () => {
      const options = {
        maxResults: 50,
      };

      const result = SearchOptionsSchema.safeParse(options);
      expect(result.success).toBe(false);
    });

    it('should validate recency options', () => {
      const recencyOptions = ['day', 'week', 'month', 'year'];

      recencyOptions.forEach((recency) => {
        const result = SearchOptionsSchema.safeParse({ recency });
        expect(result.success).toBe(true);
      });
    });
  });
});
