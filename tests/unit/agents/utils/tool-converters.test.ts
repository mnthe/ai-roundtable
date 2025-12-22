/**
 * Tool Converters Tests
 *
 * Tests for toolkit to provider-specific format conversion utilities.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  buildOpenAITools,
  buildResponsesFunctionTools,
} from '../../../../src/agents/utils/tool-converters.js';
import type { AgentToolkit, AgentTool } from '../../../../src/tools/types.js';

/**
 * Create a mock toolkit with given tools
 */
function createMockToolkit(tools: AgentTool[]): AgentToolkit {
  return {
    getTools: () => tools,
    executeTool: vi.fn(),
    setContext: vi.fn(),
    setCurrentAgentId: vi.fn(),
    getPendingContextRequests: () => [],
    clearPendingRequests: vi.fn(),
    hasPendingRequests: () => false,
  };
}

describe('Tool Converters', () => {
  describe('buildOpenAITools', () => {
    it('should return empty array when toolkit is undefined', () => {
      const result = buildOpenAITools(undefined);

      expect(result).toEqual([]);
    });

    it('should return empty array when toolkit has no tools', () => {
      const toolkit = createMockToolkit([]);
      const result = buildOpenAITools(toolkit);

      expect(result).toEqual([]);
    });

    it('should convert single tool to OpenAI Chat Completions format', () => {
      const tool: AgentTool = {
        name: 'search_web',
        description: 'Search the web for information',
        parameters: {
          query: { type: 'string', description: 'Search query' },
          limit: { type: 'number', description: 'Max results' },
        },
      };
      const toolkit = createMockToolkit([tool]);

      const result = buildOpenAITools(toolkit);

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

    it('should convert multiple tools correctly', () => {
      const tools: AgentTool[] = [
        {
          name: 'fact_check',
          description: 'Verify a claim',
          parameters: {
            claim: { type: 'string', description: 'Claim to verify' },
          },
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

      const result = buildOpenAITools(toolkit);

      expect(result).toHaveLength(2);
      expect(result[0].function.name).toBe('fact_check');
      expect(result[0].function.parameters.required).toEqual(['claim']);
      expect(result[1].function.name).toBe('request_context');
      expect(result[1].function.parameters.required).toEqual(['question', 'priority']);
    });

    it('should handle tool with empty parameters', () => {
      const tool: AgentTool = {
        name: 'no_params_tool',
        description: 'A tool with no parameters',
        parameters: {},
      };
      const toolkit = createMockToolkit([tool]);

      const result = buildOpenAITools(toolkit);

      expect(result).toHaveLength(1);
      expect(result[0].function.parameters).toEqual({
        type: 'object',
        properties: {},
        required: [],
      });
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

      const result = buildOpenAITools(toolkit);

      expect(result[0].function.parameters.properties).toEqual(tool.parameters);
    });
  });

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
        {
          name: 'tool1',
          description: 'Tool 1',
          parameters: { param: { type: 'string' } },
        },
        {
          name: 'tool2',
          description: 'Tool 2',
          parameters: { param: { type: 'number' } },
        },
      ];
      const toolkit = createMockToolkit(tools);

      const result = buildResponsesFunctionTools(toolkit);

      expect(result[0].strict).toBe(false);
      expect(result[1].strict).toBe(false);
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
      expect(result[0].parameters).toEqual({
        type: 'object',
        properties: {},
        required: [],
      });
      expect(result[0].strict).toBe(false);
    });

    it('should preserve parameter structure from toolkit', () => {
      const tool: AgentTool = {
        name: 'preserve_params',
        description: 'Should preserve params',
        parameters: {
          stringParam: { type: 'string', description: 'A string' },
          numberParam: { type: 'number', description: 'A number' },
          boolParam: { type: 'boolean', description: 'A boolean' },
        },
      };
      const toolkit = createMockToolkit([tool]);

      const result = buildResponsesFunctionTools(toolkit);

      expect(result[0].parameters.properties).toEqual(tool.parameters);
      expect(result[0].parameters.required).toEqual(['stringParam', 'numberParam', 'boolParam']);
    });
  });

  describe('Format comparison', () => {
    it('should produce different formats for the same tool', () => {
      const tool: AgentTool = {
        name: 'test_tool',
        description: 'Test description',
        parameters: {
          param1: { type: 'string' },
        },
      };
      const toolkit = createMockToolkit([tool]);

      const openaiTools = buildOpenAITools(toolkit);
      const responsesTools = buildResponsesFunctionTools(toolkit);

      // OpenAI Chat format has nested function object
      expect(openaiTools[0]).toHaveProperty('function');
      expect(openaiTools[0].function.name).toBe('test_tool');

      // Responses API format has flat structure
      expect(responsesTools[0]).not.toHaveProperty('function');
      expect(responsesTools[0].name).toBe('test_tool');

      // Responses API has strict property
      expect(responsesTools[0]).toHaveProperty('strict');
      expect(openaiTools[0]).not.toHaveProperty('strict');
    });
  });
});
