/**
 * MCP Server Implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createLogger } from '../utils/logger.js';
import { DebateEngine } from '../core/debate-engine.js';
import { SessionManager } from '../core/session-manager.js';
import { AIConsensusAnalyzer } from '../core/ai-consensus-analyzer.js';
import { KeyPointsExtractor } from '../core/key-points-extractor.js';
import { AgentRegistry } from '../agents/registry.js';
import { setupAgents, getAvailabilityReport, type ApiKeyConfig } from '../agents/setup.js';
import { DefaultAgentToolkit } from '../tools/toolkit.js';
import { TOOLS, createErrorResponse, type ToolResponse } from './tools.js';
import {
  handleStartRoundtable,
  handleContinueRoundtable,
  handleControlSession,
  handleListSessions,
  handleGetConsensus,
  handleGetRoundDetails,
  handleGetResponseDetail,
  handleGetCitations,
  handleGetThoughts,
  handleExportSession,
  handleSynthesizeDebate,
  handleGetAgents,
} from './handlers/index.js';

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

  // Initialize AI-based consensus analyzer (will be set up after agents are registered)
  let aiConsensusAnalyzer: AIConsensusAnalyzer | null = null;
  let keyPointsExtractor: KeyPointsExtractor | null = null;

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
      logger.warn({ warning }, 'Setup warning');
    }

    // Initialize AI consensus analyzer with available agents
    aiConsensusAnalyzer = new AIConsensusAnalyzer({
      registry: agentRegistry,
    });

    // Initialize key points extractor with available agents
    keyPointsExtractor = new KeyPointsExtractor({
      registry: agentRegistry,
      fallbackToRuleBased: true,
    });
  }

  // Create debate engine with AI consensus analyzer
  const debateEngine =
    options.debateEngine ||
    new DebateEngine({
      toolkit,
      aiConsensusAnalyzer: aiConsensusAnalyzer ?? undefined,
    });

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
    tools: TOOLS,
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
          result = await handleStartRoundtable(
            args,
            debateEngine,
            sessionManager,
            agentRegistry,
            keyPointsExtractor
          );
          break;

        case 'continue_roundtable':
          result = await handleContinueRoundtable(
            args,
            debateEngine,
            sessionManager,
            agentRegistry,
            keyPointsExtractor
          );
          break;

        case 'get_consensus':
          result = await handleGetConsensus(
            args,
            sessionManager,
            aiConsensusAnalyzer,
            debateEngine
          );
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

        case 'get_round_details':
          result = await handleGetRoundDetails(
            args,
            sessionManager,
            aiConsensusAnalyzer,
            debateEngine
          );
          break;

        case 'get_response_detail':
          result = await handleGetResponseDetail(args, sessionManager);
          break;

        case 'get_citations':
          result = await handleGetCitations(args, sessionManager);
          break;

        case 'synthesize_debate':
          result = await handleSynthesizeDebate(args, sessionManager, agentRegistry);
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
