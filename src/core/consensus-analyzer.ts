/**
 * Consensus Analyzer - Analyzes agreement and disagreement in debate responses
 */

import type { AgentResponse, ConsensusResult } from '../types/index.js';

/**
 * Common English stop words for text analysis
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
 * Similarity threshold for clustering positions
 * 0.35 allows for similar positions with different vocabulary
 */
const SIMILARITY_THRESHOLD = 0.35;

/**
 * Negation words that reverse the sentiment/meaning
 */
const NEGATION_WORDS = new Set([
  'not',
  'no',
  'never',
  'neither',
  'nobody',
  'nothing',
  'nowhere',
  "don't",
  "doesn't",
  "didn't",
  "won't",
  "wouldn't",
  "shouldn't",
  "couldn't",
  'cannot',
  "can't",
  "isn't",
  "aren't",
  "wasn't",
  "weren't",
  'without',
  'lack',
  'lacking',
  'absent',
  'against',
  'oppose',
  'opposed',
  'opposing',
  'disagree',
  'reject',
  'deny',
  // Korean negation particles
  '않',
  '없',
  '못',
  '아니',
  '안',
]);

/**
 * Stance/opinion words that indicate position direction
 * These are universal across topics
 */
const STANCE_WORDS = new Set([
  // Positive stance
  'support',
  'favor',
  'agree',
  'recommend',
  'approve',
  'endorse',
  'advocate',
  'promote',
  'encourage',
  'beneficial',
  'positive',
  'good',
  'important',
  'necessary',
  'essential',
  // Negative stance
  'oppose',
  'against',
  'disagree',
  'reject',
  'disapprove',
  'harmful',
  'negative',
  'bad',
  'dangerous',
  'risky',
  'problematic',
  'unnecessary',
  // Korean stance words
  '찬성',
  '반대',
  '지지',
  '필요',
  '중요',
  '위험',
  '좋',
  '나쁘',
]);

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
        commonGround: [],
        disagreementPoints: [],
        summary: 'No responses to analyze',
      };
    }

    if (responses.length === 1) {
      const firstResponse = responses[0];
      return {
        agreementLevel: 1,
        commonGround: [firstResponse?.position ?? ''],
        disagreementPoints: [],
        summary: `Single response from ${firstResponse?.agentName ?? 'unknown'}`,
      };
    }

    // Calculate agreement level
    const agreementLevel = this.calculateAgreementLevel(responses);

    // Find common ground
    const commonGround = this.findCommonGround(responses);

    // Find disagreement points
    const disagreementPoints = this.findDisagreementPoints(responses);

    // Generate summary
    const summary = this.generateSummary(
      responses,
      agreementLevel,
      commonGround,
      disagreementPoints
    );

    return {
      agreementLevel,
      commonGround,
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
      confidences.reduce((sum, c) => sum + Math.pow(c - avgConfidence, 2), 0) / confidences.length;

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
   * Find common ground across responses
   *
   * @param responses - Agent responses
   * @returns Array of common themes/points
   */
  private findCommonGround(responses: AgentResponse[]): string[] {
    const commonGround: string[] = [];

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
        commonGround.push(`Common themes: ${commonKeywords.slice(0, 5).join(', ')}`);
      }

      // Add a representative position from the cluster
      const representativeResponse = largestCluster.reduce((highest, r) =>
        r.confidence > highest.confidence ? r : highest
      );
      const positionSummary =
        representativeResponse.position.length > 100
          ? representativeResponse.position.slice(0, 100) + '...'
          : representativeResponse.position;

      commonGround.push(
        `Consensus view (${largestCluster.length}/${responses.length} agents): ${positionSummary}`
      );
    } else {
      // No clear majority - find keywords that appear across multiple responses
      const positions = responses.map((r) => r.position.toLowerCase());
      const commonKeywords = this.extractCommonKeywords(positions);

      if (commonKeywords.length > 0) {
        commonGround.push(`Shared concepts: ${commonKeywords.slice(0, 5).join(', ')}`);
      } else {
        commonGround.push('Multiple perspectives on the topic');
      }
    }

    // Add high-confidence points as additional common ground
    const highConfidencePoints = this.extractHighConfidencePoints(responses);
    commonGround.push(...highConfidencePoints);

    return commonGround;
  }

  /**
   * Extract common keywords from positions
   *
   * @param positions - Array of position strings (already lowercased)
   * @returns Array of common keywords sorted by frequency
   */
  private extractCommonKeywords(positions: string[]): string[] {
    const wordFrequency = new Map<string, number>();

    for (const position of positions) {
      const words = position
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

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
      .map(
        (r) =>
          `${r.agentName} (${(r.confidence * 100).toFixed(0)}%): ${r.position.slice(0, 100)}${r.position.length > 100 ? '...' : ''}`
      );
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
        const avgConfidence = cluster.reduce((sum, r) => sum + r.confidence, 0) / cluster.length;

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
  private clusterPositionsBySimilarity(responses: AgentResponse[]): AgentResponse[][] {
    if (responses.length === 0) return [];
    if (responses.length === 1) return [responses];

    const clusters: AgentResponse[][] = [];
    const assigned = new Set<number>();

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

        const similarity = this.calculatePairwiseSimilarity(response1.position, response2.position);

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
   * Uses a multi-factor approach:
   * 1. Negation detection - opposite positions should have low similarity
   * 2. Weighted Jaccard - domain-relevant words count more
   * 3. Cosine-like similarity for better handling of different text lengths
   *
   * @param pos1 - First position
   * @param pos2 - Second position
   * @returns Similarity score from 0 to 1
   */
  private calculatePairwiseSimilarity(pos1: string, pos2: string): number {
    const words1 = this.extractNormalizedWords(pos1);
    const words2 = this.extractNormalizedWords(pos2);

    if (words1.length === 0 || words2.length === 0) return 0;

    // Step 1: Check for negation opposition
    // If one text has negation on key terms that the other asserts positively,
    // they are likely opposite positions
    const negationScore = this.calculateNegationScore(pos1, pos2);
    if (negationScore < 0) {
      // Negative score indicates opposition - return low similarity
      return Math.max(0, 0.2 + negationScore * 0.2);
    }

    // Step 2: Calculate Jaccard similarity (simple fallback)
    const jaccardSimilarity = this.calculateJaccardSimilarity(words1, words2);

    return Math.max(0, Math.min(1, jaccardSimilarity));
  }

  /**
   * Calculate negation score between two positions
   *
   * Detects if one position negates what the other asserts.
   * Returns negative value if positions are opposed, positive if aligned.
   *
   * @param pos1 - First position text
   * @param pos2 - Second position text
   * @returns Score from -1 (opposed) to 1 (aligned), 0 if neutral
   */
  private calculateNegationScore(pos1: string, pos2: string): number {
    const text1 = pos1.toLowerCase();
    const text2 = pos2.toLowerCase();

    // Extract key phrases (word + context window)
    const keyPhrases1 = this.extractKeyPhrasesWithNegation(text1);
    const keyPhrases2 = this.extractKeyPhrasesWithNegation(text2);

    let oppositionCount = 0;
    let alignmentCount = 0;

    // Check for opposition: same key term with different negation status
    for (const [term1, isNegated1] of keyPhrases1) {
      for (const [term2, isNegated2] of keyPhrases2) {
        // Check if terms are similar (simple substring or exact match)
        if (term1 === term2 || term1.includes(term2) || term2.includes(term1)) {
          if (isNegated1 !== isNegated2) {
            // One negated, one not - opposition
            oppositionCount++;
          } else {
            // Both negated or both positive - alignment
            alignmentCount++;
          }
        }
      }
    }

    if (oppositionCount + alignmentCount === 0) return 0;

    // Return score based on ratio
    return (alignmentCount - oppositionCount) / (alignmentCount + oppositionCount);
  }

  /**
   * Extract key phrases with negation context
   *
   * Focuses on stance words (support/oppose) and content words
   * to detect if positions are semantically opposed.
   *
   * @param text - Text to analyze
   * @returns Array of [key_term, is_negated] pairs
   */
  private extractKeyPhrasesWithNegation(text: string): Array<[string, boolean]> {
    const phrases: Array<[string, boolean]> = [];
    const words = text.split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i]?.toLowerCase().replace(/[^\w가-힣]/g, '') || '';
      if (!word || word.length < 3) continue;
      if (STOP_WORDS.has(word)) continue;

      // Focus on stance words - these indicate position direction
      const stemmed = this.stemWord(word);
      if (!STANCE_WORDS.has(word) && !STANCE_WORDS.has(stemmed)) {
        continue;
      }

      // Look for negation in window of 3 words before
      let isNegated = false;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const prevWord = words[j]?.toLowerCase().replace(/[^\w가-힣']/g, '') || '';
        if (NEGATION_WORDS.has(prevWord)) {
          isNegated = true;
          break;
        }
      }

      phrases.push([stemmed || word, isNegated]);
    }

    return phrases;
  }

  /**
   * Calculate Jaccard similarity between two word sets
   *
   * Simple fallback - AIConsensusAnalyzer handles semantic analysis.
   *
   * @param words1 - Normalized words from first position
   * @param words2 - Normalized words from second position
   * @returns Similarity score from 0 to 1
   */
  private calculateJaccardSimilarity(words1: string[], words2: string[]): number {
    const set1 = new Set(words1);
    const set2 = new Set(words2);

    const intersection = [...set1].filter((x) => set2.has(x));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;
    return intersection.length / union.size;
  }

  /**
   * Simple word stemming
   *
   * @param word - Word to stem
   * @returns Stemmed word
   */
  private stemWord(word: string): string {
    // Simple stemming: remove common suffixes
    let stemmed = word.toLowerCase();
    stemmed = stemmed.replace(/ing$/, '');
    stemmed = stemmed.replace(/ed$/, '');
    stemmed = stemmed.replace(/ies$/, 'y');
    stemmed = stemmed.replace(/es$/, '');
    stemmed = stemmed.replace(/s$/, '');
    return stemmed.length >= 2 ? stemmed : word;
  }

  /**
   * Generate a summary of the consensus analysis
   *
   * @param responses - Agent responses
   * @param agreementLevel - Calculated agreement level
   * @param commonGround - Common ground found
   * @param disagreementPoints - Disagreement points found
   * @returns Summary string
   */
  private generateSummary(
    responses: AgentResponse[],
    agreementLevel: number,
    commonGround: string[],
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

    if (commonGround.length > 0) {
      summary += `Key common ground identified. `;
    }

    if (disagreementPoints.length > 0) {
      summary += `Areas of disagreement noted.`;
    } else {
      summary += `No major disagreements.`;
    }

    return summary;
  }

  /**
   * Extract and normalize words from a position string
   *
   * Applies stop word filtering, stemming, and empty string removal.
   *
   * @param text - Position string to process
   * @returns Array of normalized words
   */
  private extractNormalizedWords(text: string): string[] {
    const normalizeWord = (word: string): string => {
      // Simple stemming: remove common suffixes
      // Order matters: 'es' before 's' to handle 'fixes' -> 'fix' correctly
      word = word.replace(/ing$/, ''); // replacing -> replac
      word = word.replace(/ed$/, ''); // replaced -> replac
      word = word.replace(/ies$/, 'y'); // families -> family
      word = word.replace(/es$/, ''); // fixes -> fix
      word = word.replace(/s$/, ''); // developers -> developer
      word = word.replace(/er$/, ''); // developer -> develop
      // Ensure word is still meaningful after stemming
      return word.length >= 2 ? word : '';
    };

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
      .map(normalizeWord)
      .filter((w) => w.length > 0);
  }
}

/**
 * Create a consensus analyzer instance
 */
export function createConsensusAnalyzer(): ConsensusAnalyzer {
  return new ConsensusAnalyzer();
}
