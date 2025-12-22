/**
 * Session management handlers
 * Handles: start_roundtable, continue_roundtable, control_session, list_sessions
 */

import type { DebateEngine } from '../../core/debate-engine.js';
import type { SessionManager } from '../../core/session-manager.js';
import type { KeyPointsExtractor } from '../../core/key-points-extractor.js';
import type { AgentRegistry } from '../../agents/registry.js';
import type { DebateConfig } from '../../types/index.js';
import {
  StartRoundtableInputSchema,
  ContinueRoundtableInputSchema,
  ControlSessionInputSchema,
  ListSessionsInputSchema,
} from '../../types/schemas.js';
import { createSuccessResponse, createErrorResponse, type ToolResponse } from '../tools.js';
import { buildRoundtableResponse } from './response-builder/index.js';
import {
  getSessionOrError,
  isSessionError,
  wrapError,
  executeAndSaveRounds,
} from './utils/index.js';
import { ERROR_MESSAGES } from './constants.js';

/**
 * Handler: start_roundtable
 */
export async function handleStartRoundtable(
  args: unknown,
  debateEngine: DebateEngine,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry,
  keyPointsExtractor: KeyPointsExtractor | null
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = StartRoundtableInputSchema.parse(args);

    // Determine which agents to use
    let agentIds = input.agents;
    if (!agentIds || agentIds.length === 0) {
      // Use all registered agents if none specified
      agentIds = agentRegistry.getAllAgentIds();
      if (agentIds.length === 0) {
        return createErrorResponse(ERROR_MESSAGES.NO_AGENTS_AVAILABLE);
      }
    }

    // Validate agents exist
    for (const agentId of agentIds) {
      if (!agentRegistry.hasAgent(agentId)) {
        return createErrorResponse(ERROR_MESSAGES.AGENT_NOT_FOUND(agentId));
      }
    }

    // Create debate config
    const config: DebateConfig = {
      topic: input.topic,
      mode: input.mode || 'collaborative',
      agents: agentIds,
      rounds: input.rounds || 3,
    };

    // Create session
    const session = await sessionManager.createSession(config);

    // Get agents
    const agents = agentRegistry.getAgents(agentIds);

    // Execute first round (handles saving and key points extraction)
    const { roundResults, keyPointsMap } = await executeAndSaveRounds(
      debateEngine,
      sessionManager,
      session,
      agents,
      keyPointsExtractor,
      { rounds: 1 }
    );

    // Build 4-layer response
    const firstRound = roundResults[0];
    if (!firstRound) {
      return createErrorResponse(ERROR_MESSAGES.NO_ROUND_RESULTS);
    }

    const response = buildRoundtableResponse(
      session,
      firstRound,
      [],
      keyPointsMap,
      firstRound.contextRequests ?? []
    );
    return createSuccessResponse(response);
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Handler: continue_roundtable
 */
export async function handleContinueRoundtable(
  args: unknown,
  debateEngine: DebateEngine,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry,
  keyPointsExtractor: KeyPointsExtractor | null
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = ContinueRoundtableInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session } = sessionResult;

    // Check if session is active
    if (session.status !== 'active') {
      return createErrorResponse(
        ERROR_MESSAGES.SESSION_NOT_ACTIVE(input.sessionId, session.status)
      );
    }

    // Get agents
    const agents = agentRegistry.getAgents(session.agentIds);

    // Get previous round responses for confidence change calculation (before executing new rounds)
    const previousResponses =
      session.currentRound > 0
        ? await sessionManager.getResponsesForRound(session.id, session.currentRound)
        : [];

    // Execute additional rounds (handles saving and key points extraction)
    const { roundResults, keyPointsMap } = await executeAndSaveRounds(
      debateEngine,
      sessionManager,
      session,
      agents,
      keyPointsExtractor,
      {
        rounds: input.rounds || 1,
        focusQuestion: input.focusQuestion,
        contextResults: input.contextResults,
      }
    );

    // Mark as completed if we've reached total rounds (session.currentRound already updated by executeRounds)
    if (session.currentRound >= session.totalRounds) {
      await sessionManager.updateSessionStatus(session.id, 'completed');
    }

    // Build 4-layer response - only latest round
    const latestRound = roundResults[roundResults.length - 1];
    if (!latestRound) {
      return createErrorResponse(ERROR_MESSAGES.NO_ROUND_RESULTS);
    }

    const response = buildRoundtableResponse(
      session,
      latestRound,
      previousResponses,
      keyPointsMap,
      latestRound.contextRequests ?? []
    );
    return createSuccessResponse(response);
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Handler: control_session
 */
export async function handleControlSession(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = ControlSessionInputSchema.parse(args);

    // Get session
    const sessionResult = await getSessionOrError(sessionManager, input.sessionId);
    if (isSessionError(sessionResult)) {
      return sessionResult.error;
    }
    const { session } = sessionResult;

    // Apply control action
    let newStatus: 'active' | 'paused' | 'completed' | 'error';
    let message: string;

    switch (input.action) {
      case 'pause':
        if (session.status !== 'active') {
          return createErrorResponse(ERROR_MESSAGES.CANNOT_PAUSE(session.status));
        }
        newStatus = 'paused';
        message = 'Session paused successfully';
        break;

      case 'resume':
        if (session.status !== 'paused') {
          return createErrorResponse(ERROR_MESSAGES.CANNOT_RESUME(session.status));
        }
        newStatus = 'active';
        message = 'Session resumed successfully';
        break;

      case 'stop':
        if (session.status === 'completed') {
          return createErrorResponse(ERROR_MESSAGES.SESSION_ALREADY_COMPLETED);
        }
        newStatus = 'completed';
        message = 'Session stopped and marked as completed';
        break;

      default:
        return createErrorResponse(ERROR_MESSAGES.UNKNOWN_ACTION(input.action));
    }

    // Update session status
    await sessionManager.updateSessionStatus(input.sessionId, newStatus);

    // Get updated session
    const updatedSession = await sessionManager.getSession(input.sessionId);

    return createSuccessResponse({
      sessionId: input.sessionId,
      action: input.action,
      previousStatus: session.status,
      newStatus: newStatus,
      message: message,
      session: updatedSession,
    });
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

/**
 * Handler: list_sessions
 */
export async function handleListSessions(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = ListSessionsInputSchema.parse(args);

    // Get all sessions
    let sessions = await sessionManager.listSessions();

    // Apply filters
    if (input.topic) {
      const topicLower = input.topic.toLowerCase();
      sessions = sessions.filter((s) => s.topic.toLowerCase().includes(topicLower));
    }

    if (input.mode) {
      sessions = sessions.filter((s) => s.mode === input.mode);
    }

    if (input.status) {
      sessions = sessions.filter((s) => s.status === input.status);
    }

    if (input.fromDate) {
      const fromDate = new Date(input.fromDate);
      sessions = sessions.filter((s) => s.createdAt >= fromDate);
    }

    if (input.toDate) {
      const toDate = new Date(input.toDate);
      sessions = sessions.filter((s) => s.createdAt <= toDate);
    }

    // Apply limit
    const limit = input.limit ?? 50;
    sessions = sessions.slice(0, limit);

    // Create summaries
    const summaries = sessions.map((session) => ({
      id: session.id,
      topic: session.topic,
      mode: session.mode,
      status: session.status,
      currentRound: session.currentRound,
      totalRounds: session.totalRounds,
      agentCount: session.agentIds.length,
      responseCount: session.responses.length,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    }));

    return createSuccessResponse({
      sessions: summaries,
      count: summaries.length,
    });
  } catch (error) {
    return createErrorResponse(wrapError(error));
  }
}

// --- Handler Registration ---

import type { HandlerRegistry } from '../handler-registry.js';

/**
 * Register session handlers with the registry
 */
export function registerSessionHandlers(registry: HandlerRegistry): void {
  registry.register('start_roundtable', (args, ctx) =>
    handleStartRoundtable(
      args,
      ctx.debateEngine,
      ctx.sessionManager,
      ctx.agentRegistry,
      ctx.keyPointsExtractor
    )
  );

  registry.register('continue_roundtable', (args, ctx) =>
    handleContinueRoundtable(
      args,
      ctx.debateEngine,
      ctx.sessionManager,
      ctx.agentRegistry,
      ctx.keyPointsExtractor
    )
  );

  registry.register('control_session', (args, ctx) =>
    handleControlSession(args, ctx.sessionManager)
  );

  registry.register('list_sessions', (args, ctx) => handleListSessions(args, ctx.sessionManager));
}
