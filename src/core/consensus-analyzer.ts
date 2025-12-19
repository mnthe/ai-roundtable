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
   * Uses a clustering-based approach:
   * - Single cluster = high agreement
   * - Multiple clusters = lower agreement based on cluster sizes
   * - Confidence variance affects the score within clusters
   *
   * @param responses - Agent responses
   * @returns Agreement level from 0 to 1
   */
  private calculateAgreementLevel(responses: AgentResponse[]): number {
    if (responses.length === 0) return 0;
    if (responses.length === 1) return 1;

    // Calculate confidence variance component
    const confidences = responses.map((r) => r.confidence);
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const variance =
      confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) /
      confidences.length;

    // Lower variance = higher agreement (normalize with max variance of 0.25)
    const confidenceScore = Math.max(0, 1 - variance / 0.25);

    // Cluster responses by position similarity
    const clusters = this.clusterPositionsBySimilarity(responses);

    // Calculate position agreement based on clustering
    let positionScore: number;
    if (clusters.length === 1) {
      // All responses in one cluster - high agreement
      positionScore = 1.0;
    } else if (clusters.length === responses.length) {
      // Each response in its own cluster - no agreement
      positionScore = 0.0;
    } else {
      // Partial clustering - score based on largest cluster size
      const largestCluster = clusters.reduce(
        (max, cluster) => (cluster.length > max.length ? cluster : max),
        clusters[0] || []
      );
      // Score = proportion in largest cluster
      positionScore = largestCluster.length / responses.length;
    }

    // Combine scores: Position similarity is primary (70%), confidence is secondary (30%)
    // Position similarity matters more for determining agreement
    const agreementLevel = 0.7 * positionScore + 0.3 * confidenceScore;

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
    const commonPoints: string[] = [];

    // Cluster positions by similarity
    const clusters = this.clusterPositionsBySimilarity(responses);

    // If there's a dominant cluster (contains majority of responses), extract common themes
    const largestCluster = clusters.reduce(
      (max, cluster) => (cluster.length > max.length ? cluster : max),
      clusters[0] || []
    );

    const majorityThreshold = Math.ceil(responses.length / 2);
    if (largestCluster.length >= majorityThreshold) {
      // Extract common keywords from the largest cluster
      const positions = largestCluster.map((r) => r.position.toLowerCase());
      const commonKeywords = this.extractCommonKeywords(positions);

      if (commonKeywords.length > 0) {
        commonPoints.push(`Common themes: ${commonKeywords.slice(0, 5).join(', ')}`);
      }

      // Add a representative position from the cluster
      const representativeResponse = largestCluster.reduce((highest, r) =>
        r.confidence > highest.confidence ? r : highest
      );
      const positionSummary =
        representativeResponse.position.length > 100
          ? representativeResponse.position.slice(0, 100) + '...'
          : representativeResponse.position;

      commonPoints.push(
        `Consensus view (${largestCluster.length}/${responses.length} agents): ${positionSummary}`
      );
    } else {
      // No clear majority - find keywords that appear across multiple responses
      const positions = responses.map((r) => r.position.toLowerCase());
      const commonKeywords = this.extractCommonKeywords(positions);

      if (commonKeywords.length > 0) {
        commonPoints.push(`Shared concepts: ${commonKeywords.slice(0, 5).join(', ')}`);
      } else {
        commonPoints.push('Multiple perspectives on the topic');
      }
    }

    // Add high-confidence points as additional common points
    const highConfidencePoints = this.extractHighConfidencePoints(responses);
    commonPoints.push(...highConfidencePoints);

    return commonPoints;
  }

  /**
   * Extract common keywords from positions
   *
   * @param positions - Array of position strings (already lowercased)
   * @returns Array of common keywords sorted by frequency
   */
  private extractCommonKeywords(positions: string[]): string[] {
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
      'not',
    ]);

    for (const position of positions) {
      const words = position
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w));

      // Use Set to count each word only once per position
      const uniqueWords = new Set(words);
      for (const word of uniqueWords) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }
    }

    // Find words that appear in at least half of responses
    const threshold = Math.ceil(positions.length / 2);
    const commonWords = Array.from(wordFrequency.entries())
      .filter(([_, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);

    return commonWords;
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
   * Find disagreement points by comparing position semantics
   *
   * @param responses - Agent responses
   * @returns Array of disagreement themes
   */
  private findDisagreementPoints(responses: AgentResponse[]): string[] {
    const disagreements: string[] = [];

    // If only one or two responses, check for low confidence
    if (responses.length <= 2) {
      const uncertainResponses = responses.filter((r) => r.confidence < 0.5);
      if (uncertainResponses.length > 0) {
        disagreements.push(
          `${uncertainResponses.length} agent(s) expressed uncertainty (confidence < 50%)`
        );
      }
      return disagreements;
    }

    // Identify semantic position clusters using pairwise similarity
    const clusters = this.clusterPositionsBySimilarity(responses);

    // If we have multiple distinct clusters, there's disagreement
    if (clusters.length > 1) {
      // Describe each cluster's position
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];
        if (!cluster || cluster.length === 0) continue;

        const agentNames = cluster.map((r) => r.agentName).join(', ');
        const avgConfidence =
          cluster.reduce((sum, r) => sum + r.confidence, 0) / cluster.length;

        // Extract key position summary from the first response in cluster
        const firstResponse = cluster[0];
        if (!firstResponse) continue;
        const positionSummary =
          firstResponse.position.length > 80
            ? firstResponse.position.slice(0, 80) + '...'
            : firstResponse.position;

        disagreements.push(
          `Position ${i + 1} (${agentNames}, avg confidence: ${(avgConfidence * 100).toFixed(0)}%): ${positionSummary}`
        );
      }
    } else {
      // Single cluster - check for low confidence or uncertainty
      const uncertainResponses = responses.filter((r) => r.confidence < 0.5);
      if (uncertainResponses.length > 0) {
        disagreements.push(
          `${uncertainResponses.length} agent(s) expressed uncertainty despite similar positions`
        );
      }

      // Check for confidence variance within the cluster
      const confidences = responses.map((r) => r.confidence);
      const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
      const variance =
        confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) /
        confidences.length;

      if (variance > 0.1) {
        const outliers = responses.filter((r) => Math.abs(r.confidence - avgConfidence) > 0.25);
        if (outliers.length > 0) {
          disagreements.push(
            `Divergent confidence levels: ${outliers.map((r) => `${r.agentName} (${(r.confidence * 100).toFixed(0)}%)`).join(', ')}`
          );
        }
      }
    }

    return disagreements;
  }

  /**
   * Cluster responses by position similarity
   *
   * Uses a simple greedy clustering algorithm based on semantic similarity
   *
   * @param responses - Agent responses
   * @returns Array of response clusters
   */
  private clusterPositionsBySimilarity(
    responses: AgentResponse[]
  ): AgentResponse[][] {
    if (responses.length === 0) return [];
    if (responses.length === 1) return [responses];

    const clusters: AgentResponse[][] = [];
    const assigned = new Set<number>();

    // Similarity threshold for considering positions as similar
    // 0.35 allows for similar positions with different vocabulary
    const SIMILARITY_THRESHOLD = 0.35;

    for (let i = 0; i < responses.length; i++) {
      if (assigned.has(i)) continue;

      const response1 = responses[i];
      if (!response1) continue;

      const cluster: AgentResponse[] = [response1];
      assigned.add(i);

      // Find similar responses
      for (let j = i + 1; j < responses.length; j++) {
        if (assigned.has(j)) continue;

        const response2 = responses[j];
        if (!response2) continue;

        const similarity = this.calculatePairwiseSimilarity(
          response1.position,
          response2.position
        );

        if (similarity >= SIMILARITY_THRESHOLD) {
          cluster.push(response2);
          assigned.add(j);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Calculate similarity between two position strings
   *
   * Uses Jaccard similarity coefficient on word sets with basic stemming
   *
   * @param pos1 - First position
   * @param pos2 - Second position
   * @returns Similarity score from 0 to 1
   */
  private calculatePairwiseSimilarity(pos1: string, pos2: string): number {
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

    const normalizeWord = (word: string): string => {
      // Simple stemming: remove common suffixes
      word = word.replace(/ing$/, ''); // replacing -> replac
      word = word.replace(/ed$/, ''); // replaced -> replac
      word = word.replace(/s$/, ''); // developers -> developer
      word = word.replace(/es$/, ''); // fixes -> fix
      word = word.replace(/er$/, ''); // developer -> develop
      return word;
    };

    const words1 = pos1
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w))
      .map(normalizeWord);

    const words2 = pos2
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !stopWords.has(w))
      .map(normalizeWord);

    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;

    return intersection.size / union.size;
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
