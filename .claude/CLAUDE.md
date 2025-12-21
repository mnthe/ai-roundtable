# AI Roundtable - Project Rules

## Project Overview

AI Roundtable is an MCP server that enables structured debates between multiple AI models (Claude, ChatGPT, Gemini, Perplexity).

## Key Design Decisions (Update docs when changing)

| Decision          | Choice                                 | Rationale                       |
| ----------------- | -------------------------------------- | ------------------------------- |
| Language          | TypeScript (ESM)                       | Type safety, Node.js 20+        |
| AI Abstraction    | BaseAgent abstract class               | Tool use support, extensibility |
| Initial Providers | Claude + ChatGPT + Gemini + Perplexity | Mature Agent SDKs               |
| Storage           | SQLite (sql.js)                        | Local MCP server use case       |
| Testing           | Unit (Mock) + Integration (optional)   | Fast feedback                   |
| Mode Pattern      | Strategy Pattern with Hooks            | Easy to add new debate modes    |
| Prompt System     | 4-Layer Prompt Structure               | Role anchor, contracts, verification |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Server Layer                           │
│  server.ts → handlers/ (session, query, export, agents, utils)  │
├─────────────────────────────────────────────────────────────────┤
│                        Core Layer                                │
│  DebateEngine ←→ SessionManager ←→ AIConsensusAnalyzer          │
│                         ↓                                        │
│              ExitCriteriaChecker (automatic termination)         │
│              KeyPointsExtractor (for 4-layer responses)          │
├─────────────────────────────────────────────────────────────────┤
│       Agents Layer              │        Modes Layer             │
│  BaseAgent (Template Method)    │   BaseModeStrategy (Hooks)     │
│  ├── ClaudeAgent               │   ├── CollaborativeMode        │
│  ├── ChatGPTAgent              │   ├── AdversarialMode          │
│  ├── GeminiAgent               │   ├── SocraticMode             │
│  └── PerplexityAgent           │   ├── ExpertPanelMode          │
│                                 │   ├── DevilsAdvocateMode       │
│  agents/utils/                  │   ├── DelphiMode               │
│  ├── openai-completion.ts      │   └── RedTeamBlueTeamMode       │
│  ├── error-converter.ts        │                                 │
│  ├── tool-converters.ts        │   Mode Extensions:              │
│  └── light-model-factory.ts    │   ├── processors/ (context)     │
│                                 │   ├── validators/ (response)    │
│                                 │   └── tool-policy.ts            │
├─────────────────────────────────────────────────────────────────┤
│       Tools Layer               │       Storage Layer            │
│  DefaultAgentToolkit            │   SQLiteStorage                │
│  ├── get_context               │   (sql.js WebAssembly)         │
│  ├── submit_response           │                                 │
│  ├── search_web                │   Tables: sessions, responses   │
│  ├── fact_check                │                                 │
│  └── perplexity_search         │                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Rules Reference

Detailed implementation guides are in `.claude/rules/`:

| Rule | When to Use |
|------|-------------|
| [adding-agents.md](rules/adding-agents.md) | Adding new AI provider agents |
| [adding-modes.md](rules/adding-modes.md) | Creating debate modes with hooks |
| [adding-tools.md](rules/adding-tools.md) | Adding MCP or Agent tools |
| [code-style.md](rules/code-style.md) | Code style and conventions |
| [testing.md](rules/testing.md) | Writing and running tests |

## Documentation

