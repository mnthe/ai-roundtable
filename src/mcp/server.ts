/**
 * MCP Server Implementation
 */

import { jsonrepair } from 'jsonrepair';
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
import { tools, createSuccessResponse, createErrorResponse, type ToolResponse } from './tools.js';
import {
  StartRoundtableInputSchema,
  ContinueRoundtableInputSchema,
  GetConsensusInputSchema,
  GetThoughtsInputSchema,
  ExportSessionInputSchema,
  ControlSessionInputSchema,
  GetRoundDetailsInputSchema,
  GetResponseDetailInputSchema,
  GetCitationsInputSchema,
  SynthesizeDebateInputSchema,
  type StartRoundtableInputType,
  type ContinueRoundtableInputType,
  type GetThoughtsInputType,
  type ExportSessionInputType,
  type ControlSessionInputType,
  type GetRoundDetailsInputType,
  type GetResponseDetailInputType,
  type GetCitationsInputType,
  type SynthesizeDebateInputType,
} from '../types/schemas.js';
import type {
  DebateConfig,
  SynthesisResult,
  SynthesisContext,
  RoundResult,
  AgentResponse,
  RoundtableResponse,
  ConsensusLevel,
  ActionRecommendationType,
  AgentResponseSummary,
  Session,
} from '../types/index.js';

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
      console.warn(`[ai-roundtable] ${warning}`);
    }

    // Initialize AI consensus analyzer with available agents
    aiConsensusAnalyzer = new AIConsensusAnalyzer({
      registry: agentRegistry,
      fallbackToRuleBased: true,
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

// ============================================
// Response Builder Utilities (4-Layer Structure)
// ============================================

/**
 * Classify consensus level from numeric score
 */
function classifyConsensusLevel(score: number): ConsensusLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

/**
 * Determine action recommendation based on confidence and conflicts
 */
function determineActionRecommendation(
  consensusLevel: ConsensusLevel,
  avgConfidence: number,
  conflictCount: number
): { type: ActionRecommendationType; reason: string } {
  // High confidence + high consensus = proceed
  if (avgConfidence >= 0.8 && consensusLevel === 'high') {
    return {
      type: 'proceed',
      reason: 'High consensus and confidence across agents',
    };
  }

  // Multiple conflicts or high impact uncertainties = verify
  if (conflictCount > 1 || (avgConfidence < 0.6 && conflictCount > 0)) {
    return {
      type: 'verify',
      reason: `${conflictCount} conflict(s) detected, verification recommended`,
    };
  }

  // Low confidence or consensus = query for more details
  if (avgConfidence < 0.5 || consensusLevel === 'low') {
    return {
      type: 'query_detail',
      reason: 'Low confidence or consensus, detailed analysis recommended',
    };
  }

  // Default: proceed with caution
  return {
    type: 'proceed',
    reason: 'Moderate consensus achieved',
  };
}

/**
 * Extract 2-3 key points from full reasoning
 */
function extractKeyPoints(reasoning: string): string[] {
  const keyPoints: string[] = [];

  // Try to extract numbered points (1., 2., etc.) or bullet points
  const numberedMatches = reasoning.match(/(?:^|\n)\s*(?:\d+[.):]\s*|\*\s*|-\s*)\*?\*?([^\n*]+)/g);
  if (numberedMatches && numberedMatches.length > 0) {
    for (const match of numberedMatches.slice(0, 3)) {
      const cleaned = match.replace(/^\s*(?:\d+[.):]\s*|\*\s*|-\s*)\*?\*?/, '').trim();
      if (cleaned.length > 10) {
        keyPoints.push(cleaned);
      }
    }
  }

  // Fallback: extract first 2-3 sentences if no bullet points found
  if (keyPoints.length === 0) {
    const sentences = reasoning.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    for (const sentence of sentences.slice(0, 3)) {
      const cleaned = sentence.trim();
      if (cleaned.length > 10) {
        keyPoints.push(cleaned);
      }
    }
  }

  // Ensure we have at least something
  if (keyPoints.length === 0) {
    keyPoints.push(reasoning.trim() || 'No reasoning provided');
  }

  return keyPoints;
}

/**
 * Detect conflicts between agent responses
 */
