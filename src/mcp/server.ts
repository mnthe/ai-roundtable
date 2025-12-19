/**
 * MCP Server Implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../utils/logger.js';
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
  GetThoughtsInputSchema,
  ExportSessionInputSchema,
  ControlSessionInputSchema,
  type StartRoundtableInputType,
  type ContinueRoundtableInputType,
  type GetThoughtsInputType,
  type ExportSessionInputType,
  type ControlSessionInputType,
} from '../types/schemas.js';
import type { DebateConfig } from '../types/index.js';

const logger = createLogger('MCPServer');

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
export async function createServer(options: ServerOptions = {}): Promise<Server> {
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
    const setupResult = await setupAgents(agentRegistry, options.apiKeys);

    if (options.showAvailabilityReport) {
      logger.info(getAvailabilityReport(setupResult));
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
    const startTime = Date.now();

    logger.info({ tool: name }, 'Tool call started');

    try {
      let result: ToolResponse;

      switch (name) {
        case 'start_roundtable':
          result = await handleStartRoundtable(args, debateEngine, sessionManager, agentRegistry);
          break;

        case 'continue_roundtable':
          result = await handleContinueRoundtable(args, debateEngine, sessionManager, agentRegistry);
          break;

        case 'get_consensus':
          result = await handleGetConsensus(args, debateEngine, sessionManager);
          break;

        case 'get_agents':
          result = await handleGetAgents(agentRegistry);
          break;

        case 'list_sessions':
          result = await handleListSessions(sessionManager);
          break;

        case 'get_thoughts':
          result = await handleGetThoughts(args, sessionManager);
          break;

        case 'export_session':
          result = await handleExportSession(args, sessionManager, agentRegistry);
          break;

        case 'control_session':
          result = await handleControlSession(args, sessionManager);
          break;

        default:
          result = createErrorResponse(`Unknown tool: ${name}`);
      }

      const duration = Date.now() - startTime;
      const isError = result.content[0]?.text?.includes('"error"') ?? false;
      logger.info({ tool: name, duration, success: !isError }, 'Tool call completed');

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error({ err: error, tool: name, duration }, 'Tool call failed');
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
    // Return only active agents
    const agents = agentRegistry.getActiveAgentInfoList();

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

/**
 * Handler: get_thoughts
 */
