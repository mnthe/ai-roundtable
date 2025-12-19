/**
 * Consensus Analyzer - Analyzes agreement and disagreement in debate responses
 */

import type { AgentResponse, ConsensusResult } from '../types/index.js';

/**
 * Analyze consensus among agent responses
 *
 * This is a basic implementation that:
 * - Calculates agreement level based on confidence variance
 * - Identifies common themes in positions
 * - Identifies disagreement points
 * - Generates a summary
 *
 * Future enhancements could include:
 * - NLP-based semantic similarity
 * - Topic modeling for common themes
 * - More sophisticated agreement metrics
 */
export class ConsensusAnalyzer {
  /**
   * Analyze consensus from a set of agent responses
   *
   * @param responses - Array of agent responses to analyze
   * @returns ConsensusResult with agreement metrics and points
   */
  analyzeConsensus(responses: AgentResponse[]): ConsensusResult {
    if (responses.length === 0) {
      return {
        agreementLevel: 0,
        commonPoints: [],
        disagreementPoints: [],
        summary: 'No responses to analyze',
      };
    }

    if (responses.length === 1) {
      const firstResponse = responses[0];
      return {
        agreementLevel: 1,
        commonPoints: [firstResponse?.position ?? ''],
        disagreementPoints: [],
        summary: `Single response from ${firstResponse?.agentName ?? 'unknown'}`,
      };
    }

    // Calculate agreement level
    const agreementLevel = this.calculateAgreementLevel(responses);

    // Find common points
    const commonPoints = this.findCommonPoints(responses);

    // Find disagreement points
    const disagreementPoints = this.findDisagreementPoints(responses);

    // Generate summary
    const summary = this.generateSummary(
      responses,
      agreementLevel,
      commonPoints,
      disagreementPoints
    );

    return {
      agreementLevel,
      commonPoints,
      disagreementPoints,
      summary,
    };
  }

  /**
   * Calculate agreement level based on confidence variance and position similarity
   *
   * Uses a simple heuristic:
   * - Lower confidence variance = higher agreement
   * - Position keyword overlap = higher agreement
   *
   * @param responses - Agent responses
   * @returns Agreement level from 0 to 1
   */
  private calculateAgreementLevel(responses: AgentResponse[]): number {
    // Calculate confidence variance component
    const confidences = responses.map((r) => r.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance =
      confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) /
      confidences.length;

    // Lower variance = higher agreement
    // Normalize variance (assume max reasonable variance is 0.25)
    const confidenceScore = Math.max(0, 1 - variance / 0.25);

    // Calculate position similarity component
    const positions = responses.map((r) => r.position.toLowerCase());
    const positionScore = this.calculatePositionSimilarity(positions);

    // Combine scores (weighted average)
    const agreementLevel = 0.4 * confidenceScore + 0.6 * positionScore;

    return Math.max(0, Math.min(1, agreementLevel));
  }

