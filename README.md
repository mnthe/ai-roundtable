# AI Roundtable

A Multi-AI debate platform that enables structured discussions between different AI models (Claude, ChatGPT, Gemini, Perplexity) through the Model Context Protocol (MCP).

## Overview

AI Roundtable orchestrates debates between multiple AI models using various discussion modes. Each AI agent participates in structured rounds, providing positions, reasoning, and confidence levels on topics. The platform analyzes consensus and tracks discussions through persistent storage.

### Key Features

- **4 AI Providers**: Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google), Perplexity
- **7 Debate Modes**: Collaborative, Adversarial, Socratic, Expert Panel, Devil's Advocate, Delphi, Red Team/Blue Team
- **4-Layer Response Structure**: Optimized for agentic workflows with progressive detail levels
- **AI-Powered Analysis**: Semantic consensus analysis using lightweight AI models
- **Health Check System**: Automatic agent health verification on startup
- **Native Web Search**: Each agent uses its provider's native search (Claude web_search, ChatGPT Responses API, Gemini grounding, Perplexity built-in)
- **In-Memory Storage**: SQLite-based session storage (sql.js WebAssembly)
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
GOOGLE_API_KEY=...               # For Gemini agents
PERPLEXITY_API_KEY=pplx-...      # For Perplexity agents

