/**
 * Response grouping utilities for MCP handlers
 */

import type { AgentResponse } from '../../../types/index.js';

/**
 * Group responses by round number
 * Calculates round based on response index and agents per round
 */
export function groupResponsesByRound<T extends AgentResponse>(
  responses: T[],
  agentsPerRound: number
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    if (!response) continue;
    const round = Math.floor(i / agentsPerRound) + 1;
    const existing = grouped.get(round) ?? [];
    existing.push(response);
    grouped.set(round, existing);
  }

  return grouped;
}
