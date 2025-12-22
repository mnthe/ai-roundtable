/**
 * Tests for Anthropic agent utilities
 */

import { describe, it, expect, vi } from 'vitest';
import { buildAnthropicTools } from '../../../../src/agents/anthropic/utils.js';
import type { AgentToolkit } from '../../../../src/tools/types.js';

/**
 * Create a mock toolkit with specified tools
 */
function createMockToolkit(
  tools: { name: string; description: string; parameters: Record<string, unknown> }[]
): AgentToolkit {
  return {
    getTools: vi.fn().mockReturnValue(tools),
    executeTool: vi.fn(),
    setContext: vi.fn(),
    getContext: vi.fn(),
  } as unknown as AgentToolkit;
}

describe('buildAnthropicTools', () => {
  it('should return empty array when toolkit is undefined', () => {
    const result = buildAnthropicTools(undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array when toolkit has no tools', () => {
    const toolkit = createMockToolkit([]);
    const result = buildAnthropicTools(toolkit);
    expect(result).toEqual([]);
  });

  it('should convert single tool to Anthropic format', () => {
    const toolkit = createMockToolkit([
      {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          query: { type: 'string', description: 'The search query' },
        },
      },
    ]);

    const result = buildAnthropicTools(toolkit);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'web_search',
      description: 'Search the web for information',
      input_schema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    });
  });

  it('should convert multiple tools', () => {
    const toolkit = createMockToolkit([
      {
        name: 'fact_check',
        description: 'Check facts against debate history',
        parameters: {
          claim: { type: 'string', description: 'The claim to verify' },
        },
      },
      {
        name: 'request_context',
        description: 'Request additional context',
        parameters: {
          contextType: { type: 'string', description: 'Type of context needed' },
          question: { type: 'string', description: 'The question to ask' },
        },
      },
    ]);

    const result = buildAnthropicTools(toolkit);

    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('fact_check');
    expect(result[1]?.name).toBe('request_context');
  });

  it('should set required to all parameter keys', () => {
    const toolkit = createMockToolkit([
      {
        name: 'test_tool',
        description: 'A test tool',
        parameters: {
          param1: { type: 'string', description: 'First param' },
          param2: { type: 'number', description: 'Second param' },
          param3: { type: 'boolean', description: 'Third param' },
        },
      },
    ]);

    const result = buildAnthropicTools(toolkit);

    expect(result[0]?.input_schema.required).toEqual(['param1', 'param2', 'param3']);
  });

  it('should preserve parameter properties', () => {
    const toolkit = createMockToolkit([
      {
        name: 'complex_tool',
        description: 'A complex tool',
        parameters: {
          query: {
            type: 'string',
            description: 'Search query',
            minLength: 1,
            maxLength: 100,
          },
        },
      },
    ]);

    const result = buildAnthropicTools(toolkit);

    expect(result[0]?.input_schema.properties.query).toEqual({
      type: 'string',
      description: 'Search query',
      minLength: 1,
      maxLength: 100,
    });
  });

  it('should set input_schema type to object', () => {
    const toolkit = createMockToolkit([
      {
        name: 'tool',
        description: 'desc',
        parameters: {},
      },
    ]);

    const result = buildAnthropicTools(toolkit);

    expect(result[0]?.input_schema.type).toBe('object');
  });
});
