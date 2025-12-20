/**
 * Groupthink Detector - Warns when agents reach consensus too easily
 *
 * Detects potential groupthink by analyzing:
 * 1. High confidence agreement - All agents have high confidence (>=80%)
 * 2. No dissenting stances - All agents have the same stance
 * 3. Position similarity - Positions are too similar (keyword overlap)
 */

import type { AgentResponse, GroupthinkWarning } from '../types/index.js';

/**
 * Minimum number of indicators required to trigger groupthink detection
 */
const GROUPTHINK_THRESHOLD = 2;

/**
 * Confidence threshold for high confidence detection
 */
const HIGH_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Average confidence threshold for high confidence indicator
 */
const AVG_CONFIDENCE_THRESHOLD = 0.85;

/**
 * Position similarity threshold (Jaccard coefficient)
 * Higher value means stricter similarity detection
 */
const POSITION_SIMILARITY_THRESHOLD = 0.5;

/**
 * Common English stop words for position similarity analysis
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'must',
  'can',
  'this',
  'that',
  'these',
  'those',
  'not',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
]);

/**
 * Detect potential groupthink in agent responses
 *
 * Groupthink is detected when at least 2 of the following indicators are present:
 * 1. All agents have high confidence (>=80%) with average >=85%
 * 2. All agents have the same stance (when stances are present)
 * 3. Position similarity is too high across all agents
 *
 * @param responses - Array of agent responses to analyze
 * @returns GroupthinkWarning with detection result, indicators, and recommendation
 */
export function detectGroupthink(responses: AgentResponse[]): GroupthinkWarning {
  // Handle edge cases
  if (responses.length === 0) {
    return {
      detected: false,
      indicators: [],
      recommendation: '',
    };
  }

  if (responses.length === 1) {
    return {
      detected: false,
      indicators: [],
      recommendation: '',
    };
  }

  const indicators: string[] = [];

  // Check 1: All agents have high confidence (>=80%) with average >=85%
  const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;
  const allHighConfidence = responses.every((r) => r.confidence >= HIGH_CONFIDENCE_THRESHOLD);
  if (allHighConfidence && avgConfidence >= AVG_CONFIDENCE_THRESHOLD) {
    indicators.push('All agents show high confidence (>=80%)');
  }

  // Check 2: No dissenting positions (all stances the same)
  const stances = responses.map((r) => r.stance).filter(Boolean);
  if (stances.length > 0) {
    const uniqueStances = new Set(stances);
    if (uniqueStances.size === 1) {
      indicators.push('No dissenting stances detected');
    }
  }

  // Check 3: Position similarity too high
  const positionSimilarityHigh = checkPositionSimilarity(responses);
  if (positionSimilarityHigh) {
    indicators.push('Position similarity is unusually high');
  }

  const detected = indicators.length >= GROUPTHINK_THRESHOLD;
  const recommendation = detected
    ? "Consider additional rounds with devil's advocate role or manual review"
    : '';

  return {
    detected,
    indicators,
    recommendation,
  };
}

/**
 * Check if position similarity across all responses is too high
 *
 * Uses pairwise Jaccard similarity to detect overly similar positions.
 * Returns true if average pairwise similarity exceeds threshold.
 *
 * @param responses - Array of agent responses
 * @returns true if positions are suspiciously similar
 */
function checkPositionSimilarity(responses: AgentResponse[]): boolean {
  if (responses.length < 2) {
    return false;
  }

  // Extract normalized words from each position
  const wordSets = responses.map((r) => extractWords(r.position));

  // Calculate pairwise Jaccard similarities
  let totalSimilarity = 0;
  let pairCount = 0;

  for (let i = 0; i < wordSets.length; i++) {
    for (let j = i + 1; j < wordSets.length; j++) {
      const set1 = wordSets[i];
      const set2 = wordSets[j];

      if (set1 && set2) {
        const similarity = calculateJaccardSimilarity(set1, set2);
        totalSimilarity += similarity;
        pairCount++;
      }
    }
  }

  if (pairCount === 0) {
    return false;
  }

  const avgSimilarity = totalSimilarity / pairCount;
  return avgSimilarity >= POSITION_SIMILARITY_THRESHOLD;
}

/**
 * Extract normalized words from text
 *
 * Removes punctuation, converts to lowercase, filters stop words,
 * and filters words shorter than 4 characters.
 *
 * @param text - Text to process
 * @returns Set of normalized words
 */
function extractWords(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));

  return new Set(words);
}

/**
 * Calculate Jaccard similarity between two word sets
 *
 * Jaccard coefficient = |intersection| / |union|
 *
 * @param set1 - First word set
 * @param set2 - Second word set
 * @returns Similarity score from 0 to 1
 */
function calculateJaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) {
    return 1; // Both empty = identical
  }

  if (set1.size === 0 || set2.size === 0) {
    return 0;
  }

  const intersection = [...set1].filter((x) => set2.has(x));
  const union = new Set([...set1, ...set2]);

  return intersection.length / union.size;
}