function detectConflicts(
  responses: AgentResponse[]
): { issue: string; positions: { agentId: string; stance: string }[] }[] {
  const conflicts: { issue: string; positions: { agentId: string; stance: string }[] }[] = [];

  // Simple conflict detection: check if positions are significantly different
  if (responses.length < 2) return conflicts;

  // Extract position keywords and compare
  const positionKeywords = responses.map((r) => ({
    agentId: r.agentId,
    position: r.position,
    keywords: r.position
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4),
  }));

  // Check confidence variance as indicator of disagreement
  const confidences = responses.map((r) => r.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const confidenceVariance =
    confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length;

  if (confidenceVariance > 0.04) {
    // Significant confidence variance
    conflicts.push({
      issue: 'Confidence levels',
      positions: responses.map((r) => ({
        agentId: r.agentId,
        stance: `${(r.confidence * 100).toFixed(0)}% confident`,
      })),
    });
  }

  // Check for opposing stance indicators
  const opposingPairs: [string, string][] = [
    ['better', 'worse'],
    ['agree', 'disagree'],
    ['support', 'oppose'],
    ['yes', 'no'],
    ['positive', 'negative'],
  ];

  for (const pair of opposingPairs) {
    const word1 = pair[0];
    const word2 = pair[1];
    const stances: { agentId: string; stance: string }[] = [];
    for (const pk of positionKeywords) {
      const hasWord1 = pk.position.toLowerCase().includes(word1);
      const hasWord2 = pk.position.toLowerCase().includes(word2);
      if (hasWord1 && !hasWord2) {
        stances.push({ agentId: pk.agentId, stance: word1 });
      } else if (hasWord2 && !hasWord1) {
        stances.push({ agentId: pk.agentId, stance: word2 });
      }
    }
    if (stances.length >= 2 && new Set(stances.map((s) => s.stance)).size > 1) {
      conflicts.push({ issue: `${word1} vs ${word2}`, positions: stances });
    }
  }

  return conflicts.slice(0, 3); // Limit to 3 most relevant conflicts
}

/**
 * Build verification hints based on response quality
 */
function buildVerificationHints(
  responses: AgentResponse[],
  _sessionId: string
): { field: string; reason: string; suggestedTool: string }[] {
  const hints: { field: string; reason: string; suggestedTool: string }[] = [];

  // Check for low confidence agents
  const lowConfidenceAgents = responses.filter((r) => r.confidence < 0.6);
  if (lowConfidenceAgents.length > 0) {
    hints.push({
      field: 'Agent confidence',
      reason: `${lowConfidenceAgents.length} agent(s) have low confidence`,
      suggestedTool: 'get_thoughts',
    });
  }

  // Check for agents without citations
  const noCitationAgents = responses.filter((r) => !r.citations || r.citations.length === 0);
  if (noCitationAgents.length > 0 && noCitationAgents.length < responses.length) {
    hints.push({
      field: 'Evidence sources',
      reason: `${noCitationAgents.length} agent(s) provided no citations`,
      suggestedTool: 'get_citations',
    });
  }

  // Check for significant reasoning length variance
  const reasoningLengths = responses.map((r) => r.reasoning.length);
  const avgLength = reasoningLengths.reduce((a, b) => a + b, 0) / reasoningLengths.length;
  const shortReasoningAgents = responses.filter((r) => r.reasoning.length < avgLength * 0.5);
  if (shortReasoningAgents.length > 0) {
    hints.push({
      field: 'Reasoning depth',
      reason: `${shortReasoningAgents.length} agent(s) provided shorter reasoning`,
      suggestedTool: 'get_round_details',
    });
  }

  return hints.slice(0, 3);
}

/**
 * Build the 4-layer roundtable response
 *
 * @param session - The debate session
 * @param roundResult - The round result containing responses and consensus
 * @param previousResponses - Previous round responses for confidence change calculation
 * @param keyPointsMap - Pre-extracted key points map (agentId -> keyPoints[])
 */
