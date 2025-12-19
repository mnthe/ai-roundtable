# AI Roundtable

Multi-AI debate platform that enables structured discussions between different AI models (Claude, ChatGPT, Gemini, Perplexity) as an MCP server.

## Features

- **Multi-AI Debates**: Run structured debates with Claude, ChatGPT, Gemini, and Perplexity
- **Multiple Debate Modes**:
  - Collaborative - Build consensus together
  - Adversarial - Challenge opposing viewpoints
  - Socratic - Explore through questioning
  - Expert Panel - Parallel expert assessments
- **Advanced Search**: Perplexity search with recency filters, domain restrictions, and image support
- **Tool Use**: AI agents can search the web and fact-check claims
- **Consensus Analysis**: Automatic identification of agreement/disagreement points
- **MCP Integration**: Works with Claude Desktop and other MCP clients
- **Session Persistence**: SQLite-based storage for debate history

## Quick Start

### Installation

**Option 1: npx (Recommended)**

Run directly from GitHub without installation:

```bash
npx github:mnthe/ai-roundtable
```

**Option 2: Clone and Build**

```bash
# Clone the repository
git clone https://github.com/mnthe/ai-roundtable.git
cd ai-roundtable

# Install dependencies
pnpm install

# Build
pnpm build
```

### Configuration

Create a `.env` file with your API keys:

```bash
cp .env.example .env
```

Required keys (at least one):
- `ANTHROPIC_API_KEY` - For Claude agents
- `OPENAI_API_KEY` - For ChatGPT agents
- `GOOGLE_AI_API_KEY` - For Gemini agents
- `PERPLEXITY_API_KEY` - For Perplexity agents

### Usage with Claude Desktop

Add to your Claude Desktop MCP configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

**Option 1: Using npx (Recommended)**

```json
{
  "mcpServers": {
    "ai-roundtable": {
      "command": "npx",
      "args": ["github:mnthe/ai-roundtable"],
      "env": {
        "ANTHROPIC_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key",
        "GOOGLE_AI_API_KEY": "your-key",
        "PERPLEXITY_API_KEY": "your-key"
      }
    }
  }
}
```

**Option 2: Using local build**

```json
{
  "mcpServers": {
    "ai-roundtable": {
      "command": "node",
      "args": ["/path/to/ai-roundtable/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key",
        "GOOGLE_AI_API_KEY": "your-key",
        "PERPLEXITY_API_KEY": "your-key"
      }
    }
  }
}
```

## MCP Tools

### start_roundtable

Start a new AI debate.

```typescript
{
  topic: string;      // Required: The debate topic
  mode?: DebateMode;  // Optional: 'collaborative' | 'adversarial' | 'socratic' | 'expert-panel'
  agents?: string[];  // Optional: Agent IDs to participate
  rounds?: number;    // Optional: Number of rounds (default: 3)
}
```

**Example:**
```
Start a debate on "Should AI development be regulated?" using adversarial mode with Claude and ChatGPT
```

### continue_roundtable

Continue an existing debate.

```typescript
{
  sessionId: string;       // Required: Session ID
  rounds?: number;         // Optional: Additional rounds
  focusQuestion?: string;  // Optional: New focus question
}
```

### get_consensus

Get consensus analysis for a debate.

```typescript
{
  sessionId: string;  // Required: Session ID
}
```

### get_agents

List available AI agents with their capabilities.

### list_sessions

List all debate sessions with status and metadata.

## Debate Modes

### Collaborative Mode
Agents work together to build comprehensive understanding. Sequential execution where each agent builds on previous responses.

### Adversarial Mode
Agents challenge each other's positions. Sequential execution with emphasis on counter-arguments and critiques.

### Socratic Mode
Agents explore topics through questioning. Sequential dialogue focused on probing assumptions and seeking deeper understanding.

### Expert Panel Mode
Agents provide parallel expert assessments. Parallel execution for efficient multi-perspective analysis.

## Supported AI Providers

| Provider | Model Examples | Features |
|----------|---------------|----------|
| Anthropic | claude-3-5-sonnet, claude-3-opus | Full tool use |
| OpenAI | gpt-4, gpt-4-turbo | Full tool use |
| Google | gemini-1.5-pro, gemini-1.5-flash | Function calling |
| Perplexity | llama-3.1-sonar-large-128k-online | Built-in web search, citations |

## Agent Tools

Agents have access to these tools during debates:

