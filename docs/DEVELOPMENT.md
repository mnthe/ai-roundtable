# Development Guide

This guide covers the architecture, design decisions, and how to contribute to AI Roundtable.

## Architecture Overview

AI Roundtable follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server Layer                      │
│  (src/mcp/server.ts, src/mcp/tools.ts)                  │
├─────────────────────────────────────────────────────────┤
│                    Core Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │DebateEngine │  │SessionManager│  │ConsensusAnalyzer│  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
├─────────────────────────────────────────────────────────┤
│         Agents Layer              Modes Layer            │
│  ┌──────────────────┐      ┌──────────────────────┐     │
│  │  AgentRegistry   │      │    ModeRegistry      │     │
│  │  ├─ Claude       │      │  ├─ Collaborative    │     │
│  │  ├─ ChatGPT      │      │  ├─ Adversarial      │     │
│  │  ├─ Gemini       │      │  ├─ Socratic         │     │
│  │  └─ Perplexity   │      │  └─ Expert Panel     │     │
│  └──────────────────┘      └──────────────────────┘     │
├─────────────────────────────────────────────────────────┤
│  Tools Layer                    Storage Layer            │
│  ┌──────────────────┐      ┌──────────────────────┐     │
│  │DefaultAgentToolkit│      │   SQLiteStorage     │     │
│  │ ├─ get_context   │      │                      │     │
│  │ ├─ search_web    │      │                      │     │
│  │ ├─ fact_check    │      │                      │     │
│  │ └─ perplexity_   │      │                      │     │
│  │    search        │      │                      │     │
│  └──────────────────┘      └──────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (ESM) | Type safety, modern Node.js support |
| AI Abstraction | BaseAgent class | Tool use support, provider extensibility |
| Initial Providers | Claude, ChatGPT, Gemini, Perplexity | Mature SDKs, diverse capabilities |
| Storage | SQLite only | Simple, local MCP server use case |
| Mode Strategy | Strategy Pattern | Easy to add new debate modes |
| Testing | Vitest + Mock providers | Fast feedback, no API costs in CI |

## Core Components

### DebateEngine

The central orchestrator that manages debate sessions.

```typescript
class DebateEngine {
  // Start a new debate session
  async startDebate(config: DebateConfig): Promise<Session>

  // Run a single round
  async runRound(sessionId: string, focusQuestion?: string): Promise<RoundResult>

  // Get consensus analysis
  async getConsensus(sessionId: string): Promise<ConsensusResult>
}
```

**Flow:**
1. `startDebate()` creates a session with configured agents
2. `runRound()` executes one round using the selected mode strategy
3. Each agent generates a response with optional tool use
4. `getConsensus()` analyzes agreement/disagreement points

### BaseAgent

Abstract class that all AI agents must extend.

```typescript
abstract class BaseAgent {
  // Subclasses must implement
  abstract generateResponse(context: DebateContext): Promise<AgentResponse>;

  // Provided by base class
  protected buildSystemPrompt(context: DebateContext): string;
  protected buildUserMessage(context: DebateContext): string;
  protected parseResponse(rawText: string, context: DebateContext): ParsedResponse;

  // Toolkit management
  setToolkit(toolkit: AgentToolkit): void;
}
```

### DebateModeStrategy

Interface for debate execution strategies.

```typescript
interface DebateModeStrategy {
  readonly name: string;

  // Execute one round of debate
  executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]>;

  // Build mode-specific prompt additions
  buildAgentPrompt(context: DebateContext): string;
}
```

**Mode Execution Patterns:**

| Mode | Execution | Description |
|------|-----------|-------------|
| Collaborative | Sequential | Agents build on each other's ideas |
| Adversarial | Sequential | Agents challenge previous positions |
| Socratic | Sequential | Dialogue through questioning |
| Expert Panel | Parallel | Independent expert assessments |

## Adding a New AI Provider

### Step 1: Create Agent Class

```typescript
// src/agents/my-provider.ts
import { BaseAgent } from './base.js';
import type { AgentConfig, AgentResponse, DebateContext } from '../types/index.js';

export interface MyProviderAgentOptions {
  apiKey?: string;
  client?: MyProviderClient; // For testing
}

export class MyProviderAgent extends BaseAgent {
  private client: MyProviderClient;

  constructor(config: AgentConfig, options?: MyProviderAgentOptions) {
    super(config);
    this.client = options?.client ?? new MyProviderClient({
      apiKey: options?.apiKey ?? process.env.MY_PROVIDER_API_KEY,
    });
  }

  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);
    const tools = this.toolkit ? this.buildTools() : undefined;

    // Call your provider's API
    const response = await this.client.chat({
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      tools,
    });

    // Handle tool calls if present
    // ...

    // Parse and return response
    const parsed = this.parseResponse(response.content, context);

    return {
      agentId: this.id,
      agentName: this.name,
      position: parsed.position ?? 'Unable to determine',
      reasoning: parsed.reasoning ?? response.content,
      confidence: parsed.confidence ?? 0.5,
      timestamp: new Date(),
    };
  }

  private buildTools(): ToolDefinition[] {
    // Convert toolkit tools to your provider's format
    return this.toolkit!.getTools().map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
}

export function createMyProviderAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: MyProviderAgentOptions
): MyProviderAgent {
  const agent = new MyProviderAgent(config, options);
  if (toolkit) agent.setToolkit(toolkit);
  return agent;
}
```