function buildRoundtableResponse(
  session: Session,
  roundResult: RoundResult,
  previousResponses: AgentResponse[] = [],
  keyPointsMap: Map<string, string[]> = new Map()
): RoundtableResponse {
  const responses = roundResult.responses;
  const consensus = roundResult.consensus;

  // Calculate average confidence
  const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;

  // Classify consensus level
  const consensusLevel = classifyConsensusLevel(consensus.agreementLevel);

  // Detect conflicts
  const conflicts = detectConflicts(responses);

  // Determine action recommendation
  const actionRecommendation = determineActionRecommendation(
    consensusLevel,
    avgConfidence,
    conflicts.length
  );

  // Build agent response summaries (Layer 2)
  const agentResponses: AgentResponseSummary[] = responses.map((r) => {
    // Find previous confidence for this agent
    const prevResponse = previousResponses.find((pr) => pr.agentId === r.agentId);
    const confidenceChange = prevResponse
      ? {
          delta: r.confidence - prevResponse.confidence,
          previousRound: roundResult.roundNumber - 1,
          reason:
            r.confidence > prevResponse.confidence
              ? 'Position strengthened'
              : r.confidence < prevResponse.confidence
                ? 'Position reconsidered'
                : 'Position maintained',
        }
      : undefined;

    // Count evidence used
    const webSearches =
      r.toolCalls?.filter(
        (tc) =>
          tc.toolName.includes('search') ||
          tc.toolName.includes('web') ||
          tc.toolName.includes('perplexity')
      ).length || 0;
    const citations = r.citations?.length || 0;
    const toolCalls = [...new Set(r.toolCalls?.map((tc) => tc.toolName) || [])];

    // Use AI-extracted key points if available, fallback to rule-based
    const keyPoints = keyPointsMap.get(r.agentId) ?? extractKeyPoints(r.reasoning);

    return {
      agentId: r.agentId,
      agentName: r.agentName,
      position: r.position,
      keyPoints,
      confidence: r.confidence,
      confidenceChange,
      evidenceUsed: {
        webSearches,
        citations,
        toolCalls,
      },
    };
  });

  // Total citations (Layer 3)
  const totalCitations = responses.reduce((sum, r) => sum + (r.citations?.length || 0), 0);

  // Build verification hints (Layer 4)
  const verificationHints = buildVerificationHints(responses, session.id);

  return {
    sessionId: session.id,
    topic: session.topic,
    mode: session.mode,
    roundNumber: roundResult.roundNumber,
    totalRounds: session.totalRounds,

    // Layer 1: Decision
    decision: {
      consensusLevel,
      agreementScore: consensus.agreementLevel,
      actionRecommendation,
    },

    // Layer 2: Agent Responses
    agentResponses,

    // Layer 3: Evidence
    evidence: {
      totalCitations,
      conflicts,
      consensusSummary:
        consensus.summary.length > 200
          ? consensus.summary.substring(0, 200) + '...'
          : consensus.summary,
    },

    // Layer 4: Metadata
    metadata: {
      detailReference: {
        tool: 'get_round_details',
        params: {
          sessionId: session.id,
          roundNumber: roundResult.roundNumber,
        },
      },
      verificationHints,
      hasMoreDetails: true,
    },
  };
}

/**
 * Handler: start_roundtable
 */
