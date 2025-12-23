/**
 * AI-Based Consensus Analyzer
 *
 * Uses lightweight AI models for semantic analysis of debate positions,
 * replacing rule-based keyword matching with true language understanding.
 */

import type { BaseAgent } from '../agents/base.js';
import type { AgentRegistry } from '../agents/registry.js';
import type { LightModelAgentOptions } from '../agents/utils/light-model-factory.js';
import { ConfigurationError } from '../errors/index.js';
import type { AgentResponse, AIConsensusResult, AIProvider } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import { parseAIConsensusResponse } from './utils/json-parser.js';
// Default imports - can be overridden via config for dependency injection
import {
  selectPreferredAgent as defaultSelectPreferredAgent,
  createLightAgentFromBase as defaultCreateLightAgentFromBase,
} from '../agents/utils/light-agent-selector.js';

const logger = createLogger('AIConsensusAnalyzer');

/** Constant for self-analysis identifier when only one response is provided */
const SELF_ANALYZER_ID = 'self';

/** Type for agent selection function */
export type SelectAgentFn = (
  registry: AgentRegistry,
  preferredProvider?: AIProvider
) => BaseAgent | null;

/** Type for light agent creation function */
export type CreateLightAgentFn = (
  baseAgent: BaseAgent,
  registry: AgentRegistry,
  options: Omit<LightModelAgentOptions, 'registry'>
) => BaseAgent;

/**
 * Configuration for AIConsensusAnalyzer
 */
export interface AIConsensusAnalyzerConfig {
  /** Agent registry to get available agents */
  registry: AgentRegistry;
  /** Preferred provider for analysis (uses first available if not specified) */
  preferredProvider?: AIProvider;
  /** Optional function injection for agent selection (for dependency injection/testing) */
  selectAgent?: SelectAgentFn;
  /** Optional function injection for light agent creation (for dependency injection/testing) */
  createLightAgent?: CreateLightAgentFn;
}

/**
 * Diagnostic information about why AI analysis may be unavailable
 */
export interface AIAnalysisDiagnostics {
  /** Whether AI analysis is available */
  available: boolean;
  /** Human-readable reason if unavailable */
  reason?: string;
  /** Number of registered providers */
  registeredProviders: number;
  /** List of registered provider names */
  providerNames: AIProvider[];
  /** Total number of agents in registry */
  totalAgents: number;
  /** Number of active (healthy) agents */
  activeAgents: number;
  /** Number of inactive agents with their errors */
  inactiveAgents: Array<{
    id: string;
    provider: AIProvider;
    error?: string;
  }>;
  /** Preferred provider if configured */
  preferredProvider?: AIProvider;
  /** Whether preferred provider is available */
  preferredProviderAvailable?: boolean;
}

/**
 * Base analysis prompt template (without groupthink detection)
 */
const BASE_ANALYSIS_PROMPT = `You are analyzing debate positions from multiple AI agents. Your task is to perform semantic analysis - understanding meaning, not just matching keywords.

## Debate Topic
{topic}

## Agent Positions
{positions}

## Your Analysis Task

Analyze these positions semantically and return a JSON object with this exact structure:

{
  "agreementLevel": <number 0-1, where 1 = complete agreement>,
  "clusters": [
    {
      "theme": "<descriptive name for this position cluster>",
      "agentIds": ["<agent IDs in this cluster>"],
      "summary": "<what this cluster's position is>"
    }
  ],
  "commonGround": ["<points ALL agents agree on>"],
  "disagreementPoints": ["<key points of disagreement>"],
  "nuances": {
    "partialAgreements": ["<points where agents mostly agree with caveats>"],
    "conditionalPositions": ["<positions that depend on conditions>"],
    "uncertainties": ["<areas where agents express uncertainty>"]
  },
  "summary": "<2-3 sentence overall summary>",
  "reasoning": "<brief explanation of your analysis>"
}

Important:
- Focus on SEMANTIC meaning, not keyword matching
- "Developers need better tools" and "Software engineers require improved tooling" are THE SAME position
- "AI is dangerous" and "AI is not dangerous" are OPPOSITE positions (detect negation!)
- Consider degrees of agreement (strong vs weak agreement)
- Identify nuanced positions (conditional, partial, uncertain)

Return ONLY the JSON object, no other text.`;

/**
 * Groupthink detection addition to the prompt
 */
const GROUPTHINK_PROMPT_ADDITION = `

Additionally, include groupthink detection in your analysis:

Add this field to your JSON response:
  "groupthinkWarning": {
    "detected": <boolean - true if groupthink indicators present>,
    "indicators": ["<list of detected groupthink indicators>"],
    "recommendation": "<suggested action if groupthink detected>"
  }

Groupthink Detection - Set detected=true if ANY of these are present:
- All agents show very high confidence (>=85%) without substantive disagreement
- All positions converge on identical conclusion without exploring alternatives
- No devil's advocate or contrarian perspectives despite controversial topic
- Arguments rely on social proof ("everyone agrees") rather than evidence
- Dissenting viewpoints are dismissed without proper consideration`;

