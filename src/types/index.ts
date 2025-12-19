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
}

export interface DebateContext {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  currentRound: number;
  totalRounds: number;
  previousResponses: AgentResponse[];
  focusQuestion?: string;
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

export interface ConsensusResult {
  agreementLevel: number; // 0-1
  commonPoints: string[];
  disagreementPoints: string[];
  summary: string;
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
