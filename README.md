# AI Roundtable

A Multi-AI debate platform that enables structured discussions between different AI models (Claude, ChatGPT, Gemini, Perplexity) through the Model Context Protocol (MCP).

## Overview

AI Roundtable orchestrates debates between multiple AI models using various discussion modes. Each AI agent participates in structured rounds, providing positions, reasoning, and confidence levels on topics. The platform analyzes consensus and tracks discussions through persistent storage.

### Key Features

- **4 AI Providers**: Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google), Perplexity
- **7 Debate Modes**: Collaborative, Adversarial, Socratic, Expert Panel, Devil's Advocate, Delphi, Red Team/Blue Team
- **Tool Support**: Agents can use web search, fact-checking, and Perplexity's advanced search
- **Persistent Storage**: SQLite-based session storage
- **MCP Protocol**: Standard MCP server interface for integration with Claude Desktop and other MCP clients

## Quick Start

### Installation

```bash
# Option 1: Run directly with npx (Recommended)
npx github:mnthe/ai-roundtable

# Option 2: Clone and build locally
git clone https://github.com/mnthe/ai-roundtable.git
cd ai-roundtable
pnpm install
pnpm build
```

### Environment Setup

Create a `.env` file with your API keys:

```bash
# Required: At least one API key
ANTHROPIC_API_KEY=sk-ant-...     # For Claude agents
OPENAI_API_KEY=sk-...            # For ChatGPT agents
GOOGLE_AI_API_KEY=...            # For Gemini agents
PERPLEXITY_API_KEY=pplx-...      # For Perplexity agents

# Optional
DATABASE_PATH=./data/roundtable.db
LOG_LEVEL=info
```

### Claude Desktop Integration

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "ai-roundtable": {
      "command": "npx",
      "args": ["github:mnthe/ai-roundtable"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "OPENAI_API_KEY": "sk-...",
        "GOOGLE_AI_API_KEY": "...",
        "PERPLEXITY_API_KEY": "pplx-..."
      }
    }
  }
}
```

## MCP Tools

### `start_roundtable`

Start a new debate session.

```typescript
{
  topic: string;        // Required: Debate topic
  mode?: DebateMode;    // Default: 'collaborative'
  agents?: string[];    // Default: all available
  rounds?: number;      // Default: 3
}
```

### `continue_roundtable`

Continue an existing debate session.

```typescript
{
  sessionId: string;    // Required: Session ID
  rounds?: number;      // Additional rounds to run
  focusQuestion?: string;
}
```

### `get_consensus`

Get consensus analysis for a session.

```typescript
{
  sessionId: string;    // Required: Session ID
}
```

### `get_agents`

List available AI agents and their configurations.

### `list_sessions`

List all debate sessions with their status.

## Debate Modes

| Mode | Execution | Description |
|------|-----------|-------------|
| **Collaborative** | Parallel | Agents build consensus by finding common ground |
| **Adversarial** | Sequential | Agents challenge and counter-argue positions |
| **Socratic** | Sequential | Dialogue through probing questions |
| **Expert Panel** | Parallel | Independent expert assessments |
| **Devil's Advocate** | Sequential | Structured opposition: propose/oppose/evaluate |
| **Delphi** | Parallel | Anonymized iterative consensus building |
| **Red Team/Blue Team** | Parallel | Attack/defense team dynamics |

### Mode Details

**Collaborative**: All agents respond in parallel, focusing on finding common ground and building on each other's ideas. Best for brainstorming and consensus formation.

**Adversarial**: Agents respond sequentially, challenging previous positions with counter-arguments. Best for stress-testing ideas and identifying weaknesses.

**Socratic**: Sequential dialogue focused on probing questions rather than direct answers. Explores assumptions and seeks deeper understanding.

**Expert Panel**: Parallel independent assessments from each agent acting as a domain expert. Best for multi-disciplinary analysis.

**Devil's Advocate**: Three-role structure - primary position, opposition, and evaluator. Best for preventing groupthink and thorough risk assessment.

**Delphi**: Anonymized parallel rounds with statistical aggregation. Responses from previous rounds are anonymized ("Participant 1", "Participant 2") to reduce bias.

**Red Team/Blue Team**: Agents split into attack (Red) and defense (Blue) teams. Even-indexed agents are Red Team (identify risks/weaknesses), odd-indexed are Blue Team (propose solutions/defenses).

## Architecture

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
│  │  └─ Perplexity   │      │  └─ ... (7 modes)    │     │
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

## Project Structure

```
src/
├── agents/       # AI Agent implementations
│   ├── base.ts           # BaseAgent abstract class
│   ├── claude.ts         # Anthropic Claude
│   ├── chatgpt.ts        # OpenAI ChatGPT
│   ├── gemini.ts         # Google Gemini
│   ├── perplexity.ts     # Perplexity AI
│   ├── registry.ts       # Agent registry
│   └── setup.ts          # Auto-configuration
├── core/         # Core debate logic
│   ├── debate-engine.ts  # Main orchestrator
│   ├── session-manager.ts
│   └── consensus-analyzer.ts
├── modes/        # Debate mode strategies
│   ├── base.ts           # DebateModeStrategy interface
│   ├── collaborative.ts
│   ├── adversarial.ts
│   ├── socratic.ts
│   ├── expert-panel.ts
│   ├── devils-advocate.ts
│   ├── delphi.ts
│   ├── red-team-blue-team.ts
│   └── registry.ts
├── tools/        # Agent toolkit
│   └── toolkit.ts
├── storage/      # Persistence layer
│   └── sqlite.ts
├── mcp/          # MCP server interface
│   ├── server.ts
│   └── tools.ts
├── types/        # TypeScript types
├── utils/        # Utilities (logger, retry)
├── errors/       # Custom error types
└── index.ts      # Entry point
```

## Development

### Prerequisites

- Node.js >= 20.0.0
- pnpm (recommended)

### Commands

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Development (watch mode)
pnpm dev

# Run tests
pnpm test
pnpm test:watch
pnpm test:coverage

# Run integration tests (requires API keys)
pnpm test:integration

# Lint and format
pnpm lint
pnpm lint:fix
pnpm format

# Type check
pnpm typecheck
```

