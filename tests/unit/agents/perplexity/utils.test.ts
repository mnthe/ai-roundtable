/**
 * Perplexity Utils Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { buildPerplexityTools } from '../../../../src/agents/perplexity/utils.js';
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

describe('buildPerplexityTools', () => {
  it('should return empty array when toolkit is undefined', () => {
    const result = buildPerplexityTools(undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array when toolkit has no tools', () => {
    const toolkit = createMockToolkit([]);
    const result = buildPerplexityTools(toolkit);
    expect(result).toEqual([]);
  });

  it('should convert single tool to Perplexity format', () => {
    const tool: AgentTool = {
      name: 'search_web',
      description: 'Search the web for information',
      parameters: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results' },
      },
    };
    const toolkit = createMockToolkit([tool]);

    const result = buildPerplexityTools(toolkit);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      type: 'function',
      function: {
        name: 'search_web',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results' },
          },
          required: ['query', 'limit'],
        },
      },
    });
  });

  it('should handle tool with empty parameters', () => {
    const tool: AgentTool = {
      name: 'no_params_tool',
      description: 'A tool with no parameters',
      parameters: {},
    };
    const toolkit = createMockToolkit([tool]);

    const result = buildPerplexityTools(toolkit);

    expect(result).toHaveLength(1);
    expect(result[0]?.function.parameters).toEqual({
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

    const result = buildPerplexityTools(toolkit);

    expect(result).toHaveLength(2);
    expect(result[0]?.function.name).toBe('fact_check');
    expect(result[0]?.function.parameters.required).toEqual(['claim']);
    expect(result[1]?.function.name).toBe('request_context');
    expect(result[1]?.function.parameters.required).toEqual(['question', 'priority']);
  });

  it('should preserve complex parameter definitions', () => {
    const tool: AgentTool = {
      name: 'complex_tool',
      description: 'A tool with complex parameters',
      parameters: {
        nested: {
          type: 'object',
          description: 'Nested object',
          properties: { inner: { type: 'string' } },
        },
        array_param: {
          type: 'array',
          description: 'Array parameter',
          items: { type: 'string' },
        },
      },
    };
    const toolkit = createMockToolkit([tool]);

    const result = buildPerplexityTools(toolkit);

    expect(result[0]?.function.parameters.properties).toEqual(tool.parameters);
  });
});
