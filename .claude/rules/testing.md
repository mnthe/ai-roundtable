# Testing Rules

## When to Apply

Apply these rules when:
- Writing new tests
- Modifying existing tests
- Adding new features (tests required)
- Fixing bugs (regression tests required)

## Test Structure

```
tests/
├── unit/                    # Unit tests (no external calls)
│   ├── agents/             # Agent tests
│   ├── modes/              # Mode tests
│   ├── core/               # Core component tests
│   ├── tools/              # Toolkit tests
│   ├── storage/            # Storage tests
│   └── mcp/                # MCP server tests
└── integration/            # Integration tests (requires API keys)
    └── agents.test.ts
```

## Unit Test Patterns

### Agent Testing

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAgent } from '../../../src/agents/claude.js';
import type { DebateContext } from '../../../src/types/index.js';

describe('ClaudeAgent', () => {
  // Create mock client
  const createMockClient = (response: string, stopReason = 'end_turn') => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: response }],
        stop_reason: stopReason,
      }),
    },
  });

  const defaultConfig = {
    id: 'claude-test',
    name: 'Claude Test',
    provider: 'anthropic' as const,
    model: 'claude-sonnet-4-5',
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Test topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate response from API', async () => {
    const mockResponse = JSON.stringify({
      position: 'Test position',
      reasoning: 'Test reasoning',
      confidence: 0.85,
    });

    const mockClient = createMockClient(mockResponse);
    const agent = new ClaudeAgent(defaultConfig, { client: mockClient as any });

    const response = await agent.generateResponse(defaultContext);

    expect(response.agentId).toBe('claude-test');
    expect(response.position).toBe('Test position');
    expect(response.confidence).toBe(0.85);
    expect(mockClient.messages.create).toHaveBeenCalled();
  });

  it('should handle non-JSON responses gracefully', async () => {
    const mockClient = createMockClient('Plain text response');
    const agent = new ClaudeAgent(defaultConfig, { client: mockClient as any });

    const response = await agent.generateResponse(defaultContext);

    expect(response.reasoning).toContain('Plain text response');
    expect(response.confidence).toBe(0.5); // Default
  });

  it('should clamp confidence to valid range', async () => {
    const mockResponse = JSON.stringify({ confidence: 1.5 });
    const mockClient = createMockClient(mockResponse);
    const agent = new ClaudeAgent(defaultConfig, { client: mockClient as any });

    const response = await agent.generateResponse(defaultContext);

    expect(response.confidence).toBeLessThanOrEqual(1);
    expect(response.confidence).toBeGreaterThanOrEqual(0);
  });
});
```

### Mode Testing

```typescript
describe('AdversarialMode', () => {
  let mode: AdversarialMode;
  let mockToolkit: AgentToolkit;

  beforeEach(() => {
    mode = new AdversarialMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
      setContext: vi.fn(),
    };
  });

  it('should execute agents sequentially', async () => {
    const executionOrder: string[] = [];

    const agent1 = createMockAgent('1', async () => {
      executionOrder.push('1');
      return createMockResponse('1');
    });

    const agent2 = createMockAgent('2', async () => {
      executionOrder.push('2');
      return createMockResponse('2');
    });

    await mode.executeRound([agent1, agent2], defaultContext, mockToolkit);

    expect(executionOrder).toEqual(['1', '2']);
  });

  it('should accumulate responses in context', async () => {
    const receivedContexts: DebateContext[] = [];

    const agent1 = createMockAgent('1', async (ctx) => {
      receivedContexts.push(ctx);
      return createMockResponse('1');
    });

    const agent2 = createMockAgent('2', async (ctx) => {
      receivedContexts.push(ctx);
      return createMockResponse('2');
    });

    await mode.executeRound([agent1, agent2], defaultContext, mockToolkit);

    expect(receivedContexts[0].previousResponses).toHaveLength(0);
    expect(receivedContexts[1].previousResponses).toHaveLength(1);
  });
});
```

### Tool Testing

```typescript
describe('DefaultAgentToolkit', () => {
  it('should execute search_web tool', async () => {
    const mockSearchProvider = {
      search: vi.fn().mockResolvedValue([
        { title: 'Result', url: 'https://example.com', snippet: 'Test' },
      ]),
    };

    const toolkit = new DefaultAgentToolkit(mockSearchProvider);
    toolkit.setContext(defaultContext);

    const result = await toolkit.executeTool('search_web', { query: 'test' });

    expect(result.success).toBe(true);
    expect(result.data.results).toHaveLength(1);
    expect(mockSearchProvider.search).toHaveBeenCalledWith('test', expect.any(Object));
  });

  it('should return error for unknown tool', async () => {
    const toolkit = new DefaultAgentToolkit();

    const result = await toolkit.executeTool('unknown_tool', {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
```

## Integration Tests

Integration tests call real APIs and require API keys.

```typescript
// tests/integration/agents.test.ts
import { describe, it, expect } from 'vitest';
import { ClaudeAgent } from '../../src/agents/claude.js';

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Claude Integration', () => {
  it('should generate real response', async () => {
    const agent = new ClaudeAgent({
      id: 'claude-integration',
      name: 'Claude',
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
    });

    const response = await agent.generateResponse({
      sessionId: 'test',
      topic: 'What is 2 + 2?',
      mode: 'collaborative',
      currentRound: 1,
      totalRounds: 1,
      previousResponses: [],
    });

    expect(response.position).toBeDefined();
    expect(response.reasoning).toBeDefined();
    expect(response.confidence).toBeGreaterThan(0);
  }, 30000); // 30s timeout for API calls
});
```

## Mock Patterns

### Mock Anthropic Client

```typescript
const createMockAnthropicClient = (response: string, stopReason = 'end_turn', toolUse?: any[]) => ({
  messages: {
    create: vi.fn().mockResolvedValue({
      content: toolUse ?? [{ type: 'text', text: response }],
      stop_reason: stopReason,
    }),
  },
});
```

### Mock OpenAI Client

```typescript
const createMockOpenAIClient = (response: string, finishReason = 'stop', toolCalls?: any[]) => ({
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [{
          message: {
            content: response,
            role: 'assistant',
            tool_calls: toolCalls,
          },
          finish_reason: finishReason,
        }],
      }),
    },
  },
});
```

### Mock Agent

```typescript
import { MockAgent } from '../../../src/agents/base.js';