async function handleGetThoughts(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetThoughtsInputSchema.parse(args) as GetThoughtsInputType;

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Verify agent participated in this session
    if (!session.agentIds.includes(input.agentId)) {
      return createErrorResponse(
        `Agent "${input.agentId}" did not participate in session "${input.sessionId}"`
      );
    }

    // Get all responses for this agent
    const allResponses = await sessionManager.getResponses(input.sessionId);
    const agentResponses = allResponses.filter((r) => r.agentId === input.agentId);

    if (agentResponses.length === 0) {
      return createErrorResponse(`No responses found for agent "${input.agentId}" in this session`);
    }

    // Group responses by round
    const responsesByRound: Record<number, typeof agentResponses> = {};
    for (const response of agentResponses) {
      // Find round number from timestamp order
      const roundIndex = allResponses.indexOf(response);
      const round = Math.floor(roundIndex / session.agentIds.length) + 1;
      if (!responsesByRound[round]) {
        responsesByRound[round] = [];
      }
      responsesByRound[round].push(response);
    }

    return createSuccessResponse({
      sessionId: input.sessionId,
      agentId: input.agentId,
      agentName: agentResponses[0]!.agentName,
      totalResponses: agentResponses.length,
      rounds: Object.keys(responsesByRound).length,
      responses: agentResponses.map((r) => ({
        position: r.position,
        reasoning: r.reasoning,
        confidence: r.confidence,
        citations: r.citations,
        toolCalls: r.toolCalls?.map((tc) => ({
          toolName: tc.toolName,
          timestamp: tc.timestamp,
        })),
        timestamp: r.timestamp,
      })),
      confidenceEvolution: agentResponses.map((r, idx) => ({
        round: idx + 1,
        confidence: r.confidence,
      })),
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: export_session
 */
async function handleExportSession(
  args: unknown,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = ExportSessionInputSchema.parse(args) as ExportSessionInputType;

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Get all responses
    const responses = await sessionManager.getResponses(input.sessionId);

    if (input.format === 'json') {
      // JSON format: return full structured data
      return createSuccessResponse({
        session: {
          id: session.id,
          topic: session.topic,
          mode: session.mode,
          status: session.status,
          currentRound: session.currentRound,
          totalRounds: session.totalRounds,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
        },
        agents: session.agentIds.map((id) => {
          const agent = agentRegistry.getAgent(id);
          return agent ? agent.getInfo() : { id, name: 'Unknown', provider: 'unknown' as const, model: 'unknown' };
        }),
        responses: responses.map((r) => ({
          agentId: r.agentId,
          agentName: r.agentName,
          position: r.position,
          reasoning: r.reasoning,
          confidence: r.confidence,
          citations: r.citations,
          toolCalls: r.toolCalls,
          timestamp: r.timestamp,
        })),
        consensus: session.consensus,
      });
    } else {
      // Markdown format
      const lines: string[] = [];

      // Title
      lines.push(`# Debate Session: ${session.topic}`);
      lines.push('');

      // Metadata
      lines.push('## Session Information');
      lines.push('');
      lines.push(`- **Session ID:** ${session.id}`);
      lines.push(`- **Mode:** ${session.mode}`);
      lines.push(`- **Status:** ${session.status}`);
      lines.push(`- **Rounds:** ${session.currentRound} / ${session.totalRounds}`);
      lines.push(`- **Created:** ${session.createdAt.toISOString()}`);
      lines.push(`- **Updated:** ${session.updatedAt.toISOString()}`);
      lines.push('');

      // Participants
      lines.push('## Participants');
      lines.push('');
      for (const agentId of session.agentIds) {
        const agent = agentRegistry.getAgent(agentId);
        if (agent) {
          const info = agent.getInfo();
          lines.push(`- **${info.name}** (${info.provider} / ${info.model})`);
        } else {
          lines.push(`- ${agentId}`);
        }
      }
      lines.push('');

      // Responses by round
      const responsesByRound: Record<number, typeof responses> = {};
      for (const response of responses) {
        const roundIndex = responses.indexOf(response);
        const round = Math.floor(roundIndex / session.agentIds.length) + 1;
        if (!responsesByRound[round]) {
          responsesByRound[round] = [];
        }
        responsesByRound[round].push(response);
      }

      for (const [round, roundResponses] of Object.entries(responsesByRound).sort(
        ([a], [b]) => Number(a) - Number(b)
      )) {
        lines.push(`## Round ${round}`);
        lines.push('');

        for (const response of roundResponses) {
          lines.push(`### ${response.agentName}`);
          lines.push('');
          lines.push(`**Position:** ${response.position}`);
          lines.push('');
          lines.push(`**Confidence:** ${(response.confidence * 100).toFixed(1)}%`);
          lines.push('');
          lines.push('**Reasoning:**');
          lines.push('');
          lines.push(response.reasoning);
          lines.push('');

          if (response.citations && response.citations.length > 0) {
            lines.push('**Citations:**');
            lines.push('');
            for (const citation of response.citations) {
              lines.push(`- [${citation.title}](${citation.url})`);
              if (citation.snippet) {
                lines.push(`  > ${citation.snippet}`);
              }
            }
            lines.push('');
          }

          if (response.toolCalls && response.toolCalls.length > 0) {
            lines.push(`**Tools Used:** ${response.toolCalls.map((tc) => tc.toolName).join(', ')}`);
            lines.push('');
          }
        }
      }

      // Consensus
      if (session.consensus) {
        lines.push('## Consensus Analysis');
        lines.push('');
        lines.push(
          `**Agreement Level:** ${(session.consensus.agreementLevel * 100).toFixed(1)}%`
        );
        lines.push('');

        if (session.consensus.commonPoints.length > 0) {
          lines.push('**Common Points:**');
          lines.push('');
          for (const point of session.consensus.commonPoints) {
            lines.push(`- ${point}`);
          }
          lines.push('');
        }

        if (session.consensus.disagreementPoints.length > 0) {
          lines.push('**Disagreement Points:**');
          lines.push('');
          for (const point of session.consensus.disagreementPoints) {
            lines.push(`- ${point}`);
          }
          lines.push('');
        }

        lines.push('**Summary:**');
        lines.push('');
        lines.push(session.consensus.summary);
      }

      return createSuccessResponse({
        format: 'markdown',
        content: lines.join('\n'),
      });
    }
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: control_session
 */
async function handleControlSession(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = ControlSessionInputSchema.parse(args) as ControlSessionInputType;

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Apply control action
    let newStatus: 'active' | 'paused' | 'completed' | 'error';
    let message: string;

    switch (input.action) {
      case 'pause':
        if (session.status !== 'active') {
          return createErrorResponse(
            `Cannot pause session in status "${session.status}". Only active sessions can be paused.`
          );
        }
        newStatus = 'paused';
        message = 'Session paused successfully';
        break;

      case 'resume':
        if (session.status !== 'paused') {
          return createErrorResponse(
            `Cannot resume session in status "${session.status}". Only paused sessions can be resumed.`
          );
        }
        newStatus = 'active';
        message = 'Session resumed successfully';
        break;

      case 'stop':
        if (session.status === 'completed') {
          return createErrorResponse('Session is already completed');
        }
        newStatus = 'completed';
        message = 'Session stopped and marked as completed';
        break;

      default:
        return createErrorResponse(`Unknown action: ${input.action}`);
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
    return createErrorResponse(error as Error);
  }
}
