/**
 * AI-Based Key Points Extractor
 *
 * Uses lightweight AI models to extract meaningful key points from agent reasoning,
 * replacing rule-based regex extraction with true language understanding.
 */

import { jsonrepair } from 'jsonrepair';
import type { BaseAgent } from '../agents/base.js';
import type { AgentRegistry } from '../agents/registry.js';
import { AgentError } from '../errors/index.js';
import type { AgentResponse, AIProvider } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import {
  selectPreferredAgent,
  createLightAgentFromBase,
} from '../agents/utils/light-agent-selector.js';
import { getCachedHealthStatus, setCachedHealthStatus } from '../agents/utils/health-cache.js';

const logger = createLogger('KeyPointsExtractor');

/**
 * Configuration for KeyPointsExtractor
 */
export interface KeyPointsExtractorConfig {
  /** Agent registry to get available agents */
  registry: AgentRegistry;
  /** Preferred provider for extraction (uses first available if not specified) */
  preferredProvider?: AIProvider;
  /** Maximum number of key points to extract per response */
  maxKeyPoints?: number;
  /** Whether to fall back to rule-based extraction on AI failure */
  fallbackToRuleBased?: boolean;
}

/**
 * Result of key points extraction for a single response
 */
export interface KeyPointsResult {
  agentId: string;
  keyPoints: string[];
}

/**
 * Prompt template for key points extraction
 */
const EXTRACTION_PROMPT = `You are extracting key points from a debate response. Your task is to identify the 2-4 most important points from the reasoning.

## Agent: {agentName}
## Position: {position}
## Full Reasoning:
{reasoning}

## Your Task

Extract 2-4 key points that summarize the most important aspects of this response. Each key point should:
- Be a complete, self-contained statement
- Capture a distinct, important insight or argument
- Be concise but informative (1-2 sentences max)
- NOT be truncated mid-sentence

Return a JSON object with this exact structure:
{
  "keyPoints": [
    "<key point 1>",
    "<key point 2>",
    "<key point 3>"
  ]
}

Important:
- Focus on MAIN points, not sub-details or examples
- Preserve the original meaning accurately
- Do NOT truncate sentences
- Return ONLY the JSON object, no other text.`;

/**
 * AI-Based Key Points Extractor
 *
 * Provides semantic extraction of key points using lightweight AI models.
 * Falls back to rule-based extraction if AI is unavailable.
 */
export class KeyPointsExtractor {
  private registry: AgentRegistry;
  private preferredProvider?: AIProvider;
  private maxKeyPoints: number;
  private fallbackToRuleBased: boolean;
  private lightAgent: BaseAgent | null = null;

  constructor(config: KeyPointsExtractorConfig) {
    this.registry = config.registry;
    this.preferredProvider = config.preferredProvider;
    this.maxKeyPoints = config.maxKeyPoints ?? 4;
    this.fallbackToRuleBased = config.fallbackToRuleBased ?? true;
  }

  /**
   * Extract key points from multiple responses in parallel
   *
   * @param responses - Agent responses to extract key points from
   * @returns Map of agentId to key points
   */
  async extractKeyPointsBatch(responses: AgentResponse[]): Promise<Map<string, string[]>> {
    const results = new Map<string, string[]>();

    if (responses.length === 0) {
      return results;
    }

    // Try to get or create a light model agent
    const agent = await this.getOrCreateLightAgent();

    if (agent) {
      // Extract key points in parallel using AI
      const extractionPromises = responses.map(async (response) => {
        try {
          const keyPoints = await this.extractWithAI(agent, response);
          return { agentId: response.agentId, keyPoints };
        } catch (error) {
          logger.warn({ err: error, agentId: response.agentId }, 'AI extraction failed');
          // Fallback for this specific response
          if (this.fallbackToRuleBased) {
            return {
              agentId: response.agentId,
              keyPoints: this.extractWithRules(response.reasoning),
            };
          }
          return { agentId: response.agentId, keyPoints: [] };
        }
      });

      const extractionResults = await Promise.all(extractionPromises);
      for (const result of extractionResults) {
        results.set(result.agentId, result.keyPoints);
      }
    } else if (this.fallbackToRuleBased) {
      // No AI available, use rule-based extraction for all
      for (const response of responses) {
        results.set(response.agentId, this.extractWithRules(response.reasoning));
      }
    }

    return results;
  }

  /**
   * Extract key points from a single response
   *
   * @param response - Agent response to extract key points from
   * @returns Array of key points
   */
  async extractKeyPoints(response: AgentResponse): Promise<string[]> {
    const results = await this.extractKeyPointsBatch([response]);
    return results.get(response.agentId) ?? [];
  }

