/**
 * AI-Based Consensus Analyzer
 *
 * Uses lightweight AI models for semantic analysis of debate positions,
 * replacing rule-based keyword matching with true language understanding.
 */

import { jsonrepair } from 'jsonrepair';
import type { BaseAgent } from '../agents/base.js';
import type { AgentRegistry } from '../agents/registry.js';
import type { AgentResponse, AIConsensusResult, AIProvider } from '../types/index.js';
import { LIGHT_MODELS } from '../agents/setup.js';
import { ConsensusAnalyzer } from './consensus-analyzer.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AIConsensusAnalyzer');

/**
 * Configuration for AIConsensusAnalyzer
 */
export interface AIConsensusAnalyzerConfig {
  /** Agent registry to get available agents */
  registry: AgentRegistry;
  /** Preferred provider for analysis (uses first available if not specified) */
  preferredProvider?: AIProvider;
  /** Whether to fall back to rule-based analysis on AI failure */
  fallbackToRuleBased?: boolean;
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
 * Analysis prompt template for the AI model
 */
const ANALYSIS_PROMPT = `You are analyzing debate positions from multiple AI agents. Your task is to perform semantic analysis - understanding meaning, not just matching keywords.

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
 * AI-Based Consensus Analyzer
 *
 * Provides semantic analysis of debate positions using lightweight AI models.
 * Falls back to basic analysis if AI is unavailable.
 */
export class AIConsensusAnalyzer {
  private registry: AgentRegistry;
  private preferredProvider?: AIProvider;
  private fallbackToRuleBased: boolean;

  constructor(config: AIConsensusAnalyzerConfig) {
    this.registry = config.registry;
    this.preferredProvider = config.preferredProvider;
    this.fallbackToRuleBased = config.fallbackToRuleBased ?? true;
  }

  /**
   * Analyze consensus using AI semantic analysis
   *
   * @param responses - Agent responses to analyze
   * @param topic - The debate topic for context
   * @returns AI-enhanced consensus result
   */
  async analyzeConsensus(
    responses: AgentResponse[],
    topic: string
  ): Promise<AIConsensusResult> {
    // Handle edge cases
    if (responses.length === 0) {
      return this.createEmptyResult('No responses to analyze');
    }

    if (responses.length === 1) {
      const response = responses[0]!;
      return {
        agreementLevel: 1,
        commonPoints: [response.position],
        disagreementPoints: [],
        summary: `Single response from ${response.agentName}`,
        clusters: [
          {
            theme: 'Single Position',
            agentIds: [response.agentId],
            summary: response.position,
          },
        ],
        analyzerId: 'self',
      };
    }

    // Try AI analysis
    let diagnostics: AIAnalysisDiagnostics | undefined;
    let aiError: Error | undefined;

    try {
      const result = await this.getAnalysisAgent();
      diagnostics = result.diagnostics;

      if (result.agent) {
        logger.debug({ topic, responseCount: responses.length }, 'Attempting AI consensus analysis');
        return await this.performAIAnalysis(result.agent, responses, topic);
      } else {
        logger.info(
          {
            reason: diagnostics.reason,
            totalAgents: diagnostics.totalAgents,
            activeAgents: diagnostics.activeAgents,
            registeredProviders: diagnostics.providerNames,
          },
          'No analysis agent available, falling back to rule-based analysis'
        );
      }
    } catch (error) {
      aiError = error instanceof Error ? error : new Error(String(error));
      logger.warn(
        {
          err: error,
          errorMessage: aiError.message,
          diagnostics,
        },
        'AI analysis failed, falling back to rule-based analysis'
      );
    }

    // Fallback to semantic similarity-based analysis
    if (this.fallbackToRuleBased) {
      logger.debug('Using ConsensusAnalyzer for fallback analysis');
      return this.performBasicAnalysis(responses, diagnostics, aiError);
    }

    const unavailableReason = aiError
      ? `AI analysis failed: ${aiError.message}`
      : diagnostics?.reason ?? 'AI analysis unavailable';
    return this.createEmptyResult(`${unavailableReason} and fallback disabled`);
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

    const activeAgents = this.registry.getActiveAgents();
    if (activeAgents.length === 0) {
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

    // Try preferred provider first
    if (this.preferredProvider) {
      const preferred = activeAgents.find(
        (a) => a.getInfo().provider === this.preferredProvider
      );
      if (preferred) {
        logger.debug(
          { provider: this.preferredProvider, agentId: preferred.getInfo().id },
          'Using preferred provider for analysis'
        );
        return { agent: this.createLightModelAgent(preferred), diagnostics: { ...diagnostics, available: true } };
      }
      logger.debug(
        {
          preferredProvider: this.preferredProvider,
          availableProviders: activeAgents.map((a) => a.getInfo().provider),
        },
        'Preferred provider not available, using alternative'
      );
    }

    // Use first available agent
    const firstAgent = activeAgents[0];
    if (firstAgent) {
      logger.debug(
        { provider: firstAgent.getInfo().provider, agentId: firstAgent.getInfo().id },
        'Using first available agent for analysis'
      );
      return { agent: this.createLightModelAgent(firstAgent), diagnostics: { ...diagnostics, available: true } };
    }

    return { agent: null, diagnostics };
  }

  /**
   * Create a variant of the agent using the light model
   *
   * Creates a new agent instance with the same provider but using the lightweight model
   * defined in LIGHT_MODELS for cost-efficient consensus analysis.
   */
  private createLightModelAgent(baseAgent: BaseAgent): BaseAgent {
    const info = baseAgent.getInfo();
    const lightModel = LIGHT_MODELS[info.provider];

    // Get the factory from registry to create a new agent with light model
    const factory = this.registry.getProviderFactory(info.provider);
    if (!factory) {
      // Fallback to base agent if factory not available
      return baseAgent;
    }

    // Create new agent with light model config
    const lightConfig = {
      id: `${info.id}-light-consensus`,
      name: `${info.name} (Light)`,
      provider: info.provider,
      model: lightModel,
    };

    return factory(lightConfig);
  }

  /**
   * Perform AI-based semantic analysis
   */
  private async performAIAnalysis(
    agent: BaseAgent,
    responses: AgentResponse[],
    topic: string
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

    // Build the analysis prompt
    const prompt = ANALYSIS_PROMPT.replace('{topic}', topic).replace(
      '{positions}',
      positionsText
    );

    // System prompt for JSON-only output
    const systemPrompt =
      'You are an AI assistant that analyzes debate positions. ' +
      'You must respond with valid JSON only, no additional text before or after the JSON object. ' +
      'Do not include markdown code fences or any other formatting.';

    // Use generateRawCompletion to get raw JSON without parsing
    const rawResponse = await agent.generateRawCompletion(prompt, systemPrompt);

    // Parse the raw JSON response
    return this.parseRawAIResponse(rawResponse, agent.getInfo().id);
  }

  /**
   * Parse raw AI response string into AIConsensusResult
   * Used with generateRawCompletion which returns unparsed text
   */
  private parseRawAIResponse(rawResponse: string, analyzerId: string): AIConsensusResult {
    try {
      // Strip markdown code fences if present (```json ... ```)
      let cleanedResponse = rawResponse.trim();
      const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        cleanedResponse = codeBlockMatch[1].trim();
      }

      // Try to extract JSON from the response
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      return this.parseJsonToResult(jsonMatch[0], analyzerId);
    } catch (error) {
      logger.warn(
        { err: error, responseLength: rawResponse.length, responsePreview: rawResponse.slice(0, 200) },
        'Failed to parse raw AI response'
      );
      // Return a basic result with the raw response as summary
      return {
        agreementLevel: 0.5,
        commonPoints: ['Unable to determine common points'],
        disagreementPoints: [],
        summary: rawResponse.slice(0, 5000) || 'Analysis failed',
        analyzerId,
      };
    }
  }

  /**
   * Parse JSON string into AIConsensusResult
   * Uses jsonrepair to handle malformed JSON from AI models
   */
  private parseJsonToResult(json: string, analyzerId: string): AIConsensusResult {
    // Clean up common issues before repair
    let cleanedJson = json
      // Remove trailing commas before closing brackets
      .replace(/,(\s*[}\]])/g, '$1')
      // Remove any BOM or zero-width characters
      .replace(/[\uFEFF\u200B-\u200D\u2060]/g, '');

    // Use jsonrepair to fix remaining JSON issues
    const repairedJson = jsonrepair(cleanedJson);
    const parsed = JSON.parse(repairedJson);

    return {
      agreementLevel: Math.max(0, Math.min(1, Number(parsed.agreementLevel) || 0.5)),
      commonPoints: Array.isArray(parsed.commonGround) ? parsed.commonGround : [],
      disagreementPoints: Array.isArray(parsed.disagreementPoints)
        ? parsed.disagreementPoints
        : [],
      summary: String(parsed.summary || 'Analysis complete'),
      clusters: Array.isArray(parsed.clusters) ? parsed.clusters : undefined,
      nuances: parsed.nuances
        ? {
            partialAgreements: Array.isArray(parsed.nuances.partialAgreements)
              ? parsed.nuances.partialAgreements
              : [],
            conditionalPositions: Array.isArray(parsed.nuances.conditionalPositions)
              ? parsed.nuances.conditionalPositions
              : [],
            uncertainties: Array.isArray(parsed.nuances.uncertainties)
              ? parsed.nuances.uncertainties
              : [],
          }
        : undefined,
      reasoning: String(parsed.reasoning || ''),
      analyzerId,
    };
  }

  /**
   * Perform semantic similarity-based analysis as fallback
   * Uses ConsensusAnalyzer for sophisticated clustering and agreement detection
   */
  private performBasicAnalysis(
    responses: AgentResponse[],
    diagnostics?: AIAnalysisDiagnostics,
    error?: Error
  ): AIConsensusResult {
    // Use ConsensusAnalyzer for semantic similarity-based analysis
    const consensusAnalyzer = new ConsensusAnalyzer();
    const result = consensusAnalyzer.analyzeConsensus(responses);

    // Build informative reasoning message
    const reasoningParts: string[] = ['Semantic similarity analysis (AI unavailable)'];

    if (error) {
      reasoningParts.push(`Error: ${error.message}`);
    } else if (diagnostics) {
      reasoningParts.push(`Reason: ${diagnostics.reason}`);
    }

    if (diagnostics) {
      if (diagnostics.totalAgents === 0) {
        reasoningParts.push('Hint: No agents registered. Ensure API keys are set and setupAgents() was called.');
      } else if (diagnostics.activeAgents === 0) {
        const inactiveInfo = diagnostics.inactiveAgents
          .map((a) => `${a.provider}: ${a.error ?? 'unknown error'}`)
          .join('; ');
        reasoningParts.push(`Hint: All ${diagnostics.totalAgents} agents failed health checks. Errors: ${inactiveInfo}`);
      }
    }

    return {
      agreementLevel: result.agreementLevel,
      commonPoints: result.commonPoints,
      disagreementPoints: result.disagreementPoints,
      summary: result.summary,
      reasoning: reasoningParts.join('. '),
    };
  }

  /**
   * Create an empty result for edge cases
   */
  private createEmptyResult(message: string): AIConsensusResult {
    return {
      agreementLevel: 0,
      commonPoints: [],
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
      const preferredAvailable = activeAgents.some(
        (a) => a.provider === this.preferredProvider
      );
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
