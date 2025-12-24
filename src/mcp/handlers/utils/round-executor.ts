/**
 * Round execution utilities for MCP handlers
 *
 * Centralizes the common round execution, saving, and key points extraction logic
 * that is duplicated across start_roundtable and continue_roundtable handlers.
 */

import type { DebateEngine } from '../../../core/debate-engine.js';
import type { SessionManager } from '../../../core/session-manager.js';
import type { KeyPointsExtractor } from '../../../core/key-points-extractor.js';
import type { BaseAgent } from '../../../agents/base.js';
import type { Session, RoundResult, ContextResult } from '../../../types/index.js';

/**
 * Options for executing a single round
 */
export interface ExecuteRoundsOptions {
  /** Optional focus question for the round */
  focusQuestion?: string;
  /** Optional context results from previous requests */
  contextResults?: ContextResult[];
}

/**
 * Result from executing and saving rounds
 */
export interface ExecuteRoundsResult {
  /** The executed round results */
  roundResults: RoundResult[];
  /** Map of agent ID to extracted key points */
  keyPointsMap: Map<string, string[]>;
}

/**
 * Execute a single round, save responses, and extract key points
 *
 * This function centralizes the common logic used by both start_roundtable
 * and continue_roundtable handlers:
 * 1. Execute one round via debateEngine
 * 2. Update session round tracking
 * 3. Save all responses to storage
 * 4. Extract key points using AI (if available)
 *
 * @param debateEngine - The debate engine for executing rounds
 * @param sessionManager - The session manager for persistence
 * @param session - The current session
 * @param agents - The agents participating in the debate
 * @param keyPointsExtractor - Optional AI key points extractor
 * @param options - Execution options
 * @returns Round results and extracted key points
 */
export async function executeAndSaveRounds(
  debateEngine: DebateEngine,
  sessionManager: SessionManager,
  session: Session,
  agents: BaseAgent[],
  keyPointsExtractor: KeyPointsExtractor | null,
  options: ExecuteRoundsOptions = {}
): Promise<ExecuteRoundsResult> {
  const { focusQuestion, contextResults } = options;

  // Execute one round
  const roundResults = await debateEngine.executeRounds(
    agents,
    session,
    1, // Always execute exactly one round
    focusQuestion,
    contextResults
  );

  // Update session round tracking (session.currentRound is already updated by executeRounds)
  await sessionManager.updateSessionRound(session.id, session.currentRound);

  // Save all responses (parallel within each round)
  for (const result of roundResults) {
    await Promise.all(
      result.responses.map((response) =>
        sessionManager.addResponse(session.id, response, result.roundNumber)
      )
    );
  }

  // Extract key points from the latest round using AI (if available)
  const latestRound = roundResults[roundResults.length - 1];
  const keyPointsMap =
    keyPointsExtractor && latestRound
      ? await keyPointsExtractor.extractKeyPointsBatch(latestRound.responses)
      : new Map<string, string[]>();

  return { roundResults, keyPointsMap };
}
