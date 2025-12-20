import { describe, it, expect } from 'vitest';
import { detectGroupthink } from '../../../src/core/groupthink-detector.js';
import type { AgentResponse, Stance } from '../../../src/types/index.js';

/**
 * Helper to create a mock agent response
 */
function createResponse(
  id: string,
  options: {
    position?: string;
    confidence?: number;
    stance?: Stance;
  } = {}
): AgentResponse {
  return {
    agentId: id,
    agentName: `Agent ${id}`,
    position: options.position ?? `Position from agent ${id}`,
    reasoning: `Reasoning from agent ${id}`,
    confidence: options.confidence ?? 0.8,
    stance: options.stance,
    timestamp: new Date(),
  };
}

describe('detectGroupthink', () => {
  describe('edge cases', () => {
    it('should return not detected for empty responses', () => {
      const result = detectGroupthink([]);

      expect(result.detected).toBe(false);
      expect(result.indicators).toEqual([]);
      expect(result.recommendation).toBe('');
    });

    it('should return not detected for single response', () => {
      const responses = [createResponse('1', { confidence: 0.95 })];

      const result = detectGroupthink(responses);

      expect(result.detected).toBe(false);
      expect(result.indicators).toEqual([]);
      expect(result.recommendation).toBe('');
    });
  });

  describe('high confidence detection', () => {
    it('should detect high confidence when all agents have >=80% and avg >=85%', () => {
      const responses = [
        createResponse('1', { confidence: 0.85 }),
        createResponse('2', { confidence: 0.90 }),
        createResponse('3', { confidence: 0.88 }),
      ];

      const result = detectGroupthink(responses);

      expect(result.indicators).toContain('All agents show high confidence (>=80%)');
    });

    it('should not detect high confidence when one agent has <80%', () => {
      const responses = [
        createResponse('1', { confidence: 0.85 }),
        createResponse('2', { confidence: 0.75 }), // Below threshold
        createResponse('3', { confidence: 0.90 }),
      ];

      const result = detectGroupthink(responses);

      expect(result.indicators).not.toContain('All agents show high confidence (>=80%)');
    });

    it('should not detect high confidence when avg is below 85%', () => {
      const responses = [
        createResponse('1', { confidence: 0.80 }),
        createResponse('2', { confidence: 0.80 }),
        createResponse('3', { confidence: 0.80 }),
      ];

      // All are >=80% but avg is exactly 80%, below 85% threshold
      const result = detectGroupthink(responses);

      expect(result.indicators).not.toContain('All agents show high confidence (>=80%)');
    });
  });

  describe('stance detection', () => {
    it('should detect no dissenting stances when all stances are the same', () => {
      const responses = [
        createResponse('1', { stance: 'YES' }),
        createResponse('2', { stance: 'YES' }),
        createResponse('3', { stance: 'YES' }),
      ];

      const result = detectGroupthink(responses);

      expect(result.indicators).toContain('No dissenting stances detected');
    });

    it('should not detect uniform stances when stances differ', () => {
      const responses = [
        createResponse('1', { stance: 'YES' }),
        createResponse('2', { stance: 'NO' }),
        createResponse('3', { stance: 'YES' }),
      ];

      const result = detectGroupthink(responses);

      expect(result.indicators).not.toContain('No dissenting stances detected');
    });

    it('should not check stances when none are provided', () => {
      const responses = [
        createResponse('1', { confidence: 0.5 }),
        createResponse('2', { confidence: 0.5 }),
      ];

      const result = detectGroupthink(responses);

      // Should not have stance indicator since no stances provided
      expect(result.indicators).not.toContain('No dissenting stances detected');
    });

    it('should handle mixed stance presence (some with, some without)', () => {
      const responses = [
        createResponse('1', { stance: 'YES' }),
        createResponse('2', {}), // No stance
        createResponse('3', { stance: 'YES' }),
      ];

      const result = detectGroupthink(responses);

      // Only considers responses with stances, so YES+YES = uniform
      expect(result.indicators).toContain('No dissenting stances detected');
    });
  });

  describe('position similarity detection', () => {
    it('should detect high position similarity for nearly identical positions', () => {
      const responses = [
        createResponse('1', {
          position: 'AI will transform the software development industry significantly',
        }),
        createResponse('2', {
          position: 'AI will transform the software development industry completely',
        }),
        createResponse('3', {
          position: 'AI will transform software development industry dramatically',
        }),
      ];

      const result = detectGroupthink(responses);

      expect(result.indicators).toContain('Position similarity is unusually high');
    });

    it('should not detect high similarity for diverse positions', () => {
      const responses = [
        createResponse('1', {
          position: 'Nuclear power provides reliable baseload energy generation',
        }),
        createResponse('2', {
          position: 'Solar panels offer clean renewable electricity production',
        }),
        createResponse('3', {
          position: 'Wind turbines generate sustainable power efficiently',
        }),
      ];

      const result = detectGroupthink(responses);

      expect(result.indicators).not.toContain('Position similarity is unusually high');
    });
  });

  describe('groupthink detection threshold', () => {
    it('should detect groupthink when 2 or more indicators are present', () => {
      // High confidence + same stance = 2 indicators
      const responses = [
        createResponse('1', { confidence: 0.90, stance: 'YES' }),
        createResponse('2', { confidence: 0.88, stance: 'YES' }),
        createResponse('3', { confidence: 0.92, stance: 'YES' }),
      ];

      const result = detectGroupthink(responses);

      expect(result.detected).toBe(true);
      expect(result.indicators.length).toBeGreaterThanOrEqual(2);
      expect(result.recommendation).toContain("devil's advocate");
    });

    it('should not detect groupthink with only 1 indicator', () => {
      // Only same stance (confidence is varied, positions are different)
      const responses = [
        createResponse('1', {
          confidence: 0.60,
          stance: 'YES',
          position: 'Nuclear power provides reliable baseload energy generation',
        }),
        createResponse('2', {
          confidence: 0.70,
          stance: 'YES',
          position: 'Solar panels offer clean renewable electricity production',
        }),
        createResponse('3', {
          confidence: 0.65,
          stance: 'YES',
          position: 'Wind turbines generate sustainable power efficiently',
        }),
      ];

      const result = detectGroupthink(responses);

      expect(result.indicators).toHaveLength(1);
      expect(result.indicators).toContain('No dissenting stances detected');
      expect(result.detected).toBe(false);
      expect(result.recommendation).toBe('');
    });

    it('should detect groupthink with all 3 indicators', () => {
      const responses = [
        createResponse('1', {
          confidence: 0.90,
          stance: 'YES',
          position: 'AI assistants will revolutionize software development completely',
        }),
        createResponse('2', {
          confidence: 0.88,
          stance: 'YES',
          position: 'AI assistants will revolutionize software development entirely',
        }),
        createResponse('3', {
          confidence: 0.92,
          stance: 'YES',
          position: 'AI assistants will revolutionize software development significantly',
        }),
      ];

      const result = detectGroupthink(responses);

      expect(result.detected).toBe(true);
      expect(result.indicators.length).toBe(3);
      expect(result.indicators).toContain('All agents show high confidence (>=80%)');
      expect(result.indicators).toContain('No dissenting stances detected');
      expect(result.indicators).toContain('Position similarity is unusually high');
      expect(result.recommendation).toContain('manual review');
    });
  });

  describe('recommendation message', () => {
    it('should provide recommendation when groupthink is detected', () => {
      const responses = [
        createResponse('1', { confidence: 0.90, stance: 'NO' }),
        createResponse('2', { confidence: 0.88, stance: 'NO' }),
      ];

      const result = detectGroupthink(responses);

      if (result.detected) {
        expect(result.recommendation).toContain("devil's advocate");
        expect(result.recommendation).toContain('manual review');
      }
    });

    it('should have empty recommendation when no groupthink detected', () => {
      const responses = [
        createResponse('1', { confidence: 0.50, stance: 'YES' }),
        createResponse('2', { confidence: 0.60, stance: 'NO' }),
      ];

      const result = detectGroupthink(responses);

      expect(result.detected).toBe(false);
      expect(result.recommendation).toBe('');
    });
  });

  describe('real-world scenarios', () => {
    it('should detect groupthink in echo chamber scenario', () => {
      // Scenario: All agents strongly agree on a controversial topic
      const responses = [
        createResponse('claude', {
          confidence: 0.95,
          stance: 'YES',
          position: 'Cryptocurrency will definitely replace traditional banking systems',
        }),
        createResponse('gpt', {
          confidence: 0.92,
          stance: 'YES',
          position: 'Cryptocurrency will certainly replace traditional banking systems',
        }),
        createResponse('gemini', {
          confidence: 0.90,
          stance: 'YES',
          position: 'Cryptocurrency will surely replace traditional banking systems',
        }),
      ];

      const result = detectGroupthink(responses);

      expect(result.detected).toBe(true);
      expect(result.indicators.length).toBeGreaterThanOrEqual(2);
    });

    it('should not detect groupthink in healthy debate scenario', () => {
      // Scenario: Agents have different perspectives with varied confidence
      const responses = [
        createResponse('claude', {
          confidence: 0.70,
          stance: 'YES',
          position: 'Electric vehicles will dominate the market by 2030',
        }),
        createResponse('gpt', {
          confidence: 0.55,
          stance: 'NEUTRAL',
          position: 'Hybrid vehicles offer the best transition solution',
        }),
        createResponse('gemini', {
          confidence: 0.65,
          stance: 'NO',
          position: 'Internal combustion engines will remain competitive',
        }),
      ];

      const result = detectGroupthink(responses);

      expect(result.detected).toBe(false);
    });

    it('should handle NEUTRAL stance correctly', () => {
      // All NEUTRAL is still uniform
      const responses = [
        createResponse('1', { confidence: 0.60, stance: 'NEUTRAL' }),
        createResponse('2', { confidence: 0.55, stance: 'NEUTRAL' }),
        createResponse('3', { confidence: 0.65, stance: 'NEUTRAL' }),
      ];

      const result = detectGroupthink(responses);

      expect(result.indicators).toContain('No dissenting stances detected');
    });
  });
});
