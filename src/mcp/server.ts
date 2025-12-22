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
import { DefaultAgentToolkit, createSessionManagerAdapter } from '../tools/index.js';
import { TOOLS, createErrorResponse } from './tools.js';
import { HandlerRegistry, type HandlerContext } from './handler-registry.js';
import { registerAllHandlers } from './handlers/index.js';

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

  // Create toolkit with SessionManagerAdapter for fact_check evidence
  const sessionDataProvider = createSessionManagerAdapter(sessionManager);
  const toolkit = new DefaultAgentToolkit(sessionDataProvider);

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

  // Create handler registry
  const handlerRegistry = new HandlerRegistry();
  registerAllHandlers(handlerRegistry);

  // Create handler context
  const handlerContext: HandlerContext = {
    debateEngine,
    sessionManager,
    agentRegistry,
    aiConsensusAnalyzer,
    keyPointsExtractor,
  };

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Register tool call handler (simplified with registry)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    logger.info({ tool: name }, 'Tool call started');

    try {
      const result = await handlerRegistry.execute(name, args, handlerContext);

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
