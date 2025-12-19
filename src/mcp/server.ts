/**
 * MCP Server Implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { DebateEngine } from '../core/DebateEngine.js';
import { SessionManager } from '../core/session-manager.js';
import { AgentRegistry } from '../agents/registry.js';
import { setupAgents, getAvailabilityReport, type ApiKeyConfig } from '../agents/setup.js';
import { DefaultAgentToolkit } from '../tools/toolkit.js';
import {
  tools,
  createSuccessResponse,
  createErrorResponse,
  type ToolResponse,
} from './tools.js';
import {
  StartRoundtableInputSchema,
  ContinueRoundtableInputSchema,
  GetConsensusInputSchema,
  type StartRoundtableInputType,
  type ContinueRoundtableInputType,
} from '../types/schemas.js';
import type { DebateConfig } from '../types/index.js';

export interface ServerOptions {
  name?: string;
  version?: string;
  debateEngine?: DebateEngine;
  sessionManager?: SessionManager;
  agentRegistry?: AgentRegistry;
  /** API keys for auto-setup (defaults to environment variables) */
  apiKeys?: ApiKeyConfig;
  /** Auto-setup agents based on available API keys (default: true) */
  autoSetup?: boolean;
  /** Show availability report on startup (default: false) */
  showAvailabilityReport?: boolean;
}

/**
 * Create and configure the MCP server
 */
export function createServer(options: ServerOptions = {}): Server {
  const serverName = options.name || 'ai-roundtable';
  const serverVersion = options.version || '0.1.0';
  const autoSetup = options.autoSetup !== false; // Default to true

  // Initialize dependencies
  const sessionManager = options.sessionManager || new SessionManager();
  const agentRegistry = options.agentRegistry || new AgentRegistry();
  const toolkit = new DefaultAgentToolkit();
  const debateEngine = options.debateEngine || new DebateEngine({ toolkit });

  // Set toolkit for agents
  agentRegistry.setToolkit(toolkit);

  // Auto-setup agents based on available API keys
  if (autoSetup) {
    const setupResult = setupAgents(agentRegistry, options.apiKeys);

    if (options.showAvailabilityReport) {
      console.log(getAvailabilityReport(setupResult));
    }

    // Log warnings if any
    for (const warning of setupResult.warnings) {
      console.warn(`[ai-roundtable] ${warning}`);
    }
  }

  // Create server instance
  const server = new Server(
    {
      name: serverName,
      version: serverVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'start_roundtable':
          return await handleStartRoundtable(args, debateEngine, sessionManager, agentRegistry);

        case 'continue_roundtable':
          return await handleContinueRoundtable(args, debateEngine, sessionManager, agentRegistry);

        case 'get_consensus':
          return await handleGetConsensus(args, debateEngine, sessionManager);

        case 'get_agents':
          return await handleGetAgents(agentRegistry);

        case 'list_sessions':
          return await handleListSessions(sessionManager);

        default:
          return createErrorResponse(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return createErrorResponse(error as Error);
    }
  });

  return server;
}

/**
 * Handler: start_roundtable
 */
async function handleStartRoundtable(
  args: unknown,
  debateEngine: DebateEngine,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = StartRoundtableInputSchema.parse(args) as StartRoundtableInputType;

    // Determine which agents to use
    let agentIds = input.agents;
    if (!agentIds || agentIds.length === 0) {
      // Use all registered agents if none specified
      agentIds = agentRegistry.getAllAgentIds();
      if (agentIds.length === 0) {
        return createErrorResponse('No agents available. Please register agents first.');
      }
    }

    // Validate agents exist
    for (const agentId of agentIds) {
      if (!agentRegistry.hasAgent(agentId)) {
        return createErrorResponse(`Agent "${agentId}" not found`);
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

    // Execute first round
    const roundResults = await debateEngine.executeRounds(agents, session, 1);

    // Update session
    await sessionManager.updateSessionRound(session.id, 1);
    for (const result of roundResults) {
      for (const response of result.responses) {
        await sessionManager.addResponse(session.id, response);
      }
    }

    // Get updated session
    const updatedSession = await sessionManager.getSession(session.id);

    return createSuccessResponse({
      sessionId: session.id,
      topic: session.topic,
      mode: session.mode,
      currentRound: 1,
      totalRounds: session.totalRounds,
      round: roundResults[0],
      session: updatedSession,
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: continue_roundtable
 */
async function handleContinueRoundtable(
  args: unknown,
  debateEngine: DebateEngine,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = ContinueRoundtableInputSchema.parse(args) as ContinueRoundtableInputType;

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Check if session is active
    if (session.status !== 'active') {
      return createErrorResponse(`Session "${input.sessionId}" is not active (status: ${session.status})`);
    }

    // Get agents
    const agents = agentRegistry.getAgents(session.agentIds);

    // Execute additional rounds
    const numRounds = input.rounds || 1;
    const roundResults = await debateEngine.executeRounds(
      agents,
      session,
      numRounds,
      input.focusQuestion
    );

    // Update session
    await sessionManager.updateSessionRound(session.id, session.currentRound + numRounds);
    for (const result of roundResults) {
      for (const response of result.responses) {
        await sessionManager.addResponse(session.id, response);
      }
    }

    // Mark as completed if we've reached total rounds
    if (session.currentRound >= session.totalRounds) {
      await sessionManager.updateSessionStatus(session.id, 'completed');
    }

    // Get updated session
    const updatedSession = await sessionManager.getSession(session.id);

    return createSuccessResponse({
      sessionId: session.id,
      currentRound: session.currentRound,
      totalRounds: session.totalRounds,
      rounds: roundResults,
      session: updatedSession,
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: get_consensus
 */
async function handleGetConsensus(
  args: unknown,
  debateEngine: DebateEngine,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetConsensusInputSchema.parse(args);

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Get all responses
    const responses = await sessionManager.getResponses(input.sessionId);
    if (responses.length === 0) {
      return createErrorResponse('No responses found in this session');
    }

    // Analyze consensus
    const consensus = debateEngine.analyzeConsensus(responses);

    return createSuccessResponse({
      sessionId: input.sessionId,
      consensus,
      responseCount: responses.length,
      roundCount: session.currentRound,
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: get_agents
 */
async function handleGetAgents(agentRegistry: AgentRegistry): Promise<ToolResponse> {
  try {
    const agents = agentRegistry.getAgentInfoList();

    return createSuccessResponse({
      agents,
      count: agents.length,
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: list_sessions
 */
async function handleListSessions(sessionManager: SessionManager): Promise<ToolResponse> {
  try {
    const sessions = await sessionManager.listSessions();

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
    return createErrorResponse(error as Error);
  }
}
