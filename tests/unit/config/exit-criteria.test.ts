import { describe, it, expect } from 'vitest';
import { EXIT_CRITERIA_CONFIG, type ExitCriteriaConfig } from '../../../src/config/exit-criteria.js';

describe('Exit Criteria Config', () => {
  describe('EXIT_CRITERIA_CONFIG', () => {
    it('should have default enabled value', () => {
      expect(EXIT_CRITERIA_CONFIG.enabled).toBe(true);
    });

    it('should have default consensusThreshold', () => {
      expect(EXIT_CRITERIA_CONFIG.consensusThreshold).toBe(0.9);
    });

    it('should have default convergenceRounds', () => {
      expect(EXIT_CRITERIA_CONFIG.convergenceRounds).toBe(2);
    });

    it('should match ExitCriteriaConfig interface', () => {
      const config: ExitCriteriaConfig = EXIT_CRITERIA_CONFIG;

      expect(typeof config.enabled).toBe('boolean');
      expect(typeof config.consensusThreshold).toBe('number');
      expect(typeof config.convergenceRounds).toBe('number');
    });

    it('should have consensusThreshold in valid range', () => {
      expect(EXIT_CRITERIA_CONFIG.consensusThreshold).toBeGreaterThanOrEqual(0);
      expect(EXIT_CRITERIA_CONFIG.consensusThreshold).toBeLessThanOrEqual(1);
    });

    it('should have positive convergenceRounds', () => {
      expect(EXIT_CRITERIA_CONFIG.convergenceRounds).toBeGreaterThan(0);
    });
  });
});
