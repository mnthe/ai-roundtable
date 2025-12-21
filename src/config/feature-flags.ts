/**
 * Feature Flag System
 *
 * Provides centralized configuration for enabling/disabling features
 * with support for environment variables and session-level overrides.
 *
 * Resolution order (highest to lowest priority):
 * 1. Session-level override (per-debate via MCP tool params)
 * 2. Environment variables (MCP server config)
 * 3. Default values (hardcoded fallback)
 */

import type { DebateMode } from '../types/index.js';
import { getEnvBoolean, getEnvNumber } from '../utils/env.js';

// ============================================
// Types
// ============================================

/**
 * Parallelization level for sequential modes
 * - 'none': Fully sequential execution
 * - 'last-only': All agents except last run in parallel, last sees all
 * - 'full': All agents run in parallel (converts to parallel mode)
 */
export type ParallelizationLevel = 'none' | 'last-only' | 'full';

/**
 * Enforcement level for various features
 * - 'strict': Strict enforcement with validation
 * - 'normal': Default behavior
 * - 'relaxed': Minimal enforcement
 */
export type EnforcementLevel = 'strict' | 'normal' | 'relaxed';

/**
 * Source of a feature flag value
 */
export type FlagSource = 'session' | 'env' | 'default';

/**
 * Resolution result for a single flag
 */
export interface FlagResolution {
  value: unknown;
  source: FlagSource;
}

/**
 * Sequential parallelization feature configuration
 */
export interface SequentialParallelizationConfig {
  /** Enable parallel execution for sequential modes */
  enabled: boolean;
  /** Parallelization strategy */
  level: ParallelizationLevel;
  /** Override parallelization for specific modes */
  modes?: DebateMode[];
}

/**
 * Tool enforcement feature configuration
 */
export interface ToolEnforcementConfig {
  /** Enable tool usage enforcement */
  enabled: boolean;
  /** Enforcement level */
  level: EnforcementLevel;
  /** Minimum tool calls per round */
  minCalls?: number;
  /** Maximum tool calls per round */
  maxCalls?: number;
}

/**
 * Groupthink detection feature configuration
 */
export interface GroupthinkDetectionConfig {
  /** Enable groupthink warning */
  enabled: boolean;
  /** Agreement level threshold to trigger warning (0-1) */
  threshold?: number;
}

/**
 * Exit criteria feature configuration
 */
export interface ExitCriteriaConfig {
  /** Enable automatic exit criteria checking */
  enabled: boolean;
  /** Agreement level to trigger early exit (0-1) */
  consensusThreshold?: number;
  /** Number of rounds with stable positions to trigger exit */
  convergenceRounds?: number;
}

/**
 * Prompt enforcement feature configuration
 */
export interface PromptEnforcementConfig {
  /** Enforcement level for prompt requirements */
  level: EnforcementLevel;
  /** Require explicit stance in devils-advocate mode */
  requireStance?: boolean;
  /** Require tool usage in all modes */
  requireToolUsage?: boolean;
}

/**
 * Complete feature flags configuration
 */
export interface FeatureFlags {
  /** Sequential mode parallelization */
  sequentialParallelization: SequentialParallelizationConfig;
  /** Tool usage enforcement */
  toolEnforcement: ToolEnforcementConfig;
  /** Groupthink detection */
  groupthinkDetection: GroupthinkDetectionConfig;
  /** Exit criteria */
  exitCriteria: ExitCriteriaConfig;
  /** Prompt enforcement */
  promptEnforcement: PromptEnforcementConfig;
}

// ============================================
// Constants
// ============================================

/**
 * Default feature flag values
 *
 * These defaults are optimized based on benchmark results:
 * - sequentialParallelization: 18% latency reduction with last-only
 * - exitCriteria: Cost savings via early termination
 * - groupthinkDetection: 0.85 threshold for earlier warnings
 */
export const DEFAULT_FLAGS: FeatureFlags = {
  sequentialParallelization: {
    enabled: true,
    level: 'last-only',
  },
  toolEnforcement: {
    enabled: true,
    level: 'normal',
    minCalls: 1,
    maxCalls: 6,
  },
  groupthinkDetection: {
    enabled: true,
    threshold: 0.85,
  },
  exitCriteria: {
    enabled: true,
    consensusThreshold: 0.9,
    convergenceRounds: 2,
  },
  promptEnforcement: {
    level: 'normal',
    requireStance: true,
  },
};

/**
 * Valid parallelization levels
 */
const VALID_PARALLELIZATION_LEVELS: ParallelizationLevel[] = ['none', 'last-only', 'full'];

