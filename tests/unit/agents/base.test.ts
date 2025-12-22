import { describe, it, expect, beforeEach } from 'vitest';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentConfig, DebateContext, AgentResponse, Citation, ToolCallRecord } from '../../../src/types/index.js';

describe('BaseAgent', () => {
  const defaultConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    provider: 'anthropic',
    model: 'test-model',
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
    it('should initialize with provided config', () => {
      const agent = new MockAgent(defaultConfig);

      expect(agent.id).toBe('test-agent');
      expect(agent.name).toBe('Test Agent');
      expect(agent.provider).toBe('anthropic');
      expect(agent.model).toBe('test-model');
    });

    it('should use default temperature when not provided', () => {
      const config: AgentConfig = {
        id: 'test',
        name: 'Test',
        provider: 'openai',
        model: 'gpt-4',
      };
      const agent = new MockAgent(config);
      const info = agent.getInfo();

      expect(info.provider).toBe('openai');
    });
  });

  describe('getInfo', () => {
    it('should return agent info', () => {
      const agent = new MockAgent(defaultConfig);
      const info = agent.getInfo();

      expect(info).toEqual({
        id: 'test-agent',
        name: 'Test Agent',
        provider: 'anthropic',
        model: 'test-model',
      });
    });
  });

  describe('setToolkit', () => {
    it('should accept toolkit', () => {
      const agent = new MockAgent(defaultConfig);
      const mockToolkit = {
        getTools: () => [],
        executeTool: async () => ({}),
      };

      // Should not throw
      agent.setToolkit(mockToolkit);
    });
  });

  describe('buildSystemPrompt', () => {
    it('should include modePrompt when provided in context', () => {
      // Create a test agent that exposes buildSystemPrompt
      class TestAgent extends MockAgent {
        public testBuildSystemPrompt(context: DebateContext): string {
          return this.buildSystemPrompt(context);
        }
      }

      const agent = new TestAgent(defaultConfig);
      const contextWithModePrompt: DebateContext = {
        ...defaultContext,
        modePrompt: 'Mode: Collaborative Discussion\n\nWork together to find common ground.',
      };

      const systemPrompt = agent.testBuildSystemPrompt(contextWithModePrompt);

      expect(systemPrompt).toContain('Mode: Collaborative Discussion');
      expect(systemPrompt).toContain('find common ground');
    });

    it('should not include modePrompt section when not provided', () => {
      class TestAgent extends MockAgent {
        public testBuildSystemPrompt(context: DebateContext): string {
          return this.buildSystemPrompt(context);
        }
      }

      const agent = new TestAgent(defaultConfig);
      const systemPrompt = agent.testBuildSystemPrompt(defaultContext);

      // Should contain base instructions but not mode-specific prompt
      expect(systemPrompt).toContain('Should AI be regulated?');
      expect(systemPrompt).toContain('collaborative');
      expect(systemPrompt).not.toContain('Mode:');
    });

    it('should include topic and round information', () => {
      class TestAgent extends MockAgent {
        public testBuildSystemPrompt(context: DebateContext): string {
          return this.buildSystemPrompt(context);
        }
      }

      const agent = new TestAgent(defaultConfig);
      const systemPrompt = agent.testBuildSystemPrompt(defaultContext);

      expect(systemPrompt).toContain('Should AI be regulated?');
      expect(systemPrompt).toContain('Round 1 of 3');
      expect(systemPrompt).toContain('collaborative');
    });

    it('should include focus question when provided', () => {
      class TestAgent extends MockAgent {
        public testBuildSystemPrompt(context: DebateContext): string {
          return this.buildSystemPrompt(context);
        }
      }

      const agent = new TestAgent(defaultConfig);
      const contextWithFocus: DebateContext = {
        ...defaultContext,
        focusQuestion: 'What about privacy implications?',
      };

      const systemPrompt = agent.testBuildSystemPrompt(contextWithFocus);

      expect(systemPrompt).toContain('Focus question: What about privacy implications?');
    });
  });
});

