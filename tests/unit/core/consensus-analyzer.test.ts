import { describe, it, expect, beforeEach } from 'vitest';
import { ConsensusAnalyzer, createConsensusAnalyzer } from '../../../src/core/consensus-analyzer.js';
import type { AgentResponse } from '../../../src/types/index.js';

describe('ConsensusAnalyzer', () => {
  let analyzer: ConsensusAnalyzer;

  beforeEach(() => {
    analyzer = new ConsensusAnalyzer();
  });

  describe('analyzeConsensus', () => {
    it('should handle empty responses', () => {
      const result = analyzer.analyzeConsensus([]);

      expect(result.agreementLevel).toBe(0);
      expect(result.commonPoints).toEqual([]);
      expect(result.disagreementPoints).toEqual([]);
      expect(result.summary).toContain('No responses');
    });

    it('should handle single response', () => {
      const responses: AgentResponse[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent 1',
          position: 'AI should be regulated',
          reasoning: 'Safety is important',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ];

      const result = analyzer.analyzeConsensus(responses);

      expect(result.agreementLevel).toBe(1);
      expect(result.commonPoints).toContain('AI should be regulated');
      expect(result.disagreementPoints).toEqual([]);
      expect(result.summary).toContain('Single response from Agent 1');
    });

    it('should calculate high agreement for similar positions', () => {
      const responses: AgentResponse[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent 1',
          position: 'Renewable energy is the future solution',
          reasoning: 'Clean and sustainable',
          confidence: 0.85,
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent 2',
          position: 'Renewable energy sources are our best solution',
          reasoning: 'Environmentally friendly',
          confidence: 0.9,
          timestamp: new Date(),
        },
      ];

      const result = analyzer.analyzeConsensus(responses);

      expect(result.agreementLevel).toBeGreaterThan(0.5);
      expect(result.summary).toContain('agreement');
    });

    it('should calculate low agreement for different positions', () => {
      const responses: AgentResponse[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent 1',
          position: 'Nuclear power is the solution',
          reasoning: 'High energy density',
          confidence: 0.9,
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent 2',
          position: 'Solar panels are better choice',
          reasoning: 'Safer and renewable',
          confidence: 0.3,
          timestamp: new Date(),
        },
      ];

      const result = analyzer.analyzeConsensus(responses);

      expect(result.agreementLevel).toBeLessThan(0.7);
      expect(result.disagreementPoints.length).toBeGreaterThan(0);
    });

    it('should identify common themes in positions', () => {
      const responses: AgentResponse[] = [
        {
          agentId: 'agent-1',
          agentName: 'Agent 1',
          position: 'Climate change requires immediate action',
          reasoning: 'Science supports this',
          confidence: 0.8,
          timestamp: new Date(),
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent 2',
          position: 'Climate change demands urgent policy action',
          reasoning: 'Evidence is clear',
          confidence: 0.85,
          timestamp: new Date(),
        },
        {
          agentId: 'agent-3',
          agentName: 'Agent 3',
          position: 'We must take action on climate change now',
          reasoning: 'Future depends on it',
          confidence: 0.9,
          timestamp: new Date(),
        },
      ];

      const result = analyzer.analyzeConsensus(responses);

      expect(result.commonPoints.length).toBeGreaterThan(0);
      const commonPointsText = result.commonPoints.join(' ').toLowerCase();
      expect(commonPointsText).toMatch(/climate|change|action/);
    });
  });
});

describe('createConsensusAnalyzer', () => {
  it('should create a ConsensusAnalyzer instance', () => {
    const analyzer = createConsensusAnalyzer();
    expect(analyzer).toBeInstanceOf(ConsensusAnalyzer);
  });
});