| Tool | Description |
|------|-------------|
| `get_context` | Get current debate context |
| `submit_response` | Submit structured response |
| `search_web` | Basic web search |
| `fact_check` | Verify claims with evidence |
| `perplexity_search` | Advanced search with filters |

### Perplexity Search Options

The `perplexity_search` tool provides advanced search capabilities:

```typescript
{
  query: string;                    // Search query
  recency_filter?: 'hour' | 'day' | 'week' | 'month';  // Time filter
  domain_filter?: string[];         // Limit to domains (max 3)
  return_images?: boolean;          // Include images
  return_related_questions?: boolean; // Get related questions
}
```

**Use cases:**
- Recent news: `{ query: "AI news", recency_filter: "day" }`
- Academic sources: `{ query: "machine learning", domain_filter: ["arxiv.org", "nature.com"] }`

## Project Structure

```
ai-roundtable/
├── src/
│   ├── agents/       # AI agent implementations
│   │   ├── base.ts       # BaseAgent abstract class
│   │   ├── claude.ts     # Claude (Anthropic) agent
│   │   ├── chatgpt.ts    # ChatGPT (OpenAI) agent
│   │   ├── gemini.ts     # Gemini (Google) agent
│   │   ├── perplexity.ts # Perplexity agent
│   │   └── registry.ts   # Agent registry
│   ├── core/         # Core logic
│   │   ├── debate-engine.ts    # Main debate orchestration
│   │   ├── session-manager.ts  # Session management
│   │   └── consensus-analyzer.ts # Consensus analysis
│   ├── modes/        # Debate mode strategies
│   │   ├── base.ts           # DebateModeStrategy interface
│   │   ├── collaborative.ts  # Collaborative mode
│   │   ├── adversarial.ts    # Adversarial mode
│   │   ├── socratic.ts       # Socratic mode
│   │   ├── expert-panel.ts   # Expert panel mode
│   │   └── registry.ts       # Mode registry
│   ├── tools/        # Agent toolkit
│   │   └── toolkit.ts  # DefaultAgentToolkit
│   ├── storage/      # Persistence
│   │   └── sqlite.ts   # SQLite storage
│   ├── mcp/          # MCP server interface
│   │   ├── server.ts   # MCP server
│   │   └── tools.ts    # MCP tool definitions
│   └── types/        # TypeScript types
│       └── index.ts
├── tests/
│   ├── unit/         # Unit tests
│   └── integration/  # Integration tests
├── docs/             # Documentation
└── config/           # Configuration files
```

## Development

```bash
# Install dependencies
pnpm install

# Run in development mode (watch)
pnpm dev

# Run tests
pnpm test

# Run tests with watch
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run integration tests (requires API keys)
pnpm test:integration

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format code
pnpm format

# Build for production
pnpm build
```

## Adding New AI Providers

1. Create a new agent class extending `BaseAgent`:

```typescript
// src/agents/my-agent.ts
import { BaseAgent } from './base.js';
import type { AgentConfig, AgentResponse, DebateContext } from '../types/index.js';

export class MyAgent extends BaseAgent {
  constructor(config: AgentConfig) {
    super(config);
    // Initialize your client
  }

  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);

    // Call your AI provider
    // Handle tool calls if supported

    return {
      agentId: this.id,
      agentName: this.name,
      position: '...',
      reasoning: '...',
      confidence: 0.8,
      timestamp: new Date(),
    };
  }
}
```

2. Register the provider:

```typescript
import { getGlobalRegistry } from './agents/index.js';

const registry = getGlobalRegistry();
registry.registerProvider(
  'my-provider',
  (config) => new MyAgent(config),
  'default-model'
);
```

## Adding New Debate Modes

1. Implement `DebateModeStrategy`:

```typescript
// src/modes/my-mode.ts
import type { DebateModeStrategy } from './base.js';

export class MyMode implements DebateModeStrategy {
  readonly name = 'my-mode';

  async executeRound(agents, context, toolkit) {
    const responses = [];
    // Your execution logic
    return responses;
  }

  buildAgentPrompt(context) {
    return `Your custom prompt for ${context.topic}...`;
  }
}
```

2. Register the mode:

```typescript
import { getGlobalModeRegistry } from './modes/index.js';

const registry = getGlobalModeRegistry();
registry.registerMode('my-mode', new MyMode());
```

## Documentation

- [Development Guide](docs/DEVELOPMENT.md) - Architecture and contributing
- [Testing Guide](docs/TESTING.md) - How to write and run tests
- [API Reference](docs/API.md) - Detailed API documentation

## License

MIT