describe('MockAgent', () => {
  const defaultConfig: AgentConfig = {
    id: 'mock-agent',
    name: 'Mock Agent',
    provider: 'anthropic',
    model: 'mock-model',
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Test Topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  describe('generateResponse', () => {
    it('should generate default mock response', async () => {
      const agent = new MockAgent(defaultConfig);
      const response = await agent.generateResponse(defaultContext);

      expect(response.agentId).toBe('mock-agent');
      expect(response.agentName).toBe('Mock Agent');
      expect(response.position).toContain('Mock position');
      expect(response.confidence).toBe(0.75);
      expect(response.timestamp).toBeInstanceOf(Date);
    });

    it('should use custom mock response when set', async () => {
      const customResponse: AgentResponse = {
        agentId: 'custom',
        agentName: 'Custom',
        position: 'Custom position',
        reasoning: 'Custom reasoning',
        confidence: 0.9,
        timestamp: new Date(),
      };

      const agent = new MockAgent(defaultConfig, { mockResponse: customResponse });
      const response = await agent.generateResponse(defaultContext);

      expect(response.position).toBe('Custom position');
      expect(response.reasoning).toBe('Custom reasoning');
      expect(response.confidence).toBe(0.9);
      // Agent ID and name should be overwritten
      expect(response.agentId).toBe('mock-agent');
      expect(response.agentName).toBe('Mock Agent');
    });

    it('should allow updating mock response', async () => {
      const agent = new MockAgent(defaultConfig);

      const firstResponse = await agent.generateResponse(defaultContext);
      expect(firstResponse.position).toContain('Mock position');

      agent.setMockResponse({
        agentId: 'mock-agent',
        agentName: 'Mock Agent',
        position: 'Updated position',
        reasoning: 'Updated reasoning',
        confidence: 0.95,
        timestamp: new Date(),
      });

      const secondResponse = await agent.generateResponse(defaultContext);
      expect(secondResponse.position).toBe('Updated position');
    });

    it('should respect response delay', async () => {
      const delay = 50;
      const agent = new MockAgent(defaultConfig, { responseDelay: delay });

      const start = Date.now();
      await agent.generateResponse(defaultContext);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(delay - 10); // Allow small margin
    });

    it('should include context info in default response', async () => {
      const agent = new MockAgent(defaultConfig);
      const context: DebateContext = {
        ...defaultContext,
        topic: 'Climate Change',
        currentRound: 2,
        totalRounds: 5,
      };

      const response = await agent.generateResponse(context);

      expect(response.position).toContain('Climate Change');
      expect(response.reasoning).toContain('Round 2/5');
    });
  });

  describe('multiple agents', () => {
    it('should work with different configurations', async () => {
      const agent1 = new MockAgent({
        id: 'agent-1',
        name: 'Agent One',
        provider: 'anthropic',
        model: 'claude',
      });

      const agent2 = new MockAgent({
        id: 'agent-2',
        name: 'Agent Two',
        provider: 'openai',
        model: 'gpt-4',
      });

      const [response1, response2] = await Promise.all([
        agent1.generateResponse(defaultContext),
        agent2.generateResponse(defaultContext),
      ]);

      expect(response1.agentId).toBe('agent-1');
      expect(response2.agentId).toBe('agent-2');
      expect(response1.agentName).toBe('Agent One');
      expect(response2.agentName).toBe('Agent Two');
    });
  });
});

describe('parseResponse', () => {
  const defaultConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    provider: 'anthropic',
    model: 'test-model',
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Test Topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  // Expose protected parseResponse for testing
  class TestableAgent extends MockAgent {
    public testParseResponse(raw: string, context: DebateContext) {
      return this.parseResponse(raw, context);
    }
  }

  it('should parse standard JSON response with position/reasoning/confidence', () => {
    const agent = new TestableAgent(defaultConfig);
    const raw = JSON.stringify({
      position: 'Test position',
      reasoning: 'Test reasoning',
      confidence: 0.85,
    });

    const result = agent.testParseResponse(raw, defaultContext);

    expect(result.position).toBe('Test position');
    expect(result.reasoning).toBe('Test reasoning');
    expect(result.confidence).toBe(0.85);
  });

  it('should use defaults when position/reasoning are empty strings', () => {
    const agent = new TestableAgent(defaultConfig);
    const raw = JSON.stringify({
      position: '',
      reasoning: '',
      confidence: 0.5,
    });

    const result = agent.testParseResponse(raw, defaultContext);

    expect(result.position).toBe('Unable to determine position');
    expect(result.reasoning).toBe('Unable to determine reasoning');
  });

  it('should preserve raw JSON when no position/reasoning fields exist (keyPoints case)', () => {
    const agent = new TestableAgent(defaultConfig);
    const raw = JSON.stringify({
      keyPoints: ['Point 1', 'Point 2', 'Point 3'],
    });

    const result = agent.testParseResponse(raw, defaultContext);

    // Should fall back to preserving raw text in reasoning
    expect(result.reasoning).toContain('keyPoints');
    expect(result.reasoning).toContain('Point 1');
    expect(result.reasoning).toContain('Point 2');
    expect(result.reasoning).toContain('Point 3');
  });

  it('should preserve arbitrary JSON for downstream processing', () => {
    const agent = new TestableAgent(defaultConfig);
    const customData = {
      analysis: { score: 0.9, category: 'high' },
      tags: ['important', 'urgent'],
    };
    const raw = JSON.stringify(customData);

    const result = agent.testParseResponse(raw, defaultContext);

    // The raw JSON should be preserved in reasoning
    expect(result.reasoning).toContain('analysis');
    expect(result.reasoning).toContain('score');
    expect(result.reasoning).toContain('0.9');
  });

  it('should clamp confidence to valid range [0, 1]', () => {
    const agent = new TestableAgent(defaultConfig);

    // Test confidence > 1
    let result = agent.testParseResponse(
      JSON.stringify({ position: 'test', reasoning: 'test', confidence: 1.5 }),
      defaultContext
    );
    expect(result.confidence).toBe(1);

    // Test confidence < 0
    result = agent.testParseResponse(
      JSON.stringify({ position: 'test', reasoning: 'test', confidence: -0.5 }),
      defaultContext
    );
    expect(result.confidence).toBe(0);
  });

  it('should handle malformed JSON gracefully', () => {
    const agent = new TestableAgent(defaultConfig);
    const raw = 'This is not JSON at all';

    const result = agent.testParseResponse(raw, defaultContext);

    // Should fallback to raw text
    expect(result.reasoning).toBe('This is not JSON at all');
    expect(result.confidence).toBe(0.5);
  });

  it('should extract JSON from text with surrounding content', () => {
    const agent = new TestableAgent(defaultConfig);
    const raw = `Here is my analysis:
{"position": "Embedded position", "reasoning": "Embedded reasoning", "confidence": 0.7}
Hope this helps!`;

    const result = agent.testParseResponse(raw, defaultContext);

    expect(result.position).toBe('Embedded position');
    expect(result.reasoning).toBe('Embedded reasoning');
    expect(result.confidence).toBe(0.7);
  });

  it('should handle JSON with only position field', () => {
    const agent = new TestableAgent(defaultConfig);
    const raw = JSON.stringify({
      position: 'Only position provided',
    });

    const result = agent.testParseResponse(raw, defaultContext);

    expect(result.position).toBe('Only position provided');
    expect(result.reasoning).toBe('Unable to determine reasoning');
  });

  it('should handle JSON with only reasoning field', () => {
    const agent = new TestableAgent(defaultConfig);
    const raw = JSON.stringify({
      reasoning: 'Only reasoning provided',
    });

    const result = agent.testParseResponse(raw, defaultContext);

    expect(result.position).toBe('Unable to determine position');
    expect(result.reasoning).toBe('Only reasoning provided');
  });
});

describe('extractCitationsFromToolResult', () => {
  const defaultConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    provider: 'anthropic',
    model: 'test-model',
  };

  // Expose protected method for testing
  class TestableAgent extends MockAgent {
    public testExtractCitationsFromToolResult(toolName: string, result: unknown): Citation[] {
      return this.extractCitationsFromToolResult(toolName, result);
    }
  }

  it('should extract citations from search_web tool result', () => {
    const agent = new TestableAgent(defaultConfig);
    const result = {
      success: true,
      data: {
        results: [
          { title: 'Article 1', url: 'https://example.com/1', snippet: 'Snippet 1' },
          { title: 'Article 2', url: 'https://example.com/2', snippet: 'Snippet 2' },
        ],
      },
    };

    const citations = agent.testExtractCitationsFromToolResult('search_web', result);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      title: 'Article 1',
      url: 'https://example.com/1',
      snippet: 'Snippet 1',
    });
    expect(citations[1]).toEqual({
      title: 'Article 2',
      url: 'https://example.com/2',
      snippet: 'Snippet 2',
    });
  });

  it('should extract citations from perplexity_search tool result', () => {
    const agent = new TestableAgent(defaultConfig);
    const result = {
      success: true,
      data: {
        citations: [
          { title: 'Source 1', url: 'https://source.com/1', snippet: 'Info 1' },
        ],
      },
    };

    const citations = agent.testExtractCitationsFromToolResult('perplexity_search', result);

    expect(citations).toHaveLength(1);
    expect(citations[0]).toEqual({
      title: 'Source 1',
      url: 'https://source.com/1',
      snippet: 'Info 1',
    });
  });

  it('should return empty array when success is false', () => {
    const agent = new TestableAgent(defaultConfig);
    const result = {
      success: false,
      data: {
        results: [
          { title: 'Article', url: 'https://example.com', snippet: 'Snippet' },
        ],
      },
    };

    const citations = agent.testExtractCitationsFromToolResult('search_web', result);

    expect(citations).toHaveLength(0);
  });

  it('should return empty array for non-search tools', () => {
    const agent = new TestableAgent(defaultConfig);
    const result = {
      success: true,
      data: {
        results: [
          { title: 'Article', url: 'https://example.com', snippet: 'Snippet' },
        ],
      },
    };

    const citations = agent.testExtractCitationsFromToolResult('other_tool', result);

    expect(citations).toHaveLength(0);
  });

  it('should return empty array for null/undefined result', () => {
    const agent = new TestableAgent(defaultConfig);

    expect(agent.testExtractCitationsFromToolResult('search_web', null)).toHaveLength(0);
    expect(agent.testExtractCitationsFromToolResult('search_web', undefined)).toHaveLength(0);
  });

  it('should return empty array when data is missing', () => {
    const agent = new TestableAgent(defaultConfig);
    const result = { success: true };

    const citations = agent.testExtractCitationsFromToolResult('search_web', result);

    expect(citations).toHaveLength(0);
  });
});

