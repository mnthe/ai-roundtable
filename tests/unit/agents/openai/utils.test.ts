/**
 * OpenAI Utils Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { buildResponsesFunctionTools } from '../../../../src/agents/openai/utils.js';
import type { AgentToolkit, AgentTool } from '../../../../src/tools/types.js';

function createMockToolkit(tools: AgentTool[]): AgentToolkit {
  return {
    getTools: () => tools,
    executeTool: vi.fn(),
    setContext: vi.fn(),
    getPendingContextRequests: () => [],
    clearPendingRequests: vi.fn(),
    hasPendingRequests: () => false,
  };
}

describe('buildResponsesFunctionTools', () => {
  it('should return empty array when toolkit is undefined', () => {
    const result = buildResponsesFunctionTools(undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array when toolkit has no tools', () => {
    const toolkit = createMockToolkit([]);
    const result = buildResponsesFunctionTools(toolkit);
    expect(result).toEqual([]);
  });

  it('should convert single tool to Responses API FunctionTool format', () => {
    const tool: AgentTool = {
      name: 'search_web',
      description: 'Search the web for information',
      parameters: {
        query: { type: 'string', description: 'Search query' },
      },
    };
    const toolkit = createMockToolkit([tool]);

    const result = buildResponsesFunctionTools(toolkit);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'function',
      name: 'search_web',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
      strict: false,
    });
  });

  it('should set strict: false for all tools', () => {
    const tools: AgentTool[] = [
      { name: 'tool1', description: 'Tool 1', parameters: { param: { type: 'string' } } },
      { name: 'tool2', description: 'Tool 2', parameters: { param: { type: 'number' } } },
    ];
    const toolkit = createMockToolkit(tools);

    const result = buildResponsesFunctionTools(toolkit);

    expect(result[0]?.strict).toBe(false);
    expect(result[1]?.strict).toBe(false);
  });

  it('should handle tool with empty parameters', () => {
    const tool: AgentTool = {
      name: 'empty_params',
      description: 'No parameters',
      parameters: {},
    };
    const toolkit = createMockToolkit([tool]);

    const result = buildResponsesFunctionTools(toolkit);

    expect(result).toHaveLength(1);
    expect(result[0]?.parameters).toEqual({
      type: 'object',
      properties: {},
      required: [],
    });
  });

  it('should convert multiple tools correctly', () => {
    const tools: AgentTool[] = [
      {
        name: 'fact_check',
        description: 'Verify a claim',
        parameters: { claim: { type: 'string', description: 'Claim to verify' } },
      },
      {
        name: 'request_context',
        description: 'Request additional context',
        parameters: {
          question: { type: 'string', description: 'Question to ask' },
          priority: { type: 'string', description: 'Priority level' },
        },
      },
    ];
    const toolkit = createMockToolkit(tools);

    const result = buildResponsesFunctionTools(toolkit);

    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('fact_check');
    expect(result[0]?.parameters.required).toEqual(['claim']);
    expect(result[1]?.name).toBe('request_context');
    expect(result[1]?.parameters.required).toEqual(['question', 'priority']);
  });
});
