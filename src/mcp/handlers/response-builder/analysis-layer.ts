/**
 * Analysis layer utilities for roundtable response building
 *
 * Provides key point extraction and conflict detection
 * from agent responses.
 */

import type { AgentResponse } from '../../../types/index.js';

/**
 * Extract 2-3 key points from full reasoning
 */
export function extractKeyPoints(reasoning: string): string[] {
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
export function detectConflicts(
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
