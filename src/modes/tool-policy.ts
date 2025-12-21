/**
 * Tool Usage Policy for Debate Modes
 *
 * Defines mode-aware tool usage policies to optimize sequential mode performance.
 * Sequential modes benefit from limited tool usage since previous agents have
 * already gathered evidence that later agents can leverage.
 */

import type { DebateMode } from '../types/index.js';
import type { ParallelizationLevel } from '../config/feature-flags.js';

/**
 * Execution pattern for debate modes
 */
export type ExecutionPattern = 'parallel' | 'sequential';

// Re-export ParallelizationLevel for convenience
export type { ParallelizationLevel } from '../config/feature-flags.js';

/**
 * Tool usage policy defining limits and guidance for agents
 */
export interface ToolUsagePolicy {
  /** Minimum number of tool calls recommended */
  minCalls: number;
  /** Maximum number of tool calls allowed */
  maxCalls: number;
  /** Human-readable guidance for the agent */
  guidance: string;
}

/**
 * Tool usage policies by execution pattern
 */
export const TOOL_USAGE_POLICIES: Record<ExecutionPattern, ToolUsagePolicy> = {
  parallel: {
    minCalls: 1,
    maxCalls: 10,
    guidance: 'Use tools freely to gather comprehensive evidence.',
  },
  sequential: {
    minCalls: 1,
    maxCalls: 5,
    guidance: 'Leverage previous responses; limit to 1-5 essential tool calls.',
  },
};

/**
 * Mapping from debate mode to execution pattern
 */
export const MODE_EXECUTION_PATTERN: Record<DebateMode, ExecutionPattern> = {
  collaborative: 'parallel',
  'expert-panel': 'parallel',
  delphi: 'parallel',
  adversarial: 'sequential',
  socratic: 'sequential',
  'devils-advocate': 'sequential',
  'red-team-blue-team': 'parallel',
};

/**
 * Parallelization optimization for sequential modes
 *
 * Specifies which parallelization strategy applies to each sequential mode
 * when the sequentialParallelization feature flag is enabled:
 *
 * - 'none': Keep fully sequential (each agent sees all previous responses)
 * - 'last-only': All except last run in parallel, last sees all
 * - 'full': All agents run in parallel (effectively converts to parallel mode)
 *
 * Design rationale:
 * - devils-advocate: 'last-only' - Evaluator (last) needs to see PRIMARY and OPPOSITION
 * - socratic: 'none' - Each question depends on previous answers
 * - adversarial: 'none' - Counter-arguments need to see what they're countering
 */
export const MODE_PARALLELIZATION: Record<DebateMode, ParallelizationLevel> = {
  // Parallel modes - no optimization needed (already parallel)
  collaborative: 'full',
  'expert-panel': 'full',
  delphi: 'full',
  'red-team-blue-team': 'full',
  // Sequential modes - specify optimization potential
  adversarial: 'none', // Keep sequential: counter-arguments need context
  socratic: 'none', // Keep sequential: questions depend on previous answers
  'devils-advocate': 'last-only', // Optimize: evaluator needs both, but PRIMARY/OPPOSITION can parallel
};

/**
 * Sequential mode tool guidance for prompt inclusion
 *
 * This guidance helps agents understand when to use tools sparingly
 * in sequential modes where previous agents have already gathered evidence.
 */
export const SEQUENTIAL_MODE_TOOL_GUIDANCE = `
## Tool Usage in Sequential Discussion

Previous participants have already gathered evidence and research.
Before making a tool call, check if the information already exists in their responses.

MUST:
- Review previous responses for existing evidence before searching
- Limit tool calls to 1-2 essential searches only
- Focus on NEW information not already covered

MUST NOT:
- Repeat searches that previous agents have done
- Use more than 2 tool calls per response
- Search for information already present in context
`;

/**
 * Get the tool usage policy for a specific debate mode
 *
 * Returns the appropriate policy based on the mode's execution pattern:
 * - parallel: Agents gather evidence independently
 * - sequential: Agents leverage previous responses, limited tool usage
 *
 * @param mode - The debate mode
 * @returns The tool usage policy for the mode's execution pattern
 */
export function getToolPolicy(mode: DebateMode): ToolUsagePolicy {
  const pattern = MODE_EXECUTION_PATTERN[mode];
  return TOOL_USAGE_POLICIES[pattern];
}

/**
 * Get the execution pattern for a specific debate mode
 *
 * @param mode - The debate mode
 * @returns The execution pattern (parallel or sequential)
 */
export function getExecutionPattern(mode: DebateMode): ExecutionPattern {
  return MODE_EXECUTION_PATTERN[mode];
}

/**
 * Check if a mode uses sequential execution
 *
 * @param mode - The debate mode
 * @returns True if the mode uses sequential execution
 */
export function isSequentialMode(mode: DebateMode): boolean {
  return MODE_EXECUTION_PATTERN[mode] === 'sequential';
}

/**
 * Check if a mode uses parallel execution
 *
 * @param mode - The debate mode
 * @returns True if the mode uses parallel execution
 */
export function isParallelMode(mode: DebateMode): boolean {
  return MODE_EXECUTION_PATTERN[mode] === 'parallel';
}

/**
 * Get tool guidance text based on mode
 *
 * Returns the sequential mode tool guidance if the mode is sequential,
 * otherwise returns an empty string.
 *
 * @param mode - The debate mode
 * @returns Tool guidance text for sequential modes, empty string for parallel
 */
export function getToolGuidanceForMode(mode: DebateMode): string {
  return isSequentialMode(mode) ? SEQUENTIAL_MODE_TOOL_GUIDANCE : '';
}

/**
 * Get the parallelization level for a specific debate mode
 *
 * @param mode - The debate mode
 * @returns The parallelization level (none, last-only, or full)
 */
export function getParallelizationLevel(mode: DebateMode): ParallelizationLevel {
  return MODE_PARALLELIZATION[mode];
}

/**
 * Check if a mode supports last-only parallelization optimization
 *
 * @param mode - The debate mode
 * @returns True if the mode can use last-only parallelization
 */
export function supportsLastOnlyParallelization(mode: DebateMode): boolean {
  return MODE_PARALLELIZATION[mode] === 'last-only';
}