describe('extractResponseFromToolCallsOrText', () => {
  const defaultConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    provider: 'anthropic',
    model: 'test-model',
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Test Topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  // Expose protected method for testing
  class TestableAgent extends MockAgent {
    public testExtractResponseFromToolCallsOrText(
      toolCalls: ToolCallRecord[],
      rawText: string,
      context: DebateContext
    ) {
      return this.extractResponseFromToolCallsOrText(toolCalls, rawText, context);
    }
  }

  it('should extract response from submit_response tool call', () => {
    const agent = new TestableAgent(defaultConfig);
    const toolCalls: ToolCallRecord[] = [
      {
        toolName: 'submit_response',
        input: {},
        output: {
          success: true,
          data: {
            position: 'Tool position',
            reasoning: 'Tool reasoning',
            confidence: 0.9,
          },
        },
        timestamp: new Date(),
      },
    ];

    const result = agent.testExtractResponseFromToolCallsOrText(toolCalls, 'Raw text', defaultContext);

    expect(result.position).toBe('Tool position');
    expect(result.reasoning).toBe('Tool reasoning');
    expect(result.confidence).toBe(0.9);
  });

  it('should fall back to text parsing when submit_response fails', () => {
    const agent = new TestableAgent(defaultConfig);
    const toolCalls: ToolCallRecord[] = [
      {
        toolName: 'submit_response',
        input: {},
        output: {
          success: false,
          error: 'Validation failed',
        },
        timestamp: new Date(),
      },
    ];
    const rawText = JSON.stringify({
      position: 'Text position',
      reasoning: 'Text reasoning',
      confidence: 0.7,
    });

    const result = agent.testExtractResponseFromToolCallsOrText(toolCalls, rawText, defaultContext);

    expect(result.position).toBe('Text position');
    expect(result.reasoning).toBe('Text reasoning');
    expect(result.confidence).toBe(0.7);
  });

  it('should fall back to text parsing when no submit_response tool call', () => {
    const agent = new TestableAgent(defaultConfig);
    const toolCalls: ToolCallRecord[] = [
      {
        toolName: 'search_web',
        input: { query: 'test' },
        output: { success: true, data: { results: [] } },
        timestamp: new Date(),
      },
    ];
    const rawText = JSON.stringify({
      position: 'Parsed position',
      reasoning: 'Parsed reasoning',
      confidence: 0.8,
    });

    const result = agent.testExtractResponseFromToolCallsOrText(toolCalls, rawText, defaultContext);

    expect(result.position).toBe('Parsed position');
    expect(result.reasoning).toBe('Parsed reasoning');
    expect(result.confidence).toBe(0.8);
  });

  it('should clamp confidence to valid range', () => {
    const agent = new TestableAgent(defaultConfig);
    const toolCalls: ToolCallRecord[] = [
      {
        toolName: 'submit_response',
        input: {},
        output: {
          success: true,
          data: {
            position: 'Test',
            reasoning: 'Test',
            confidence: 1.5, // > 1
          },
        },
        timestamp: new Date(),
      },
    ];

    const result = agent.testExtractResponseFromToolCallsOrText(toolCalls, '', defaultContext);

    expect(result.confidence).toBe(1);
  });

  it('should use default values when fields are missing', () => {
    const agent = new TestableAgent(defaultConfig);
    const toolCalls: ToolCallRecord[] = [
      {
        toolName: 'submit_response',
        input: {},
        output: {
          success: true,
          data: {},
        },
        timestamp: new Date(),
      },
    ];

    const result = agent.testExtractResponseFromToolCallsOrText(toolCalls, '', defaultContext);

    expect(result.position).toBe('Unable to determine position');
    expect(result.reasoning).toBe('Unable to determine reasoning');
    expect(result.confidence).toBe(0.5);
  });
});