  /**
   * Calculate similarity between positions using keyword overlap
   *
   * @param positions - Array of position strings
   * @returns Similarity score from 0 to 1
   */
  private calculatePositionSimilarity(positions: string[]): number {
    // Extract keywords (simple word-based approach)
    const stopWords = new Set([
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
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
    ]);

    const keywordSets = positions.map((pos) => {
      const words = pos
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w));
      return new Set(words);
    });

    // Calculate pairwise overlaps
    let totalOverlap = 0;
    let comparisons = 0;

    for (let i = 0; i < keywordSets.length; i++) {
      for (let j = i + 1; j < keywordSets.length; j++) {
        const set1 = keywordSets[i];
        const set2 = keywordSets[j];
        if (!set1 || !set2) continue;
        const intersection = new Set([...set1].filter((x) => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        if (union.size > 0) {
          totalOverlap += intersection.size / union.size;
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? totalOverlap / comparisons : 0;
  }

  /**
   * Find common points across responses
   *
   * @param responses - Agent responses
   * @returns Array of common themes/points
   */
  private findCommonPoints(responses: AgentResponse[]): string[] {
    const positions = responses.map((r) => r.position.toLowerCase());

    // Find common keywords
    const wordFrequency = new Map<string, number>();
    const stopWords = new Set([
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
    ]);

    for (const position of positions) {
      const words = position
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w));

      for (const word of words) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }
    }

    // Find words that appear in at least half of responses
    const threshold = Math.ceil(responses.length / 2);
    const commonWords = Array.from(wordFrequency.entries())
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);

    if (commonWords.length === 0) {
      return ['Multiple perspectives on the topic'];
    }

    return [
      `Common themes: ${commonWords.join(', ')}`,
      ...this.extractHighConfidencePoints(responses),
    ];
  }

  /**
   * Extract points where agents have high confidence
   *
   * @param responses - Agent responses
   * @returns Array of high-confidence points
   */
  private extractHighConfidencePoints(responses: AgentResponse[]): string[] {
    return responses
      .filter((r) => r.confidence >= 0.8)
      .slice(0, 2)
      .map((r) => `${r.agentName} (${(r.confidence * 100).toFixed(0)}%): ${r.position.slice(0, 100)}${r.position.length > 100 ? '...' : ''}`);
  }

  /**
   * Find disagreement points
   *
   * @param responses - Agent responses
   * @returns Array of disagreement themes
   */
  private findDisagreementPoints(responses: AgentResponse[]): string[] {
    const disagreements: string[] = [];

    // Identify low confidence responses (uncertainty)
    const uncertainResponses = responses.filter((r) => r.confidence < 0.5);
    if (uncertainResponses.length > 0) {
      disagreements.push(
        `${uncertainResponses.length} agent(s) expressed uncertainty (confidence < 50%)`
      );
    }

    // Identify outlier positions (simple approach: very different confidence levels)
    const confidences = responses.map((r) => r.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const outliers = responses.filter((r) => Math.abs(r.confidence - avgConfidence) > 0.3);

    if (outliers.length > 0) {
      disagreements.push(
        `Divergent confidence levels: ${outliers.map((r) => `${r.agentName} (${(r.confidence * 100).toFixed(0)}%)`).join(', ')}`
      );
    }

    // If no specific disagreements found but agreement level is low
    if (disagreements.length === 0 && this.calculateAgreementLevel(responses) < 0.5) {
      disagreements.push('Agents provided diverse perspectives with limited overlap');
    }

    return disagreements;
  }

  /**
   * Generate a summary of the consensus analysis
   *
   * @param responses - Agent responses
   * @param agreementLevel - Calculated agreement level
   * @param commonPoints - Common points found
   * @param disagreementPoints - Disagreement points found
   * @returns Summary string
   */
  private generateSummary(
    responses: AgentResponse[],
    agreementLevel: number,
    commonPoints: string[],
    disagreementPoints: string[]
  ): string {
    const agentNames = responses.map((r) => r.agentName).join(', ');
    const agreementPct = (agreementLevel * 100).toFixed(0);

    let summary = `Analysis of ${responses.length} responses from ${agentNames}. `;

    if (agreementLevel >= 0.8) {
      summary += `Strong consensus (${agreementPct}% agreement). `;
    } else if (agreementLevel >= 0.6) {
      summary += `Moderate consensus (${agreementPct}% agreement). `;
    } else if (agreementLevel >= 0.4) {
      summary += `Partial agreement (${agreementPct}% agreement). `;
    } else {
      summary += `Diverse perspectives (${agreementPct}% agreement). `;
    }

    if (commonPoints.length > 0) {
      summary += `Key common points identified. `;
    }

    if (disagreementPoints.length > 0) {
      summary += `Areas of disagreement noted.`;
    } else {
      summary += `No major disagreements.`;
    }

    return summary;
  }
}

/**
 * Create a consensus analyzer instance
 */
export function createConsensusAnalyzer(): ConsensusAnalyzer {
  return new ConsensusAnalyzer();
}
