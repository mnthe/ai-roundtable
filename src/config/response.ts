import { z } from 'zod';
import { getEnvBoolean, getEnvNumber } from '../utils/env.js';

export const ResponseConfigSchema = z.object({
  debugMode: z.boolean().default(false),
  debugToolCalls: z.boolean().default(false),
  consensusSummaryMaxLength: z.number().min(-1).default(200),
  thresholds: z.object({
    lowConfidence: z.number().min(0).max(1).default(0.6),
    confidenceVariance: z.number().min(0).default(0.04),
    minReasoningLengthRatio: z.number().min(0).max(1).default(0.5),
    highConsensus: z.number().min(0).max(1).default(0.7),
    mediumConsensus: z.number().min(0).max(1).default(0.4),
    highConfidenceAction: z.number().min(0).max(1).default(0.8),
    lowConfidenceAction: z.number().min(0).max(1).default(0.6),
    veryLowConfidenceAction: z.number().min(0).max(1).default(0.5),
  }),
});

export type ResponseConfig = z.infer<typeof ResponseConfigSchema>;

const DEFAULTS: ResponseConfig = {
  debugMode: false,
  debugToolCalls: false,
  consensusSummaryMaxLength: 200,
  thresholds: {
    lowConfidence: 0.6,
    confidenceVariance: 0.04,
    minReasoningLengthRatio: 0.5,
    highConsensus: 0.7,
    mediumConsensus: 0.4,
    highConfidenceAction: 0.8,
    lowConfidenceAction: 0.6,
    veryLowConfidenceAction: 0.5,
  },
};

function loadConfig(): ResponseConfig {
  const maxLength = getEnvNumber(
    'ROUNDTABLE_CONSENSUS_SUMMARY_MAX_LENGTH',
    DEFAULTS.consensusSummaryMaxLength
  );

  return {
    debugMode: getEnvBoolean('ROUNDTABLE_DEBUG_MODE', DEFAULTS.debugMode),
    debugToolCalls: getEnvBoolean('ROUNDTABLE_DEBUG_TOOL_CALLS', DEFAULTS.debugToolCalls),
    consensusSummaryMaxLength: maxLength === -1 ? 0 : Math.max(0, maxLength),
    thresholds: {
      lowConfidence: getEnvNumber(
        'ROUNDTABLE_LOW_CONFIDENCE_THRESHOLD',
        DEFAULTS.thresholds.lowConfidence
      ),
      confidenceVariance: getEnvNumber(
        'ROUNDTABLE_CONFIDENCE_VARIANCE_THRESHOLD',
        DEFAULTS.thresholds.confidenceVariance
      ),
      minReasoningLengthRatio: getEnvNumber(
        'ROUNDTABLE_MIN_REASONING_LENGTH_RATIO',
        DEFAULTS.thresholds.minReasoningLengthRatio
      ),
      highConsensus: getEnvNumber(
        'ROUNDTABLE_HIGH_CONSENSUS_THRESHOLD',
        DEFAULTS.thresholds.highConsensus
      ),
      mediumConsensus: getEnvNumber(
        'ROUNDTABLE_MEDIUM_CONSENSUS_THRESHOLD',
        DEFAULTS.thresholds.mediumConsensus
      ),
      highConfidenceAction: getEnvNumber(
        'ROUNDTABLE_HIGH_CONFIDENCE_ACTION_THRESHOLD',
        DEFAULTS.thresholds.highConfidenceAction
      ),
      lowConfidenceAction: getEnvNumber(
        'ROUNDTABLE_LOW_CONFIDENCE_ACTION_THRESHOLD',
        DEFAULTS.thresholds.lowConfidenceAction
      ),
      veryLowConfidenceAction: getEnvNumber(
        'ROUNDTABLE_VERY_LOW_CONFIDENCE_ACTION_THRESHOLD',
        DEFAULTS.thresholds.veryLowConfidenceAction
      ),
    },
  };
}

export const RESPONSE_CONFIG: ResponseConfig = loadConfig();

export function isDebugMode(): boolean {
  return RESPONSE_CONFIG.debugMode;
}

export function isToolCallDebugEnabled(): boolean {
  return RESPONSE_CONFIG.debugToolCalls;
}

export function truncateIfNeeded(text: string, maxLength?: number): string {
  if (isDebugMode()) {
    return text;
  }

  const limit = maxLength ?? RESPONSE_CONFIG.consensusSummaryMaxLength;

  if (limit === 0 || text.length <= limit) {
    return text;
  }

  const truncated = text.substring(0, limit);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('. '),
    truncated.lastIndexOf('! '),
    truncated.lastIndexOf('? ')
  );

  if (lastSentenceEnd > limit * 0.7) {
    return truncated.substring(0, lastSentenceEnd + 1).trim();
  }

  return truncated.trim() + '...';
}
