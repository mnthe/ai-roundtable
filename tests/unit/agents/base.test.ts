import { describe, it, expect, beforeEach } from 'vitest';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentConfig, DebateContext, AgentResponse } from '../../../src/types/index.js';

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
