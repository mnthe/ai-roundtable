/**
 * Core type definitions for AI Roundtable
 */

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
  timestamp: Date;
  /**
   * Role violation metadata (set by StanceValidator when stance doesn't match expected).
   * Preserved for analysis - stance is NOT force-corrected to avoid data corruption.
   */
  _roleViolation?: {
    expected: Stance;
    actual: Stance | null;
  };
}

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output: unknown;
  timestamp: Date;
}

// ============================================
// Perspective Types (Expert Panel Mode)
// ============================================

/**
 * Basic perspective definition for expert-panel mode
 * Can be provided as input by users
 */
export interface Perspective {
  name: string;
  description?: string;
}

/**
 * Generated perspective with full prompt context
 * Created by Light Model auto-generation or normalized from user input
 */
export interface GeneratedPerspective extends Perspective {
  /** Key areas to focus on for this perspective */
  focusAreas: string[];
  /** Types of evidence appropriate for this perspective */
  evidenceTypes: string[];
  /** Key questions this perspective should address */
  keyQuestions: string[];
  /** What this perspective should NOT do */
  antiPatterns: string[];
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
  /** Custom perspectives for expert-panel mode (string or Perspective object) */
  perspectives?: Array<string | Perspective>;
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
  /** Results from previous context requests (provided by caller) */
  contextResults?: ContextResult[];
  /** Generated perspectives for expert-panel mode */
  perspectives?: GeneratedPerspective[];
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
  /** Generated perspectives for expert-panel mode */
  perspectives?: GeneratedPerspective[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RoundResult {
  roundNumber: number;
  responses: AgentResponse[];
  consensus: ConsensusResult;
  /** Context requests made by agents during this round */
  contextRequests?: ContextRequest[];
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
  agentCount?: number;
  rounds?: number;
  exitOnConsensus?: boolean;
  perspectives?: Array<string | Perspective>;
}

export interface ContinueRoundtableInput {
  sessionId: string;
  rounds?: number;
  focusQuestion?: string;
  /** Results for previous context requests (provided by caller) */
  contextResults?: ContextResult[];
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

  /** Response status indicating if context is needed */
  status: RoundtableStatus;

  /** Layer 1: Quick decision info */
  decision: DecisionLayer;

  /** Layer 2: Per-agent summaries with key points */
  agentResponses: AgentResponseSummary[];

  /** Layer 3: Aggregated evidence */
  evidence: EvidenceLayer;

  /** Layer 4: Deep dive references */
  metadata: MetadataLayer;

  /** Context requests from agents (present when status is 'needs_context') */
  contextRequests?: ContextRequest[];
}

// ============================================
// Exit Criteria Types
// ============================================

export type { ExitCriteria, ExitReason, ExitResult } from './exit-criteria.js';

// ============================================
// Context Request Types (External Context Integration)
// ============================================

/**
 * Priority level for context requests
 * - required: Debate cannot meaningfully continue without this information
 * - optional: Information would be helpful but debate can proceed without it
 */
export type ContextRequestPriority = 'required' | 'optional';

/**
 * Context request from an agent during debate
 *
 * Agents use this to request additional information that isn't available
 * in the current debate context. The caller (SOTA AI like Claude Code)
 * decides HOW to obtain this information.
 */
export interface ContextRequest {
  /** Unique identifier for this request */
  id: string;
  /** ID of the agent that made this request */
  agentId: string;
  /** Natural language description of what information is needed */
  query: string;
  /** Why this information is needed (for audit and context) */
  reason: string;
  /** Whether this information is required to continue */
  priority: ContextRequestPriority;
  /** Timestamp when the request was made */
  timestamp: Date;
}

/**
 * Result provided by caller for a context request
 */
export interface ContextResult {
  /** ID of the original ContextRequest this result corresponds to */
  requestId: string;
  /** Whether the request was successfully fulfilled */
  success: boolean;
  /** The result data (when success is true) */
  result?: string;
  /** Error message (when success is false) */
  error?: string;
}

/**
 * Status of roundtable response
 * - completed: Round completed successfully, no pending requests
 * - needs_context: Agents have requested additional context
 * - in_progress: Debate is still active
 */
export type RoundtableStatus = 'completed' | 'needs_context' | 'in_progress';