/**
 * Valid enforcement levels
 */
const VALID_ENFORCEMENT_LEVELS: EnforcementLevel[] = ['strict', 'normal', 'relaxed'];

// ============================================
// Utility Functions
// ============================================

/**
 * Parse parallelization level from string
 */
function parseParallelizationLevel(value: string | undefined): ParallelizationLevel {
  if (!value) return DEFAULT_FLAGS.sequentialParallelization.level;
  const normalized = value.toLowerCase().trim();
  if (VALID_PARALLELIZATION_LEVELS.includes(normalized as ParallelizationLevel)) {
    return normalized as ParallelizationLevel;
  }
  return DEFAULT_FLAGS.sequentialParallelization.level;
}

/**
 * Parse enforcement level from string
 */
function parseEnforcementLevel(value: string | undefined): EnforcementLevel {
  if (!value) return 'normal';
  const normalized = value.toLowerCase().trim();
  if (VALID_ENFORCEMENT_LEVELS.includes(normalized as EnforcementLevel)) {
    return normalized as EnforcementLevel;
  }
  return 'normal';
}

/**
 * Deep merge utility for feature flag objects
 *
 * Merges multiple objects deeply, with later objects taking precedence.
 * Only merges plain objects; arrays and primitives are replaced entirely.
 * Creates deep copies of all nested objects to prevent mutation.
 *
 * @param target - Base object
 * @param sources - Objects to merge into target (later takes precedence)
 * @returns Merged object (deep copy)
 */
export function deepMerge<T extends object>(
  target: T,
  ...sources: Partial<T>[]
): T {
  const result = { ...target } as T;

  for (const source of sources) {
    if (!source) continue;

    for (const key of Object.keys(source) as (keyof T)[]) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (sourceValue === undefined) {
        // Skip undefined values
        continue;
      }

      if (isPlainObject(sourceValue)) {
        if (isPlainObject(targetValue)) {
          // Deep merge two objects
          (result as Record<string, unknown>)[key as string] = deepMerge(
            targetValue as object,
            sourceValue as object
          );
        } else {
          // Deep copy the source object (target has no corresponding object)
          (result as Record<string, unknown>)[key as string] = deepMerge(
            {} as object,
            sourceValue as object
          );
        }
      } else if (Array.isArray(sourceValue)) {
        // Deep copy arrays
        (result as Record<string, unknown>)[key as string] = [...sourceValue];
      } else {
        // Replace primitive value
        (result as Record<string, unknown>)[key as string] = sourceValue;
      }
    }
  }

  return result;
}

/**
 * Check if value is a plain object (not array, null, or class instance)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// ============================================
// Environment Variable Loading
// ============================================

/**
 * Load feature flags from environment variables
 *
 * Environment variables:
 * - ROUNDTABLE_PARALLEL_ENABLED: Enable sequential parallelization
 * - ROUNDTABLE_PARALLEL_LEVEL: Parallelization level (none/last-only/full)
 * - ROUNDTABLE_TOOL_ENFORCEMENT: Tool enforcement level (strict/normal/relaxed)
 * - ROUNDTABLE_TOOL_MIN_CALLS: Minimum tool calls per round
 * - ROUNDTABLE_TOOL_MAX_CALLS: Maximum tool calls per round
 * - ROUNDTABLE_GROUPTHINK_ENABLED: Enable groupthink detection
 * - ROUNDTABLE_GROUPTHINK_THRESHOLD: Agreement threshold for warning
 * - ROUNDTABLE_EXIT_ENABLED: Enable exit criteria
 * - ROUNDTABLE_EXIT_CONSENSUS: Consensus threshold for early exit
 * - ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS: Convergence rounds for early exit
 * - ROUNDTABLE_PROMPT_LEVEL: Prompt enforcement level
 *
 * @returns Partial feature flags from environment
 */
