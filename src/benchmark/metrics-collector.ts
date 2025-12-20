/**
 * Metrics Collector
 *
 * Collects and aggregates metrics during debate execution for benchmark analysis.
 */

import type { AgentResponse } from '../types/index.js';
import type {
  BenchmarkMetrics,
  TimingEvent,
  CrossReference,
  MetricsCollectorConfig,
  LatencyMetrics,
  InteractionMetrics,
  ContentMetrics,
  ConsensusMetrics,
} from './types.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MetricsCollector');

// Default configuration values
const DEFAULT_GROUPTHINK_THRESHOLD = 0.9;
const DEFAULT_MIN_CONVERGENCE_ROUNDS = 2;

/**
 * MetricsCollector
 *
 * Tracks timing, interactions, and quality metrics during debate execution.
 * Use this class to collect data for benchmark comparison.
 */
export class MetricsCollector {
  private readonly config: Required<MetricsCollectorConfig>;
  private timingEvents: TimingEvent[] = [];
  private crossReferences: CrossReference[] = [];
  private responses: AgentResponse[] = [];
  private roundStartTime: number | null = null;
  private agentStartTimes: Map<string, number> = new Map();

  constructor(config: MetricsCollectorConfig) {
    this.config = {
      sessionId: config.sessionId,
      totalRounds: config.totalRounds,
      groupthinkThreshold: config.groupthinkThreshold ?? DEFAULT_GROUPTHINK_THRESHOLD,
      minConvergenceRounds: config.minConvergenceRounds ?? DEFAULT_MIN_CONVERGENCE_ROUNDS,
    };
  }

  // ============================================
  // Timing Methods
  // ============================================

  /**
   * Record the start of a round
   */
  recordRoundStart(round: number): void {
    this.roundStartTime = Date.now();
    this.timingEvents.push({
      type: 'round_start',
      timestamp: this.roundStartTime,
      round,
    });
    logger.debug({ round, sessionId: this.config.sessionId }, 'Round started');
  }

  /**
   * Record the end of a round
   */
  recordRoundEnd(round: number): void {
    const timestamp = Date.now();
    this.timingEvents.push({
      type: 'round_end',
      timestamp,
      round,
    });
    this.roundStartTime = null;
    logger.debug(
      { round, sessionId: this.config.sessionId, duration: this.getRoundDuration(round) },
      'Round ended'
    );
  }

  /**
   * Record the start of an agent's response generation
   */
  recordAgentStart(agentId: string, round: number): void {
    const timestamp = Date.now();
    this.agentStartTimes.set(`${round}-${agentId}`, timestamp);
    this.timingEvents.push({
      type: 'agent_start',
      timestamp,
      round,
      agentId,
    });
  }

  /**
   * Record the end of an agent's response generation
   */
  recordAgentEnd(agentId: string, round: number): void {
    const timestamp = Date.now();
    this.timingEvents.push({
      type: 'agent_end',
      timestamp,
      round,
      agentId,
    });
    this.agentStartTimes.delete(`${round}-${agentId}`);
  }

  // ============================================
  // Response Collection
  // ============================================

  /**
   * Record a response from an agent
   * Also analyzes for cross-references
   */
  recordResponse(response: AgentResponse, round: number): void {
    this.responses.push(response);

    // Analyze cross-references
    const references = this.detectCrossReferences(response, round);
    this.crossReferences.push(...references);
  }

  /**
   * Record multiple responses from a round
   */
  recordResponses(responses: AgentResponse[], round: number): void {
    for (const response of responses) {
      this.recordResponse(response, round);
    }
  }

  // ============================================
  // Metrics Calculation
  // ============================================

  /**
   * Get all collected metrics
   */
  getMetrics(): BenchmarkMetrics {
    return {
      latency: this.calculateLatencyMetrics(),
      interaction: this.calculateInteractionMetrics(),
      content: this.calculateContentMetrics(),
      consensus: this.calculateConsensusMetrics(),
    };
  }

  /**
   * Calculate latency metrics
   */
  calculateLatencyMetrics(): LatencyMetrics {
    const perRoundMs = this.calculatePerRoundLatency();
    const perAgentMs = this.calculatePerAgentLatency();
    const totalMs = perRoundMs.reduce((sum, ms) => sum + ms, 0);

    return {
      totalMs,
      perRoundMs,
      perAgentMs,
    };
  }

