import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAgent, createClaudeAgent } from '../../../src/agents/claude.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';
import type { AgentToolkit } from '../../../src/agents/base.js';

// Mock Anthropic client
const createMockClient = (responseContent: string, stopReason = 'end_turn') => {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: responseContent }],
        stop_reason: stopReason,
      }),
    },
  };
};

// Mock client that simulates tool use
const createMockClientWithToolUse = (
  toolCallName: string,
  toolCallInput: unknown,
  toolResult: unknown,
  finalResponse: string
) => {
  let callCount = 0;
  return {
    messages: {
      create: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            content: [
              {
                type: 'tool_use',
                id: 'tool-1',
                name: toolCallName,
                input: toolCallInput,
              },
            ],
            stop_reason: 'tool_use',
          });
        }
        return Promise.resolve({
          content: [{ type: 'text', text: finalResponse }],
          stop_reason: 'end_turn',
        });
      }),
    },
  };
};

describe('ClaudeAgent', () => {
  const defaultConfig: AgentConfig = {
    id: 'claude-test',
    name: 'Claude Test',
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    temperature: 0.7,
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Should AI be regulated?',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  describe('constructor', () => {
    it('should create agent with custom client', () => {
      const mockClient = createMockClient('test');
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      expect(agent.id).toBe('claude-test');
      expect(agent.provider).toBe('anthropic');
    });
  });

  describe('generateResponse', () => {
    it('should generate response from Claude API', async () => {
      const mockResponse = JSON.stringify({
        position: 'AI should be regulated',
        reasoning: 'To ensure safety and fairness',
        confidence: 0.85,
      });

      const mockClient = createMockClient(mockResponse);
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.agentId).toBe('claude-test');
      expect(response.agentName).toBe('Claude Test');
      expect(response.position).toBe('AI should be regulated');
      expect(response.reasoning).toBe('To ensure safety and fairness');
      expect(response.confidence).toBe(0.85);
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should call API with correct parameters', async () => {
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      await agent.generateResponse(defaultContext);

      expect(mockClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-opus-20240229',
          max_tokens: 4096,
          temperature: 0.7,
        })
      );
    });

    it('should handle non-JSON response gracefully', async () => {
      const mockClient = createMockClient('This is a plain text response without JSON');
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.position).toBeDefined();
      expect(response.reasoning).toContain('plain text response');
      expect(response.confidence).toBe(0.5); // fallback
    });

    it('should clamp confidence to 0-1 range', async () => {
      const mockResponse = JSON.stringify({
        position: 'Test',
        reasoning: 'Test',
        confidence: 1.5, // Above 1
      });

      const mockClient = createMockClient(mockResponse);
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const response = await agent.generateResponse(defaultContext);

      expect(response.confidence).toBe(1);
    });

    it('should include context in system prompt', async () => {
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const contextWithFocus: DebateContext = {
        ...defaultContext,
        focusQuestion: 'What about privacy concerns?',
      };

      await agent.generateResponse(contextWithFocus);

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      expect(call?.system).toContain('Should AI be regulated?');
      expect(call?.system).toContain('collaborative');
      expect(call?.system).toContain('What about privacy concerns?');
    });

    it('should include previous responses in user message', async () => {
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });

      const contextWithPrevious: DebateContext = {
        ...defaultContext,
        previousResponses: [
          {
            agentId: 'other-agent',
            agentName: 'Other Agent',
            position: 'AI should not be regulated',
            reasoning: 'Innovation should be free',
            confidence: 0.7,
            timestamp: new Date(),
          },
        ],
      };

      await agent.generateResponse(contextWithPrevious);

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      const userMessage = call?.messages[0]?.content;
      expect(userMessage).toContain('Other Agent');
      expect(userMessage).toContain('AI should not be regulated');
    });
  });

  describe('tool use', () => {
    it('should handle tool use response', async () => {
      const mockClient = createMockClientWithToolUse(
        'search_web',
        { query: 'AI regulation' },
        { results: [{ title: 'AI News', url: 'https://example.com', snippet: 'Recent developments...' }] },
        '{"position":"Based on research","reasoning":"Found relevant sources","confidence":0.9}'
      );

      const mockToolkit: AgentToolkit = {
        getTools: () => [
          {
            name: 'search_web',
            description: 'Search the web',
            parameters: { query: { type: 'string' } },
          },
        ],
        executeTool: vi.fn().mockResolvedValue({
          results: [
            { title: 'AI News', url: 'https://example.com', snippet: 'Recent developments...' },
          ],
        }),
      };

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      const response = await agent.generateResponse(defaultContext);

      expect(mockToolkit.executeTool).toHaveBeenCalledWith('search_web', { query: 'AI regulation' });
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls?.[0]?.toolName).toBe('search_web');
      expect(response.citations).toHaveLength(1);
      expect(response.citations?.[0]?.title).toBe('AI News');
    });

    it('should provide tools to API when toolkit is set', async () => {
      const mockClient = createMockClient('{"position":"test","reasoning":"test","confidence":0.5}');
      const mockToolkit: AgentToolkit = {
        getTools: () => [
          {
            name: 'test_tool',
            description: 'A test tool',
            parameters: { input: { type: 'string' } },
          },
        ],
        executeTool: vi.fn(),
      };

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      await agent.generateResponse(defaultContext);

      const call = mockClient.messages.create.mock.calls[0]?.[0];
      expect(call?.tools).toBeDefined();
      expect(call?.tools).toHaveLength(1);
      expect(call?.tools?.[0]?.name).toBe('test_tool');
    });

    it('should handle tool execution errors', async () => {
      const mockClient = createMockClientWithToolUse(
        'failing_tool',
        { input: 'test' },
        { error: 'Tool failed' },
        '{"position":"Handled error","reasoning":"Continued despite tool failure","confidence":0.6}'
      );

      const mockToolkit: AgentToolkit = {
        getTools: () => [
          {
            name: 'failing_tool',
            description: 'A failing tool',
            parameters: { input: { type: 'string' } },
          },
        ],
        executeTool: vi.fn().mockRejectedValue(new Error('Tool failed')),
      };

      const agent = new ClaudeAgent(defaultConfig, {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      });
      agent.setToolkit(mockToolkit);

      // Should not throw
      const response = await agent.generateResponse(defaultContext);
      expect(response.toolCalls?.[0]?.output).toEqual({ error: 'Tool failed' });
    });
  });
});

describe('createClaudeAgent', () => {
  it('should create agent with factory function', () => {
    const mockClient = createMockClient('test');
    const config: AgentConfig = {
      id: 'factory-agent',
      name: 'Factory Agent',
      provider: 'anthropic',
      model: 'claude-3-opus',
    };

    const agent = createClaudeAgent(config, undefined, {
      client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
    });

    expect(agent.id).toBe('factory-agent');
    expect(agent).toBeInstanceOf(ClaudeAgent);
  });

  it('should set toolkit when provided', () => {
    const mockClient = createMockClient('test');
    const mockToolkit: AgentToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
    };

    const agent = createClaudeAgent(
      {
        id: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
      },
      mockToolkit,
      {
        client: mockClient as unknown as ConstructorParameters<typeof ClaudeAgent>[1]['client'],
      }
    );

    expect(agent).toBeInstanceOf(ClaudeAgent);
  });
});