export function loadFlagsFromEnv(): Partial<FeatureFlags> {
  const flags: Partial<FeatureFlags> = {};

  // Sequential parallelization
  const parallelEnabled = process.env.ROUNDTABLE_PARALLEL_ENABLED;
  const parallelLevel = process.env.ROUNDTABLE_PARALLEL_LEVEL;

  if (parallelEnabled !== undefined || parallelLevel !== undefined) {
    flags.sequentialParallelization = {
      enabled: parallelEnabled !== undefined
        ? getEnvBoolean('ROUNDTABLE_PARALLEL_ENABLED', false)
        : DEFAULT_FLAGS.sequentialParallelization.enabled,
      level: parseParallelizationLevel(parallelLevel),
    };
  }

  // Tool enforcement
  const toolEnforcement = process.env.ROUNDTABLE_TOOL_ENFORCEMENT;
  const toolMinCalls = process.env.ROUNDTABLE_TOOL_MIN_CALLS;
  const toolMaxCalls = process.env.ROUNDTABLE_TOOL_MAX_CALLS;

  if (toolEnforcement !== undefined || toolMinCalls !== undefined || toolMaxCalls !== undefined) {
    flags.toolEnforcement = {
      enabled: DEFAULT_FLAGS.toolEnforcement.enabled,
      level: parseEnforcementLevel(toolEnforcement),
    };
    if (toolMinCalls !== undefined) {
      flags.toolEnforcement.minCalls = getEnvNumber('ROUNDTABLE_TOOL_MIN_CALLS', 1);
    }
    if (toolMaxCalls !== undefined) {
      flags.toolEnforcement.maxCalls = getEnvNumber('ROUNDTABLE_TOOL_MAX_CALLS', 6);
    }
  }

  // Groupthink detection
  const groupthinkEnabled = process.env.ROUNDTABLE_GROUPTHINK_ENABLED;
  const groupthinkThreshold = process.env.ROUNDTABLE_GROUPTHINK_THRESHOLD;

  if (groupthinkEnabled !== undefined || groupthinkThreshold !== undefined) {
    flags.groupthinkDetection = {
      enabled: groupthinkEnabled !== undefined
        ? getEnvBoolean('ROUNDTABLE_GROUPTHINK_ENABLED', true)
        : DEFAULT_FLAGS.groupthinkDetection.enabled,
    };
    if (groupthinkThreshold !== undefined) {
      const threshold = parseFloat(groupthinkThreshold);
      if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) {
        flags.groupthinkDetection.threshold = threshold;
      }
    }
  }

  // Exit criteria
  const exitEnabled = process.env.ROUNDTABLE_EXIT_ENABLED;
  const exitConsensus = process.env.ROUNDTABLE_EXIT_CONSENSUS;
  const exitConvergence = process.env.ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS;

  if (exitEnabled !== undefined || exitConsensus !== undefined || exitConvergence !== undefined) {
    flags.exitCriteria = {
      enabled: exitEnabled !== undefined
        ? getEnvBoolean('ROUNDTABLE_EXIT_ENABLED', false)
        : DEFAULT_FLAGS.exitCriteria.enabled,
    };
    if (exitConsensus !== undefined) {
      const threshold = parseFloat(exitConsensus);
      if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) {
        flags.exitCriteria.consensusThreshold = threshold;
      }
    }
    if (exitConvergence !== undefined) {
      flags.exitCriteria.convergenceRounds = getEnvNumber('ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS', 2);
    }
  }

  // Prompt enforcement
  const promptLevel = process.env.ROUNDTABLE_PROMPT_LEVEL;

  if (promptLevel !== undefined) {
    flags.promptEnforcement = {
      level: parseEnforcementLevel(promptLevel),
    };
  }

  return flags;
}

// ============================================
// Feature Flag Resolver
// ============================================

/**
 * Feature Flag Resolver
 *
 * Resolves feature flags from multiple sources with clear precedence:
 * 1. Session override (highest)
 * 2. Environment variables
 * 3. Default values (lowest)
 */
export class FeatureFlagResolver {
  private envFlags: Partial<FeatureFlags>;
  private defaultFlags: FeatureFlags = DEFAULT_FLAGS;

  constructor() {
    this.envFlags = loadFlagsFromEnv();
  }

  /**
   * Resolve feature flags with optional session override
   *
   * @param sessionOverride - Session-level flag overrides (highest priority)
   * @returns Fully resolved feature flags
   */
  resolve(sessionOverride?: Partial<FeatureFlags>): FeatureFlags {
    return deepMerge(
      this.defaultFlags,
      this.envFlags,
      sessionOverride ?? {}
    );
  }