const createMockAgent = (id: string, responseOverride?: Partial<AgentResponse>) => {
  const agent = new MockAgent({
    id,
    name: `Agent ${id}`,
    provider: 'anthropic',
    model: 'mock',
  });

  agent.setMockResponse({
    agentId: id,
    agentName: `Agent ${id}`,
    position: `Position from ${id}`,
    reasoning: `Reasoning from ${id}`,
    confidence: 0.8,
    timestamp: new Date(),
    ...responseOverride,
  });

  return agent;
};
```

## Running Tests

```bash
# Run all unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test tests/unit/agents/claude.test.ts

# Run tests matching pattern
pnpm test -t "should generate response"

# Run integration tests (requires API keys)
pnpm test:integration
```

## Coverage Targets

| Metric | Target |
|--------|--------|
| Statements | 80% |
| Branches | 75% |
| Functions | 80% |
| Lines | 80% |

## Test Checklist

- [ ] Unit tests cover happy path
- [ ] Unit tests cover error cases
- [ ] Unit tests cover edge cases (empty arrays, null, undefined)
- [ ] Mock clients used (no real API calls)
- [ ] Test isolation (beforeEach with vi.clearAllMocks())
- [ ] Descriptive test names
- [ ] Integration test added for new providers (with skipIf)
- [ ] All tests pass: `pnpm test`