async function handleStartRoundtable(
  args: unknown,
  debateEngine: DebateEngine,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry,
  keyPointsExtractor: KeyPointsExtractor | null
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

    // Update session (session.currentRound is already updated by executeRounds)
    await sessionManager.updateSessionRound(session.id, session.currentRound);
    for (const result of roundResults) {
      for (const response of result.responses) {
        await sessionManager.addResponse(session.id, response);
      }
    }

    // Build 4-layer response
    const firstRound = roundResults[0];
    if (!firstRound) {
      return createErrorResponse('No round results available');
    }

    // Extract key points using AI (if available)
    const keyPointsMap = keyPointsExtractor
      ? await keyPointsExtractor.extractKeyPointsBatch(firstRound.responses)
      : new Map<string, string[]>();

    const response = buildRoundtableResponse(session, firstRound, [], keyPointsMap);
    return createSuccessResponse(response);
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
  agentRegistry: AgentRegistry,
  keyPointsExtractor: KeyPointsExtractor | null
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
      return createErrorResponse(
        `Session "${input.sessionId}" is not active (status: ${session.status})`
      );
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

    // Update session (session.currentRound is already updated by executeRounds)
    await sessionManager.updateSessionRound(session.id, session.currentRound);
    for (const result of roundResults) {
      for (const response of result.responses) {
        await sessionManager.addResponse(session.id, response);
      }
    }

    // Mark as completed if we've reached total rounds (session.currentRound already updated by executeRounds)
    if (session.currentRound >= session.totalRounds) {
      await sessionManager.updateSessionStatus(session.id, 'completed');
    }

    // Build 4-layer response - only latest round
    const latestRound = roundResults[roundResults.length - 1];
    if (!latestRound) {
      return createErrorResponse('No round results available');
    }

    // Get previous round responses for confidence change calculation
    const previousResponses =
      session.currentRound > 0
        ? await sessionManager.getResponsesForRound(session.id, session.currentRound)
        : [];

    // Update session object for response building (session.currentRound already updated by executeRounds)
    const updatedSession: Session = {
      ...session,
    };

    // Extract key points using AI (if available)
    const keyPointsMap = keyPointsExtractor
      ? await keyPointsExtractor.extractKeyPointsBatch(latestRound.responses)
      : new Map<string, string[]>();

    const response = buildRoundtableResponse(
      updatedSession,
      latestRound,
      previousResponses,
      keyPointsMap
    );
    return createSuccessResponse(response);
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: get_consensus
 */
async function handleGetConsensus(
  args: unknown,
  sessionManager: SessionManager,
  aiConsensusAnalyzer: AIConsensusAnalyzer | null,
  debateEngine: DebateEngine
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetConsensusInputSchema.parse(args);

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Determine which round to analyze
    // If roundNumber is specified, use it; otherwise use the latest round
    const roundToAnalyze = input.roundNumber ?? session.currentRound;

    // Validate round number
    if (roundToAnalyze < 1) {
      return createErrorResponse('No rounds have been executed yet');
    }
    if (roundToAnalyze > session.currentRound) {
      return createErrorResponse(
        `Round ${roundToAnalyze} does not exist. Current round is ${session.currentRound}`
      );
    }

    // Get responses for the specific round only
    const responses = await sessionManager.getResponsesForRound(input.sessionId, roundToAnalyze);
    if (responses.length === 0) {
      return createErrorResponse(`No responses found for round ${roundToAnalyze}`);
    }

    // Analyze consensus using AI if available, otherwise fall back to rule-based
    const consensus = aiConsensusAnalyzer
      ? await aiConsensusAnalyzer.analyzeConsensus(responses, session.topic)
      : debateEngine.analyzeConsensus(responses);

    return createSuccessResponse({
      sessionId: input.sessionId,
      consensus,
      responseCount: responses.length,
      analyzedRound: roundToAnalyze,
      totalRounds: session.currentRound,
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
          return agent
            ? agent.getInfo()
            : { id, name: 'Unknown', provider: 'unknown' as const, model: 'unknown' };
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
        lines.push(`**Agreement Level:** ${(session.consensus.agreementLevel * 100).toFixed(1)}%`);
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

/**
 * Handler: get_round_details
 */
async function handleGetRoundDetails(
  args: unknown,
  sessionManager: SessionManager,
  aiConsensusAnalyzer: AIConsensusAnalyzer | null,
  debateEngine: DebateEngine
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetRoundDetailsInputSchema.parse(args) as GetRoundDetailsInputType;

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Validate round number
    if (input.roundNumber > session.currentRound) {
      return createErrorResponse(
        `Round ${input.roundNumber} has not been executed yet. Current round: ${session.currentRound}`
      );
    }

    // Get responses for this round
    const responses = await sessionManager.getResponsesForRound(input.sessionId, input.roundNumber);

    if (responses.length === 0) {
      return createErrorResponse(`No responses found for round ${input.roundNumber}`);
    }

    // Analyze consensus using AI if available, otherwise fall back to rule-based
    const consensus = aiConsensusAnalyzer
      ? await aiConsensusAnalyzer.analyzeConsensus(responses, session.topic)
      : debateEngine.analyzeConsensus(responses);

    return createSuccessResponse({
      sessionId: input.sessionId,
      roundNumber: input.roundNumber,
      responses: responses.map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
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
      consensus,
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: get_response_detail
 */
async function handleGetResponseDetail(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetResponseDetailInputSchema.parse(args) as GetResponseDetailInputType;

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

    // Get all responses
    const allResponses = await sessionManager.getResponses(input.sessionId);
    let agentResponses = allResponses.filter((r) => r.agentId === input.agentId);

    if (agentResponses.length === 0) {
      return createErrorResponse(`No responses found for agent "${input.agentId}" in this session`);
    }

    // Filter by round if specified
    if (input.roundNumber !== undefined) {
      const roundResponses = await sessionManager.getResponsesForRound(
        input.sessionId,
        input.roundNumber
      );
      agentResponses = roundResponses.filter((r) => r.agentId === input.agentId);

      if (agentResponses.length === 0) {
        return createErrorResponse(
          `No responses found for agent "${input.agentId}" in round ${input.roundNumber}`
        );
      }
    }

    return createSuccessResponse({
      sessionId: input.sessionId,
      agentId: input.agentId,
      agentName: agentResponses[0]!.agentName,
      roundNumber: input.roundNumber,
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
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: get_citations
 */
async function handleGetCitations(
  args: unknown,
  sessionManager: SessionManager
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = GetCitationsInputSchema.parse(args) as GetCitationsInputType;

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Get responses based on filters
    let responses = await sessionManager.getResponses(input.sessionId);

    // Filter by round if specified
    if (input.roundNumber !== undefined) {
      responses = await sessionManager.getResponsesForRound(input.sessionId, input.roundNumber);
    }

    // Filter by agent if specified
    if (input.agentId !== undefined) {
      responses = responses.filter((r) => r.agentId === input.agentId);
    }

    // Extract all citations
    const citations = responses
      .flatMap((r) => {
        if (!r.citations || r.citations.length === 0) return [];
        return r.citations.map((c) => ({
          ...c,
          agentId: r.agentId,
          agentName: r.agentName,
          timestamp: r.timestamp,
        }));
      })
      .filter((c) => c !== null);

    // Remove duplicate citations (same URL)
    const uniqueCitations = citations.reduce(
      (acc, citation) => {
        const existing = acc.find((c) => c.url === citation.url);
        if (!existing) {
          acc.push(citation);
        }
        return acc;
      },
      [] as typeof citations
    );

    return createSuccessResponse({
      sessionId: input.sessionId,
      roundNumber: input.roundNumber,
      agentId: input.agentId,
      citations: uniqueCitations,
      totalCitations: uniqueCitations.length,
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Handler: synthesize_debate
 */
async function handleSynthesizeDebate(
  args: unknown,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = SynthesizeDebateInputSchema.parse(args) as SynthesizeDebateInputType;

    // Get session
    const session = await sessionManager.getSession(input.sessionId);
    if (!session) {
      return createErrorResponse(`Session "${input.sessionId}" not found`);
    }

    // Get all responses
    const responses = await sessionManager.getResponses(input.sessionId);
    if (responses.length === 0) {
      return createErrorResponse(
        'No responses found in this session. Cannot synthesize an empty debate.'
      );
    }

    // Determine synthesizer agent
    let synthesizerId = input.synthesizer;
    if (!synthesizerId) {
      // Use first active agent as default
      const activeAgentIds = agentRegistry.getActiveAgentIds();
      if (activeAgentIds.length === 0) {
        return createErrorResponse('No active agents available for synthesis');
      }
      synthesizerId = activeAgentIds[0]!;
    }

    // Verify synthesizer exists
    const synthesizerAgent = agentRegistry.getAgent(synthesizerId);
    if (!synthesizerAgent) {
      return createErrorResponse(`Synthesizer agent "${synthesizerId}" not found`);
    }

    // Build synthesis prompt
    const synthesisPrompt = buildSynthesisPrompt(session.topic, responses, session.mode);

    // Create synthesis context with the proper format
    const synthesisContext: SynthesisContext = {
      sessionId: session.id,
      topic: session.topic,
      mode: session.mode,
      responses: responses,
      synthesisPrompt: synthesisPrompt,
    };

    // Generate synthesis using the dedicated synthesis method
    // This ensures the synthesis-specific prompts are used (not debate format)
    const synthesisResponse = await synthesizerAgent.generateSynthesis(synthesisContext);

    // Parse the agent response to extract synthesis result
    const synthesis = parseSynthesisResponse(synthesisResponse, synthesizerId);

    return createSuccessResponse({
      sessionId: input.sessionId,
      synthesizerId: synthesizerId,
      synthesis: synthesis,
    });
  } catch (error) {
    return createErrorResponse(error as Error);
  }
}

/**
 * Build synthesis prompt from debate responses
 */
function buildSynthesisPrompt(
  topic: string,
  responses: import('../types/index.js').AgentResponse[],
  mode: string
): string {
  const parts: string[] = [];

  parts.push(`You are analyzing a debate on the topic: "${topic}"`);
  parts.push(`Debate mode: ${mode}`);
  parts.push('');

  // Group responses by round
  const responsesByRound: Record<number, typeof responses> = {};
  const agentsInSession = new Set(responses.map((r) => r.agentId));
  const agentsPerRound = agentsInSession.size;

  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    if (!response) continue;
    const round = Math.floor(i / agentsPerRound) + 1;
    if (!responsesByRound[round]) {
      responsesByRound[round] = [];
    }
    responsesByRound[round].push(response);
  }

  const totalRounds = Object.keys(responsesByRound).length;
  parts.push(
    `The debate had ${totalRounds} rounds with the following participants: ${Array.from(agentsInSession).join(', ')}`
  );
  parts.push('');

  // Add all responses
  parts.push('Here are all the positions and reasoning from each round:');
  parts.push('');

  for (const [round, roundResponses] of Object.entries(responsesByRound).sort(
    ([a], [b]) => Number(a) - Number(b)
  )) {
    parts.push(`--- Round ${round} ---`);
    for (const response of roundResponses) {
      parts.push(`${response.agentName}:`);
      parts.push(`Position: ${response.position}`);
      parts.push(`Reasoning: ${response.reasoning}`);
      parts.push(`Confidence: ${(response.confidence * 100).toFixed(0)}%`);
      if (response.citations && response.citations.length > 0) {
        parts.push(`Citations: ${response.citations.map((c) => c.title).join(', ')}`);
      }
      parts.push('');
    }
  }

  parts.push(
    'Please analyze this debate and provide a comprehensive synthesis in JSON format with the following structure:'
  );
  parts.push('{');
  parts.push('  "commonGround": ["Key point 1", "Key point 2", ...],');
  parts.push('  "keyDifferences": ["Difference 1", "Difference 2", ...],');
  parts.push('  "evolutionSummary": "How opinions evolved throughout the debate",');
  parts.push('  "conclusion": "Your overall conclusion based on the debate",');
  parts.push('  "recommendation": "Your recommendation for the user",');
  parts.push('  "confidence": 0.0 to 1.0');
  parts.push('}');
  parts.push('');
  parts.push('Guidelines:');
  parts.push('- commonGround: List points where ALL agents agreed or showed convergence');
  parts.push('- keyDifferences: List the main points where agents disagreed');
  parts.push('- evolutionSummary: Describe how positions changed across rounds');
  parts.push('- conclusion: Synthesize the key insights from the debate');
  parts.push('- recommendation: Provide actionable advice based on the debate');
  parts.push('- confidence: Your confidence in this synthesis (0-1)');

  return parts.join('\n');
}

/**
 * Parse agent response to extract synthesis result
 * Uses jsonrepair to handle malformed JSON from AI models
 */
function parseSynthesisResponse(responseText: string, synthesizerId: string): SynthesisResult {
  try {
    // Try to extract JSON from the response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      // Use jsonrepair to fix common JSON issues (trailing commas, unquoted keys, etc.)
      const repairedJson = jsonrepair(jsonMatch[0]);
      const parsed = JSON.parse(repairedJson) as {
        commonGround?: string[];
        keyDifferences?: string[];
        evolutionSummary?: string;
        conclusion?: string;
        recommendation?: string;
        confidence?: number;
      };

      return {
        commonGround: parsed.commonGround || [],
        keyDifferences: parsed.keyDifferences || [],
        evolutionSummary: parsed.evolutionSummary || 'No evolution summary provided',
        conclusion: parsed.conclusion || 'No conclusion provided',
        recommendation: parsed.recommendation || 'No recommendation provided',
        confidence: Math.min(1, Math.max(0, parsed.confidence ?? 0.5)),
        synthesizerId,
        timestamp: new Date(),
      };
    }
  } catch (error) {
    // Fall through to fallback parsing
    logger.warn({ err: error }, 'Failed to parse synthesis response as JSON');
  }

  // Fallback: create a basic synthesis from the raw text
  return {
    commonGround: ['See detailed analysis in conclusion'],
    keyDifferences: ['See detailed analysis in conclusion'],
    evolutionSummary: 'Unable to parse structured evolution summary',
    conclusion: responseText,
    recommendation: 'Review the detailed analysis above',
    confidence: 0.5,
    synthesizerId,
    timestamp: new Date(),
  };
}