  /**
   * Resolve feature flags with source information for debugging
   *
   * @param sessionOverride - Session-level flag overrides
   * @returns Record of flag paths to resolution info
   */
  resolveWithSource(
    sessionOverride?: Partial<FeatureFlags>
  ): Record<string, FlagResolution> {
    const result: Record<string, FlagResolution> = {};

    const resolveValue = (
      path: string,
      defaultVal: unknown,
      envVal: unknown,
      sessionVal: unknown
    ): void => {
      if (sessionVal !== undefined) {
        result[path] = { value: sessionVal, source: 'session' };
      } else if (envVal !== undefined) {
        result[path] = { value: envVal, source: 'env' };
      } else {
        result[path] = { value: defaultVal, source: 'default' };
      }
    };

    // Sequential parallelization
    resolveValue(
      'sequentialParallelization.enabled',
      this.defaultFlags.sequentialParallelization.enabled,
      this.envFlags.sequentialParallelization?.enabled,
      sessionOverride?.sequentialParallelization?.enabled
    );
    resolveValue(
      'sequentialParallelization.level',
      this.defaultFlags.sequentialParallelization.level,
      this.envFlags.sequentialParallelization?.level,
      sessionOverride?.sequentialParallelization?.level
    );
    resolveValue(
      'sequentialParallelization.modes',
      this.defaultFlags.sequentialParallelization.modes,
      this.envFlags.sequentialParallelization?.modes,
      sessionOverride?.sequentialParallelization?.modes
    );

    // Tool enforcement
    resolveValue(
      'toolEnforcement.enabled',
      this.defaultFlags.toolEnforcement.enabled,
      this.envFlags.toolEnforcement?.enabled,
      sessionOverride?.toolEnforcement?.enabled
    );
    resolveValue(
      'toolEnforcement.level',
      this.defaultFlags.toolEnforcement.level,
      this.envFlags.toolEnforcement?.level,
      sessionOverride?.toolEnforcement?.level
    );
    resolveValue(
      'toolEnforcement.minCalls',
      this.defaultFlags.toolEnforcement.minCalls,
      this.envFlags.toolEnforcement?.minCalls,
      sessionOverride?.toolEnforcement?.minCalls
    );
    resolveValue(
      'toolEnforcement.maxCalls',
      this.defaultFlags.toolEnforcement.maxCalls,
      this.envFlags.toolEnforcement?.maxCalls,
      sessionOverride?.toolEnforcement?.maxCalls
    );

    // Groupthink detection
    resolveValue(
      'groupthinkDetection.enabled',
      this.defaultFlags.groupthinkDetection.enabled,
      this.envFlags.groupthinkDetection?.enabled,
      sessionOverride?.groupthinkDetection?.enabled
    );
    resolveValue(
      'groupthinkDetection.threshold',
      this.defaultFlags.groupthinkDetection.threshold,
      this.envFlags.groupthinkDetection?.threshold,
      sessionOverride?.groupthinkDetection?.threshold
    );

    // Exit criteria
    resolveValue(
      'exitCriteria.enabled',
      this.defaultFlags.exitCriteria.enabled,
      this.envFlags.exitCriteria?.enabled,
      sessionOverride?.exitCriteria?.enabled
    );
    resolveValue(
      'exitCriteria.consensusThreshold',
      this.defaultFlags.exitCriteria.consensusThreshold,
      this.envFlags.exitCriteria?.consensusThreshold,
      sessionOverride?.exitCriteria?.consensusThreshold
    );
    resolveValue(
      'exitCriteria.convergenceRounds',
      this.defaultFlags.exitCriteria.convergenceRounds,
      this.envFlags.exitCriteria?.convergenceRounds,
      sessionOverride?.exitCriteria?.convergenceRounds
    );

    // Prompt enforcement
    resolveValue(
      'promptEnforcement.level',
      this.defaultFlags.promptEnforcement.level,
      this.envFlags.promptEnforcement?.level,
      sessionOverride?.promptEnforcement?.level
    );
    resolveValue(
      'promptEnforcement.requireStance',
      this.defaultFlags.promptEnforcement.requireStance,
      this.envFlags.promptEnforcement?.requireStance,
      sessionOverride?.promptEnforcement?.requireStance
    );
    resolveValue(
      'promptEnforcement.requireToolUsage',
      this.defaultFlags.promptEnforcement.requireToolUsage,
      this.envFlags.promptEnforcement?.requireToolUsage,
      sessionOverride?.promptEnforcement?.requireToolUsage
    );

    return result;
  }

  /**
   * Get environment flags (for debugging)
   * Returns a deep copy to prevent external modification
   */
  getEnvFlags(): Partial<FeatureFlags> {
    return deepMerge({} as FeatureFlags, this.envFlags);
  }

  /**
   * Get default flags
   * Returns a deep copy to prevent external modification
   */
  getDefaultFlags(): FeatureFlags {
    return deepMerge({} as FeatureFlags, this.defaultFlags);
  }

  /**
   * Reload environment flags
   * Useful for testing or dynamic configuration updates
   */
  reloadEnvFlags(): void {
    this.envFlags = loadFlagsFromEnv();
  }
}
