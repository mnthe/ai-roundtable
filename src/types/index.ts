/**
 * Core type definitions for AI Roundtable
 */

import type { FeatureFlags } from '../config/feature-flags.js';

// Re-export for convenience
export type { FeatureFlags };

// ============================================
// Provider Types
// ============================================

export type AIProvider = 'anthropic' | 'openai' | 'google' | 'perplexity';

// ============================================
// Agent Types
// ============================================

/**
 * Stance represents the agent's logical position in structured debate modes.
 * Used primarily in devils-advocate mode to enforce role assignment.
 * - YES: Affirmative/supporting stance
 * - NO: Negative/opposing stance
 * - NEUTRAL: Evaluator/observer stance (for evaluators in devils-advocate, expert-panel, etc.)
 */
export type Stance = 'YES' | 'NO' | 'NEUTRAL';

export interface AgentConfig {
  id: string;
  name: string;
  provider: AIProvider;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AgentResponse {
  agentId: string;
  agentName: string;
  /** Logical stance in structured debate modes (optional, required in devils-advocate) */
  stance?: Stance;
  position: string;
  reasoning: string;
  confidence: number;
  citations?: Citation[];
  toolCalls?: ToolCallRecord[];
  /** Images from search results (Perplexity) */
  images?: ImageResult[];
  /** Related questions from search (Perplexity) */
  relatedQuestions?: string[];
  timestamp: Date;
}

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface ImageResult {
  url: string;
  description?: string;
}

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output: unknown;
  timestamp: Date;
}

// ============================================
// Debate Types
// ============================================

export type DebateMode =
  | 'collaborative'
  | 'adversarial'
  | 'socratic'
  | 'expert-panel'
  | 'devils-advocate'
  | 'delphi'
  | 'red-team-blue-team';

export interface DebateConfig {
  topic: string;
  mode: DebateMode;
  agents: string[]; // Agent IDs
  rounds?: number;
  focusQuestion?: string;
  /** Session-level feature flag overrides */
  flags?: Partial<FeatureFlags>;
}

export interface DebateContext {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  currentRound: number;
  totalRounds: number;
  previousResponses: AgentResponse[];
  focusQuestion?: string;
  /** Mode-specific prompt additions (set by the mode strategy) */
  modePrompt?: string;
  /** Session-level feature flag overrides (merged with defaults at runtime) */
  flags?: Partial<FeatureFlags>;
}

// ============================================
// Session Types
// ============================================

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';

export interface Session {
  id: string;
  topic: string;
  mode: DebateMode;
  agentIds: string[];
  status: SessionStatus;
  currentRound: number;
  totalRounds: number;
  responses: AgentResponse[];
  consensus?: ConsensusResult;
  /** Session-level feature flag overrides */
  flags?: Partial<FeatureFlags>;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoundResult {
  roundNumber: number;
  responses: AgentResponse[];
  consensus: ConsensusResult;
}

// ============================================
// Consensus Types
// ============================================

/**
 * Groupthink warning information
 *
 * Indicates when agents may have reached consensus too easily,
 * suggesting potential groupthink that warrants additional scrutiny.
 */
export interface GroupthinkWarning {
  /** Whether groupthink indicators were detected */
  detected: boolean;
  /** List of specific indicators that triggered the warning */
  indicators: string[];
  /** Recommended action if groupthink is detected */
  recommendation: string;
}

export interface ConsensusResult {
  agreementLevel: number; // 0-1
  commonGround: string[];
  disagreementPoints: string[];
  summary: string;
  /** Groupthink warning if detected */
  groupthinkWarning?: GroupthinkWarning;
}

/**
 * Enhanced AI-based consensus result with semantic analysis
 */
export interface AIConsensusResult extends ConsensusResult {
  /** Position clusters identified by AI */
  clusters?: {
    theme: string;
    agentIds: string[];
    summary: string;
  }[];
  /** Nuanced aspects that rule-based analysis would miss */
  nuances?: {
    partialAgreements: string[];
    conditionalPositions: string[];
    uncertainties: string[];
  };
  /** AI's reasoning for the analysis */
  reasoning?: string;
  /** ID of the agent that performed the analysis */
  analyzerId?: string;
}

// ============================================
// Synthesis Types
// ============================================

/**
 * Context for debate synthesis
 * Used by agents to generate synthesis responses with correct format
 */
export interface SynthesisContext {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  responses: AgentResponse[];
  /** The full synthesis prompt with instructions */
  synthesisPrompt: string;
}

export interface SynthesisResult {
  commonGround: string[];
  keyDifferences: string[];
  evolutionSummary: string;
  conclusion: string;
  recommendation: string;
  confidence: number;
  synthesizerId: string;
  timestamp: Date;
}

// ============================================
// Tool Types
// ============================================

export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
}

