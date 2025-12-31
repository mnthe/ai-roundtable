import { describe, it, expect } from 'vitest';
import { getPersonasForMode, type PersonaTemplate } from '../../../../src/agents/personas/index.js';
import type { DebateMode } from '../../../../src/types/index.js';

describe('getPersonasForMode', () => {
  const modes: DebateMode[] = [
    'collaborative',
    'adversarial',
    'socratic',
    'expert-panel',
    'devils-advocate',
    'delphi',
    'red-team-blue-team',
  ];

  it.each(modes)('should return personas for %s mode', (mode) => {
    const personas = getPersonasForMode(mode, 4);

    expect(personas).toHaveLength(4);
    personas.forEach((persona: PersonaTemplate) => {
      expect(persona.name).toBeDefined();
      expect(persona.trait).toBeDefined();
    });
  });

  describe('collaborative mode', () => {
    it('should return synthesizer, analyst, creative, pragmatist', () => {
      const personas = getPersonasForMode('collaborative', 4);

      expect(personas[0].name).toBe('Synthesizer');
      expect(personas[1].name).toBe('Analyst');
      expect(personas[2].name).toBe('Creative');
      expect(personas[3].name).toBe('Pragmatist');
    });
  });

  describe('adversarial mode', () => {
    it('should alternate proponent and opponent', () => {
      const personas = getPersonasForMode('adversarial', 4);

      expect(personas[0].name).toBe('Proponent');
      expect(personas[1].name).toBe('Opponent');
      expect(personas[2].name).toBe('Proponent');
      expect(personas[3].name).toBe('Opponent');
    });
  });

  describe('devils-advocate mode', () => {
    it('should have advocate, challenger, and evaluator', () => {
      const personas = getPersonasForMode('devils-advocate', 3);

      expect(personas[0].name).toBe('Advocate');
      expect(personas[1].name).toBe('Challenger');
      expect(personas[2].name).toBe('Evaluator');
    });
  });

  describe('red-team-blue-team mode', () => {
    it('should alternate red team and blue team', () => {
      const personas = getPersonasForMode('red-team-blue-team', 4);

      expect(personas[0].name).toBe('Red Team');
      expect(personas[1].name).toBe('Blue Team');
      expect(personas[2].name).toBe('Red Team');
      expect(personas[3].name).toBe('Blue Team');
    });
  });

  describe('delphi mode', () => {
    it('should return generic participants', () => {
      const personas = getPersonasForMode('delphi', 4);

      expect(personas[0].name).toBe('Participant 1');
      expect(personas[1].name).toBe('Participant 2');
      expect(personas[2].name).toBe('Participant 3');
      expect(personas[3].name).toBe('Participant 4');
    });
  });

  it('should handle count greater than defined personas by cycling', () => {
    const personas = getPersonasForMode('collaborative', 6);

    expect(personas).toHaveLength(6);
    expect(personas[4].name).toBe('Synthesizer'); // Cycles back
    expect(personas[5].name).toBe('Analyst');
  });

  it('should handle count less than defined personas', () => {
    const personas = getPersonasForMode('collaborative', 2);

    expect(personas).toHaveLength(2);
    expect(personas[0].name).toBe('Synthesizer');
    expect(personas[1].name).toBe('Analyst');
  });
});
