/**
 * MCP Tool Definitions
 *
 * Tool schemas are generated from Zod schemas using Zod 4's native z.toJSONSchema().
 * Runtime validation is handled by Zod schemas in types/schemas.ts.
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  DebateModeSchema,
  SessionStatusSchema,
  ParallelizationLevelSchema,
  StartRoundtableInputSchema,
  ContinueRoundtableInputSchema,
  GetConsensusInputSchema,
  GetThoughtsInputSchema,
  ExportSessionInputSchema,
  ControlSessionInputSchema,
  GetRoundDetailsInputSchema,
  GetResponseDetailInputSchema,
  GetCitationsInputSchema,
  SynthesizeDebateInputSchema,
  ListSessionsInputSchema,
  GetAgentsInputSchema,
} from '../types/schemas.js';

// Type for MCP Tool inputSchema
type McpInputSchema = Tool['inputSchema'];

/**
 * Convert Zod schema to MCP-compatible JSON Schema
 * Removes $schema property that Zod adds by default
 */
function toMcpJsonSchema(schema: z.ZodType): McpInputSchema {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  // Remove $schema as MCP protocol doesn't expect it
  delete jsonSchema.$schema;
  return jsonSchema as McpInputSchema;
}

/**
 * Tool: start_roundtable
 *
 * Start a new AI debate roundtable
 */
const START_ROUNDTABLE_TOOL: Tool = {
  name: 'start_roundtable',
  description:
    'Start a new AI debate roundtable on a given topic. Agents will discuss the topic across multiple rounds, each providing their perspectives, reasoning, and citations.',
  inputSchema: toMcpJsonSchema(StartRoundtableInputSchema),
};

/**
 * Tool: continue_roundtable
 *
 * Continue an existing debate with additional rounds
 */
const CONTINUE_ROUNDTABLE_TOOL: Tool = {
  name: 'continue_roundtable',
  description: `Continue an existing debate roundtable with additional rounds.

## CRITICAL: Handling contextRequests (READ THIS FIRST)

When the previous response has status "needs_context" with contextRequests array, you MUST:

1. **STOP** - Do not call continue_roundtable immediately
2. **FULFILL** each contextRequest using your own tools:
   - Use web search for factual/research queries
   - Use file read for code/document queries
   - Use any appropriate tool based on the query
3. **CALL** continue_roundtable with contextResults:

Example workflow:
\`\`\`
Previous response: { status: "needs_context", contextRequests: [{ id: "ctx-123", query: "Find research on X" }] }

Your action:
1. WebSearch("research on X") → found results
2. continue_roundtable({ sessionId, contextResults: [{ requestId: "ctx-123", success: true, result: "Found: ..." }] })
\`\`\`

If priority is "required", the debate CANNOT proceed without this information.
Ignoring contextRequests will result in degraded debate quality.

## Optional Parameters
- focusQuestion: Guide the next round's discussion topic
- rounds: Number of additional rounds (default: 1)`,
  inputSchema: toMcpJsonSchema(ContinueRoundtableInputSchema),
};

/**
 * Tool: get_consensus
 *
 * Get consensus analysis for a debate
 */
const GET_CONSENSUS_TOOL: Tool = {
  name: 'get_consensus',
  description:
    'Analyze the consensus level in a debate session. Returns agreement level, common points of agreement, disagreement points, and a summary. By default, analyzes only the latest round to provide current consensus state.',
  inputSchema: toMcpJsonSchema(GetConsensusInputSchema),
};

/**
 * Tool: get_agents
 *
 * List available AI agents
 */
const GET_AGENTS_TOOL: Tool = {
  name: 'get_agents',
  description:
    'List all available AI agents that can participate in debates. Returns agent ID, name, provider (e.g., anthropic, openai), and model information.',
  inputSchema: toMcpJsonSchema(GetAgentsInputSchema),
};

/**
 * Tool: list_sessions
 *
 * List all debate sessions with optional filters
 */
const LIST_SESSIONS_TOOL: Tool = {
  name: 'list_sessions',
  description:
    'List debate sessions with optional filters. Search by topic keyword, filter by mode/status, or date range.',
  inputSchema: toMcpJsonSchema(ListSessionsInputSchema),
};

