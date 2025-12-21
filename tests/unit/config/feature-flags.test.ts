import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_FLAGS,
  deepMerge,
  loadFlagsFromEnv,
  FeatureFlagResolver,
  type FeatureFlags,
} from '../../../src/config/feature-flags.js';

describe('Feature Flag System', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all ROUNDTABLE_ env vars
    Object.keys(process.env)
      .filter((key) => key.startsWith('ROUNDTABLE_'))
      .forEach((key) => delete process.env[key]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('DEFAULT_FLAGS', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_FLAGS.exitCriteria.enabled).toBe(true);
      expect(DEFAULT_FLAGS.exitCriteria.consensusThreshold).toBe(0.9);
      expect(DEFAULT_FLAGS.exitCriteria.convergenceRounds).toBe(2);
    });
  });

  describe('deepMerge', () => {
    it('should merge simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should deep merge nested objects', () => {
      const target = {
        outer: { a: 1, b: 2 },
        other: 'value',
      };
      const source = {
        outer: { b: 3, c: 4 },
      };
      const result = deepMerge(target, source as typeof target);

      expect(result).toEqual({
        outer: { a: 1, b: 3, c: 4 },
        other: 'value',
      });
    });

    it('should not mutate original objects', () => {
      const target = { a: 1 };
      const source = { b: 2 };
      const result = deepMerge(target, source as typeof target);

      expect(target).toEqual({ a: 1 });
      expect(source).toEqual({ b: 2 });
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should skip undefined values', () => {
      const target = { a: 1, b: 2 };
      const source = { a: undefined, c: 3 };
      const result = deepMerge(target, source as typeof target);

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should replace arrays (not merge them)', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };
      const result = deepMerge(target, source);

      expect(result.arr).toEqual([4, 5]);
    });

    it('should handle multiple sources with correct precedence', () => {
      const target = { a: 1, b: 1, c: 1 };
      const source1 = { a: 2, b: 2 };
      const source2 = { a: 3 };
      const result = deepMerge(target, source1, source2);

      expect(result).toEqual({ a: 3, b: 2, c: 1 });
    });

    it('should handle null and empty sources', () => {
      const target = { a: 1 };
      const result = deepMerge(target, {}, undefined as unknown as typeof target);

      expect(result).toEqual({ a: 1 });
    });
  });

  describe('loadFlagsFromEnv', () => {
    describe('exitCriteria', () => {
      it('should load enabled flag', () => {
        process.env.ROUNDTABLE_EXIT_ENABLED = 'true';
        const flags = loadFlagsFromEnv();

        expect(flags.exitCriteria?.enabled).toBe(true);
      });

      it('should load consensus threshold', () => {
        process.env.ROUNDTABLE_EXIT_CONSENSUS = '0.95';
        const flags = loadFlagsFromEnv();

        expect(flags.exitCriteria?.consensusThreshold).toBe(0.95);
      });

      it('should load convergence rounds', () => {
        process.env.ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS = '3';
        const flags = loadFlagsFromEnv();

        expect(flags.exitCriteria?.convergenceRounds).toBe(3);
      });

      it('should not set threshold for invalid value', () => {
        process.env.ROUNDTABLE_EXIT_CONSENSUS = 'invalid';
        const flags = loadFlagsFromEnv();

        expect(flags.exitCriteria?.consensusThreshold).toBeUndefined();
      });

      it('should not set threshold for out-of-range value', () => {
        process.env.ROUNDTABLE_EXIT_CONSENSUS = '1.5';
        const flags = loadFlagsFromEnv();

        expect(flags.exitCriteria?.consensusThreshold).toBeUndefined();
      });
    });

    it('should return empty partial when no env vars set', () => {
      const flags = loadFlagsFromEnv();

      expect(Object.keys(flags)).toHaveLength(0);
    });

    it('should load all flags correctly', () => {
      process.env.ROUNDTABLE_EXIT_ENABLED = 'true';
      process.env.ROUNDTABLE_EXIT_CONSENSUS = '0.95';
      process.env.ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS = '3';

      const flags = loadFlagsFromEnv();

      expect(flags.exitCriteria?.enabled).toBe(true);
      expect(flags.exitCriteria?.consensusThreshold).toBe(0.95);
      expect(flags.exitCriteria?.convergenceRounds).toBe(3);
    });
  });

  describe('FeatureFlagResolver', () => {
    describe('resolve', () => {
      it('should return default flags when no env or session override', () => {
        const resolver = new FeatureFlagResolver();
        const flags = resolver.resolve();

        expect(flags).toEqual(DEFAULT_FLAGS);
      });

      it('should apply environment overrides', () => {
        process.env.ROUNDTABLE_EXIT_ENABLED = 'false';
        process.env.ROUNDTABLE_EXIT_CONSENSUS = '0.85';

        const resolver = new FeatureFlagResolver();
        const flags = resolver.resolve();

        expect(flags.exitCriteria.enabled).toBe(false);
        expect(flags.exitCriteria.consensusThreshold).toBe(0.85);
      });

      it('should apply session overrides with highest priority', () => {
        process.env.ROUNDTABLE_EXIT_CONSENSUS = '0.85';

        const resolver = new FeatureFlagResolver();
        const sessionOverride: Partial<FeatureFlags> = {
          exitCriteria: {
            enabled: false,
            consensusThreshold: 0.95,
          },
        };
        const flags = resolver.resolve(sessionOverride);

        // Session override takes precedence over env
        expect(flags.exitCriteria.enabled).toBe(false);
        expect(flags.exitCriteria.consensusThreshold).toBe(0.95);
      });

      it('should merge partial session overrides with defaults', () => {
        const resolver = new FeatureFlagResolver();
        const sessionOverride: Partial<FeatureFlags> = {
          exitCriteria: {
            enabled: false,
            consensusThreshold: 0.95,
          },
        };
        const flags = resolver.resolve(sessionOverride);

        expect(flags.exitCriteria.enabled).toBe(false);
        expect(flags.exitCriteria.consensusThreshold).toBe(0.95);
        // convergenceRounds should remain default
        expect(flags.exitCriteria.convergenceRounds).toBe(2);
      });
    });

    describe('resolveWithSource', () => {
      it('should show default as source when no overrides', () => {
        const resolver = new FeatureFlagResolver();
        const resolutions = resolver.resolveWithSource();

        expect(resolutions['exitCriteria.enabled'].source).toBe('default');
        expect(resolutions['exitCriteria.enabled'].value).toBe(true);
      });

      it('should show env as source when env var set', () => {
        process.env.ROUNDTABLE_EXIT_ENABLED = 'false';

        const resolver = new FeatureFlagResolver();
        const resolutions = resolver.resolveWithSource();

        expect(resolutions['exitCriteria.enabled'].source).toBe('env');
        expect(resolutions['exitCriteria.enabled'].value).toBe(false);
      });

      it('should show session as source when session override provided', () => {
        process.env.ROUNDTABLE_EXIT_ENABLED = 'false';

        const resolver = new FeatureFlagResolver();
        const sessionOverride: Partial<FeatureFlags> = {
          exitCriteria: {
            enabled: true,
            consensusThreshold: 0.95,
          },
        };
        const resolutions = resolver.resolveWithSource(sessionOverride);

        expect(resolutions['exitCriteria.enabled'].source).toBe('session');
        expect(resolutions['exitCriteria.enabled'].value).toBe(true);
      });

      it('should track sources for all flag fields', () => {
        const resolver = new FeatureFlagResolver();
        const resolutions = resolver.resolveWithSource();

        // Check that all expected keys exist
        const expectedKeys = [
          'exitCriteria.enabled',
          'exitCriteria.consensusThreshold',
          'exitCriteria.convergenceRounds',
        ];

        for (const key of expectedKeys) {
          expect(resolutions[key]).toBeDefined();
          expect(resolutions[key].source).toMatch(/^(default|env|session)$/);
        }
      });
    });

    describe('getEnvFlags', () => {
      it('should return copy of env flags', () => {
        process.env.ROUNDTABLE_EXIT_ENABLED = 'false';

        const resolver = new FeatureFlagResolver();
        const envFlags = resolver.getEnvFlags();

        expect(envFlags.exitCriteria?.enabled).toBe(false);

        // Modifying returned object should not affect resolver
        if (envFlags.exitCriteria) {
          envFlags.exitCriteria.enabled = true;
        }
        const envFlags2 = resolver.getEnvFlags();
        expect(envFlags2.exitCriteria?.enabled).toBe(false);
      });
    });

    describe('getDefaultFlags', () => {
      it('should return copy of default flags', () => {
        const resolver = new FeatureFlagResolver();
        const defaults = resolver.getDefaultFlags();

        expect(defaults).toEqual(DEFAULT_FLAGS);

        // Modifying returned object should not affect resolver
        defaults.exitCriteria.enabled = false;
        const defaults2 = resolver.getDefaultFlags();
        expect(defaults2.exitCriteria.enabled).toBe(true);
      });
    });

    describe('reloadEnvFlags', () => {
      it('should reload flags from environment', () => {
        const resolver = new FeatureFlagResolver();
        let flags = resolver.resolve();
        expect(flags.exitCriteria.enabled).toBe(true);

        // Set env var after resolver creation to override default
        process.env.ROUNDTABLE_EXIT_ENABLED = 'false';

        // Before reload, should still be default value
        flags = resolver.resolve();
        expect(flags.exitCriteria.enabled).toBe(true);

        // After reload, should pick up new env value
        resolver.reloadEnvFlags();
        flags = resolver.resolve();
        expect(flags.exitCriteria.enabled).toBe(false);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle MCP server config scenario', () => {
      // Simulate MCP server with env config
      process.env.ROUNDTABLE_EXIT_ENABLED = 'true';
      process.env.ROUNDTABLE_EXIT_CONSENSUS = '0.85';
      process.env.ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS = '3';

      const resolver = new FeatureFlagResolver();
      const flags = resolver.resolve();

      expect(flags.exitCriteria.enabled).toBe(true);
      expect(flags.exitCriteria.consensusThreshold).toBe(0.85);
      expect(flags.exitCriteria.convergenceRounds).toBe(3);
    });

    it('should handle per-session override scenario', () => {
      // Base env config
      process.env.ROUNDTABLE_EXIT_CONSENSUS = '0.85';

      const resolver = new FeatureFlagResolver();

      // Session 1: Use env defaults
      const session1Flags = resolver.resolve();
      expect(session1Flags.exitCriteria.consensusThreshold).toBe(0.85);

      // Session 2: Override for specific use case
      const session2Flags = resolver.resolve({
        exitCriteria: {
          enabled: true,
          consensusThreshold: 0.95,
        },
      });
      expect(session2Flags.exitCriteria.enabled).toBe(true);
      expect(session2Flags.exitCriteria.consensusThreshold).toBe(0.95);

      // Session 3: Different override
      const session3Flags = resolver.resolve({
        exitCriteria: {
          enabled: false,
          consensusThreshold: 0.75,
        },
      });
      expect(session3Flags.exitCriteria.enabled).toBe(false);
      expect(session3Flags.exitCriteria.consensusThreshold).toBe(0.75);
    });
  });
});
