# Development Guide

This guide covers the architecture, design decisions, and how to contribute to AI Roundtable.

## Architecture Overview

AI Roundtable follows a modular architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────┐
│                    MCP Server Layer                     │
│  (src/mcp/server.ts, src/mcp/tools.ts)                  │
├─────────────────────────────────────────────────────────┤
│                    Core Layer                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │DebateEngine │  │SessionManager│  │ConsensusAnalyzer│ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
├─────────────────────────────────────────────────────────┤
│         Agents Layer              Modes Layer           │
│  ┌──────────────────┐      ┌───────────────────────┐    │
│  │  AgentRegistry   │      │    ModeRegistry       │    │
│  │  ├─ Claude       │      │  ├─ Collaborative     │    │
│  │  ├─ ChatGPT      │      │  ├─ Adversarial       │    │
│  │  ├─ Gemini       │      │  ├─ Socratic          │    │
│  │  └─ Perplexity   │      │  ├─ Expert Panel      │    │
│  │                  │      │  ├─ Devil's Advocate  │    │
│  │                  │      │  ├─ Delphi            │    │
│  │                  │      │  └─ Red Team/Blue Team│    │
│  └──────────────────┘      └───────────────────────┘    │
├─────────────────────────────────────────────────────────┤
│  Tools Layer                    Storage Layer           │
│  ┌───────────────────┐      ┌──────────────────────┐    │
│  │DefaultAgentToolkit│      │   SQLiteStorage      │    │
│  │ ├─ get_context    │      │                      │    │
│  │ ├─ submit_response│      │                      │    │
│  │ ├─ search_web     │      │                      │    │
│  │ ├─ fact_check     │      │                      │    │
│  │ └─ perplexity_    │      │                      │    │
│  │    search         │      │                      │    │
│  └───────────────────┘      └──────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Key Design Decisions

| Decision          | Choice                              | Rationale                                |
| ----------------- | ----------------------------------- | ---------------------------------------- |
| Language          | TypeScript (ESM)                    | Type safety, modern Node.js support      |
| AI Abstraction    | BaseAgent class                     | Tool use support, provider extensibility |
| Initial Providers | Claude, ChatGPT, Gemini, Perplexity | Mature SDKs, diverse capabilities        |
| Storage           | SQLite only                         | Simple, local MCP server use case        |
| Mode Strategy     | Strategy Pattern                    | Easy to add new debate modes             |
| Testing           | Vitest + Mock providers             | Fast feedback, no API costs in CI        |

## Core Components

### DebateEngine

The central orchestrator that manages debate sessions.

```typescript
class DebateEngine {
  // Execute a single debate round
  async executeRound(agents: BaseAgent[], context: DebateContext): Promise<RoundResult>

  // Execute multiple debate rounds
  async executeRounds(
    agents: BaseAgent[],
    session: Session,
    numRounds: number,
    focusQuestion?: string
  ): Promise<RoundResult[]>

  // Analyze consensus with AI (primary) or rule-based (fallback)
  async analyzeConsensusWithAI(responses: AgentResponse[], topic: string): Promise<ConsensusResult>

  // Rule-based consensus analysis (fallback)
  analyzeConsensus(responses: AgentResponse[]): ConsensusResult
}
```

**Flow:**
1. MCP handler creates a session via `SessionManager`
2. `executeRound()` or `executeRounds()` executes rounds using the selected mode strategy
3. Each agent generates a response with optional tool use
4. `analyzeConsensusWithAI()` analyzes agreement/disagreement points (AI-based or rule-based fallback)

### BaseAgent (Template Method Pattern)

Abstract class that all AI agents must extend. Uses Template Method pattern where `generateResponse()` is the template method that calls abstract hooks.

```typescript
abstract class BaseAgent {
  // Template method - DO NOT override
  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    // 1. Log start
    // 2. Call callProviderApi() [abstract]
    // 3. Extract response from tool calls or text
    // 4. Build AgentResponse
    // 5. Log completion
  }

  // Abstract methods - MUST implement
  protected abstract callProviderApi(context: DebateContext): Promise<ProviderApiResult>;
  protected abstract performHealthCheck(): Promise<void>;
  abstract generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string>;

  // Virtual method - override for provider-specific error handling
  protected convertError(error: unknown): Error;

  // Provided by base class
  protected buildSystemPrompt(context: DebateContext): string;
  protected buildUserMessage(context: DebateContext): string;
  protected parseResponse(rawText: string, context: DebateContext): Partial<AgentResponse>;
  protected extractCitationsFromToolResult(toolName: string, result: unknown): Citation[];

  // Toolkit management
  setToolkit(toolkit: AgentToolkit): void;
}
```

