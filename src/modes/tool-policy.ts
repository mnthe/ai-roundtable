/**
 * Tool Usage Policy for Debate Modes
 *
 * Defines mode-aware tool usage policies to optimize sequential mode performance.
 * Sequential modes benefit from limited tool usage since previous agents have
 * already gathered evidence that later agents can leverage.
 */

import type { DebateMode } from '../types/index.js';

/**
 * Execution pattern for debate modes
 */
export type ExecutionPattern = 'parallel' | 'sequential';

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
    maxCalls: 6,
    guidance: 'Use tools freely to gather comprehensive evidence.',
  },
  sequential: {
    minCalls: 1,
    maxCalls: 2,
    guidance: 'Leverage previous responses; limit to 1-2 essential tool calls.',
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