# Optional
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
      "args": ["-y", "github:mnthe/ai-roundtable"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "OPENAI_API_KEY": "sk-...",
        "GOOGLE_API_KEY": "...",
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

### `get_round_details`

Get detailed responses for a specific round.

```typescript
{
  sessionId: string;    // Required: Session ID
  roundNumber: number;  // Required: Round number (1-based)
}
```

### `get_response_detail`

Get detailed response from a specific agent.

```typescript
{
  sessionId: string;    // Required: Session ID
  agentId: string;      // Required: Agent ID
  roundNumber?: number; // Optional: specific round
}
```

### `get_citations`

Get all citations used in a debate.

```typescript
{
  sessionId: string;    // Required: Session ID
  roundNumber?: number; // Optional: filter by round
  agentId?: string;     // Optional: filter by agent
}
```

### `synthesize_debate`

AI-powered synthesis of the entire debate. Uses lightweight AI models to generate comprehensive analysis.

```typescript
{
  sessionId: string;    // Required: Session ID
  synthesizer?: string; // Optional: Agent ID to use
}
```

### `get_thoughts`

Get detailed reasoning evolution for an agent.

```typescript
{
  sessionId: string;    // Required: Session ID
  agentId: string;      // Required: Agent ID
}
```

### `export_session`

Export debate in markdown or JSON format.

```typescript
{
  sessionId: string;    // Required: Session ID
  format?: 'markdown' | 'json';  // Default: 'markdown'
}
```

### `control_session`

Control session execution state.

```typescript
{
  sessionId: string;    // Required: Session ID
  action: 'pause' | 'resume' | 'stop';
}
```

## Debate Modes

| Mode                   | Execution  | Description                                     |
| ---------------------- | ---------- | ----------------------------------------------- |
| **Collaborative**      | Parallel   | Agents build consensus by finding common ground |
| **Adversarial**        | Sequential | Agents challenge and counter-argue positions    |
| **Socratic**           | Sequential | Dialogue through probing questions              |
| **Expert Panel**       | Parallel   | Independent expert assessments                  |
| **Devil's Advocate**   | Sequential | Structured opposition: propose/oppose/evaluate  |
| **Delphi**             | Parallel   | Anonymized iterative consensus building         |
| **Red Team/Blue Team** | Hybrid     | Attack/defense team dynamics                    |

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
│                    MCP Server Layer                     │
│  (src/mcp/server.ts, src/mcp/tools.ts)                  │
├─────────────────────────────────────────────────────────┤
│                    Core Layer                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │DebateEngine │  │SessionManager│  │ExitCriteria     │ │
│  └─────────────┘  └──────────────┘  └─────────────────┘ │
│                                                         │
│  ┌────────────────────────┐  ┌────────────────────────┐ │
│  │  AIConsensusAnalyzer   │  │   KeyPointsExtractor   │ │
│  │  (semantic AI analysis)│  │   (4-layer responses)  │ │
│  └────────────────────────┘  └────────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│         Agents Layer              Modes Layer           │
│  ┌──────────────────┐      ┌──────────────────────┐     │
│  │  AgentRegistry   │      │    ModeRegistry      │     │
│  │  ├─ Claude       │      │  ├─ Collaborative    │     │
│  │  ├─ ChatGPT      │      │  ├─ Adversarial      │     │
│  │  ├─ Gemini       │      │  ├─ Socratic         │     │
│  │  └─ Perplexity   │      │  └─ ... (7 modes)    │     │
│  │                  │      └──────────────────────┘     │
│  │  Health Check    │                                   │
│  │  (startup verify)│                                   │
│  └──────────────────┘                                   │
├─────────────────────────────────────────────────────────┤
│  Tools Layer                    Storage Layer           │
│  ┌───────────────────┐      ┌──────────────────────┐    │
│  │DefaultAgentToolkit│      │    SQLiteStorage     │    │
│  │ ├─ fact_check     │      │                      │    │
│  │ └─ request_context│      │                      │    │
│  │                   │      │                      │    │
│  │Native Web Search: │      │                      │    │
│  │ ├─ Claude:        │      │                      │    │
│  │ │   web_search    │      │                      │    │
│  │ ├─ ChatGPT:       │      │                      │    │
│  │ │   Responses API │      │                      │    │
│  │ ├─ Gemini:        │      │                      │    │
│  │ │   grounding     │      │                      │    │
│  │ └─ Perplexity:    │      │                      │    │
│  │     built-in      │      │                      │    │
│  └───────────────────┘      └──────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Model Tiers

AI Roundtable uses different model tiers for different purposes:

| Tier      | Purpose              | Models                                                        |
| --------- | -------------------- | ------------------------------------------------------------- |
| **Heavy** | Debate participation | claude-sonnet-4-5, gpt-5.2, gemini-3-flash-preview, sonar-pro |
| **Light** | Consensus analysis   | claude-haiku-4-5, gpt-5-mini, gemini-2.5-flash-lite, sonar    |

Light models are automatically used for `AIConsensusAnalyzer` and `synthesize_debate` to reduce costs and latency.

### 4-Layer Response Structure

Roundtable responses are structured in 4 progressive layers, optimized for agentic workflows where the main agent needs to make decisions efficiently:

| Layer | Name            | Purpose                                                        |
| ----- | --------------- | -------------------------------------------------------------- |
| **1** | Decision        | Quick consensus level (high/medium/low), action recommendation |
| **2** | Agent Responses | Per-agent position summaries with key points and confidence    |
| **3** | Evidence        | Aggregated citations, identified conflicts, consensus summary  |
| **4** | Metadata        | References for deep dive, verification hints                   |

**Action Recommendations:**
- `proceed` - High consensus, safe to act on results
- `verify` - Medium consensus, review before proceeding
- `query_detail` - Low consensus, use detail tools for more info

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed structure.

## Project Structure

```
src/
├── agents/           # AI Agent implementations (Claude, ChatGPT, Gemini, Perplexity)
│   └── utils/        # Shared utilities (error converter, tool converters)
├── benchmark/        # Benchmark framework for debate performance metrics
├── config/           # Configuration (exit criteria settings)
├── core/             # Core logic (DebateEngine, SessionManager, AIConsensusAnalyzer)
├── modes/            # Debate mode strategies (7 modes)
│   ├── processors/   # Context processors (anonymization, statistics)
│   ├── validators/   # Response validators (stance, confidence)
│   └── utils/        # Prompt builder utilities
├── tools/            # Agent toolkit (fact_check, request_context)
├── storage/          # Persistence layer (SQLite via sql.js)
├── mcp/              # MCP server interface
│   └── handlers/     # Domain handlers (session, query, export, agents)
├── types/            # TypeScript types and Zod schemas
├── utils/            # Utilities (logger, retry, env)
└── errors/           # Custom error types (RoundtableError hierarchy)
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

1. Create agent class extending `BaseAgent` (Template Method pattern):

```typescript
// src/agents/my-agent.ts
export class MyAgent extends BaseAgent {
  // Implement 3 abstract methods:

  protected async callProviderApi(context: DebateContext): Promise<ProviderApiResult> {
    // Primary API call with tool handling
    return { rawText: '...', toolCalls: [], citations: [] };
  }

  protected async performHealthCheck(): Promise<void> {
    // Minimal API call to verify connectivity
  }

  protected async generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string> {
    // Raw completion for synthesis/analysis (no tool calls)
  }
}
```

2. Update `AIProvider` type in `src/types/index.ts`

3. Register in `src/agents/setup.ts` (DEFAULT_MODELS, LIGHT_MODELS, setupProviders)

4. Add tests in `tests/unit/agents/`

See [.claude/rules/adding-agents.md](.claude/rules/adding-agents.md) for complete guide.

### Adding a New Debate Mode

1. Extend `BaseModeStrategy` abstract class:

```typescript
// src/modes/my-mode.ts
export class MyMode extends BaseModeStrategy {
  readonly name = 'my-mode';

  async executeRound(agents, context, toolkit): Promise<AgentResponse[]> {
    // Use inherited methods:
    return this.executeParallel(agents, context, toolkit);  // or executeSequential
  }

  buildAgentPrompt(context: DebateContext): string {
    // Build 4-layer prompt using prompt-builder utilities
    return buildModePrompt(config, context);
  }
}
```

2. Register in `src/modes/registry.ts`

3. Update `DebateMode` type in `src/types/index.ts`

See [.claude/rules/adding-modes.md](.claude/rules/adding-modes.md) for complete guide.

## Agent Tools

### Toolkit Tools (All Agents)

| Tool              | Description                                               |
| ----------------- | --------------------------------------------------------- |
| `fact_check`      | Verify claims with debate history                         |
| `request_context` | Request additional context from caller (SOTA AI)          |

Note: `get_context` and `submit_response` were removed as redundant - context is already in system prompt, response parsing is handled by BaseAgent.

### Native Web Search (Provider-Specific)

Each agent uses its provider's native web search capability for evidence gathering:

| Agent      | Web Search Method              | Citation Format     |
| ---------- | ------------------------------ | ------------------- |
| Claude     | Anthropic `web_search` tool    | URL citations       |
| ChatGPT    | OpenAI Responses API           | URL annotations     |
| Gemini     | Google Search grounding        | Grounding metadata  |
| Perplexity | Built-in search (always on)    | search_results      |

This architecture ensures each agent uses its provider's optimized search capabilities.

## Key Design Decisions

| Decision       | Choice                              | Rationale                                     |
| -------------- | ----------------------------------- | --------------------------------------------- |
| Language       | TypeScript (ESM)                    | Type safety, Node.js 20+ support              |
| AI Abstraction | BaseAgent class                     | Unified interface for tool use, extensibility |
| Providers      | Claude, ChatGPT, Gemini, Perplexity | Mature SDKs, diverse capabilities             |
| Storage        | SQLite (sql.js)                     | Simple, local, no external dependencies       |
| Mode Pattern   | Strategy Pattern                    | Easy to add new debate modes                  |
| Testing        | Vitest + Mocks                      | Fast feedback, no API costs in CI             |

## Environment Variables

| Variable             | Description                  | Required            |
| -------------------- | ---------------------------- | ------------------- |
| `ANTHROPIC_API_KEY`  | Anthropic API key for Claude | For Claude agents   |
| `OPENAI_API_KEY`     | OpenAI API key for ChatGPT   | For ChatGPT agents  |
| `GOOGLE_API_KEY`     | Google AI API key for Gemini | For Gemini agents   |
| `PERPLEXITY_API_KEY` | Perplexity API key           | For Perplexity agents |
| `LOG_LEVEL`          | Logging verbosity            | No (default: `info`) |

**Note:** Storage uses in-memory SQLite (sql.js WebAssembly). Sessions persist only during server runtime.

## Documentation

- [Architecture & Flow](docs/ARCHITECTURE.md) - System architecture and debate flow visualization
- [API Reference](docs/API.md) - Complete API documentation
- [Development Guide](docs/DEVELOPMENT.md) - Contribution guide
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