/**
 * Build the analysis prompt, optionally including groupthink detection
 */
function buildAnalysisPrompt(includeGroupthink: boolean): string {
  if (includeGroupthink) {
    return BASE_ANALYSIS_PROMPT + GROUPTHINK_PROMPT_ADDITION;
  }
  return BASE_ANALYSIS_PROMPT;
}

/**
 * AI-Based Consensus Analyzer
 *
 * Provides semantic analysis of debate positions using lightweight AI models.
 * Requires at least one active AI agent to function.
 */
export class AIConsensusAnalyzer {
  private registry: AgentRegistry;
  private preferredProvider?: AIProvider;
  private selectAgent: SelectAgentFn;
  private createLightAgent: CreateLightAgentFn;

  constructor(config: AIConsensusAnalyzerConfig) {
    this.registry = config.registry;
    this.preferredProvider = config.preferredProvider;
    // Allow injection but keep defaults for backward compatibility
    this.selectAgent = config.selectAgent ?? defaultSelectPreferredAgent;
    this.createLightAgent = config.createLightAgent ?? defaultCreateLightAgentFromBase;
  }

  /**
   * Analyze consensus using AI semantic analysis
   *
   * @param responses - Agent responses to analyze
   * @param topic - The debate topic for context
   * @param options - Analysis options
   * @param options.includeGroupthinkDetection - Whether to include groupthink detection (default: true)
   * @returns AI-enhanced consensus result
   * @throws Error if no AI agent is available
   */
  async analyzeConsensus(
    responses: AgentResponse[],
    topic: string,
    options?: { includeGroupthinkDetection?: boolean }
  ): Promise<AIConsensusResult> {
    const includeGroupthink = options?.includeGroupthinkDetection ?? true;

    // Handle edge cases
    if (responses.length === 0) {
      return this.createEmptyResult('No responses to analyze');
    }

    if (responses.length === 1) {
      const response = responses[0]!;
      return {
        agreementLevel: 1,
        commonGround: [response.position],
        disagreementPoints: [],
        summary: `Single response from ${response.agentName}`,
        clusters: [
          {
            theme: 'Single Position',
            agentIds: [response.agentId],
            summary: response.position,
          },
        ],
        analyzerId: SELF_ANALYZER_ID,
      };
    }

    // Get analysis agent - throws if unavailable
    const result = await this.getAnalysisAgent();

    if (!result.agent) {
      const errorMessage = this.buildUnavailableErrorMessage(result.diagnostics);
      logger.error(
        {
          reason: result.diagnostics.reason,
          totalAgents: result.diagnostics.totalAgents,
          activeAgents: result.diagnostics.activeAgents,
          registeredProviders: result.diagnostics.providerNames,
        },
        'No AI agent available for consensus analysis'
      );
      throw new ConfigurationError(errorMessage, {
        code: 'AI_ANALYSIS_UNAVAILABLE',
      });
    }

    logger.debug(
      { topic, responseCount: responses.length, includeGroupthink },
      'Performing AI consensus analysis'
    );
    return await this.performAIAnalysis(result.agent, responses, topic, includeGroupthink);
  }

  /**
   * Build a helpful error message when AI analysis is unavailable
   */
  private buildUnavailableErrorMessage(diagnostics: AIAnalysisDiagnostics): string {
    const parts: string[] = ['AI consensus analysis unavailable'];

    if (diagnostics.reason) {
      parts.push(diagnostics.reason);
    }

    if (diagnostics.totalAgents === 0) {
      parts.push(
        'Hint: No agents registered. Ensure API keys are set and setupAgents() was called.'
      );
    } else if (diagnostics.activeAgents === 0) {
      const inactiveInfo = diagnostics.inactiveAgents
        .slice(0, 3)
        .map((a) => `${a.provider}: ${a.error ?? 'unknown error'}`)
        .join('; ');
      parts.push(
        `Hint: All ${diagnostics.totalAgents} agents failed health checks. Errors: ${inactiveInfo}`
      );
    }

    return parts.join('. ');
  }

  /**
   * Get an agent configured for analysis (using light model)
   * Returns both the agent and diagnostic information about availability
   */
  private async getAnalysisAgent(): Promise<{
    agent: BaseAgent | null;
    diagnostics: AIAnalysisDiagnostics;
  }> {
    const diagnostics = this.getDiagnostics();

    // Use injected function for agent selection
    const baseAgent = this.selectAgent(this.registry, this.preferredProvider);
    if (!baseAgent) {
      logger.warn(
        {
          totalAgents: diagnostics.totalAgents,
          inactiveAgents: diagnostics.inactiveAgents,
          registeredProviders: diagnostics.providerNames,
        },
        'No active agents available for AI consensus analysis'
      );
      return { agent: null, diagnostics };
    }

    const info = baseAgent.getInfo();
    const isPreferred = this.preferredProvider && info.provider === this.preferredProvider;

    if (isPreferred) {
      logger.debug(
        { provider: this.preferredProvider, agentId: info.id },
        'Using preferred provider for analysis'
      );
    } else if (this.preferredProvider) {
      logger.debug(
        {
          preferredProvider: this.preferredProvider,
          actualProvider: info.provider,
        },
        'Preferred provider not available, using alternative'
      );
    } else {
      logger.debug(
        { provider: info.provider, agentId: info.id },
        'Using first available agent for analysis'
      );
    }

    // Create light model agent using injected function
    const lightAgent = this.createLightAgent(baseAgent, this.registry, {
      idSuffix: 'consensus',
      maxTokens: 8192, // Higher limit for detailed analysis
    });

    return { agent: lightAgent, diagnostics: { ...diagnostics, available: true } };
  }

