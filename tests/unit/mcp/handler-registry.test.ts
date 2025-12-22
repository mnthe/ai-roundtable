/**
 * Tests for MCP Handler Registry
 */

import { describe, it, expect, vi } from 'vitest';
import { HandlerRegistry, type HandlerContext } from '../../../src/mcp/handler-registry.js';

describe('HandlerRegistry', () => {
  /**
   * Create a minimal mock context for testing
   */
  function createMockContext(): HandlerContext {
    return {
      debateEngine: {} as any,
      sessionManager: {} as any,
      agentRegistry: {} as any,
      aiConsensusAnalyzer: null,
      keyPointsExtractor: null,
    };
  }

  describe('register', () => {
    it('should register a handler', () => {
      const registry = new HandlerRegistry();
      const handler = vi.fn();

      registry.register('test_tool', handler);

      expect(registry.has('test_tool')).toBe(true);
    });

    it('should overwrite existing handler with same name', () => {
      const registry = new HandlerRegistry();
      const handler1 = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '1' }] });
      const handler2 = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '2' }] });

      registry.register('test_tool', handler1);
      registry.register('test_tool', handler2);

      expect(registry.getRegisteredTools()).toHaveLength(1);
    });
  });

  describe('has', () => {
    it('should return true for registered tool', () => {
      const registry = new HandlerRegistry();
      registry.register('my_tool', vi.fn());

      expect(registry.has('my_tool')).toBe(true);
    });

    it('should return false for unregistered tool', () => {
      const registry = new HandlerRegistry();

      expect(registry.has('unknown_tool')).toBe(false);
    });
  });

  describe('getRegisteredTools', () => {
    it('should return empty array when no tools registered', () => {
      const registry = new HandlerRegistry();

      expect(registry.getRegisteredTools()).toEqual([]);
    });

    it('should return all registered tool names', () => {
      const registry = new HandlerRegistry();
      registry.register('tool_a', vi.fn());
      registry.register('tool_b', vi.fn());
      registry.register('tool_c', vi.fn());

      const tools = registry.getRegisteredTools();

      expect(tools).toHaveLength(3);
      expect(tools).toContain('tool_a');
      expect(tools).toContain('tool_b');
      expect(tools).toContain('tool_c');
    });
  });

  describe('execute', () => {
    it('should execute registered handler with args and context', async () => {
      const registry = new HandlerRegistry();
      const mockHandler = vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'success' }],
      });
      const mockContext = createMockContext();
      const args = { param: 'value' };

      registry.register('test_tool', mockHandler);
      await registry.execute('test_tool', args, mockContext);

      expect(mockHandler).toHaveBeenCalledWith(args, mockContext);
    });

    it('should return handler result', async () => {
      const registry = new HandlerRegistry();
      const expectedResult = {
        content: [{ type: 'text', text: JSON.stringify({ data: 'test' }) }],
      };
      const mockHandler = vi.fn().mockResolvedValue(expectedResult);

      registry.register('test_tool', mockHandler);
      const result = await registry.execute('test_tool', {}, createMockContext());

      expect(result).toBe(expectedResult);
    });

    it('should return error response for unknown tool', async () => {
      const registry = new HandlerRegistry();

      const result = await registry.execute('unknown_tool', {}, createMockContext());

      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Unknown tool');
      expect(result.content[0].text).toContain('unknown_tool');
    });

    it('should propagate handler errors', async () => {
      const registry = new HandlerRegistry();
      const mockHandler = vi.fn().mockRejectedValue(new Error('Handler failed'));

      registry.register('failing_tool', mockHandler);

      await expect(registry.execute('failing_tool', {}, createMockContext())).rejects.toThrow(
        'Handler failed'
      );
    });

    it('should pass context dependencies to handler', async () => {
      const registry = new HandlerRegistry();
      const mockHandler = vi.fn().mockResolvedValue({ content: [] });

      const context: HandlerContext = {
        debateEngine: { executeRounds: vi.fn() } as any,
        sessionManager: { getSession: vi.fn() } as any,
        agentRegistry: { getAllAgentIds: vi.fn() } as any,
        aiConsensusAnalyzer: { analyze: vi.fn() } as any,
        keyPointsExtractor: { extract: vi.fn() } as any,
      };

      registry.register('context_tool', mockHandler);
      await registry.execute('context_tool', {}, context);

      expect(mockHandler).toHaveBeenCalledWith({}, context);
      const passedContext = mockHandler.mock.calls[0][1];
      expect(passedContext.debateEngine).toBe(context.debateEngine);
      expect(passedContext.sessionManager).toBe(context.sessionManager);
      expect(passedContext.agentRegistry).toBe(context.agentRegistry);
    });
  });
});
