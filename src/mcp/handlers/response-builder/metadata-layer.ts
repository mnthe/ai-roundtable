/**
 * Metadata layer utilities for roundtable response building
 *
 * Provides verification hints and metadata generation
 * for quality assessment.
 */

import { RESPONSE_CONFIG } from '../../../config/response.js';
import type { AgentResponse } from '../../../types/index.js';

const { thresholds } = RESPONSE_CONFIG;

export function buildVerificationHints(
  responses: AgentResponse[],
  _sessionId: string
): { field: string; reason: string; suggestedTool: string }[] {
  const hints: { field: string; reason: string; suggestedTool: string }[] = [];

  const lowConfidenceAgents = responses.filter((r) => r.confidence < thresholds.lowConfidence);
  if (lowConfidenceAgents.length > 0) {
    hints.push({
      field: 'Agent confidence',
      reason: `${lowConfidenceAgents.length} agent(s) have low confidence`,
      suggestedTool: 'get_thoughts',
    });
  }

  const noCitationAgents = responses.filter((r) => !r.citations || r.citations.length === 0);
  if (noCitationAgents.length > 0 && noCitationAgents.length < responses.length) {
    hints.push({
      field: 'Evidence sources',
      reason: `${noCitationAgents.length} agent(s) provided no citations`,
      suggestedTool: 'get_citations',
    });
  }

  const reasoningLengths = responses.map((r) => r.reasoning.length);
  const avgLength = reasoningLengths.reduce((a, b) => a + b, 0) / reasoningLengths.length;
  const shortReasoningAgents = responses.filter(
    (r) => r.reasoning.length < avgLength * thresholds.minReasoningLengthRatio
  );
  if (shortReasoningAgents.length > 0) {
    hints.push({
      field: 'Reasoning depth',
      reason: `${shortReasoningAgents.length} agent(s) provided shorter reasoning`,
      suggestedTool: 'get_round_details',
    });
  }

  return hints.slice(0, 3);
}
