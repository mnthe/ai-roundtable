/**
 * AI-Based Consensus Analyzer
 *
 * Uses lightweight AI models for semantic analysis of debate positions,
 * replacing rule-based keyword matching with true language understanding.
 */

import { jsonrepair } from 'jsonrepair';
import { parse as parsePartialJson, Allow } from 'partial-json';
import type { BaseAgent } from '../agents/base.js';
import type { AgentRegistry } from '../agents/registry.js';
import { createLightModelAgent } from '../agents/utils/light-model-factory.js';
import type { AgentResponse, AIConsensusResult, AIProvider } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AIConsensusAnalyzer');

/**
 * Allowed partial JSON parsing flags for LLM responses
 * Allows incomplete strings, arrays, and objects
 */
const PARTIAL_JSON_ALLOW = Allow.STR | Allow.ARR | Allow.OBJ;

/**
 * Configuration for AIConsensusAnalyzer
 */
export interface AIConsensusAnalyzerConfig {
  /** Agent registry to get available agents */
  registry: AgentRegistry;
  /** Preferred provider for analysis (uses first available if not specified) */
  preferredProvider?: AIProvider;
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
  "groupthinkWarning": {
    "detected": <boolean - true if groupthink indicators present>,
    "indicators": ["<list of detected groupthink indicators>"],
    "recommendation": "<suggested action if groupthink detected>"
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

Groupthink Detection - Set detected=true if ANY of these are present:
- All agents show very high confidence (>=85%) without substantive disagreement
- All positions converge on identical conclusion without exploring alternatives
- No devil's advocate or contrarian perspectives despite controversial topic
- Arguments rely on social proof ("everyone agrees") rather than evidence
- Dissenting viewpoints are dismissed without proper consideration

Return ONLY the JSON object, no other text.`;

/**
 * AI-Based Consensus Analyzer
 *
 * Provides semantic analysis of debate positions using lightweight AI models.
 * Requires at least one active AI agent to function.
 */
export class AIConsensusAnalyzer {
  private registry: AgentRegistry;
  private preferredProvider?: AIProvider;

  constructor(config: AIConsensusAnalyzerConfig) {
    this.registry = config.registry;
    this.preferredProvider = config.preferredProvider;
  }

  /**
   * Analyze consensus using AI semantic analysis
   *
   * @param responses - Agent responses to analyze
   * @param topic - The debate topic for context
   * @param _groupthinkThreshold - Optional threshold for groupthink detection (reserved for future use)
   * @returns AI-enhanced consensus result
   * @throws Error if no AI agent is available
   */
  async analyzeConsensus(
    responses: AgentResponse[],
    topic: string,
    _groupthinkThreshold?: number
  ): Promise<AIConsensusResult> {
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
        analyzerId: 'self',
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
      throw new Error(errorMessage);
    }

    logger.debug({ topic, responseCount: responses.length }, 'Performing AI consensus analysis');
    return await this.performAIAnalysis(result.agent, responses, topic);
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
      parts.push('Hint: No agents registered. Ensure API keys are set and setupAgents() was called.');
    } else if (diagnostics.activeAgents === 0) {
      const inactiveInfo = diagnostics.inactiveAgents
        .slice(0, 3)
        .map((a) => `${a.provider}: ${a.error ?? 'unknown error'}`)
        .join('; ');
      parts.push(`Hint: All ${diagnostics.totalAgents} agents failed health checks. Errors: ${inactiveInfo}`);
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
        const lightAgent = createLightModelAgent(preferred, this.registry, {
          idSuffix: 'consensus',
          maxTokens: 8192, // Higher limit for detailed analysis
        });
        return { agent: lightAgent, diagnostics: { ...diagnostics, available: true } };
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
      const lightAgent = createLightModelAgent(firstAgent, this.registry, {
        idSuffix: 'consensus',
        maxTokens: 8192, // Higher limit for detailed analysis
      });
      return { agent: lightAgent, diagnostics: { ...diagnostics, available: true } };
    }

    return { agent: null, diagnostics };
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
    const result = this.parseRawAIResponse(rawResponse, agent.getInfo().id);

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
   * Parse raw AI response string into AIConsensusResult
   * Uses multiple strategies to handle various LLM output formats:
   * 1. Strip markdown code fences (complete or incomplete)
   * 2. Try jsonrepair for malformed JSON
   * 3. Try partial-json for truncated responses
   * 4. Extract key fields even from partial data
   */
  private parseRawAIResponse(rawResponse: string, analyzerId: string): AIConsensusResult {
    const cleanedResponse = this.cleanLLMResponse(rawResponse);

    // Strategy 1: Try standard JSON parsing with jsonrepair
    try {
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return this.parseJsonToResult(jsonMatch[0], analyzerId);
      }
    } catch (error) {
      logger.debug(
        { err: error, strategy: 'jsonrepair' },
        'jsonrepair failed, trying partial-json'
      );
    }

    // Strategy 2: Try partial-json for truncated responses
    try {
      const partialResult = this.parsePartialJsonResponse(cleanedResponse, analyzerId);
      if (partialResult) {
        logger.info(
          { analyzerId, agreementLevel: partialResult.agreementLevel },
          'Successfully parsed partial JSON response'
        );
        return partialResult;
      }
    } catch (error) {
      logger.debug(
        { err: error, strategy: 'partial-json' },
        'partial-json failed, using fallback'
      );
    }

    // Strategy 3: Extract agreementLevel with regex as last resort
    const extractedLevel = this.extractAgreementLevelFromText(cleanedResponse);
    const extractedSummary = this.extractSummaryFromText(cleanedResponse);

    logger.warn(
      {
        responseLength: rawResponse.length,
        responsePreview: rawResponse.slice(0, 500), // Preview for log readability
        extractedLevel,
        hasExtractedSummary: !!extractedSummary,
      },
      'All JSON parsing strategies failed, using extracted/fallback values'
    );

    // Log full raw response at debug level for investigation
    logger.debug(
      {
        rawResponse, // Full response preserved at debug level
        analyzerId,
      },
      'Full raw response after parsing failure'
    );

    return {
      agreementLevel: extractedLevel ?? 0.5,
      commonGround: extractedLevel !== null ? [] : ['Unable to determine common ground'],
      disagreementPoints: [],
      // Use extracted summary or full raw response (not truncated)
      summary: extractedSummary || rawResponse || 'Analysis failed',
      analyzerId,
      reasoning: 'Parsed from partial/malformed response',
    };
  }

  /**
   * Clean LLM response by removing markdown formatting and extracting JSON content
   */
  private cleanLLMResponse(rawResponse: string): string {
    let cleaned = rawResponse.trim();

    // Handle complete markdown code fences: ```json ... ```
    const completeCodeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (completeCodeBlock && completeCodeBlock[1]) {
      return completeCodeBlock[1].trim();
    }

    // Handle incomplete markdown code fences (truncated response): ```json ...
    const incompleteCodeBlock = cleaned.match(/```(?:json)?\s*([\s\S]*)/);
    if (incompleteCodeBlock && incompleteCodeBlock[1] && !cleaned.endsWith('```')) {
      cleaned = incompleteCodeBlock[1].trim();
    }

    // Remove any leading/trailing markdown or text before JSON
    const jsonStartIndex = cleaned.indexOf('{');
    if (jsonStartIndex > 0) {
      cleaned = cleaned.slice(jsonStartIndex);
    }

    return cleaned;
  }