- **All documentation must be written in English**
- Code comments: English
- Commit messages: English (Korean body allowed for detailed explanation)
- README, docs/*, and inline documentation: English only

## Directory Structure

```
src/
├── agents/           # AI Agent abstraction
│   ├── base.ts          # BaseAgent abstract class (Template Method)
│   ├── claude.ts        # Anthropic Claude implementation
│   ├── chatgpt.ts       # OpenAI ChatGPT implementation
│   ├── gemini.ts        # Google Gemini implementation
│   ├── perplexity.ts    # Perplexity implementation
│   ├── registry.ts      # AgentRegistry for provider management
│   ├── setup.ts         # Auto-setup with API key detection
│   └── utils/           # Shared utilities
├── benchmark/        # Benchmark framework
│   ├── benchmark-runner.ts  # Runs benchmark scenarios
│   ├── metrics-collector.ts # Collects debate performance metrics
│   └── types.ts             # BenchmarkMetrics, BenchmarkScenario
├── config/           # Configuration
│   └── exit-criteria.ts     # Exit criteria environment config
├── core/             # Core logic
│   ├── debate-engine.ts        # Main orchestrator
│   ├── session-manager.ts      # Session CRUD operations
│   ├── ai-consensus-analyzer.ts # AI-based consensus analysis
│   ├── exit-criteria.ts        # Exit criteria logic
│   └── key-points-extractor.ts # Key points for 4-layer response
├── modes/            # Debate mode strategies
│   ├── base.ts              # BaseModeStrategy with hooks
│   ├── registry.ts          # ModeRegistry
│   ├── tool-policy.ts       # Mode-aware tool usage policy
│   ├── processors/          # Context processors
│   ├── validators/          # Response validators
│   └── utils/               # Prompt builder utilities
├── tools/            # Agent toolkit
├── mcp/              # MCP server interface
│   ├── server.ts        # Server setup and tool routing
│   ├── tools.ts         # MCP tool definitions
│   └── handlers/        # Domain-specific handlers
├── storage/          # SQLite persistence
├── types/            # TypeScript types
├── utils/            # Utilities
└── errors/           # Custom error types
```

## Core Types

```typescript
type AIProvider = 'anthropic' | 'openai' | 'google' | 'perplexity';

type DebateMode =
  | 'collaborative'
  | 'adversarial'
  | 'socratic'
  | 'expert-panel'
  | 'devils-advocate'
  | 'delphi'
  | 'red-team-blue-team';

interface AgentResponse {
  agentId: string;
  agentName: string;
  position: string;
  reasoning: string;
  confidence: number;        // 0.0-1.0
  stance?: 'YES' | 'NO' | 'NEUTRAL';  // For devils-advocate mode
  citations?: Citation[];
  toolCalls?: ToolCallRecord[];
  timestamp: Date;
}

interface DebateContext {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  currentRound: number;
  totalRounds: number;
  previousResponses: AgentResponse[];
  focusQuestion?: string;
  modePrompt?: string;    // Mode-specific prompt (set by mode strategy)
}
```

## Error Handling

Use custom error types from `src/errors/index.ts`:

```typescript
RoundtableError           // Base error (code, retryable, provider, cause)
├── APIRateLimitError     // Rate limit (retryable: true)
├── APIAuthError          // Auth failure (retryable: false)
├── APINetworkError       // Network issue (retryable: true)
├── APITimeoutError       // Timeout (retryable: true)
├── AgentError            // Agent execution error
├── SessionError          // Session-related error
├── StorageError          // Storage/database error
└── ConfigurationError    // Invalid configuration
```

## AI Models

### Heavy Models (Debate Responses)

| Provider   | Model                   |
| ---------- | ----------------------- |
| Anthropic  | claude-sonnet-4-5       |
| OpenAI     | gpt-5.2                 |
| Google     | gemini-3-flash-preview  |
| Perplexity | sonar-pro               |

### Light Models (Consensus Analysis)

| Provider   | Model                 |
| ---------- | --------------------- |
| Anthropic  | claude-haiku-4-5      |
| OpenAI     | gpt-5-mini            |
| Google     | gemini-2.5-flash-lite |
| Perplexity | sonar                 |

## Exit Criteria System

Automatic debate termination based on configurable criteria:

| Condition | Default | Description |
|-----------|---------|-------------|
| Consensus | >= 0.9 | Agreement level threshold |
| Convergence | 2 rounds | Positions stable across N rounds |
| Confidence | >= 0.85 | All agents confidence threshold |
| Max Rounds | varies | Fallback termination |

**Environment Variables:**
```bash
ROUNDTABLE_EXIT_ENABLED=true
ROUNDTABLE_EXIT_CONSENSUS_THRESHOLD=0.9
ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS=2
ROUNDTABLE_EXIT_CONFIDENCE_THRESHOLD=0.85
```

## MCP Tools

| Tool                  | Description                      |
| --------------------- | -------------------------------- |
| `start_roundtable`    | Start new debate session         |
| `continue_roundtable` | Continue existing debate         |
| `control_session`     | Pause/resume/stop session        |
| `list_sessions`       | List debate sessions             |
| `get_consensus`       | Get consensus analysis           |
| `get_round_details`   | Get responses for specific round |
| `get_response_detail` | Get agent's detailed response    |
| `get_citations`       | Get citations from debate        |
| `get_thoughts`        | Get agent's reasoning evolution  |
| `export_session`      | Export session (markdown/JSON)   |
| `synthesize_debate`   | AI-powered debate synthesis      |
| `get_agents`          | List available agents            |

## Agent Tools (During Debates)

| Tool                | Description                               |
| ------------------- | ----------------------------------------- |
| `get_context`       | Get current debate context                |
| `submit_response`   | Submit structured response (validation)   |
| `search_web`        | Basic web search for evidence             |
| `fact_check`        | Verify claims with web and debate evidence|
| `perplexity_search` | Advanced search with recency/domain filters|

## Debate Modes Quick Reference

| Mode                   | Execution  | Use Case                        |
| ---------------------- | ---------- | ------------------------------- |
| collaborative          | Parallel   | Consensus building, brainstorming |
| adversarial            | Sequential | Stress-testing ideas            |
| socratic               | Sequential | Deep exploration via questions  |
| expert-panel           | Parallel   | Independent expert assessments  |
| devils-advocate        | Sequential | Forced opposition (YES/NO/NEUTRAL roles) |
| delphi                 | Parallel   | Anonymized iterative consensus  |
| red-team-blue-team     | Hybrid     | Security/risk analysis          |

## Dependencies

### Production
- `@anthropic-ai/sdk` - Claude API
- `openai` - ChatGPT and Perplexity APIs
- `@google/genai` - Gemini API
- `@modelcontextprotocol/sdk` - MCP protocol
- `sql.js` - SQLite (WebAssembly)
- `pino` - Logging
- `zod` - Schema validation
- `jsonrepair` - Fix malformed JSON from AI responses

### Development
- `vitest` - Testing
- `typescript` - Type checking
- `eslint` + `prettier` - Code quality

## Known Issues / Future Improvements

1. **Tool result caching**: Web search results are not cached between agents in the same round.
2. **Delphi position comparison**: Uses first-sentence extraction for position distribution (not full semantic analysis).
