/**
 * MCP Tool Definitions
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool: start_roundtable
 *
 * Start a new AI debate roundtable
 */
const START_ROUNDTABLE_TOOL: Tool = {
  name: 'start_roundtable',
  description:
    'Start a new AI debate roundtable on a given topic. Agents will discuss the topic across multiple rounds, each providing their perspectives, reasoning, and citations.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'The debate topic or question to discuss',
      },
      mode: {
        type: 'string',
        enum: [
          'collaborative',
          'adversarial',
          'socratic',
          'expert-panel',
          'devils-advocate',
          'delphi',
          'red-team-blue-team',
        ],
        description:
          'Debate mode: collaborative (find common ground), adversarial (challenge positions), socratic (question-driven), expert-panel (independent expert opinions), devils-advocate (challenge assumptions), delphi (anonymous consensus building), red-team-blue-team (opposing team analysis)',
        default: 'collaborative',
      },
      agents: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Optional: Array of agent IDs to participate. If not provided, default agents will be used.',
      },
      rounds: {
        type: 'number',
        description: 'Number of debate rounds (default: 3)',
        default: 3,
        minimum: 1,
        maximum: 10,
      },
      parallel: {
        type: 'string',
        enum: ['none', 'last-only', 'full'],
        description:
          'Parallelization level for agent execution. none: sequential (agents see each other\'s responses), last-only: parallel except last agent responds sequentially (default, best balance), full: all agents respond in parallel',
      },
      exitOnConsensus: {
        type: 'boolean',
        description:
          'Exit early when consensus is reached. When true, the debate ends if agents reach sufficient agreement before all rounds complete.',
      },
    },
    required: ['topic'],
  },
};

/**
 * Tool: continue_roundtable
 *
 * Continue an existing debate with additional rounds
 */
const CONTINUE_ROUNDTABLE_TOOL: Tool = {
  name: 'continue_roundtable',
  description:
    'Continue an existing debate roundtable with additional rounds. You can optionally provide a new focus question to guide the discussion.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID of the debate to continue',
      },
      rounds: {
        type: 'number',
        description: 'Number of additional rounds to execute (default: 1)',
        default: 1,
        minimum: 1,
        maximum: 10,
      },
      focusQuestion: {
        type: 'string',
        description: 'Optional: A specific question to focus the continued discussion',
      },
    },
    required: ['sessionId'],
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to analyze',
      },
      roundNumber: {
        type: 'number',
        description:
          'Optional: specific round number to analyze (1-based index). If not provided, analyzes the latest round only.',
        minimum: 1,
      },
    },
    required: ['sessionId'],
  },
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
  inputSchema: {
    type: 'object',
    properties: {},
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Search sessions by topic keyword (partial match)',
      },
      mode: {
        type: 'string',
        enum: [
          'collaborative',
          'adversarial',
          'socratic',
          'expert-panel',
          'devils-advocate',
          'delphi',
          'red-team-blue-team',
        ],
        description: 'Filter by debate mode',
      },
      status: {
        type: 'string',
        enum: ['active', 'paused', 'completed', 'error'],
        description: 'Filter by session status',
      },
      fromDate: {
        type: 'string',
        description: 'Filter sessions created after this date (ISO 8601 format)',
      },
      toDate: {
        type: 'string',
        description: 'Filter sessions created before this date (ISO 8601 format)',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return',
        default: 50,
      },
    },
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to query',
      },
      agentId: {
        type: 'string',
        description: 'The agent ID whose thoughts to retrieve',
      },
    },
    required: ['sessionId', 'agentId'],
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to export',
      },
      format: {
        type: 'string',
        enum: ['markdown', 'json'],
        description: 'Export format (default: markdown)',
        default: 'markdown',
      },
    },
    required: ['sessionId'],
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to control',
      },
      action: {
        type: 'string',
        enum: ['pause', 'resume', 'stop'],
        description:
          'Control action: pause (halt temporarily), resume (continue), stop (end permanently)',
      },
    },
    required: ['sessionId', 'action'],
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to query',
      },
      roundNumber: {
        type: 'number',
        description: 'The round number to retrieve (1-based index)',
        minimum: 1,
      },
    },
    required: ['sessionId', 'roundNumber'],
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to query',
      },
      agentId: {
        type: 'string',
        description: 'The agent ID whose response to retrieve',
      },
      roundNumber: {
        type: 'number',
        description: 'Optional: specific round number (1-based index)',
        minimum: 1,
      },
    },
    required: ['sessionId', 'agentId'],
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to query',
      },
      roundNumber: {
        type: 'number',
        description: 'Optional: filter citations by round number (1-based index)',
        minimum: 1,
      },
      agentId: {
        type: 'string',
        description: 'Optional: filter citations by agent ID',
      },
    },
    required: ['sessionId'],
  },
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
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to synthesize',
      },
      synthesizer: {
        type: 'string',
        description: 'Optional: Agent ID to use for synthesis (defaults to first active agent)',
      },
    },
    required: ['sessionId'],
  },
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