**ProviderApiResult structure:**
```typescript
interface ProviderApiResult {
  rawText: string;
  toolCalls: ToolCallRecord[];
  citations: Citation[];
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

| Mode               | Execution        | Description                             |
| ------------------ | ---------------- | --------------------------------------- |
| Collaborative      | Parallel         | Find common ground, build consensus     |
| Adversarial        | Sequential       | Challenge opposing viewpoints           |
| Socratic           | Sequential       | Dialogue through questioning            |
| Expert Panel       | Parallel         | Independent expert assessments          |
| Devil's Advocate   | Sequential       | Structured opposition and challenge     |
| Delphi             | Parallel         | Anonymized iterative consensus building |
| Red Team/Blue Team | Hybrid           | Attack/defense team analysis            |

## Adding a New AI Provider

See [.claude/rules/adding-agents.md](../.claude/rules/adding-agents.md) for complete guide.

### Step 1: Create Agent Class

```typescript
// src/agents/my-provider.ts
import { BaseAgent } from './base.js';
import type { AgentConfig, AgentResponse, DebateContext, ToolCallRecord, Citation } from '../types/index.js';
import type { ProviderApiResult } from './base.js';
import { convertSDKError } from './utils/error-converter.js';
import { withRetry } from '../utils/retry.js';

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

  /**
   * ABSTRACT METHOD #1: Primary API call with tool handling
   */
  protected async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);
    const tools = this.toolkit ? this.buildMyTools() : undefined;
    const toolCalls: ToolCallRecord[] = [];
    const citations: Citation[] = [];

    // Initial API call with retry
    let response = await withRetry(
      () => this.client.chat({
        model: this.model,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        tools,
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
        citations.push(...this.extractCitationsFromToolResult(toolCall.name, result));
      }
      // Continue with tool results...
      response = await withRetry(
        () => this.client.chat({ /* ... with tool results */ }),
        { maxRetries: 3 }
      );
    }

    return { rawText: response.content, toolCalls, citations };
  }

  /**
   * ABSTRACT METHOD #2: Health check implementation
   */
  protected async performHealthCheck(): Promise<void> {
    await this.client.chat({
      model: this.model,
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 10,
    });
  }

  /**
   * ABSTRACT METHOD #3: Raw completion for synthesis/analysis (public - used by AIConsensusAnalyzer)
   */
  async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    const response = await withRetry(
      () => this.client.chat({
        model: this.model,
        messages: [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt }
        ],
      }),
      { maxRetries: 3 }
    );
    return response.content;
  }

  /**
   * VIRTUAL METHOD: Override for provider-specific error handling
   */
  protected override convertError(error: unknown): Error {
    return convertSDKError(error, 'my-provider');
  }

  private buildMyTools(): ToolDefinition[] {
    if (!this.toolkit) return [];
    return this.toolkit.getTools().map(tool => ({
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

See [.claude/rules/adding-modes.md](../.claude/rules/adding-modes.md) for complete guide.

### Step 1: Create Mode Class

```typescript
// src/modes/my-mode.ts
import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { AgentResponse, DebateContext } from '../types/index.js';
import {
  buildModePrompt,
  createOutputSections,
  type ModePromptConfig,
} from './utils/prompt-builder.js';

export class MyMode extends BaseModeStrategy {
  readonly name = 'my-mode';

  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Use inherited execution methods:
    // - executeParallel: All agents respond simultaneously
    // - executeSequential: Agents respond one by one
    return this.executeParallel(agents, context, toolkit);
  }

  buildAgentPrompt(context: DebateContext): string {
    // Use 4-layer prompt structure via prompt-builder utilities
    const config: ModePromptConfig = {
      modeName: 'My Custom Discussion',
      roleAnchor: {
        emoji: '🎯',
        title: 'MY CUSTOM ROLE',
        definition: 'You are a participant in a custom discussion format.',
        mission: 'Primary objective for this mode.',
        persistence: 'Maintain this role throughout all rounds.',
        helpfulMeans: 'what being helpful means here',
        helpfulNotMeans: 'what to avoid',
      },
      behavioralContract: {
        mustBehaviors: ['Provide evidence-based reasoning', 'State confidence levels'],
        mustNotBehaviors: ['Make claims without justification'],
        priorityHierarchy: ['Accuracy', 'Constructive engagement'],
        failureMode: 'Responses without evidence will be rejected.',
      },
      structuralEnforcement: {
        firstRoundSections: createOutputSections([
          ['[POSITION]', 'State your position clearly'],
          ['[EVIDENCE]', 'Provide supporting reasoning'],
          ['[CONFIDENCE]', 'Express confidence level (0-100%)'],
        ]),
        subsequentRoundSections: createOutputSections([
          ['[ENGAGEMENT]', 'Address previous points'],
          ['[UPDATED POSITION]', 'Refine your position'],
        ]),
      },
      verificationLoop: {
        checklistItems: ['Is reasoning evidence-based?', 'Is confidence justified?'],
      },
      focusQuestion: {
        instructions: 'Prioritize addressing the focus question.',
      },
    };

    return buildModePrompt(config, context);
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

## Testing with MCP Inspector

MCP Inspector is the official tool for testing MCP servers via a web UI. It's useful for real-time testing and debugging during development.

### Quick Start

```bash
# Build and run Inspector
pnpm build && npx -y @modelcontextprotocol/inspector node dist/index.js
```

Once Inspector is running, open `http://localhost:5173` in your browser.

### Environment Setup

API keys must be set before running Inspector:

```bash
# Option 1: Set environment variables directly
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GOOGLE_API_KEY=...
export PERPLEXITY_API_KEY=pplx-...

pnpm build && npx -y @modelcontextprotocol/inspector node dist/index.js

# Option 2: Use .env file with dotenv-cli
npx -y dotenv-cli -e .env -- npx -y @modelcontextprotocol/inspector node dist/index.js
```

### Using MCP Inspector

#### 1. View Available Tools

The left panel shows all available tools:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Tools                                                               │
├─────────────────────────────────────────────────────────────────────┤
│ ▸ start_roundtable      - Start a new debate session                │
│ ▸ continue_roundtable   - Continue existing debate                  │
│ ▸ get_consensus         - Get consensus analysis                    │
│ ▸ get_agents            - List available AI agents                  │
│ ▸ list_sessions         - List all sessions                         │
│ ▸ get_round_details     - Get detailed round responses              │
│ ▸ get_response_detail   - Get specific agent response               │
│ ▸ get_citations         - Get all citations                         │
│ ▸ synthesize_debate     - AI-powered debate synthesis               │
│ ▸ get_thoughts          - Get agent reasoning evolution             │
│ ▸ export_session        - Export in markdown/JSON                   │
│ ▸ control_session       - Pause/resume/stop session                 │
└─────────────────────────────────────────────────────────────────────┘
```

#### 2. Basic Test Scenario

**Step 1: Check available agents**
```json
// Tool: get_agents
// Arguments: {}
```

Expected result:
```json
{
  "agents": [
    { "id": "claude-1", "name": "Claude", "provider": "anthropic", "model": "claude-sonnet-4-5" },
    { "id": "chatgpt-1", "name": "ChatGPT", "provider": "openai", "model": "gpt-5.2" }
  ]
}
```

**Step 2: Start a debate**
```json
// Tool: start_roundtable
// Arguments:
{
  "topic": "Should AI be regulated?",
  "mode": "collaborative",
  "rounds": 2
}
```

**Step 3: Continue the debate**
```json
// Tool: continue_roundtable
// Arguments:
{
  "sessionId": "<sessionId from previous response>",
  "rounds": 1,
  "focusQuestion": "What specific regulations should be implemented?"
}
```

**Step 4: Analyze consensus**
```json
// Tool: get_consensus
// Arguments:
{
  "sessionId": "<sessionId>"
}
```

#### 3. Testing Different Modes

Test each debate mode:

```json
// Collaborative (parallel, consensus-focused)
{ "topic": "...", "mode": "collaborative" }

// Adversarial (sequential, counter-arguments)
{ "topic": "...", "mode": "adversarial" }

// Socratic (sequential, question-driven)
{ "topic": "...", "mode": "socratic" }

// Expert Panel (parallel, independent assessments)
{ "topic": "...", "mode": "expert-panel" }

// Devil's Advocate (sequential, structured opposition)
{ "topic": "...", "mode": "devils-advocate" }

// Delphi (anonymized iterative consensus)
{ "topic": "...", "mode": "delphi" }

// Red Team/Blue Team (attack/defense teams)
{ "topic": "...", "mode": "red-team-blue-team" }
```

#### 4. Querying Detailed Information

```json
// Get round details
// Tool: get_round_details
{
  "sessionId": "<sessionId>",
  "roundNumber": 1
}

// Get specific agent response
// Tool: get_response_detail
{
  "sessionId": "<sessionId>",
  "agentId": "claude-1",
  "roundNumber": 1
}

// Get citations
// Tool: get_citations
{
  "sessionId": "<sessionId>"
}

// Get agent reasoning evolution
// Tool: get_thoughts
{
  "sessionId": "<sessionId>",
  "agentId": "claude-1"
}
```

#### 5. Session Control and Export

```json
// Pause session
// Tool: control_session
{
  "sessionId": "<sessionId>",
  "action": "pause"
}

// Export to markdown
// Tool: export_session
{
  "sessionId": "<sessionId>",
  "format": "markdown"
}

// Generate AI synthesis
// Tool: synthesize_debate
{
  "sessionId": "<sessionId>"
}
```

### Debugging Tips

#### Log Level Configuration

```bash
# Verbose logging
LOG_LEVEL=debug npx -y @modelcontextprotocol/inspector node dist/index.js

# Errors only
LOG_LEVEL=error npx -y @modelcontextprotocol/inspector node dist/index.js
```

#### Common Issues

| Issue                       | Cause                             | Solution                         |
| --------------------------- | --------------------------------- | -------------------------------- |
| "No agents available"       | API keys not set                  | Check environment variables      |
| "Agent health check failed" | Invalid API key or quota exceeded | Verify API key validity          |
| "Session not found"         | Invalid sessionId                 | Use `list_sessions` to verify    |
| Inspector connection failed | Build not run                     | Run `pnpm build` first           |
| Timeout                     | Network or API latency            | Retry or reduce number of rounds |

#### Development with Watch Mode

```bash
# Terminal 1: Watch for changes and auto-build
pnpm dev

# Terminal 2: Run Inspector (after build completes)
npx -y @modelcontextprotocol/inspector node dist/index.js
```

### Testing with Claude Desktop

In addition to MCP Inspector, you can test directly with Claude Desktop:

```json
// ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
// %APPDATA%\Claude\claude_desktop_config.json (Windows)
{
  "mcpServers": {
    "ai-roundtable-dev": {
      "command": "node",
      "args": ["/path/to/ai-roundtable/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "OPENAI_API_KEY": "sk-...",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

Restart Claude Desktop to use AI Roundtable tools in conversations.

### Local Development with Claude Code

For testing with Claude Code CLI, create a `.mcp.json` file in the project root:

```json
{
  "mcpServers": {
    "ai-roundtable": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-anthropic-api-key",
        "OPENAI_API_KEY": "your-openai-api-key",
        "PERPLEXITY_API_KEY": "your-perplexity-api-key",
        "GOOGLE_API_KEY": "your-google-ai-api-key"
      }
    }
  }
}
```

Make sure to run `pnpm build` before starting Claude Code to ensure the latest changes are compiled.

---

## Code Style Guidelines

### Naming Conventions

| Type              | Convention       | Example            |
| ----------------- | ---------------- | ------------------ |
| Files             | kebab-case       | `my-agent.ts`      |
| Classes           | PascalCase       | `MyProviderAgent`  |
| Functions/Methods | camelCase        | `generateResponse` |
| Constants         | UPPER_SNAKE_CASE | `DEFAULT_TIMEOUT`  |
| Types/Interfaces  | PascalCase       | `AgentConfig`      |

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
