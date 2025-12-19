# Adding New AI Agents

## When to Apply

Apply this rule when:
- Adding a new AI provider (e.g., DeepSeek, Mistral, Cohere)
- Modifying existing agent implementations
- Updating agent registration logic

## Required Steps

### 1. Create Agent Class

Create `src/agents/<provider>.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'; // or your SDK
import { BaseAgent, type AgentToolkit } from './base.js';
import type { AgentConfig, AgentResponse, DebateContext, ToolCallRecord, Citation } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('MyAgent');

export interface MyAgentOptions {
  apiKey?: string;
  client?: MySDKClient; // For testing
}

export class MyAgent extends BaseAgent {
  private client: MySDKClient;

  constructor(config: AgentConfig, options?: MyAgentOptions) {
    super(config);
    this.client = options?.client ?? new MySDKClient({
      apiKey: options?.apiKey ?? process.env.MY_PROVIDER_API_KEY,
    });
  }

  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);
    const startTime = Date.now();
    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    logger.info({ sessionId: context.sessionId, agentId: this.id }, 'Starting response generation');

    try {
      // 1. Build tools if toolkit available
      const tools = this.toolkit ? this.buildMyTools() : undefined;

      // 2. Call API
      let response = await this.client.chat({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        tools,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      });

      // 3. Handle tool calls loop (if SDK supports it)
      while (response.finish_reason === 'tool_calls' && response.tool_calls) {
        for (const toolCall of response.tool_calls) {
          const result = await this.executeTool(toolCall.name, toolCall.args);
          toolCalls.push({
            toolName: toolCall.name,
            input: toolCall.args,
            output: result,
            timestamp: new Date(),
          });

          // Extract citations from search results
          if (toolCall.name === 'search_web' && result?.results) {
            citations.push(...result.results.map((r: any) => ({
              title: r.title,
              url: r.url,
              snippet: r.snippet,
            })));
          }
        }
        // Continue with tool results...
      }

      // 4. Parse response
      const rawText = response.content;
      const parsed = this.parseResponse(rawText, context);

      const duration = Date.now() - startTime;
      logger.info({ sessionId: context.sessionId, agentId: this.id, duration }, 'Response generated');

      return {
        agentId: this.id,
        agentName: this.name,
        position: parsed.position ?? 'Unable to determine position',
        reasoning: parsed.reasoning ?? rawText,
        confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
        citations: citations.length > 0 ? citations : undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        timestamp: new Date(),
      };
    } catch (error) {
      logger.error({ err: error, sessionId: context.sessionId, agentId: this.id }, 'Failed to generate response');
      throw error;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      await this.client.chat({
        model: this.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10,
      });
      return { healthy: true };
    } catch (error) {
      return { healthy: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  private buildMyTools(): MyToolFormat[] {
    if (!this.toolkit) return [];
    return this.toolkit.getTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters,
        required: Object.keys(tool.parameters),
      },
    }));
  }

  private async executeTool(name: string, input: unknown): Promise<unknown> {
    if (!this.toolkit) return { error: 'No toolkit available' };
    return this.toolkit.executeTool(name, input);
  }
}

export function createMyAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: MyAgentOptions
): MyAgent {
  const agent = new MyAgent(config, options);
  if (toolkit) agent.setToolkit(toolkit);
  return agent;
}
```

### 2. Update Types

In `src/types/index.ts`, add provider to `AIProvider`:

```typescript
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'perplexity' | 'my-provider';
```

### 3. Register Provider

In `src/agents/setup.ts`:

```typescript
import { MyAgent } from './my-agent.js';

// Add to DEFAULT_MODELS
const DEFAULT_MODELS: Record<AIProvider, string> = {
  // ...
  'my-provider': 'my-model-v1',
};

// Add to DEFAULT_AGENT_NAMES
const DEFAULT_AGENT_NAMES: Record<AIProvider, string> = {
  // ...
  'my-provider': 'MyAgent',
};

// Add to detectApiKeys()
export function detectApiKeys(): ApiKeyConfig {
  return {
    // ...
    myProvider: process.env.MY_PROVIDER_API_KEY,
  };
}

// Add to setupProviders()
if (keys.myProvider) {
  registry.registerProvider(
    'my-provider',
    (config) => new MyAgent(config, { apiKey: keys.myProvider }),
    DEFAULT_MODELS['my-provider']
  );
} else {
  warnings.push('MyAgent not available: MY_PROVIDER_API_KEY not set');
}
```

### 4. Export from Index

In `src/agents/index.ts`:

```typescript
export { MyAgent, createMyAgent, type MyAgentOptions } from './my-agent.js';
```

### 5. Add Tests

Create `tests/unit/agents/my-agent.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyAgent } from '../../../src/agents/my-agent.js';
import type { DebateContext } from '../../../src/types/index.js';

describe('MyAgent', () => {
  const defaultConfig = {
    id: 'my-test',
    name: 'Test Agent',
    provider: 'my-provider' as const,
    model: 'my-model-v1',
  };

  const defaultContext: DebateContext = {
    sessionId: 'session-1',
    topic: 'Test topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  it('should generate response', async () => {
    const mockClient = {
      chat: vi.fn().mockResolvedValue({
        content: '{"position":"Test position","reasoning":"Test reasoning","confidence":0.8}',
        finish_reason: 'stop',
      }),
    };

    const agent = new MyAgent(defaultConfig, { client: mockClient as any });
    const response = await agent.generateResponse(defaultContext);

    expect(response.agentId).toBe('my-test');
    expect(response.position).toBe('Test position');
    expect(response.confidence).toBe(0.8);
    expect(mockClient.chat).toHaveBeenCalled();
  });

  it('should handle non-JSON responses gracefully', async () => {
    const mockClient = {
      chat: vi.fn().mockResolvedValue({
        content: 'Plain text response',
        finish_reason: 'stop',
      }),
    };

    const agent = new MyAgent(defaultConfig, { client: mockClient as any });
    const response = await agent.generateResponse(defaultContext);

    expect(response.reasoning).toBe('Plain text response');
    expect(response.confidence).toBe(0.5); // Default
  });

  it('should pass health check', async () => {
    const mockClient = {
      chat: vi.fn().mockResolvedValue({ content: 'ok' }),
    };

    const agent = new MyAgent(defaultConfig, { client: mockClient as any });
    const result = await agent.healthCheck();

    expect(result.healthy).toBe(true);
  });
});
```

### 6. Update Documentation

Update these files:
- `README.md` - Add provider to supported list
- `docs/API.md` - Add agent class documentation
- `.env.example` - Add environment variable

## Checklist

- [ ] Agent class extends `BaseAgent`
- [ ] `generateResponse()` implemented
- [ ] `healthCheck()` implemented (optional but recommended)
- [ ] Tool use supported (if SDK supports it)
- [ ] Citations extracted from search results
- [ ] Logging added with `createLogger()`
- [ ] Error handling with try/catch
- [ ] Type added to `AIProvider`
- [ ] Registered in `setup.ts`
- [ ] Exported from `index.ts`
- [ ] Unit tests with mock client
- [ ] Environment variable documented