### Adding a New AI Provider

1. Create agent class extending `BaseAgent`:

```typescript
// src/agents/my-agent.ts
export class MyAgent extends BaseAgent {
  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    const systemPrompt = this.buildSystemPrompt(context);
    const userMessage = this.buildUserMessage(context);
    // Call your AI provider API
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

2. Update `AIProvider` type in `src/types/index.ts`

3. Register in `src/agents/setup.ts`

4. Add tests in `tests/unit/agents/`

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed guide.

### Adding a New Debate Mode

1. Implement `DebateModeStrategy` interface:

```typescript
// src/modes/my-mode.ts
export class MyMode implements DebateModeStrategy {
  readonly name = 'my-mode';

  async executeRound(agents, context, toolkit): Promise<AgentResponse[]> {
    // Parallel: return Promise.all(agents.map(a => a.generateResponse(context)));
    // Sequential: use for...of loop with context accumulation
  }

  buildAgentPrompt(context: DebateContext): string {
    return `Your mode-specific prompt for ${context.topic}...`;
  }
}
```

2. Register in `src/modes/registry.ts`

3. Update `DebateMode` type in `src/types/index.ts`

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed guide.

## Agent Tools

During debates, agents have access to these tools:

| Tool | Description |
|------|-------------|
| `get_context` | Get current debate context (topic, round, previous responses) |
| `submit_response` | Submit structured response with position, reasoning, confidence |
| `search_web` | Basic web search for evidence |
| `fact_check` | Verify claims with web and debate evidence |
| `perplexity_search` | Advanced search with recency/domain filters, images, related questions |

### Perplexity Search Options

```typescript
{
  query: string;
  recency_filter?: 'hour' | 'day' | 'week' | 'month';
  domain_filter?: string[];  // Max 3 domains
  return_images?: boolean;
  return_related_questions?: boolean;
}
```

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (ESM) | Type safety, Node.js 20+ support |
| AI Abstraction | BaseAgent class | Unified interface for tool use, extensibility |
| Providers | Claude, ChatGPT, Gemini, Perplexity | Mature SDKs, diverse capabilities |
| Storage | SQLite (sql.js) | Simple, local, no external dependencies |
| Mode Pattern | Strategy Pattern | Easy to add new debate modes |
| Testing | Vitest + Mocks | Fast feedback, no API costs in CI |

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | For Claude agents |
| `OPENAI_API_KEY` | OpenAI API key for ChatGPT | For ChatGPT agents |
| `GOOGLE_AI_API_KEY` | Google AI API key for Gemini | For Gemini agents |
| `PERPLEXITY_API_KEY` | Perplexity API key | For Perplexity agents |
| `DATABASE_PATH` | SQLite database path | No (default: `./data/roundtable.db`) |
| `LOG_LEVEL` | Logging verbosity | No (default: `info`) |

## Documentation

- [API Reference](docs/API.md) - Complete API documentation
- [Development Guide](docs/DEVELOPMENT.md) - Architecture and contribution guide
- [Testing Guide](docs/TESTING.md) - Testing patterns and practices

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Run all checks: `pnpm typecheck && pnpm lint && pnpm test`
5. Commit with descriptive message
6. Push and create PR

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for contribution guidelines.
