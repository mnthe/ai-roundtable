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
│  ┌──────────────────┐      ┌──────────────────────┐     │
│  │  AgentRegistry   │      │    ModeRegistry      │     │
│  │  ├─ Claude       │      │  ├─ Collaborative    │     │
│  │  ├─ ChatGPT      │      │  ├─ Adversarial      │     │
│  │  ├─ Gemini       │      │  ├─ Socratic         │     │
│  │  └─ Perplexity   │      │  ├─ Expert Panel     │     │
│  │                  │      │  ├─ Devil's Advocate │     │
│  │                  │      │  ├─ Delphi           │     │
│  │                  │      │  └─ Red Team/Blue Team│    │
│  └──────────────────┘      └──────────────────────┘     │
├─────────────────────────────────────────────────────────┤
│  Tools Layer                    Storage Layer           │
│  ┌───────────────────┐      ┌──────────────────────┐    │
│  │DefaultAgentToolkit│      │   SQLiteStorage      │    │
│  │ ├─ get_context    │      │                      │    │
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

| Mode               | Execution        | Description                             |
| ------------------ | ---------------- | --------------------------------------- |
| Collaborative      | Parallel         | Find common ground, build consensus     |
| Adversarial        | Sequential       | Challenge opposing viewpoints           |
| Socratic           | Sequential       | Dialogue through questioning            |
| Expert Panel       | Parallel         | Independent expert assessments          |
| Devil's Advocate   | Sequential       | Structured opposition and challenge     |
| Delphi             | Parallel         | Anonymized iterative consensus building |
| Red Team/Blue Team | Parallel (teams) | Attack/defense team analysis            |

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
export GOOGLE_AI_API_KEY=...
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
│ Tools                                                                │
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
        "GOOGLE_AI_API_KEY": "your-google-ai-api-key"
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
