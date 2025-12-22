/**
 * JSON Parser Utilities for LLM Responses
 *
 * Provides robust JSON parsing strategies for AI model outputs,
 * handling common issues like markdown formatting, truncated responses,
 * and malformed JSON.
 */

import { jsonrepair } from 'jsonrepair';
import { parse as parsePartialJson, Allow } from 'partial-json';
import type { AIConsensusResult } from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('JsonParser');

/**
 * Allowed partial JSON parsing flags for LLM responses
 * Allows incomplete strings, arrays, and objects
 */
const PARTIAL_JSON_ALLOW = Allow.STR | Allow.ARR | Allow.OBJ;

/**
 * Options for parsing AI consensus responses
 */
export interface ParseOptions {
  /** Identifier for the analyzer agent */
  analyzerId: string;
}

/**
 * Clean LLM response by removing markdown formatting and extracting JSON content
 *
 * Handles:
 * - Complete markdown code fences: ```json ... ```
 * - Incomplete markdown code fences (truncated): ```json ...
 * - Leading text before JSON object
 */
export function cleanLLMResponse(rawResponse: string): string {
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
 * Safely extract a number from potentially partial data
 */
export function extractNumber(value: unknown): number | null {
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
export function extractStringArray(value: unknown): string[] {
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
export function extractClusters(
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
      agentIds: extractStringArray(item.agentIds),
      summary: String(item.summary || ''),
    }))
    .filter((c) => c.agentIds.length > 0);

  return clusters.length > 0 ? clusters : undefined;
}

/**
 * Safely extract nuances from potentially partial data
 */
export function extractNuances(value: unknown): AIConsensusResult['nuances'] {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  const nuances = {
    partialAgreements: extractStringArray(v.partialAgreements),
    conditionalPositions: extractStringArray(v.conditionalPositions),
    uncertainties: extractStringArray(v.uncertainties),
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
 * Safely extract groupthink warning from AI response
 */
export function extractGroupthinkWarning(
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
 * Extract agreementLevel from text using regex (last resort)
 */
export function extractAgreementLevelFromText(text: string): number | null {
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
export function extractSummaryFromText(text: string): string | null {
  // Look for "summary": "..." pattern
  const match = text.match(/"summary"\s*:\s*"([^"]+)/);
  return match?.[1] || null;
}

/**
 * Parse truncated/partial JSON using partial-json library
 */
export function parsePartialJsonResponse(
  json: string,
  analyzerId: string
): AIConsensusResult | null {
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
  const agreementLevel = extractNumber(parsed.agreementLevel);
  if (agreementLevel === null) {
    return null;
  }

  return {
    agreementLevel: Math.max(0, Math.min(1, agreementLevel)),
    commonGround: extractStringArray(parsed.commonGround),
    disagreementPoints: extractStringArray(parsed.disagreementPoints),
    summary: String(parsed.summary || 'Partial analysis'),
    clusters: extractClusters(parsed.clusters),
    nuances: extractNuances(parsed.nuances),
    groupthinkWarning: extractGroupthinkWarning(parsed.groupthinkWarning),
    reasoning: String(parsed.reasoning || 'Parsed from partial response'),
    analyzerId,
  };
}

/**
 * Parse JSON string into AIConsensusResult
 * Uses jsonrepair to handle malformed JSON from AI models
 */
export function parseJsonToResult(json: string, analyzerId: string): AIConsensusResult {
  // Clean up common issues before repair
  const cleanedJson = json
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
    disagreementPoints: Array.isArray(parsed.disagreementPoints) ? parsed.disagreementPoints : [],
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
    groupthinkWarning: extractGroupthinkWarning(parsed.groupthinkWarning),
    reasoning: String(parsed.reasoning || ''),
    analyzerId,
  };
}

/**
 * Parse raw AI response string into AIConsensusResult
 *
 * Uses multiple strategies to handle various LLM output formats:
 * 1. Strip markdown code fences (complete or incomplete)
 * 2. Try jsonrepair for malformed JSON
 * 3. Try partial-json for truncated responses
 * 4. Extract key fields even from partial data
 *
 * @param rawResponse - Raw string response from AI model
 * @param options - Parsing options including analyzer ID
 * @returns Parsed AIConsensusResult
 */
export function parseAIConsensusResponse(
  rawResponse: string,
  options: ParseOptions
): AIConsensusResult {
  const { analyzerId } = options;
  const cleanedResponse = cleanLLMResponse(rawResponse);

  // Strategy 1: Try standard JSON parsing with jsonrepair
  try {
    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return parseJsonToResult(jsonMatch[0], analyzerId);
    }
  } catch (error) {
    logger.debug({ err: error, strategy: 'jsonrepair' }, 'jsonrepair failed, trying partial-json');
  }

  // Strategy 2: Try partial-json for truncated responses
  try {
    const partialResult = parsePartialJsonResponse(cleanedResponse, analyzerId);
    if (partialResult) {
      logger.info(
        { analyzerId, agreementLevel: partialResult.agreementLevel },
        'Successfully parsed partial JSON response'
      );
      return partialResult;
    }
  } catch (error) {
    logger.debug({ err: error, strategy: 'partial-json' }, 'partial-json failed, using fallback');
  }

  // Strategy 3: Extract agreementLevel with regex as last resort
  const extractedLevel = extractAgreementLevelFromText(cleanedResponse);
  const extractedSummary = extractSummaryFromText(cleanedResponse);

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
