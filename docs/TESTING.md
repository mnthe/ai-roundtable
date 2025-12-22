# Testing Guide

This guide explains how to write and run tests for AI Roundtable.

## Test Stack

- **Vitest** - Test runner (Jest-compatible API)
- **Mock clients** - No real API calls in unit tests
- **Shared mock utilities** - `tests/utils/mocks.ts` provides reusable mock factories

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

## Test Structure

```
tests/
├── unit/                    # Unit tests (no external calls)
│   ├── agents/             # Agent tests
│   │   ├── base.test.ts
│   │   ├── claude.test.ts
│   │   ├── chatgpt.test.ts
│   │   ├── gemini.test.ts
│   │   ├── perplexity.test.ts
│   │   ├── registry.test.ts
│   │   ├── setup.test.ts
│   │   └── utils/
│   │       └── error-converter.test.ts
│   ├── modes/              # Mode tests
│   │   ├── base.test.ts
│   │   ├── collaborative.test.ts
│   │   ├── adversarial.test.ts
│   │   ├── socratic.test.ts
│   │   ├── expert-panel.test.ts
│   │   ├── devils-advocate.test.ts
│   │   ├── delphi.test.ts
│   │   ├── red-team-blue-team.test.ts
│   │   └── registry.test.ts
│   ├── core/               # Core component tests
│   │   ├── debate-engine.test.ts
│   │   ├── debate-engine-ai-consensus.test.ts
│   │   ├── session-manager.test.ts
│   │   ├── consensus-analyzer.test.ts
│   │   ├── ai-consensus-analyzer.test.ts
│   │   ├── ai-consensus-debug.test.ts
│   │   └── key-points-extractor.test.ts
│   ├── tools/              # Toolkit tests
│   │   └── toolkit.test.ts
│   ├── storage/            # Storage tests
│   │   ├── sqlite.test.ts
│   │   └── storage-interface.test.ts
│   ├── mcp/                # MCP server tests
│   │   ├── tools.test.ts
│   │   ├── keypoints.test.ts
│   │   └── synthesis.test.ts
│   ├── errors/             # Error tests
│   │   └── errors.test.ts
│   ├── utils/              # Utility tests
│   │   ├── retry.test.ts
│   │   └── env.test.ts
│   ├── types/              # Type tests
│   │   └── stored-session-schema.test.ts
│   ├── schemas.test.ts     # Schema validation tests
│   └── types.test.ts       # Type tests
├── utils/                   # Shared test utilities
│   ├── index.ts            # Re-exports from mocks.ts
│   └── mocks.ts            # Mock factories (createMockAnthropicClient, etc.)
└── integration/            # Integration tests (requires API keys)
    ├── setup.ts            # Test setup and helper functions (isProviderAvailable, etc.)
    ├── real-agents.test.ts
    └── e2e.test.ts
```

## Writing Unit Tests

### Testing Agents

Use mock clients to avoid real API calls:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAgent } from '../../../src/agents/claude.js';
import type { AgentConfig, DebateContext } from '../../../src/types/index.js';

// Create mock client
const createMockClient = (responseContent: string) => ({
  messages: {
    create: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: responseContent }],
      stop_reason: 'end_turn',
    }),
  },
});