export interface SearchOptions {
  maxResults?: number;
  recency?: 'day' | 'week' | 'month' | 'year';
}

// ============================================
// MCP Types
// ============================================

export interface StartRoundtableInput {
  topic: string;
  mode?: DebateMode;
  agents?: string[];
  rounds?: number;
}

export interface ContinueRoundtableInput {
  sessionId: string;
  rounds?: number;
  focusQuestion?: string;
}

export interface GetConsensusInput {
  sessionId: string;
}

export interface GetThoughtsInput {
  sessionId: string;
  agentId: string;
}

export type ExportFormat = 'markdown' | 'json';

export interface ExportSessionInput {
  sessionId: string;
  format?: ExportFormat;
}

export type SessionAction = 'pause' | 'resume' | 'stop';

export interface ControlSessionInput {
  sessionId: string;
  action: SessionAction;
}

export interface SynthesizeDebateInput {
  sessionId: string;
  synthesizer?: string;
}

// ============================================
// 4-Layer Response Types (MCP Response Enhancement)
// ============================================

/**
 * Consensus level classification for quick decision making
 */
export type ConsensusLevel = 'high' | 'medium' | 'low';

/**
 * Action recommendation type for main agent decision flow
 */
export type ActionRecommendationType = 'proceed' | 'verify' | 'query_detail';

/**
 * Layer 1: Decision - Quick decision-making information
 */
export interface DecisionLayer {
  /** Classified consensus level (high >= 0.7, medium >= 0.4, low < 0.4) */
  consensusLevel: ConsensusLevel;
  /** Numeric agreement level (0-1) */
  agreementScore: number;
  /** Recommended next action for main agent */
  actionRecommendation: {
    type: ActionRecommendationType;
    reason: string;
  };
}

/**
 * Layer 2: Agent Response Summary - Per-agent reasoning information
 */
export interface AgentResponseSummary {
  agentId: string;
  agentName: string;
  /** Logical stance in structured debate modes (optional) */
  stance?: Stance;
  /** Full position statement */
  position: string;
  /** 2-3 key reasoning points extracted from full reasoning */
  keyPoints: string[];
  /** Confidence score (0-1) */
  confidence: number;
  /** Confidence change from previous round (if applicable) */
  confidenceChange?: {
    delta: number;
    previousRound: number;
    reason: string;
  };
  /** Summary of evidence/tools used */
  evidenceUsed: {
    webSearches: number;
    citations: number;
    toolCalls: string[];
  };
}

/**
 * Layer 3: Evidence Summary - Aggregated evidence information
 */
export interface EvidenceLayer {
  /** Total citations across all agents */
  totalCitations: number;
  /** Identified conflicts between agents */
  conflicts: {
    issue: string;
    positions: { agentId: string; stance: string }[];
  }[];
  /** Brief consensus summary */
  consensusSummary: string;
}

/**
 * Layer 4: Metadata - References for deep dive
 */
export interface MetadataLayer {
  /** Reference to get full details */
  detailReference: {
    tool: string;
    params: Record<string, unknown>;
  };
  /** Hints for what to verify if confidence is low */
  verificationHints: {
    field: string;
    reason: string;
    suggestedTool: string;
  }[];
  /** Flag indicating more detailed data is available */
  hasMoreDetails: boolean;
}

/**
 * Enhanced roundtable response with 4-layer structure
 */
export interface RoundtableResponse {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  roundNumber: number;
  totalRounds: number;

  /** Layer 1: Quick decision info */
  decision: DecisionLayer;

  /** Layer 2: Per-agent summaries with key points */
  agentResponses: AgentResponseSummary[];

  /** Layer 3: Aggregated evidence */
  evidence: EvidenceLayer;

  /** Layer 4: Deep dive references */
  metadata: MetadataLayer;
}

// ============================================
// Exit Criteria Types
// ============================================

/**
 * Exit criteria configuration for automatic debate termination
 */
export interface ExitCriteria {
  /** Consensus agreement level threshold (default: 0.9) */
  consensusThreshold?: number;

  /** Number of rounds with stable positions to trigger convergence exit (default: 2) */
  convergenceRounds?: number;

  /** Minimum confidence level for all agents to trigger exit (default: 0.85) */
  confidenceThreshold?: number;

  /** Maximum rounds (required, existing behavior) */
  maxRounds: number;
}

/**
 * Exit reason types for automatic debate termination
 */
export type ExitReason = 'consensus' | 'convergence' | 'confidence' | 'max_rounds';

/**
 * Result of checking exit criteria
 */
export interface ExitResult {
  /** Whether the debate should exit */
  shouldExit: boolean;

  /** Reason for exit (null if shouldExit is false) */
  reason: ExitReason | null;

  /** Human-readable explanation */
  details: string;
}
