import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_FLAGS,
  deepMerge,
  loadFlagsFromEnv,
  FeatureFlagResolver,
  type FeatureFlags,
  type ParallelizationLevel,
  type EnforcementLevel,
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
      // Optimized defaults based on benchmark results
      expect(DEFAULT_FLAGS.sequentialParallelization.enabled).toBe(true);
      expect(DEFAULT_FLAGS.sequentialParallelization.level).toBe('last-only');

      expect(DEFAULT_FLAGS.toolEnforcement.enabled).toBe(true);
      expect(DEFAULT_FLAGS.toolEnforcement.level).toBe('normal');
      expect(DEFAULT_FLAGS.toolEnforcement.minCalls).toBe(1);
      expect(DEFAULT_FLAGS.toolEnforcement.maxCalls).toBe(6);

      expect(DEFAULT_FLAGS.groupthinkDetection.enabled).toBe(true);
      expect(DEFAULT_FLAGS.groupthinkDetection.threshold).toBe(0.85);

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
    describe('sequentialParallelization', () => {
      it('should load enabled flag', () => {
        process.env.ROUNDTABLE_PARALLEL_ENABLED = 'true';
        const flags = loadFlagsFromEnv();

        expect(flags.sequentialParallelization?.enabled).toBe(true);
      });

      it('should load level flag', () => {
        process.env.ROUNDTABLE_PARALLEL_LEVEL = 'last-only';
        const flags = loadFlagsFromEnv();

        expect(flags.sequentialParallelization?.level).toBe('last-only');
      });

      it('should default to last-only for invalid level', () => {
        process.env.ROUNDTABLE_PARALLEL_LEVEL = 'invalid';
        const flags = loadFlagsFromEnv();

        // Invalid level falls back to DEFAULT_FLAGS.sequentialParallelization.level
        expect(flags.sequentialParallelization?.level).toBe('last-only');
      });

      it('should parse all valid parallelization levels', () => {
        const levels: ParallelizationLevel[] = ['none', 'last-only', 'full'];

        for (const level of levels) {
          process.env.ROUNDTABLE_PARALLEL_LEVEL = level;
          const flags = loadFlagsFromEnv();
          expect(flags.sequentialParallelization?.level).toBe(level);
        }
      });
    });

    describe('toolEnforcement', () => {
      it('should load enforcement level', () => {
        process.env.ROUNDTABLE_TOOL_ENFORCEMENT = 'strict';
        const flags = loadFlagsFromEnv();

        expect(flags.toolEnforcement?.level).toBe('strict');
      });

      it('should load min/max calls', () => {
        process.env.ROUNDTABLE_TOOL_MIN_CALLS = '2';
        process.env.ROUNDTABLE_TOOL_MAX_CALLS = '4';
        const flags = loadFlagsFromEnv();

        expect(flags.toolEnforcement?.minCalls).toBe(2);
        expect(flags.toolEnforcement?.maxCalls).toBe(4);
      });

      it('should parse all valid enforcement levels', () => {
        const levels: EnforcementLevel[] = ['strict', 'normal', 'relaxed'];

        for (const level of levels) {
          process.env.ROUNDTABLE_TOOL_ENFORCEMENT = level;
          const flags = loadFlagsFromEnv();
          expect(flags.toolEnforcement?.level).toBe(level);
        }
      });

      it('should default to normal for invalid enforcement level', () => {
        process.env.ROUNDTABLE_TOOL_ENFORCEMENT = 'invalid';
        const flags = loadFlagsFromEnv();

        expect(flags.toolEnforcement?.level).toBe('normal');
      });
    });

    describe('groupthinkDetection', () => {
      it('should load enabled flag', () => {
        process.env.ROUNDTABLE_GROUPTHINK_ENABLED = 'false';
        const flags = loadFlagsFromEnv();

        expect(flags.groupthinkDetection?.enabled).toBe(false);
      });

      it('should load threshold', () => {
        process.env.ROUNDTABLE_GROUPTHINK_THRESHOLD = '0.85';
        const flags = loadFlagsFromEnv();

        expect(flags.groupthinkDetection?.threshold).toBe(0.85);
      });

      it('should not set threshold for invalid value', () => {
        process.env.ROUNDTABLE_GROUPTHINK_THRESHOLD = 'invalid';
        const flags = loadFlagsFromEnv();

        expect(flags.groupthinkDetection?.threshold).toBeUndefined();
      });

      it('should not set threshold for out-of-range value', () => {
        process.env.ROUNDTABLE_GROUPTHINK_THRESHOLD = '1.5';
        const flags = loadFlagsFromEnv();

        expect(flags.groupthinkDetection?.threshold).toBeUndefined();
      });
    });

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
    });

    it('should return empty partial when no env vars set', () => {
      const flags = loadFlagsFromEnv();

      expect(Object.keys(flags)).toHaveLength(0);
    });

    it('should load all flags correctly', () => {
      process.env.ROUNDTABLE_PARALLEL_ENABLED = 'true';
      process.env.ROUNDTABLE_PARALLEL_LEVEL = 'full';
      process.env.ROUNDTABLE_TOOL_ENFORCEMENT = 'strict';
      process.env.ROUNDTABLE_TOOL_MIN_CALLS = '2';
      process.env.ROUNDTABLE_TOOL_MAX_CALLS = '4';
      process.env.ROUNDTABLE_GROUPTHINK_ENABLED = 'true';
      process.env.ROUNDTABLE_GROUPTHINK_THRESHOLD = '0.8';
      process.env.ROUNDTABLE_EXIT_ENABLED = 'true';
      process.env.ROUNDTABLE_EXIT_CONSENSUS = '0.95';
      process.env.ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS = '3';

      const flags = loadFlagsFromEnv();

      expect(flags.sequentialParallelization?.enabled).toBe(true);
      expect(flags.sequentialParallelization?.level).toBe('full');
      expect(flags.toolEnforcement?.level).toBe('strict');
      expect(flags.toolEnforcement?.minCalls).toBe(2);
      expect(flags.toolEnforcement?.maxCalls).toBe(4);
      expect(flags.groupthinkDetection?.enabled).toBe(true);
      expect(flags.groupthinkDetection?.threshold).toBe(0.8);
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
        process.env.ROUNDTABLE_PARALLEL_ENABLED = 'true';
        process.env.ROUNDTABLE_PARALLEL_LEVEL = 'last-only';

        const resolver = new FeatureFlagResolver();
        const flags = resolver.resolve();

        expect(flags.sequentialParallelization.enabled).toBe(true);
        expect(flags.sequentialParallelization.level).toBe('last-only');
        // Other flags should remain default
        expect(flags.toolEnforcement).toEqual(DEFAULT_FLAGS.toolEnforcement);
      });

      it('should apply session overrides with highest priority', () => {
        process.env.ROUNDTABLE_PARALLEL_LEVEL = 'last-only';

        const resolver = new FeatureFlagResolver();
        const sessionOverride: Partial<FeatureFlags> = {
          sequentialParallelization: {
            enabled: true,
            level: 'full',
          },
        };
        const flags = resolver.resolve(sessionOverride);

        // Session override takes precedence over env
        expect(flags.sequentialParallelization.enabled).toBe(true);
        expect(flags.sequentialParallelization.level).toBe('full');
      });

      it('should merge partial session overrides with defaults', () => {
        const resolver = new FeatureFlagResolver();
        const sessionOverride: Partial<FeatureFlags> = {
          toolEnforcement: {
            enabled: true,
            level: 'strict',
            minCalls: 2,
          },
        };
        const flags = resolver.resolve(sessionOverride);

        expect(flags.toolEnforcement.enabled).toBe(true);
        expect(flags.toolEnforcement.level).toBe('strict');
        expect(flags.toolEnforcement.minCalls).toBe(2);
        // maxCalls should come from DEFAULT_FLAGS (now has default value 6)
        expect(flags.toolEnforcement.maxCalls).toBe(6);
      });

      it('should handle complex nested overrides', () => {
        process.env.ROUNDTABLE_TOOL_ENFORCEMENT = 'relaxed';
        process.env.ROUNDTABLE_TOOL_MIN_CALLS = '1';

        const resolver = new FeatureFlagResolver();
        const sessionOverride: Partial<FeatureFlags> = {
          toolEnforcement: {
            enabled: false,
            level: 'strict',
            maxCalls: 5,
          },
        };
        const flags = resolver.resolve(sessionOverride);

        // Session overrides env
        expect(flags.toolEnforcement.enabled).toBe(false);
        expect(flags.toolEnforcement.level).toBe('strict');
        // Env value for minCalls
        expect(flags.toolEnforcement.minCalls).toBe(1);
        // Session value for maxCalls
        expect(flags.toolEnforcement.maxCalls).toBe(5);
      });
    });

    describe('resolveWithSource', () => {
      it('should show default as source when no overrides', () => {
        const resolver = new FeatureFlagResolver();
        const resolutions = resolver.resolveWithSource();

        expect(resolutions['sequentialParallelization.enabled'].source).toBe('default');
        expect(resolutions['sequentialParallelization.enabled'].value).toBe(true);
      });

      it('should show env as source when env var set', () => {
        process.env.ROUNDTABLE_PARALLEL_ENABLED = 'true';

        const resolver = new FeatureFlagResolver();
        const resolutions = resolver.resolveWithSource();

        expect(resolutions['sequentialParallelization.enabled'].source).toBe('env');
        expect(resolutions['sequentialParallelization.enabled'].value).toBe(true);
      });

      it('should show session as source when session override provided', () => {
        process.env.ROUNDTABLE_PARALLEL_ENABLED = 'true';

        const resolver = new FeatureFlagResolver();
        const sessionOverride: Partial<FeatureFlags> = {
          sequentialParallelization: {
            enabled: false,
            level: 'full',
          },
        };
        const resolutions = resolver.resolveWithSource(sessionOverride);

        expect(resolutions['sequentialParallelization.enabled'].source).toBe('session');
        expect(resolutions['sequentialParallelization.enabled'].value).toBe(false);
      });

      it('should track sources for all flag fields', () => {
        const resolver = new FeatureFlagResolver();
        const resolutions = resolver.resolveWithSource();

        // Check that all expected keys exist
        const expectedKeys = [
          'sequentialParallelization.enabled',
          'sequentialParallelization.level',
          'sequentialParallelization.modes',
          'toolEnforcement.enabled',
          'toolEnforcement.level',
          'toolEnforcement.minCalls',
          'toolEnforcement.maxCalls',
          'groupthinkDetection.enabled',
          'groupthinkDetection.threshold',
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
        process.env.ROUNDTABLE_PARALLEL_ENABLED = 'true';

        const resolver = new FeatureFlagResolver();
        const envFlags = resolver.getEnvFlags();

        expect(envFlags.sequentialParallelization?.enabled).toBe(true);

        // Modifying returned object should not affect resolver
        envFlags.sequentialParallelization = {
          enabled: false,
          level: 'full',
        };
        const envFlags2 = resolver.getEnvFlags();
        expect(envFlags2.sequentialParallelization?.enabled).toBe(true);
      });
    });

    describe('getDefaultFlags', () => {
      it('should return copy of default flags', () => {
        const resolver = new FeatureFlagResolver();
        const defaults = resolver.getDefaultFlags();

        expect(defaults).toEqual(DEFAULT_FLAGS);

        // Modifying returned object should not affect resolver
        defaults.sequentialParallelization.enabled = false;
        const defaults2 = resolver.getDefaultFlags();
        expect(defaults2.sequentialParallelization.enabled).toBe(true);
      });
    });

    describe('reloadEnvFlags', () => {
      it('should reload flags from environment', () => {
        const resolver = new FeatureFlagResolver();
        let flags = resolver.resolve();
        expect(flags.sequentialParallelization.enabled).toBe(true);

        // Set env var after resolver creation to override default
        process.env.ROUNDTABLE_PARALLEL_ENABLED = 'false';

        // Before reload, should still be default value
        flags = resolver.resolve();
        expect(flags.sequentialParallelization.enabled).toBe(true);

        // After reload, should pick up new env value
        resolver.reloadEnvFlags();
        flags = resolver.resolve();
        expect(flags.sequentialParallelization.enabled).toBe(false);
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle MCP server config scenario', () => {
      // Simulate MCP server with env config
      process.env.ROUNDTABLE_PARALLEL_ENABLED = 'true';
      process.env.ROUNDTABLE_PARALLEL_LEVEL = 'last-only';
      process.env.ROUNDTABLE_GROUPTHINK_THRESHOLD = '0.85';

      const resolver = new FeatureFlagResolver();
      const flags = resolver.resolve();

      expect(flags.sequentialParallelization.enabled).toBe(true);
      expect(flags.sequentialParallelization.level).toBe('last-only');
      expect(flags.groupthinkDetection.threshold).toBe(0.85);
    });

    it('should handle per-session override scenario', () => {
      // Base env config
      process.env.ROUNDTABLE_PARALLEL_LEVEL = 'last-only';

      const resolver = new FeatureFlagResolver();

      // Session 1: Use env defaults
      const session1Flags = resolver.resolve();
      expect(session1Flags.sequentialParallelization.level).toBe('last-only');

      // Session 2: Override for specific use case
      const session2Flags = resolver.resolve({
        sequentialParallelization: {
          enabled: true,
          level: 'full',
        },
        exitCriteria: {
          enabled: true,
          consensusThreshold: 0.95,
        },
      });
      expect(session2Flags.sequentialParallelization.level).toBe('full');
      expect(session2Flags.exitCriteria.enabled).toBe(true);
      expect(session2Flags.exitCriteria.consensusThreshold).toBe(0.95);

      // Session 3: Different override
      const session3Flags = resolver.resolve({
        toolEnforcement: {
          enabled: true,
          level: 'strict',
        },
      });
      expect(session3Flags.sequentialParallelization.level).toBe('last-only'); // Back to env
      expect(session3Flags.toolEnforcement.level).toBe('strict');
    });

    it('should preserve type safety with mode arrays', () => {
      const resolver = new FeatureFlagResolver();
      const sessionOverride: Partial<FeatureFlags> = {
        sequentialParallelization: {
          enabled: true,
          level: 'last-only',
          modes: ['adversarial', 'socratic'],
        },
      };
      const flags = resolver.resolve(sessionOverride);

      expect(flags.sequentialParallelization.modes).toEqual(['adversarial', 'socratic']);
    });
  });
});
