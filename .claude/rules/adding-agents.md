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
import { BaseAgent } from './base.js';
import type { AgentConfig, AgentResponse, DebateContext, ToolCallRecord, Citation } from '../types/index.js';
import type { ProviderApiResult } from './base.js';
import { createLogger } from '../utils/logger.js';
import { convertSDKError } from './utils/error-converter.js';
import { withRetry } from '../utils/retry.js';

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

  /**
   * ABSTRACT METHOD #1: Primary API call with tool handling
   * Called by BaseAgent.generateResponse() template method
   */
  protected async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);
    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // Build tools from toolkit
    const tools = this.toolkit ? this.buildMyTools() : undefined;

    // Initial API call with retry
    let response = await withRetry(
      () => this.client.chat({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        tools,
        temperature: this.temperature,
        max_tokens: this.maxTokens,
      }),
      { maxRetries: 3 }
    );

    // Handle tool call loop
    while (response.finish_reason === 'tool_calls' && response.tool_calls) {
      for (const toolCall of response.tool_calls) {
        const result = await this.toolkit?.executeTool(toolCall.name, toolCall.args);
        toolCalls.push({
          toolName: toolCall.name,
          input: toolCall.args,
          output: result,
          timestamp: new Date(),
        });

        // Extract citations using helper
        citations.push(...this.extractCitationsFromToolResult(toolCall.name, result));
      }

      // Continue with tool results
      response = await withRetry(
        () => this.client.chat({
          model: this.model,
          messages: [...previousMessages, { role: 'tool', content: toolResults }],
        }),
        { maxRetries: 3 }
      );
    }

    return {
      rawText: response.content,
      toolCalls,
      citations,
    };
  }

  /**
   * ABSTRACT METHOD #2: Health check implementation
   * Called by BaseAgent.healthCheck() template method
   */
  protected async performHealthCheck(): Promise<void> {
    await this.client.chat({
      model: this.model,
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 10,
    });
  }

  /**
   * ABSTRACT METHOD #3: Raw completion for synthesis/analysis
   * Used by AIConsensusAnalyzer and synthesis features
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await withRetry(
      () => this.client.chat({
        model: this.model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt }
        ],
        max_tokens: this.maxTokens,
      }),
      { maxRetries: 3 }
    );
    return response.content;
  }

  /**
   * VIRTUAL METHOD: Error conversion (override for provider-specific errors)
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'my-provider');
  }

  /**
   * Convert toolkit to provider-specific tool format
   */
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

### 2. Update Error Converter (if needed)

The error converter uses a pattern-based approach. In `src/agents/utils/error-converter.ts`, add provider-specific error patterns:

```typescript
// Define error patterns for your provider
const MY_PROVIDER_PATTERNS: ErrorPattern[] = [
  {
    matches: (error) => getErrorName(error) === 'RateLimitError' || getErrorCode(error) === 429,
    convert: (error, provider) =>
      new APIRateLimitError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  {
    matches: (error) =>
      getErrorName(error) === 'AuthenticationError' ||
      getErrorCode(error) === 401 ||
      getErrorCode(error) === 403,
    convert: (error, provider) =>
      new APIAuthError(getErrorMessage(error), {
        provider,
        cause: error instanceof Error ? error : undefined,
      }),
  },
  // Add more patterns as needed...
];

// Then add to PROVIDER_PATTERNS object:
const PROVIDER_PATTERNS: Record<AIProvider, ErrorPattern[]> = {
  anthropic: ANTHROPIC_PATTERNS,
  openai: OPENAI_PATTERNS,
  google: GOOGLE_PATTERNS,
  perplexity: OPENAI_PATTERNS,
  'my-provider': MY_PROVIDER_PATTERNS,  // Add here
};
```

### 3. Update Types

In `src/types/index.ts`, add provider to `AIProvider`:

```typescript
export type AIProvider = 'anthropic' | 'openai' | 'google' | 'perplexity' | 'my-provider';
```

### 4. Register Provider

In `src/agents/setup.ts`:

```typescript
import { MyAgent } from './my-agent.js';

// Add to DEFAULT_MODELS (heavy models for debate)
const DEFAULT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-5.2',
  google: 'gemini-3-flash-preview',
  perplexity: 'sonar-pro',
  'my-provider': 'my-model-v1',  // Add here
};

// Add to LIGHT_MODELS (light models for consensus analysis)
export const LIGHT_MODELS: Record<AIProvider, string> = {
  anthropic: 'claude-haiku-4-5',
  openai: 'gpt-5-mini',
  google: 'gemini-2.5-flash-lite',
  perplexity: 'sonar',
  'my-provider': 'my-model-mini',  // Add here
};

// Add to DEFAULT_AGENT_NAMES
const DEFAULT_AGENT_NAMES: Record<AIProvider, string> = {
  anthropic: 'Claude',
  openai: 'ChatGPT',
  google: 'Gemini',
  perplexity: 'Perplexity',
  'my-provider': 'MyAgent',  // Add here
};

// Add to ApiKeyConfig interface
export interface ApiKeyConfig {
  anthropic?: string;
  openai?: string;
  google?: string;
  perplexity?: string;
  myProvider?: string;  // Add here
}

// Add to detectApiKeys()
export function detectApiKeys(): ApiKeyConfig {
  return {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_API_KEY,
    perplexity: process.env.PERPLEXITY_API_KEY,
    myProvider: process.env.MY_PROVIDER_API_KEY,  // Add here
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

### 5. Light Model Factory (Automatic)

Light model support is **automatic** when you register your provider in `setup.ts`. The `createLightModelAgent()` function in `src/agents/utils/light-model-factory.ts` uses the registry to dynamically create light model variants:

```typescript
// No additional changes needed in light-model-factory.ts!
// The factory uses registry.getProviderFactory() to create agents:

export function createLightModelAgent(
  baseAgent: BaseAgent,
  registry: AgentRegistry,
  options: LightModelAgentOptions
): BaseAgent {
  const info = baseAgent.getInfo();
  const lightModel = LIGHT_MODELS[info.provider];  // Uses your LIGHT_MODELS entry

  // Gets factory from registry (your setupProviders registration)
  const factory = registry.getProviderFactory(info.provider);
  if (!factory) return baseAgent;

  // Creates new agent with light model config
  return factory({
    id: `${info.id}-light-${options.idSuffix}`,
    name: `${info.name} (Light)`,
    provider: info.provider,
    model: lightModel,
  });
}
```

**Key point**: As long as you register your provider in `setupProviders()` and add an entry to `LIGHT_MODELS`, light model support works automatically.

### 6. Export from Index

In `src/agents/index.ts`:

```typescript
export { MyAgent, createMyAgent, type MyAgentOptions } from './my-agent.js';
```

### 7. Add Tests

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

  // Create mock client that matches SDK interface
  const createMockClient = (response: string, finishReason = 'stop') => ({
    chat: vi.fn().mockResolvedValue({
      content: response,
      finish_reason: finishReason,
    }),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate response', async () => {
    const mockResponse = JSON.stringify({
      position: 'Test position',
      reasoning: 'Test reasoning',
      confidence: 0.8,
    });

    const mockClient = createMockClient(mockResponse);
    const agent = new MyAgent(defaultConfig, { client: mockClient as any });
    const response = await agent.generateResponse(defaultContext);

    expect(response.agentId).toBe('my-test');
    expect(response.position).toBe('Test position');
    expect(response.confidence).toBe(0.8);
    expect(mockClient.chat).toHaveBeenCalled();
  });

  it('should handle non-JSON responses gracefully', async () => {
    const mockClient = createMockClient('Plain text response');
    const agent = new MyAgent(defaultConfig, { client: mockClient as any });

    const response = await agent.generateResponse(defaultContext);

    expect(response.reasoning).toContain('Plain text response');
    expect(response.confidence).toBe(0.5); // Default
  });

  it('should pass health check', async () => {
    const mockClient = createMockClient('ok');
    const agent = new MyAgent(defaultConfig, { client: mockClient as any });
    const result = await agent.healthCheck();

    expect(result.healthy).toBe(true);
  });

  it('should handle API errors', async () => {
    const mockClient = {
      chat: vi.fn().mockRejectedValue(new Error('API Error')),
    };
    const agent = new MyAgent(defaultConfig, { client: mockClient as any });

    await expect(agent.generateResponse(defaultContext)).rejects.toThrow();
  });
});
```

### 8. Update Documentation

Update these files:
- `README.md` - Add provider to supported list
- `docs/API.md` - Add agent class documentation
- `.env.example` - Add environment variable

## Shared Utilities

The `src/agents/utils/` directory contains reusable utilities:

| File | Purpose | Use For |
|------|---------|---------|
| `openai-completion.ts` | OpenAI SDK completion helpers | Agents using OpenAI SDK (ChatGPT, Perplexity-style) |
| `error-converter.ts` | SDK error → RoundtableError | All agents (update for new provider) |
| `tool-converters.ts` | Toolkit → provider format | Agents with tool support |
| `light-model-factory.ts` | Create light model agents | AI consensus analysis |

## Template Method Pattern

BaseAgent uses Template Method pattern. **DO NOT override `generateResponse()` directly**. Instead:

```
BaseAgent.generateResponse() [TEMPLATE - DO NOT OVERRIDE]
├── Logs start time
├── Calls callProviderApi() [ABSTRACT - IMPLEMENT THIS]
├── Calls extractResponseFromToolCallsOrText()
├── Calls buildAgentResponse()
└── Logs completion

BaseAgent.healthCheck() [TEMPLATE - DO NOT OVERRIDE]
├── Logs debug info
├── Calls performHealthCheck() [ABSTRACT - IMPLEMENT THIS]
└── Returns success/failure
```

## Checklist

- [ ] Agent class extends `BaseAgent`
- [ ] `callProviderApi()` implemented (abstract method)
- [ ] `performHealthCheck()` implemented (abstract method)
- [ ] `generateRawCompletion()` implemented (abstract method)
- [ ] `convertError()` overridden for provider-specific errors
- [ ] Tool use supported (if SDK supports it)
- [ ] `withRetry()` wrapper used for API calls
- [ ] Citations extracted using `extractCitationsFromToolResult()`
- [ ] Type added to `AIProvider`
- [ ] Registered in `setup.ts`:
  - [ ] `DEFAULT_MODELS` (heavy model for debate)
  - [ ] `LIGHT_MODELS` (light model for analysis)
  - [ ] `DEFAULT_AGENT_NAMES`
  - [ ] Provider registration in `setupProviders()`
- [ ] Error converter updated
- [ ] Exported from `index.ts`
- [ ] Unit tests with mock client
- [ ] Environment variable documented