  /**
   * Perform AI-based semantic analysis
   */
  private async performAIAnalysis(
    agent: BaseAgent,
    responses: AgentResponse[],
    topic: string,
    includeGroupthink: boolean
  ): Promise<AIConsensusResult> {
    // Format positions for the prompt
    const positionsText = responses
      .map(
        (r) =>
          `### ${r.agentName} (${r.agentId})\n` +
          `**Position:** ${r.position}\n` +
          `**Reasoning:** ${r.reasoning}\n` +
          `**Confidence:** ${(r.confidence * 100).toFixed(0)}%`
      )
      .join('\n\n');

    // Build the analysis prompt (conditionally includes groupthink detection)
    const promptTemplate = buildAnalysisPrompt(includeGroupthink);
    const prompt = promptTemplate.replace('{topic}', topic).replace('{positions}', positionsText);

    // System prompt for JSON-only output
    const systemPrompt =
      'You are an AI assistant that analyzes debate positions. ' +
      'You must respond with valid JSON only, no additional text before or after the JSON object. ' +
      'Do not include markdown code fences or any other formatting.';

    // Use generateRawCompletion to get raw JSON without parsing
    const rawResponse = await agent.generateRawCompletion(prompt, systemPrompt);

    // Log raw response for debugging (full content at debug level)
    logger.debug(
      {
        analyzerId: agent.getInfo().id,
        responseLength: rawResponse.length,
        rawResponse, // Full response for debugging
      },
      'Received raw AI consensus response'
    );

    // Parse the raw JSON response (includes AI-based groupthink detection)
    const result = parseAIConsensusResponse(rawResponse, { analyzerId: agent.getInfo().id });

    // Log if groupthink was detected
    if (result.groupthinkWarning?.detected) {
      logger.warn(
        { indicators: result.groupthinkWarning.indicators },
        'Groupthink detected by AI in consensus analysis'
      );
    }

    return result;
  }

  /**
   * Create an empty result for edge cases
   */
  private createEmptyResult(message: string): AIConsensusResult {
    return {
      agreementLevel: 0,
      commonGround: [],
      disagreementPoints: [],
      summary: message,
    };
  }

  /**
   * Get diagnostic information about AI analysis availability
   *
   * This method can be called to understand why AI analysis may be unavailable.
   * Useful for debugging and for MCP tools to provide user feedback.
   *
   * @returns Diagnostic information including agent status and availability reasons
   */
  getDiagnostics(): AIAnalysisDiagnostics {
    const registeredProviders = this.registry.getRegisteredProviders();
    const healthStatus = this.registry.getAgentHealthStatus();
    const activeAgents = healthStatus.filter((a) => a.active);
    const inactiveAgents = healthStatus.filter((a) => !a.active);

    // Determine availability and reason
    let available = false;
    let reason: string | undefined;

    if (registeredProviders.length === 0) {
      reason = 'No providers registered. API keys may not be configured.';
    } else if (healthStatus.length === 0) {
      reason = 'No agents created. Call setupAgents() to initialize agents.';
    } else if (activeAgents.length === 0) {
      const errorSummary = inactiveAgents
        .slice(0, 3)
        .map((a) => `${a.provider}: ${a.error ?? 'health check failed'}`)
        .join('; ');
      reason = `All agents failed health checks. ${errorSummary}`;
    } else if (this.preferredProvider) {
      const preferredAvailable = activeAgents.some((a) => a.provider === this.preferredProvider);
      if (preferredAvailable) {
        available = true;
      } else {
        available = true; // Will use alternative
        reason = `Preferred provider '${this.preferredProvider}' not available, using alternative.`;
      }
    } else {
      available = true;
    }

    // Check if preferred provider is available
    const preferredProviderAvailable = this.preferredProvider
      ? activeAgents.some((a) => a.provider === this.preferredProvider)
      : undefined;

    return {
      available,
      reason,
      registeredProviders: registeredProviders.length,
      providerNames: registeredProviders,
      totalAgents: healthStatus.length,
      activeAgents: activeAgents.length,
      inactiveAgents: inactiveAgents.map((a) => ({
        id: a.id,
        provider: a.provider,
        error: a.error,
      })),
      preferredProvider: this.preferredProvider,
      preferredProviderAvailable,
    };
  }
}