  /**
   * Get or create a light model agent for extraction
   *
   * Uses TTL-based health cache to avoid redundant health check API calls.
   */
  private async getOrCreateLightAgent(): Promise<BaseAgent | null> {
    // Check cached agent health before performing actual health check
    if (this.lightAgent) {
      const agentId = this.lightAgent.getInfo().id;
      const cachedHealth = getCachedHealthStatus(agentId);

      if (cachedHealth !== null) {
        // Use cached health status
        if (cachedHealth) {
          return this.lightAgent;
        }
        // Cached as unhealthy, invalidate and try to create new agent
        logger.debug({ agentId }, 'Cached health status indicates unhealthy, invalidating agent');
        this.lightAgent = null;
      } else {
        // No cache, perform actual health check
        const health = await this.lightAgent.healthCheck();
        setCachedHealthStatus(agentId, health.healthy);

        if (health.healthy) {
          return this.lightAgent;
        }
        // Invalidate unhealthy agent
        logger.debug({ agentId, error: health.error }, 'Light agent unhealthy, invalidating');
        this.lightAgent = null;
      }
    }

    // Use shared utility for agent selection
    const baseAgent = selectPreferredAgent(this.registry, this.preferredProvider);
    if (!baseAgent) {
      return null;
    }

    // Create light model agent using shared utility
    this.lightAgent = createLightAgentFromBase(baseAgent, this.registry, {
      idSuffix: 'keypoints',
    });

    return this.lightAgent;
  }

  /**
   * Extract key points using AI
   */
  private async extractWithAI(agent: BaseAgent, response: AgentResponse): Promise<string[]> {
    // Build the extraction prompt
    const prompt = EXTRACTION_PROMPT.replace('{agentName}', response.agentName)
      .replace('{position}', response.position)
      .replace('{reasoning}', response.reasoning);

    // System prompt for JSON-only output
    const systemPrompt =
      'You are an AI assistant that extracts key points from text. ' +
      'You must respond with valid JSON only, no additional text before or after the JSON object. ' +
      'Do not include markdown code fences or any other formatting.';

    // Use generateRawCompletion to get raw JSON without parsing
    const rawResponse = await agent.generateRawCompletion(prompt, systemPrompt);

    // Parse the raw response, passing original reasoning for fallback
    return this.parseRawResponse(rawResponse, response.reasoning);
  }

  /**
   * Parse the raw AI response string into key points array
   *
   * @param rawResponse - Raw string response from AI containing JSON key points
   * @param originalReasoning - Original agent's reasoning for fallback extraction
   */
  private parseRawResponse(rawResponse: string, originalReasoning: string): string[] {
    try {
      // Try to extract JSON from the raw response
      const jsonStr = rawResponse.match(/\{[\s\S]*\}/)?.[0];

      if (!jsonStr) {
        throw new AgentError('No JSON found in AI response for key points extraction', {
          code: 'KEY_POINTS_PARSE_ERROR',
        });
      }

      // Use jsonrepair to handle malformed JSON
      const repairedJson = jsonrepair(jsonStr);
      const parsed = JSON.parse(repairedJson);

      if (Array.isArray(parsed.keyPoints)) {
        const keyPoints = parsed.keyPoints
          .slice(0, this.maxKeyPoints)
          .map((kp: unknown) => String(kp).trim())
          .filter((kp: string) => kp.length > 0);

        // If AI returned empty key points, fall back to rule-based
        if (keyPoints.length === 0 && this.fallbackToRuleBased) {
          return this.extractWithRules(originalReasoning);
        }

        return keyPoints;
      }

      throw new AgentError('keyPoints field not found in parsed AI response', {
        code: 'KEY_POINTS_PARSE_ERROR',
      });
    } catch (error) {
      logger.warn({ err: error }, 'Failed to parse AI response');
      // Fallback: extract from ORIGINAL reasoning, not AI response
      if (this.fallbackToRuleBased) {
        return this.extractWithRules(originalReasoning);
      }
      return [];
    }
  }

  /**
   * Rule-based fallback extraction (improved version)
   *
   * This is used when AI extraction is unavailable or fails.
   */
  private extractWithRules(reasoning: string): string[] {
    const keyPoints: string[] = [];

    // Try to extract TOP-LEVEL numbered points only (not indented sub-bullets)
    // Match: start of string or newline, NO leading whitespace, then number
    const topLevelMatches = reasoning.match(/(?:^|\n)(?:\d+[.):]\s*)([^\n]+)/g);
    if (topLevelMatches && topLevelMatches.length > 0) {
      for (const match of topLevelMatches.slice(0, this.maxKeyPoints)) {
        const cleaned = match.replace(/^[\n\s]*\d+[.):]\s*/, '').trim();
        if (cleaned.length > 10) {
          keyPoints.push(cleaned);
        }
      }
    }

    // Fallback: extract sentences (avoid splitting on decimal numbers)
    if (keyPoints.length === 0) {
      // Split on sentence endings that are NOT followed by a digit (to preserve decimals like 1.5)
      const sentences = reasoning
        .split(/(?<=[.!?])\s+(?=[A-Z가-힣])/)
        .filter((s) => s.trim().length > 20);

      for (const sentence of sentences.slice(0, this.maxKeyPoints)) {
        const cleaned = sentence.trim();
        if (cleaned.length > 10) {
          keyPoints.push(cleaned);
        }
      }
    }

    // Ensure we have at least something
    if (keyPoints.length === 0) {
      const truncated = reasoning.trim().slice(0, 200);
      keyPoints.push(truncated || 'No key points identified');
    }

    return keyPoints;
  }
}
