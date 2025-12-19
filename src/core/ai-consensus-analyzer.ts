/**
 * AI-Based Consensus Analyzer
 *
 * Uses lightweight AI models for semantic analysis of debate positions,
 * replacing rule-based keyword matching with true language understanding.
 */

import type { BaseAgent } from '../agents/base.js';
import type { AgentRegistry } from '../agents/registry.js';
import type { AgentResponse, AIConsensusResult, AIProvider } from '../types/index.js';
import { LIGHT_MODELS } from '../agents/setup.js';

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
    try {
      const analysisAgent = await this.getAnalysisAgent();
      if (analysisAgent) {
        return await this.performAIAnalysis(analysisAgent, responses, topic);
      }
    } catch (error) {
      console.warn('[AIConsensusAnalyzer] AI analysis failed:', error);
    }

    // Fallback to basic analysis
    if (this.fallbackToRuleBased) {
      return this.performBasicAnalysis(responses);
    }

    return this.createEmptyResult('AI analysis unavailable and fallback disabled');
  }

  /**
   * Get an agent configured for analysis (using light model)
   */
  private async getAnalysisAgent(): Promise<BaseAgent | null> {
    const activeAgents = this.registry.getActiveAgents();
    if (activeAgents.length === 0) {
      return null;
    }

    // Try preferred provider first
    if (this.preferredProvider) {
      const preferred = activeAgents.find(
        (a) => a.getInfo().provider === this.preferredProvider
      );
      if (preferred) {
        return this.createLightModelAgent(preferred);
      }
    }

    // Use first available agent
    const firstAgent = activeAgents[0];
    if (firstAgent) {
      return this.createLightModelAgent(firstAgent);
    }

    return null;
  }

  /**
   * Create a variant of the agent using the light model
   */
  private createLightModelAgent(baseAgent: BaseAgent): BaseAgent {
    const info = baseAgent.getInfo();
    const lightModel = LIGHT_MODELS[info.provider];

    // Create a new agent config with the light model
    // For now, we'll use the base agent but could create a new instance with light model
    // This is a simplified approach - in production, you'd want to create a proper light agent
    return baseAgent;
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

    // Create a minimal debate context for the agent
    const analysisContext = {
      sessionId: 'consensus-analysis',
      topic: 'Analyze the following debate positions',
      mode: 'collaborative' as const,
      currentRound: 1,
      totalRounds: 1,
      previousResponses: [],
    };

    // Override the agent's prompt temporarily
    const originalResponse = await agent.generateResponse({
      ...analysisContext,
      topic: prompt,
    });

    // Parse the AI response
    return this.parseAIResponse(originalResponse, agent.getInfo().id);
  }

  /**
   * Parse the AI's JSON response into AIConsensusResult
   */
  private parseAIResponse(
    response: AgentResponse,
    analyzerId: string
  ): AIConsensusResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.position.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Try reasoning field as fallback
        const reasoningMatch = response.reasoning.match(/\{[\s\S]*\}/);
        if (!reasoningMatch) {
          throw new Error('No JSON found in response');
        }
        return this.parseJsonToResult(reasoningMatch[0], analyzerId);
      }
      return this.parseJsonToResult(jsonMatch[0], analyzerId);
    } catch (error) {
      console.warn('[AIConsensusAnalyzer] Failed to parse AI response:', error);
      // Return a basic result from the response
      return {
        agreementLevel: response.confidence,
        commonPoints: [response.position.slice(0, 200)],
        disagreementPoints: [],
        summary: response.reasoning.slice(0, 300),
        analyzerId,
      };
    }
  }

  /**
   * Parse JSON string into AIConsensusResult
   */
  private parseJsonToResult(json: string, analyzerId: string): AIConsensusResult {
    const parsed = JSON.parse(json);

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
   * Perform basic (non-AI) analysis as fallback
   * This is a simplified version that provides basic functionality
   */
  private performBasicAnalysis(responses: AgentResponse[]): AIConsensusResult {
    // Calculate average confidence as a proxy for agreement
    const avgConfidence =
      responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;

    // Simple position comparison
    const positions = responses.map((r) => r.position.toLowerCase());
    const uniqueCount = new Set(positions).size;
    const agreementLevel = 1 - (uniqueCount - 1) / responses.length;

    return {
      agreementLevel: Math.max(0, Math.min(1, agreementLevel)),
      commonPoints: [`${responses.length} agents provided positions`],
      disagreementPoints:
        uniqueCount > 1 ? [`${uniqueCount} distinct positions identified`] : [],
      summary: `Basic analysis: ${(agreementLevel * 100).toFixed(0)}% agreement based on position uniqueness. Average confidence: ${(avgConfidence * 100).toFixed(0)}%.`,
      reasoning: 'Fallback analysis (AI unavailable)',
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
}