describe('ClaudeAgent', () => {
  const defaultConfig: AgentConfig = {
    id: 'claude-test',
    name: 'Claude Test',
    provider: 'anthropic',
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

  it('should generate response from Claude API', async () => {
    const mockResponse = JSON.stringify({
      position: 'Test position',
      reasoning: 'Test reasoning',
      confidence: 0.85,
    });

    const mockClient = createMockClient(mockResponse);
    const agent = new ClaudeAgent(defaultConfig, {
      client: mockClient as unknown as Anthropic,
    });

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

    expect(response.position).toBeDefined();
    expect(response.confidence).toBe(0.5); // Fallback
  });
});
```

### Testing Modes

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdversarialMode } from '../../../src/modes/adversarial.js';
import { MockAgent } from '../../../src/agents/base.js';
import type { AgentToolkit } from '../../../src/agents/base.js';

describe('AdversarialMode', () => {
  let mode: AdversarialMode;
  let mockToolkit: AgentToolkit;

  beforeEach(() => {
    mode = new AdversarialMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
    };
  });

  it('should execute agents sequentially', async () => {
    const executionOrder: string[] = [];

    const agent1 = new MockAgent({
      id: 'agent-1',
      name: 'Agent 1',
      provider: 'anthropic',
      model: 'mock',
    });

    vi.spyOn(agent1, 'generateResponse').mockImplementation(async () => {
      executionOrder.push('agent-1');
      return {
        agentId: 'agent-1',
        agentName: 'Agent 1',
        position: 'Position 1',
        reasoning: 'Reasoning 1',
        confidence: 0.8,
        timestamp: new Date(),
      };
    });

    const agent2 = new MockAgent({
      id: 'agent-2',
      name: 'Agent 2',
      provider: 'openai',
      model: 'mock',
    });

    vi.spyOn(agent2, 'generateResponse').mockImplementation(async () => {
      executionOrder.push('agent-2');
      return {
        agentId: 'agent-2',
        agentName: 'Agent 2',
        position: 'Position 2',
        reasoning: 'Reasoning 2',
        confidence: 0.7,
        timestamp: new Date(),
      };
    });

    const responses = await mode.executeRound(
      [agent1, agent2],
      defaultContext,
      mockToolkit
    );

    expect(responses).toHaveLength(2);
    expect(executionOrder).toEqual(['agent-1', 'agent-2']);
  });
});
```

### Testing Tools

```typescript
import { describe, it, expect, vi } from 'vitest';
import { DefaultAgentToolkit } from '../../../src/tools/toolkit.js';

describe('fact_check tool', () => {
  it('should execute fact_check with debate evidence', async () => {
    const mockSessionData = {
      responses: [
        { agentName: 'Claude', position: 'AI should be regulated', confidence: 0.8 },
      ],
    };

    const mockSessionDataProvider = {
      getSession: vi.fn().mockResolvedValue(mockSessionData),
      findRelatedEvidence: vi.fn().mockResolvedValue([
        { agentName: 'Claude', evidence: 'Supports regulation', confidence: 0.8 },
      ]),
    };

    const toolkit = new DefaultAgentToolkit(mockSessionDataProvider);
    toolkit.setContext(defaultContext);

    const result = await toolkit.executeTool('fact_check', {
      claim: 'AI should be regulated',
    });

    expect(result.success).toBe(true);
    expect(result.data.debateEvidence).toBeDefined();
  });
});
```

### Testing with Parallel Execution

```typescript
it('should execute all agents in parallel', async () => {
  const startTimes: number[] = [];

  const createDelayedAgent = (id: string, delay: number) => {
    const agent = new MockAgent({ id, name: id, provider: 'mock', model: 'mock' });

    vi.spyOn(agent, 'generateResponse').mockImplementation(async () => {
      startTimes.push(Date.now());
      await new Promise(resolve => setTimeout(resolve, delay));
      return { /* response */ };
    });

    return agent;
  };

  const agents = [
    createDelayedAgent('agent-1', 50),
    createDelayedAgent('agent-2', 50),
    createDelayedAgent('agent-3', 50),
  ];

  await mode.executeRound(agents, context, toolkit);

  // All agents should start at roughly the same time
  const maxStartDiff = Math.max(...startTimes) - Math.min(...startTimes);
  expect(maxStartDiff).toBeLessThan(30); // All started within 30ms
});
```

## Mocking Patterns

### Mock OpenAI Client

```typescript
const createMockOpenAIClient = (
  response: string,
  finishReason = 'stop',
  toolCalls?: any[]
) => ({
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

### Mock Anthropic Client

```typescript
const createMockAnthropicClient = (
  response: string,
  stopReason = 'end_turn',
  toolUse?: any[]
) => ({
  messages: {
    create: vi.fn().mockResolvedValue({
      content: toolUse ?? [{ type: 'text', text: response }],
      stop_reason: stopReason,
    }),
  },
});
```

### Mock with Tool Calls

```typescript
const createMockClientWithToolUse = (
  toolName: string,
  toolArgs: string,
  finalResponse: string
) => {
  let callCount = 0;
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              choices: [{
                message: {
                  content: null,
                  tool_calls: [{
                    id: 'call-1',
                    type: 'function',
                    function: { name: toolName, arguments: toolArgs },
                  }],
                },
                finish_reason: 'tool_calls',
              }],
            });
          }
          return Promise.resolve({
            choices: [{
              message: { content: finalResponse },
              finish_reason: 'stop',
            }],
          });
        }),
      },
    },
  };
};
```

## Integration Tests

Integration tests call real APIs and require API keys. They are skipped in CI.

### Setup

Create `.env.test` with your test API keys:

```bash
ANTHROPIC_API_KEY=your-test-key
OPENAI_API_KEY=your-test-key
```

### Running

```bash
# Run integration tests
pnpm test:integration

# Run specific integration test
pnpm test:integration tests/integration/agents.test.ts
```

### Writing Integration Tests

Integration tests use helper functions from `tests/integration/setup.ts`:

```typescript
// tests/integration/agents.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ClaudeAgent } from '../../src/agents/claude.js';
import { isProviderAvailable } from './setup.js';

// Use isProviderAvailable helper for cleaner skip conditions
describe.skipIf(!isProviderAvailable('anthropic'))('Claude Integration', () => {
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

## Test Coverage

### Running Coverage

```bash
pnpm test:coverage
```

### Coverage Thresholds

The project aims for these coverage targets:

| Metric     | Target |
| ---------- | ------ |
| Statements | 80%    |
| Branches   | 75%    |
| Functions  | 80%    |
| Lines      | 80%    |

### Viewing Reports

Coverage reports are generated in `coverage/` directory:

```bash
# Open HTML report
open coverage/index.html
```

## Best Practices

### 1. Test Isolation

```typescript
beforeEach(() => {
  // Reset state before each test
  vi.clearAllMocks();
  registry.reset();
});
```

### 2. Descriptive Test Names

```typescript
// Good
it('should return error when query is missing', async () => { ... });

// Bad
it('test error', async () => { ... });
```

### 3. Test Edge Cases

```typescript
describe('confidence clamping', () => {
  it('should clamp confidence above 1 to 1', async () => { ... });
  it('should clamp confidence below 0 to 0', async () => { ... });
  it('should preserve valid confidence values', async () => { ... });
});
```

### 4. Use Type-Safe Mocks

```typescript
// Type-safe mock toolkit
const mockToolkit: AgentToolkit = {
  getTools: () => [],
  executeTool: vi.fn().mockResolvedValue({ success: true }),
};
```

### 5. Test Error Handling

```typescript
it('should handle API errors gracefully', async () => {
  const mockClient = {
    chat: {
      completions: {
        create: vi.fn().mockRejectedValue(new Error('API Error')),
      },
    },
  };

  const agent = new ChatGPTAgent(config, { client: mockClient as any });

  // Should not throw
  const response = await agent.generateResponse(context);
  expect(response.toolCalls?.[0]?.output).toEqual({ error: 'API Error' });
});
```

## CI/CD

Tests run automatically on:
- Pull requests
- Pushes to main branch

CI configuration skips integration tests (no API keys in CI).