describe('buildAgentResponse', () => {
  const defaultConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    provider: 'anthropic',
    model: 'test-model',
  };

  // Expose protected method for testing
  class TestableAgent extends MockAgent {
    public testBuildAgentResponse(params: {
      parsed: { position: string; reasoning: string; confidence: number };
      rawText: string;
      citations: Citation[];
      toolCalls: ToolCallRecord[];
      images?: { url: string; description?: string }[];
      relatedQuestions?: string[];
    }): AgentResponse {
      return this.buildAgentResponse(params);
    }
  }

  it('should build complete response with all fields', () => {
    const agent = new TestableAgent(defaultConfig);
    const citations: Citation[] = [{ title: 'Test', url: 'https://test.com' }];
    const toolCalls: ToolCallRecord[] = [
      { toolName: 'search_web', input: {}, output: {}, timestamp: new Date() },
    ];

    const result = agent.testBuildAgentResponse({
      parsed: {
        position: 'My position',
        reasoning: 'My reasoning',
        confidence: 0.85,
      },
      rawText: 'Raw text content',
      citations,
      toolCalls,
    });

    expect(result.agentId).toBe('test-agent');
    expect(result.agentName).toBe('Test Agent');
    expect(result.position).toBe('My position');
    expect(result.reasoning).toBe('My reasoning');
    expect(result.confidence).toBe(0.85);
    expect(result.citations).toEqual(citations);
    expect(result.toolCalls).toEqual(toolCalls);
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('should omit empty citations and toolCalls arrays', () => {
    const agent = new TestableAgent(defaultConfig);

    const result = agent.testBuildAgentResponse({
      parsed: {
        position: 'Position',
        reasoning: 'Reasoning',
        confidence: 0.5,
      },
      rawText: '',
      citations: [],
      toolCalls: [],
    });

    expect(result.citations).toBeUndefined();
    expect(result.toolCalls).toBeUndefined();
  });

  it('should include images and relatedQuestions for Perplexity', () => {
    const agent = new TestableAgent(defaultConfig);
    const images = [{ url: 'https://image.com/1.jpg', description: 'Image 1' }];
    const relatedQuestions = ['Question 1?', 'Question 2?'];

    const result = agent.testBuildAgentResponse({
      parsed: {
        position: 'Position',
        reasoning: 'Reasoning',
        confidence: 0.7,
      },
      rawText: '',
      citations: [],
      toolCalls: [],
      images,
      relatedQuestions,
    });

    expect(result.images).toEqual(images);
    expect(result.relatedQuestions).toEqual(relatedQuestions);
  });

  it('should omit empty images and relatedQuestions arrays', () => {
    const agent = new TestableAgent(defaultConfig);

    const result = agent.testBuildAgentResponse({
      parsed: {
        position: 'Position',
        reasoning: 'Reasoning',
        confidence: 0.5,
      },
      rawText: '',
      citations: [],
      toolCalls: [],
      images: [],
      relatedQuestions: [],
    });

    expect(result.images).toBeUndefined();
    expect(result.relatedQuestions).toBeUndefined();
  });

  it('should use fallback values for empty position/reasoning', () => {
    const agent = new TestableAgent(defaultConfig);

    const result = agent.testBuildAgentResponse({
      parsed: {
        position: '',
        reasoning: '',
        confidence: 0.5,
      },
      rawText: 'Fallback raw text',
      citations: [],
      toolCalls: [],
    });

    expect(result.position).toBe('Unable to determine position');
    expect(result.reasoning).toBe('Fallback raw text');
  });

  it('should use final fallback when both parsed and rawText are empty', () => {
    const agent = new TestableAgent(defaultConfig);

    const result = agent.testBuildAgentResponse({
      parsed: {
        position: '',
        reasoning: '',
        confidence: 0.5,
      },
      rawText: '',
      citations: [],
      toolCalls: [],
    });

    expect(result.position).toBe('Unable to determine position');
    expect(result.reasoning).toBe('Unable to determine reasoning');
  });
});

describe('buildUserMessage', () => {
  const defaultConfig: AgentConfig = {
    id: 'test-agent',
    name: 'Test Agent',
    provider: 'anthropic',
    model: 'test-model',
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Test Topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  // Expose protected method for testing
  class TestableAgent extends MockAgent {
    public testBuildUserMessage(context: DebateContext): string {
      return this.buildUserMessage(context);
    }
  }

  it('should include contextResults when provided', () => {
    const agent = new TestableAgent(defaultConfig);
    const contextWithResults: DebateContext = {
      ...defaultContext,
      contextResults: [
        {
          requestId: 'ctx-123',
          success: true,
          result: 'Here is the information about AI regulations in the EU.',
        },
        {
          requestId: 'ctx-456',
          success: true,
          result: 'The latest statistics show 85% adoption rate.',
        },
      ],
    };

    const message = agent.testBuildUserMessage(contextWithResults);

    expect(message).toContain('=== PROVIDED CONTEXT ===');
    expect(message).toContain('=== END PROVIDED CONTEXT ===');
    expect(message).toContain('[Request ID: ctx-123]');
    expect(message).toContain('Here is the information about AI regulations in the EU.');
    expect(message).toContain('[Request ID: ctx-456]');
    expect(message).toContain('The latest statistics show 85% adoption rate.');
  });

  it('should include error messages for failed context results', () => {
    const agent = new TestableAgent(defaultConfig);
    const contextWithFailedResults: DebateContext = {
      ...defaultContext,
      contextResults: [
        {
          requestId: 'ctx-789',
          success: false,
          error: 'Unable to find the requested information.',
        },
      ],
    };

    const message = agent.testBuildUserMessage(contextWithFailedResults);

    expect(message).toContain('=== PROVIDED CONTEXT ===');
    expect(message).toContain('[Request ID: ctx-789]');
    expect(message).toContain('[Error: Unable to find the requested information.]');
  });

  it('should not include context section when contextResults is empty', () => {
    const agent = new TestableAgent(defaultConfig);
    const contextWithEmptyResults: DebateContext = {
      ...defaultContext,
      contextResults: [],
    };

    const message = agent.testBuildUserMessage(contextWithEmptyResults);

    expect(message).not.toContain('=== PROVIDED CONTEXT ===');
    expect(message).not.toContain('=== END PROVIDED CONTEXT ===');
  });

  it('should not include context section when contextResults is undefined', () => {
    const agent = new TestableAgent(defaultConfig);

    const message = agent.testBuildUserMessage(defaultContext);

    expect(message).not.toContain('=== PROVIDED CONTEXT ===');
    expect(message).not.toContain('=== END PROVIDED CONTEXT ===');
  });

  it('should handle mix of successful and failed context results', () => {
    const agent = new TestableAgent(defaultConfig);
    const contextWithMixedResults: DebateContext = {
      ...defaultContext,
      contextResults: [
        {
          requestId: 'ctx-success',
          success: true,
          result: 'Successfully retrieved data.',
        },
        {
          requestId: 'ctx-error',
          success: false,
          error: 'Service temporarily unavailable.',
        },
      ],
    };

    const message = agent.testBuildUserMessage(contextWithMixedResults);

    expect(message).toContain('[Request ID: ctx-success]');
    expect(message).toContain('Successfully retrieved data.');
    expect(message).toContain('[Request ID: ctx-error]');
    expect(message).toContain('[Error: Service temporarily unavailable.]');
  });

  it('should place context results before previous responses', () => {
    const agent = new TestableAgent(defaultConfig);
    const contextWithBoth: DebateContext = {
      ...defaultContext,
      contextResults: [
        {
          requestId: 'ctx-1',
          success: true,
          result: 'Context information here.',
        },
      ],
      previousResponses: [
        {
          agentId: 'agent-1',
          agentName: 'Agent One',
          position: 'Previous position',
          reasoning: 'Previous reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        },
      ],
    };

    const message = agent.testBuildUserMessage(contextWithBoth);

    const contextIndex = message.indexOf('=== PROVIDED CONTEXT ===');
    const responsesIndex = message.indexOf('Previous responses');

    expect(contextIndex).toBeLessThan(responsesIndex);
  });
});