  /**
   * Calculate interaction metrics
   */
  calculateInteractionMetrics(): InteractionMetrics {
    return {
      crossReferenceCount: this.crossReferences.length,
      rebuttalDepth: this.calculateRebuttalDepth(),
      questionResponsePairs: this.calculateQuestionResponsePairs(),
    };
  }

  /**
   * Calculate content metrics
   */
  calculateContentMetrics(): ContentMetrics {
    const confidences = this.responses.map((r) => r.confidence);
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0;

    const confidenceVariance = this.calculateVariance(confidences, avgConfidence);
    const toolCallsPerAgent = this.calculateToolCallsPerAgent();
    const citationCount = this.responses.reduce(
      (sum, r) => sum + (r.citations?.length ?? 0),
      0
    );

    return {
      avgConfidence,
      confidenceVariance,
      toolCallsPerAgent,
      citationCount,
    };
  }

  /**
   * Calculate consensus metrics
   */
  calculateConsensusMetrics(): ConsensusMetrics {
    const agreementLevel = this.calculateAgreementLevel();
    const convergenceRound = this.detectConvergenceRound();
    const groupthinkWarning = this.detectGroupthink(agreementLevel, convergenceRound);

    return {
      agreementLevel,
      convergenceRound,
      groupthinkWarning,
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Calculate latency per round
   */
  private calculatePerRoundLatency(): number[] {
    const roundLatencies: number[] = [];
    const roundStarts = this.timingEvents.filter((e) => e.type === 'round_start');
    const roundEnds = this.timingEvents.filter((e) => e.type === 'round_end');

    for (let i = 0; i < roundStarts.length; i++) {
      const start = roundStarts[i];
      if (!start) continue;
      const end = roundEnds.find((e) => e.round === start.round);
      if (end) {
        roundLatencies.push(end.timestamp - start.timestamp);
      }
    }

    return roundLatencies;
  }

  /**
   * Calculate total latency per agent
   */
  private calculatePerAgentLatency(): Record<string, number> {
    const agentLatencies: Record<string, number> = {};
    const agentStarts = this.timingEvents.filter((e) => e.type === 'agent_start');
    const agentEnds = this.timingEvents.filter((e) => e.type === 'agent_end');

    for (const start of agentStarts) {
      if (!start.agentId) continue;

      const end = agentEnds.find(
        (e) => e.agentId === start.agentId && e.round === start.round
      );
      if (end) {
        const duration = end.timestamp - start.timestamp;
        agentLatencies[start.agentId] = (agentLatencies[start.agentId] ?? 0) + duration;
      }
    }

    return agentLatencies;
  }

  /**
   * Get duration of a specific round
   */
  private getRoundDuration(round: number): number | null {
    const start = this.timingEvents.find(
      (e) => e.type === 'round_start' && e.round === round
    );
    const end = this.timingEvents.find(
      (e) => e.type === 'round_end' && e.round === round
    );

    if (start && end) {
      return end.timestamp - start.timestamp;
    }
    return null;
  }

  /**
   * Detect cross-references in a response
   * Looks for mentions of other agents' names or explicit references
   */
  private detectCrossReferences(response: AgentResponse, round: number): CrossReference[] {
    const references: CrossReference[] = [];

    // Get all other agents' names from previous responses
    const otherAgents = new Map<string, string>();
    for (const r of this.responses) {
      if (r.agentId !== response.agentId) {
        otherAgents.set(r.agentId, r.agentName);
      }
    }

    // Search for references in position and reasoning
    const textToSearch = `${response.position} ${response.reasoning}`.toLowerCase();

    for (const [agentId, agentName] of otherAgents) {
      const nameLower = agentName.toLowerCase();
      if (textToSearch.includes(nameLower)) {
        references.push({
          sourceAgentId: response.agentId,
          targetAgentId: agentId,
          round,
        });
      }
    }

    // Also detect generic reference patterns
    const referencePatterns = [
      /previous (?:speaker|agent|participant)/gi,
      /(?:as|like) \w+ (?:mentioned|said|noted|argued)/gi,
      /agree(?:ing)? with/gi,
      /disagree(?:ing)? with/gi,
      /counter(?:ing)? the argument/gi,
      /respond(?:ing)? to/gi,
    ];

    for (const pattern of referencePatterns) {
      if (pattern.test(textToSearch)) {
        // If we can't identify specific target, count as reference to any previous agent
        const prevResponse = this.responses.find(
          (r) => r.agentId !== response.agentId
        );
        if (prevResponse) {
          // Avoid duplicate references
          const exists = references.some(
            (ref) =>
              ref.sourceAgentId === response.agentId &&
              ref.targetAgentId === prevResponse.agentId &&
              ref.round === round
          );
          if (!exists) {
            references.push({
              sourceAgentId: response.agentId,
              targetAgentId: prevResponse.agentId,
              round,
            });
          }
        }
        break;
      }
    }

    return references;
  }

  /**
   * Calculate rebuttal depth
   * Measures levels of argument-counterargument chains
   */
  private calculateRebuttalDepth(): number {
    // Group references by round to trace chains
    const referencesByRound = new Map<number, CrossReference[]>();
    for (const ref of this.crossReferences) {
      const refs = referencesByRound.get(ref.round) || [];
      refs.push(ref);
      referencesByRound.set(ref.round, refs);
    }

    // Count consecutive rounds with cross-references
    let maxDepth = 0;
    let currentDepth = 0;

    for (let round = 1; round <= this.config.totalRounds; round++) {
      const refs = referencesByRound.get(round) || [];
      if (refs.length > 0) {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else {
        currentDepth = 0;
      }
    }

    return maxDepth;
  }

  /**
   * Calculate question-response pairs (for socratic mode)
   * Looks for question marks and subsequent responses addressing them
   */
  private calculateQuestionResponsePairs(): number {
    let pairs = 0;
    const responsesByRound = this.groupResponsesByRound();

    for (let round = 1; round < this.config.totalRounds; round++) {
      const currentRoundResponses = responsesByRound.get(round) || [];
      const nextRoundResponses = responsesByRound.get(round + 1) || [];

      for (const response of currentRoundResponses) {
        // Count questions in this response
        const questionCount = (response.reasoning.match(/\?/g) || []).length;

        if (questionCount > 0 && nextRoundResponses.length > 0) {
          // Check if next round has responses that might address questions
          const hasAddressingResponse = nextRoundResponses.some(
            (r) =>
              r.agentId !== response.agentId &&
              this.crossReferences.some(
                (ref) =>
                  ref.sourceAgentId === r.agentId &&
                  ref.targetAgentId === response.agentId &&
                  ref.round === round + 1
              )
          );

          if (hasAddressingResponse) {
            pairs += Math.min(questionCount, 3); // Cap at 3 per response
          }
        }
      }
    }

    return pairs;
  }

  /**
   * Group responses by round number
   */
  private groupResponsesByRound(): Map<number, AgentResponse[]> {
    const grouped = new Map<number, AgentResponse[]>();

    // Determine round from timing events
    for (let i = 0; i < this.responses.length; i++) {
      // Estimate round based on response order
      const agentCount = this.getUniqueAgentCount();
      const round = agentCount > 0 ? Math.floor(i / agentCount) + 1 : 1;
      const response = this.responses[i];
      if (!response) continue;

      const responses = grouped.get(round) || [];
      responses.push(response);
      grouped.set(round, responses);
    }

    return grouped;
  }

  /**
   * Get unique agent count
   */
  private getUniqueAgentCount(): number {
    const agentIds = new Set(this.responses.map((r) => r.agentId));
    return agentIds.size;
  }

  /**
   * Calculate variance
   */
  private calculateVariance(values: number[], mean: number): number {
    if (values.length === 0) return 0;

    const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((sum, d) => sum + d, 0) / values.length;
  }

  /**
   * Calculate tool calls per agent
   */
  private calculateToolCallsPerAgent(): Record<string, number> {
    const toolCalls: Record<string, number> = {};

    for (const response of this.responses) {
      const count = response.toolCalls?.length ?? 0;
      toolCalls[response.agentId] = (toolCalls[response.agentId] ?? 0) + count;
    }

    return toolCalls;
  }

  /**
   * Calculate agreement level based on position similarity
   * This is a simplified calculation; real implementation would use AI analysis
   */
  private calculateAgreementLevel(): number {
    if (this.responses.length === 0) return 0;

    // Get last round responses
    const responsesByRound = this.groupResponsesByRound();
    const lastRound = Math.max(...responsesByRound.keys());
    const lastRoundResponses = responsesByRound.get(lastRound) || [];

    if (lastRoundResponses.length <= 1) return 1;

    // Compare confidence levels as proxy for agreement
    const avgConfidence =
      lastRoundResponses.reduce((sum, r) => sum + r.confidence, 0) /
      lastRoundResponses.length;

    // Check if positions converge (simplified check using keywords)
    const positions = lastRoundResponses.map((r) => r.position.toLowerCase());
    const commonKeywords = this.findCommonKeywords(positions);
    const firstPosition = positions[0] ?? '';
    const keywordOverlap =
      commonKeywords.length / Math.max(1, this.extractKeywords(firstPosition).length);

    // Weighted combination
    return Math.min(1, avgConfidence * 0.4 + keywordOverlap * 0.6);
  }

  /**
   * Find common keywords across positions
   */
  private findCommonKeywords(positions: string[]): string[] {
    if (positions.length === 0) return [];

    const keywordSets = positions.map((p) => new Set(this.extractKeywords(p)));
    const firstSet = keywordSets[0];
    if (!firstSet) return [];

    return Array.from(firstSet).filter((keyword) =>
      keywordSets.every((set) => set.has(keyword))
    );
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
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
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'ought',
      'used',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
      'and',
      'but',
      'or',
      'nor',
      'so',
      'yet',
      'both',
      'either',
      'neither',
      'not',
      'only',
      'own',
      'same',
      'than',
      'too',
      'very',
      'just',
      'also',
      'now',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'any',
      'some',
      'no',
      'more',
      'most',
      'other',
      'such',
      'this',
      'that',
      'these',
      'those',
      'i',
      'we',
      'you',
      'he',
      'she',
      'it',
      'they',
      'what',
      'which',
      'who',
      'whom',
    ]);

    return text
      .split(/\s+/)
      .map((word) => word.replace(/[^a-z]/g, ''))
      .filter((word) => word.length > 3 && !stopWords.has(word));
  }

  /**
   * Detect convergence round
   * Returns the round where positions stabilized
   */
  private detectConvergenceRound(): number | null {
    const responsesByRound = this.groupResponsesByRound();
    const rounds = Array.from(responsesByRound.keys()).sort((a, b) => a - b);

    if (rounds.length < this.config.minConvergenceRounds) {
      return null;
    }

    // Check for stability in confidence and position similarity
    for (let i = this.config.minConvergenceRounds - 1; i < rounds.length; i++) {
      const currentRound = rounds[i];
      const previousRound = rounds[i - 1];
      if (currentRound === undefined || previousRound === undefined) continue;

      const currentResponses = responsesByRound.get(currentRound) || [];
      const previousResponses = responsesByRound.get(previousRound) || [];

      if (currentResponses.length === 0 || previousResponses.length === 0) {
        continue;
      }

      // Check if confidence changed significantly
      const currentAvgConf =
        currentResponses.reduce((sum, r) => sum + r.confidence, 0) /
        currentResponses.length;
      const previousAvgConf =
        previousResponses.reduce((sum, r) => sum + r.confidence, 0) /
        previousResponses.length;

      const confidenceStable = Math.abs(currentAvgConf - previousAvgConf) < 0.1;

      // Check if positions are similar
      const currentKeywords = new Set(
        currentResponses.flatMap((r) => this.extractKeywords(r.position.toLowerCase()))
      );
      const previousKeywords = new Set(
        previousResponses.flatMap((r) => this.extractKeywords(r.position.toLowerCase()))
      );

      const intersection = new Set(
        [...currentKeywords].filter((k) => previousKeywords.has(k))
      );
      const union = new Set([...currentKeywords, ...previousKeywords]);
      const jaccard = union.size > 0 ? intersection.size / union.size : 0;

      const positionsStable = jaccard > 0.7;

      if (confidenceStable && positionsStable) {
        return currentRound;
      }
    }

    return null;
  }

  /**
   * Detect potential groupthink
   */
  private detectGroupthink(agreementLevel: number, convergenceRound: number | null): boolean {
    // High agreement very early may indicate groupthink
    if (convergenceRound !== null && convergenceRound <= 1) {
      return agreementLevel >= this.config.groupthinkThreshold;
    }

    // Very high agreement without evidence of debate
    if (agreementLevel >= this.config.groupthinkThreshold) {
      // Check if there was meaningful back-and-forth
      const hasDebate = this.crossReferences.length > 0 || this.calculateRebuttalDepth() > 0;
      return !hasDebate;
    }

    return false;
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Reset all collected data
   */
  reset(): void {
    this.timingEvents = [];
    this.crossReferences = [];
    this.responses = [];
    this.roundStartTime = null;
    this.agentStartTimes.clear();
  }

  /**
   * Get all collected responses
   */
  getResponses(): AgentResponse[] {
    return [...this.responses];
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.config.sessionId;
  }
}
