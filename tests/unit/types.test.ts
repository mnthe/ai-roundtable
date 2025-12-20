import { describe, it, expect } from 'vitest';
import type {
  AgentConfig,
  AgentResponse,
  DebateConfig,
  Session,
  ConsensusResult,
} from '../../src/types/index.js';

describe('Type Definitions', () => {
  describe('AgentConfig', () => {
    it('should accept valid agent configuration', () => {
      const config: AgentConfig = {
        id: 'claude-1',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-3-opus-20240229',
        temperature: 0.7,
      };

      expect(config.id).toBe('claude-1');
      expect(config.provider).toBe('anthropic');
    });

    it('should accept all provider types', () => {
      const providers: AgentConfig['provider'][] = [
        'anthropic',
        'openai',
        'google',
        'perplexity',
      ];

      providers.forEach((provider) => {
        const config: AgentConfig = {
          id: `agent-${provider}`,
          name: provider,
          provider,
          model: 'test-model',
        };
        expect(config.provider).toBe(provider);
      });
    });
  });

  describe('AgentResponse', () => {
    it('should accept valid agent response', () => {
      const response: AgentResponse = {
        agentId: 'claude-1',
        agentName: 'Claude',
        position: 'AI can be beneficial for society',
        reasoning: 'Because it can solve complex problems...',
        confidence: 0.85,
        timestamp: new Date(),
      };

      expect(response.confidence).toBeGreaterThanOrEqual(0);
      expect(response.confidence).toBeLessThanOrEqual(1);
    });

    it('should accept response with citations', () => {
      const response: AgentResponse = {
        agentId: 'chatgpt-1',
        agentName: 'ChatGPT',
        position: 'Renewable energy is the future',
        reasoning: 'According to recent studies...',
        confidence: 0.9,
        citations: [
          {
            title: 'Climate Report 2024',
            url: 'https://example.com/report',
            snippet: 'Renewable energy sources have grown...',
          },
        ],
        timestamp: new Date(),
      };

      expect(response.citations).toHaveLength(1);
      expect(response.citations?.[0]?.url).toContain('https://');
    });
  });

  describe('DebateConfig', () => {
    it('should accept valid debate configuration', () => {
      const config: DebateConfig = {
        topic: 'Should AI be regulated?',
        mode: 'collaborative',
        agents: ['claude-1', 'chatgpt-1'],
        rounds: 3,
      };

      expect(config.mode).toBe('collaborative');
      expect(config.agents).toHaveLength(2);
    });

    it('should accept all debate modes', () => {
      const modes: DebateConfig['mode'][] = [
        'collaborative',
        'adversarial',
        'socratic',
        'expert-panel',
      ];

      modes.forEach((mode) => {
        const config: DebateConfig = {
          topic: 'Test topic',
          mode,
          agents: ['agent-1'],
        };
        expect(config.mode).toBe(mode);
      });
    });
  });

  describe('Session', () => {
    it('should accept valid session', () => {
      const session: Session = {
        id: 'session-123',
        topic: 'Climate change solutions',
        mode: 'collaborative',
        agentIds: ['claude-1', 'chatgpt-1'],
        status: 'active',
        currentRound: 1,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(session.status).toBe('active');
      expect(session.responses).toEqual([]);
    });

    it('should accept session with consensus', () => {
      const consensus: ConsensusResult = {
        agreementLevel: 0.75,
        commonGround: ['Point A', 'Point B'],
        disagreementPoints: ['Point C'],
        summary: 'The agents largely agree on...',
      };

      const session: Session = {
        id: 'session-456',
        topic: 'Test topic',
        mode: 'adversarial',
        agentIds: ['agent-1'],
        status: 'completed',
        currentRound: 3,
        totalRounds: 3,
        responses: [],
        consensus,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(session.consensus?.agreementLevel).toBe(0.75);
    });
  });
});
