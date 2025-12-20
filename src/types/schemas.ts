/**
 * Zod schemas for runtime validation
 */

import { z } from 'zod';

// ============================================
// Provider Schemas
// ============================================

export const AIProviderSchema = z.enum(['anthropic', 'openai', 'google', 'perplexity']);

// ============================================
// Agent Schemas
// ============================================

export const AgentConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: AIProviderSchema,
  model: z.string().min(1),
  systemPrompt: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
});

export const CitationSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string().optional(),
});

export const ToolCallRecordSchema = z.object({
  toolName: z.string(),
  input: z.unknown(),
  output: z.unknown(),
  timestamp: z.coerce.date(),
});

export const AgentResponseSchema = z.object({
  agentId: z.string().min(1),
  agentName: z.string().min(1),
  position: z.string().min(1),
  reasoning: z.string().min(1),
  confidence: z.number().min(0).max(1),
  citations: z.array(CitationSchema).optional(),
  toolCalls: z.array(ToolCallRecordSchema).optional(),
  timestamp: z.coerce.date(),
});

// ============================================
// Debate Schemas
// ============================================

export const DebateModeSchema = z.enum([
  'collaborative',
  'adversarial',
  'socratic',
  'expert-panel',
  'devils-advocate',
  'delphi',
  'red-team-blue-team',
]);

export const DebateConfigSchema = z.object({
  topic: z.string().min(1),
  mode: DebateModeSchema,
  agents: z.array(z.string().min(1)).min(1),
  rounds: z.number().int().positive().optional().default(3),
  focusQuestion: z.string().optional(),
});

export const DebateContextSchema = z.object({
  sessionId: z.string().min(1),
  topic: z.string().min(1),
  mode: DebateModeSchema,
  currentRound: z.number().int().positive(),
  totalRounds: z.number().int().positive(),
  previousResponses: z.array(AgentResponseSchema),
  focusQuestion: z.string().optional(),
});

// ============================================
// Session Schemas
// ============================================

export const SessionStatusSchema = z.enum(['active', 'paused', 'completed', 'error']);

export const ConsensusResultSchema = z.object({
  agreementLevel: z.number().min(0).max(1),
  commonPoints: z.array(z.string()),
  disagreementPoints: z.array(z.string()),
  summary: z.string(),
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1),
  mode: DebateModeSchema,
  agentIds: z.array(z.string().min(1)),
  status: SessionStatusSchema,
  currentRound: z.number().int().nonnegative(),
  totalRounds: z.number().int().positive(),
  responses: z.array(AgentResponseSchema),
  consensus: ConsensusResultSchema.optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const RoundResultSchema = z.object({
  roundNumber: z.number().int().positive(),
  responses: z.array(AgentResponseSchema),
  consensus: ConsensusResultSchema,
});

// ============================================
// Tool Schemas
// ============================================

export const ToolResultSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  });

export const SearchResultSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  snippet: z.string(),
  publishedDate: z.string().optional(),
});

export const SearchOptionsSchema = z.object({
  maxResults: z.number().int().positive().max(20).optional().default(5),
  recency: z.enum(['day', 'week', 'month', 'year']).optional(),
});

// ============================================
// MCP Input Schemas
// ============================================

export const StartRoundtableInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  mode: DebateModeSchema.optional().default('collaborative'),
  agents: z.array(z.string().min(1)).optional(),
  rounds: z.number().int().positive().optional().default(3),
});

export const ContinueRoundtableInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  rounds: z.number().int().positive().optional(),
  focusQuestion: z.string().optional(),
});

export const GetConsensusInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  roundNumber: z.number().int().positive().min(1).optional(),
});

export const GetThoughtsInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
});

export const ExportSessionInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  format: z.enum(['markdown', 'json']).default('markdown'),
});

export const ControlSessionInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  action: z.enum(['pause', 'resume', 'stop']),
});

export const GetRoundDetailsInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  roundNumber: z.number().int().positive().min(1, 'Round number must be at least 1'),
});

export const GetResponseDetailInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  agentId: z.string().min(1, 'Agent ID is required'),
  roundNumber: z.number().int().positive().min(1).optional(),
});

export const GetCitationsInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  roundNumber: z.number().int().positive().min(1).optional(),
  agentId: z.string().min(1).optional(),
});

export const SynthesizeDebateInputSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  synthesizer: z.string().optional(),
});

export const SynthesisResultSchema = z.object({
  commonGround: z.array(z.string()),
  keyDifferences: z.array(z.string()),
  evolutionSummary: z.string(),
  conclusion: z.string(),
  recommendation: z.string(),
  confidence: z.number().min(0).max(1),
  synthesizerId: z.string(),
  timestamp: z.coerce.date(),
});

// ============================================
// SQLite Storage Schemas
// ============================================

/**
 * Schema for stored session rows from SQLite
 * Note: Dates are stored as Unix timestamps (numbers)
 */
export const StoredSessionRowSchema = z.object({
  id: z.string(),
  topic: z.string(),
  mode: z.string(),
  agent_ids: z.string(), // JSON array stored as string
  status: z.string(),
  current_round: z.number(),
  total_rounds: z.number(),
  created_at: z.number(), // Unix timestamp
  updated_at: z.number(), // Unix timestamp
});

/**
 * Schema for stored response rows from SQLite
 */
export const StoredResponseRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  agent_id: z.string(),
  agent_name: z.string(),
  position: z.string(),
  reasoning: z.string(),
  confidence: z.number(),
  citations: z.string().nullable(), // JSON array or null
  tool_calls: z.string().nullable(), // JSON array or null
  timestamp: z.number(), // Unix timestamp
});

/**
 * Schema for agent IDs array parsed from JSON
 */
export const AgentIdsArraySchema = z.array(z.string());

/**
 * Schema for citations array parsed from JSON in storage
 * More lenient than CitationSchema to handle various stored formats
 */
export const StoredCitationsArraySchema = z.array(
  z.object({
    title: z.string(),
    url: z.string(),
    snippet: z.string().optional(),
  })
);

/**
 * Schema for tool calls array parsed from JSON in storage
 */
export const StoredToolCallsArraySchema = z.array(
  z.object({
    toolName: z.string(),
    input: z.unknown(),
    output: z.unknown(),
    timestamp: z.union([z.string(), z.number(), z.coerce.date()]),
  })
);

// ============================================
// Type Inference Helpers
// ============================================

export type AgentConfigInput = z.input<typeof AgentConfigSchema>;
export type AgentResponseInput = z.input<typeof AgentResponseSchema>;
export type DebateConfigInput = z.input<typeof DebateConfigSchema>;
export type SessionInput = z.input<typeof SessionSchema>;
export type StartRoundtableInputType = z.infer<typeof StartRoundtableInputSchema>;
export type ContinueRoundtableInputType = z.infer<typeof ContinueRoundtableInputSchema>;
export type GetConsensusInputType = z.infer<typeof GetConsensusInputSchema>;
export type GetThoughtsInputType = z.infer<typeof GetThoughtsInputSchema>;
export type ExportSessionInputType = z.infer<typeof ExportSessionInputSchema>;
export type ControlSessionInputType = z.infer<typeof ControlSessionInputSchema>;
export type GetRoundDetailsInputType = z.infer<typeof GetRoundDetailsInputSchema>;
export type GetResponseDetailInputType = z.infer<typeof GetResponseDetailInputSchema>;
export type GetCitationsInputType = z.infer<typeof GetCitationsInputSchema>;
export type SynthesizeDebateInputType = z.infer<typeof SynthesizeDebateInputSchema>;