/**
 * Tool: get_thoughts
 *
 * Get detailed reasoning and confidence evolution for a specific agent in a session
 */
const GET_THOUGHTS_TOOL: Tool = {
  name: 'get_thoughts',
  description:
    'Retrieve the detailed reasoning process and confidence evolution for a specific agent across all rounds in a debate session. Returns all responses including position, reasoning, confidence levels, and citations.',
  inputSchema: toMcpJsonSchema(GetThoughtsInputSchema),
};

/**
 * Tool: export_session
 *
 * Export a debate session in various formats
 */
const EXPORT_SESSION_TOOL: Tool = {
  name: 'export_session',
  description:
    'Export a debate session in markdown or JSON format. Markdown format includes title, participants, round-by-round responses, and consensus analysis. JSON format provides the full structured data.',
  inputSchema: toMcpJsonSchema(ExportSessionInputSchema),
};

/**
 * Tool: control_session
 *
 * Control the execution state of a debate session
 */
const CONTROL_SESSION_TOOL: Tool = {
  name: 'control_session',
  description:
    'Control a debate session execution state. Actions: pause (temporarily halt), resume (continue paused session), stop (permanently end session with completed status).',
  inputSchema: toMcpJsonSchema(ControlSessionInputSchema),
};

/**
 * Tool: get_round_details
 *
 * Get detailed responses for a specific round
 */
const GET_ROUND_DETAILS_TOOL: Tool = {
  name: 'get_round_details',
  description:
    'Retrieve all agent responses and consensus analysis for a specific round in a debate session. Returns full position statements, reasoning, citations, and tool calls.',
  inputSchema: toMcpJsonSchema(GetRoundDetailsInputSchema),
};

/**
 * Tool: get_response_detail
 *
 * Get detailed response from a specific agent
 */
const GET_RESPONSE_DETAIL_TOOL: Tool = {
  name: 'get_response_detail',
  description:
    'Retrieve detailed response from a specific agent in a debate session. If roundNumber is provided, returns the response for that round only. Otherwise, returns all responses from the agent across all rounds.',
  inputSchema: toMcpJsonSchema(GetResponseDetailInputSchema),
};

/**
 * Tool: get_citations
 *
 * Get citations from the debate
 */
const GET_CITATIONS_TOOL: Tool = {
  name: 'get_citations',
  description:
    'Retrieve all citations used in a debate session. Can be filtered by round number and/or agent ID. Returns citation title, URL, and optional snippet.',
  inputSchema: toMcpJsonSchema(GetCitationsInputSchema),
};

/**
 * Tool: synthesize_debate
 *
 * AI-powered synthesis of the entire debate
 */
const SYNTHESIZE_DEBATE_TOOL: Tool = {
  name: 'synthesize_debate',
  description:
    'Analyze and summarize the entire debate using AI. Use this after the debate is completed.',
  inputSchema: toMcpJsonSchema(SynthesizeDebateInputSchema),
};

/**
 * All available tools
 */
export const TOOLS: Tool[] = [
  START_ROUNDTABLE_TOOL,
  CONTINUE_ROUNDTABLE_TOOL,
  GET_CONSENSUS_TOOL,
  GET_AGENTS_TOOL,
  LIST_SESSIONS_TOOL,
  GET_THOUGHTS_TOOL,
  EXPORT_SESSION_TOOL,
  CONTROL_SESSION_TOOL,
  GET_ROUND_DETAILS_TOOL,
  GET_RESPONSE_DETAIL_TOOL,
  GET_CITATIONS_TOOL,
  SYNTHESIZE_DEBATE_TOOL,
];

/**
 * Tool response type (matches MCP CallToolResult)
 */
export interface ToolResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  _meta?: Record<string, unknown>;
}

/**
 * Create a success tool response
 */
export function createSuccessResponse(data: unknown): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Create an error tool response
 */
export function createErrorResponse(error: string | Error): ToolResponse {
  const message = error instanceof Error ? error.message : error;
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message }, null, 2),
      },
    ],
  };
}
