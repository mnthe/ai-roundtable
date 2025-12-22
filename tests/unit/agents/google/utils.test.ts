/**
 * Tests for Google/Gemini agent utilities
 */

import { describe, it, expect, vi } from 'vitest';
import { Type } from '@google/genai';
import { buildGeminiTools } from '../../../../src/agents/google/utils.js';
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

describe('buildGeminiTools', () => {
  it('should return empty array when toolkit is undefined', () => {
    const result = buildGeminiTools(undefined);
    expect(result).toEqual([]);
  });

  it('should return empty array when toolkit has no tools', () => {
    const toolkit = createMockToolkit([]);
    const result = buildGeminiTools(toolkit);
    expect(result).toEqual([]);
  });

  it('should convert single tool to Gemini format', () => {
    const toolkit = createMockToolkit([
      {
        name: 'web_search',
        description: 'Search the web for information',
        parameters: {
          query: { type: 'string', description: 'The search query' },
        },
      },
    ]);

    const result = buildGeminiTools(toolkit);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: 'web_search',
      description: 'Search the web for information',
      parameters: {
        type: Type.OBJECT,
        properties: {
          query: { type: Type.STRING, description: 'The search query' },
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

    const result = buildGeminiTools(toolkit);

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

    const result = buildGeminiTools(toolkit);

    expect(result[0]?.parameters?.required).toEqual(['param1', 'param2', 'param3']);
  });

  it('should use Type.STRING for all property types', () => {
    const toolkit = createMockToolkit([
      {
        name: 'tool',
        description: 'desc',
        parameters: {
          stringParam: { type: 'string', description: 'String' },
          numberParam: { type: 'number', description: 'Number' },
          boolParam: { type: 'boolean', description: 'Boolean' },
        },
      },
    ]);

    const result = buildGeminiTools(toolkit);
    const properties = result[0]?.parameters?.properties as Record<string, { type: unknown }>;

    // Gemini converter uses Type.STRING for all params (simplified approach)
    expect(properties.stringParam.type).toBe(Type.STRING);
    expect(properties.numberParam.type).toBe(Type.STRING);
    expect(properties.boolParam.type).toBe(Type.STRING);
  });

  it('should extract description from parameter', () => {
    const toolkit = createMockToolkit([
      {
        name: 'tool',
        description: 'desc',
        parameters: {
          param: { type: 'string', description: 'Custom description' },
        },
      },
    ]);

    const result = buildGeminiTools(toolkit);
    const properties = result[0]?.parameters?.properties as Record<
      string,
      { description: string }
    >;

    expect(properties.param.description).toBe('Custom description');
  });

  it('should handle missing description gracefully', () => {
    const toolkit = createMockToolkit([
      {
        name: 'tool',
        description: 'desc',
        parameters: {
          param: { type: 'string' },
        },
      },
    ]);

    const result = buildGeminiTools(toolkit);
    const properties = result[0]?.parameters?.properties as Record<
      string,
      { description: string }
    >;

    expect(properties.param.description).toBe('');
  });

  it('should set parameters type to Type.OBJECT', () => {
    const toolkit = createMockToolkit([
      {
        name: 'tool',
        description: 'desc',
        parameters: {},
      },
    ]);

    const result = buildGeminiTools(toolkit);

    expect(result[0]?.parameters?.type).toBe(Type.OBJECT);
  });
});
