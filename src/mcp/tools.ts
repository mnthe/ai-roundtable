/**
 * MCP Tool Definitions
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  StartRoundtableInputSchema,
  ContinueRoundtableInputSchema,
  GetConsensusInputSchema,
} from '../types/schemas.js';

/**
 * Tool: start_roundtable
 *
 * Start a new AI debate roundtable
 */
export const startRoundtableTool: Tool = {
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
        enum: ['collaborative', 'adversarial', 'socratic', 'expert-panel'],
        description:
          'Debate mode: collaborative (find common ground), adversarial (challenge positions), socratic (question-driven), expert-panel (independent expert opinions)',
        default: 'collaborative',
      },
      agents: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional: Array of agent IDs to participate. If not provided, default agents will be used.',
      },
      rounds: {
        type: 'number',
        description: 'Number of debate rounds (default: 3)',
        default: 3,
        minimum: 1,
        maximum: 10,
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
export const continueRoundtableTool: Tool = {
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
export const getConsensusTool: Tool = {
  name: 'get_consensus',
  description:
    'Analyze the consensus level in a debate session. Returns agreement level, common points of agreement, disagreement points, and a summary.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'The session ID to analyze',
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
export const getAgentsTool: Tool = {
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
 * List all debate sessions
 */
export const listSessionsTool: Tool = {
  name: 'list_sessions',
  description:
    'List all debate sessions with summary information including topic, mode, status, current round, and creation date.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * All available tools
 */
export const tools: Tool[] = [
  startRoundtableTool,
  continueRoundtableTool,
  getConsensusTool,
  getAgentsTool,
  listSessionsTool,
];

/**
 * Tool handler function types
 */
export interface ToolHandlers {
  start_roundtable: (args: unknown) => Promise<ToolResponse>;
  continue_roundtable: (args: unknown) => Promise<ToolResponse>;
  get_consensus: (args: unknown) => Promise<ToolResponse>;
  get_agents: (args: unknown) => Promise<ToolResponse>;
  list_sessions: (args: unknown) => Promise<ToolResponse>;
}

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
 * Validate and parse tool arguments
 */
export function validateToolArgs<T>(schema: unknown, args: unknown): T {
  // Using Zod schema validation
  const zodSchema = schema as { parse: (data: unknown) => T };
  return zodSchema.parse(args);
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