  /**
   * Parse truncated/partial JSON using partial-json library
   */
  private parsePartialJsonResponse(json: string, analyzerId: string): AIConsensusResult | null {
    // Find the start of JSON object
    const jsonStart = json.indexOf('{');
    if (jsonStart === -1) {
      return null;
    }

    const jsonContent = json.slice(jsonStart);

    // Use partial-json to parse incomplete JSON
    const parsed = parsePartialJson(jsonContent, PARTIAL_JSON_ALLOW);

    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }

    // Check if we got at least agreementLevel (the most important field)
    const agreementLevel = this.extractNumber(parsed.agreementLevel);
    if (agreementLevel === null) {
      return null;
    }

    return {
      agreementLevel: Math.max(0, Math.min(1, agreementLevel)),
      commonGround: this.extractStringArray(parsed.commonGround),
      disagreementPoints: this.extractStringArray(parsed.disagreementPoints),
      summary: String(parsed.summary || 'Partial analysis'),
      clusters: this.extractClusters(parsed.clusters),
      nuances: this.extractNuances(parsed.nuances),
      groupthinkWarning: this.extractGroupthinkWarning(parsed.groupthinkWarning),
      reasoning: String(parsed.reasoning || 'Parsed from partial response'),
      analyzerId,
    };
  }

  /**
   * Extract agreementLevel from text using regex (last resort)
   */
  private extractAgreementLevelFromText(text: string): number | null {
    // Look for "agreementLevel": 0.XX pattern
    const match = text.match(/"agreementLevel"\s*:\s*([\d.]+)/);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      if (!isNaN(value) && value >= 0 && value <= 1) {
        return value;
      }
    }
    return null;
  }

  /**
   * Extract summary text from partial response
   */
  private extractSummaryFromText(text: string): string | null {
    // Look for "summary": "..." pattern
    const match = text.match(/"summary"\s*:\s*"([^"]+)/);
    return match?.[1] || null;
  }

  /**
   * Safely extract a number from potentially partial data
   */
  private extractNumber(value: unknown): number | null {
    if (typeof value === 'number' && !isNaN(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  /**
   * Safely extract string array from potentially partial data
   */
  private extractStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .slice(0, 20); // Limit to prevent huge arrays
  }

  /**
   * Safely extract clusters from potentially partial data
   */
  private extractClusters(
    value: unknown
  ): Array<{ theme: string; agentIds: string[]; summary: string }> | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const clusters = value
      .filter(
        (item): item is { theme?: string; agentIds?: unknown; summary?: string } =>
          typeof item === 'object' && item !== null
      )
      .map((item) => ({
        theme: String(item.theme || 'Unknown'),
        agentIds: this.extractStringArray(item.agentIds),
        summary: String(item.summary || ''),
      }))
      .filter((c) => c.agentIds.length > 0);

    return clusters.length > 0 ? clusters : undefined;
  }

  /**
   * Safely extract nuances from potentially partial data
   */
  private extractNuances(value: unknown): AIConsensusResult['nuances'] {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    const v = value as Record<string, unknown>;
    const nuances = {
      partialAgreements: this.extractStringArray(v.partialAgreements),
      conditionalPositions: this.extractStringArray(v.conditionalPositions),
      uncertainties: this.extractStringArray(v.uncertainties),
    };

    // Only return if at least one field has content
    if (
      nuances.partialAgreements.length > 0 ||
      nuances.conditionalPositions.length > 0 ||
      nuances.uncertainties.length > 0
    ) {
      return nuances;
    }
    return undefined;
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
      commonGround: Array.isArray(parsed.commonGround) ? parsed.commonGround : [],
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
      groupthinkWarning: this.extractGroupthinkWarning(parsed.groupthinkWarning),
      reasoning: String(parsed.reasoning || ''),
      analyzerId,
    };
  }

  /**
   * Safely extract groupthink warning from AI response
   */
  private extractGroupthinkWarning(
    value: unknown
  ): { detected: boolean; indicators: string[]; recommendation: string } | undefined {
    if (typeof value !== 'object' || value === null) {
      return undefined;
    }
    const v = value as Record<string, unknown>;

    // Only include if detected is explicitly true
    if (v.detected !== true) {
      return undefined;
    }

    return {
      detected: true,
      indicators: Array.isArray(v.indicators)
        ? v.indicators.filter((i): i is string => typeof i === 'string')
        : [],
      recommendation: typeof v.recommendation === 'string' ? v.recommendation : '',
    };
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