### Step 2: Export from Index

```typescript
// src/agents/index.ts
export {
  MyProviderAgent,
  createMyProviderAgent,
  type MyProviderAgentOptions,
} from './my-provider.js';
```

### Step 3: Register Provider

```typescript
// In your initialization code or registry
import { getGlobalRegistry } from './agents/index.js';
import { MyProviderAgent } from './agents/my-provider.js';

const registry = getGlobalRegistry();
registry.registerProvider(
  'my-provider',
  (config) => new MyProviderAgent(config),
  'default-model-name'
);
```

### Step 4: Add Tests

```typescript
// tests/unit/agents/my-provider.test.ts
import { describe, it, expect, vi } from 'vitest';
import { MyProviderAgent } from '../../../src/agents/my-provider.js';

describe('MyProviderAgent', () => {
  it('should generate response', async () => {
    const mockClient = {
      chat: vi.fn().mockResolvedValue({
        content: '{"position":"test","reasoning":"test","confidence":0.8}'
      }),
    };

    const agent = new MyProviderAgent(
      { id: 'test', name: 'Test', provider: 'my-provider', model: 'test' },
      { client: mockClient }
    );

    const response = await agent.generateResponse(defaultContext);

    expect(response.position).toBe('test');
    expect(mockClient.chat).toHaveBeenCalled();
  });
});
```

## Adding a New Debate Mode

### Step 1: Create Mode Class

```typescript
// src/modes/my-mode.ts
import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { AgentResponse, DebateContext } from '../types/index.js';

export class MyMode implements DebateModeStrategy {
  readonly name = 'my-mode';

  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    const responses: AgentResponse[] = [];

    // Example: Round-robin with custom logic
    for (const agent of agents) {
      agent.setToolkit(toolkit);

      const currentContext: DebateContext = {
        ...context,
        previousResponses: [...context.previousResponses, ...responses],
      };

      const response = await agent.generateResponse(currentContext);
      responses.push(response);
    }

    return responses;
  }

  buildAgentPrompt(context: DebateContext): string {
    let prompt = `## My Custom Mode\n\n`;
    prompt += `You are participating in a ${this.name} discussion.\n`;
    prompt += `Topic: ${context.topic}\n`;
    // Add mode-specific instructions
    return prompt;
  }
}
```

### Step 2: Register Mode

```typescript
// src/modes/registry.ts
import { MyMode } from './my-mode.js';

private registerDefaultModes(): void {
  // ... existing modes
  this.registerMode('my-mode', new MyMode());
}
```

### Step 3: Update Types

```typescript
// src/types/index.ts
export type DebateMode = 'collaborative' | 'adversarial' | 'socratic' | 'expert-panel' | 'my-mode';
```

## Code Style Guidelines

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `my-agent.ts` |
| Classes | PascalCase | `MyProviderAgent` |
| Functions/Methods | camelCase | `generateResponse` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_TIMEOUT` |
| Types/Interfaces | PascalCase | `AgentConfig` |

### Import Order

```typescript
// 1. External packages
import { describe, it, expect } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';

// 2. Internal modules (absolute paths)
import { BaseAgent } from './base.js';
import type { AgentConfig } from '../types/index.js';

// 3. Types (last)
import type { DebateContext } from '../types/index.js';
```

### Error Handling

```typescript
// Use typed errors
class AgentError extends Error {
  constructor(message: string, public agentId: string) {
    super(message);
    this.name = 'AgentError';
  }
}

// Graceful degradation
try {
  const result = await this.client.chat(params);
  return result;
} catch (error) {
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
  };
}
```

## Contributing

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Run all checks: `pnpm typecheck && pnpm lint && pnpm test`
5. Commit with descriptive message
6. Push and create PR

### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Example:
```
feat: add Gemini agent support

- Implement GeminiAgent with function calling
- Add tests with mock client
- Register provider in global registry

Closes #123
```

### Code Review Checklist

- [ ] Tests pass (`pnpm test`)
- [ ] Type check passes (`pnpm typecheck`)
- [ ] Lint passes (`pnpm lint`)
- [ ] New code has tests
- [ ] Documentation updated if needed
- [ ] No breaking changes (or documented)
