# AI Roundtable - Project Rules

## Project Overview

AI Roundtable is an MCP server that enables structured debates between multiple AI models (Claude, ChatGPT, Gemini, Perplexity).

## Key Design Decisions (Update docs when changing)

| Decision          | Choice                                 | Rationale                            |
| ----------------- | -------------------------------------- | ------------------------------------ |
| Language          | TypeScript (ESM)                       | Type safety, Node.js 20+             |
| AI Abstraction    | BaseAgent abstract class               | Tool use support, extensibility      |
| Initial Providers | Claude + ChatGPT + Gemini + Perplexity | Mature Agent SDKs                    |
| Storage           | SQLite (sql.js)                        | Local MCP server use case            |
| Testing           | Unit (Mock) + Integration (optional)   | Fast feedback                        |
| Mode Pattern      | Strategy Pattern with Hooks            | Easy to add new debate modes         |
| Prompt System     | 4-Layer Prompt Structure               | Role anchor, contracts, verification |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Server Layer                          │
│  server.ts → handlers/ (session, query, export, agents, utils)  │
├─────────────────────────────────────────────────────────────────┤
│                        Core Layer                               │
│  DebateEngine ←→ SessionManager ←→ AIConsensusAnalyzer          │
│                         ↓                                       │
│              ExitCriteriaChecker (automatic termination)        │
│              KeyPointsExtractor (for 4-layer responses)         │
├─────────────────────────────────────────────────────────────────┤
│       Agents Layer              │        Modes Layer             │
│  BaseAgent (Template Method)    │   BaseModeStrategy (Hooks)     │
│  ├── ClaudeAgent (web_search)  │   ├── CollaborativeMode        │
│  ├── ChatGPTAgent (Responses)  │   ├── AdversarialMode          │
│  ├── GeminiAgent (grounding)   │   ├── SocraticMode             │
│  └── PerplexityAgent (builtin) │   ├── ExpertPanelMode          │
│                                 │   ├── DevilsAdvocateMode       │
│  agents/utils/                  │   ├── DelphiMode               │
│  ├── openai-responses.ts       │   └── RedTeamBlueTeamMode       │
│  ├── error-converter.ts        │                                 │
│  ├── tool-converters.ts        │   Mode Extensions:              │
│  └── light-model-factory.ts    │   ├── processors/ (context)     │
│                                 │   ├── validators/ (response)    │
│                                 │   └── tool-policy.ts            │
├─────────────────────────────────────────────────────────────────┤
│       Tools Layer              │       Storage Layer             │
│  DefaultAgentToolkit           │   SQLiteStorage                 │
│  ├── fact_check                │   (sql.js WebAssembly)          │
│  └── request_context           │                                 │
│                                 │   Tables: sessions, responses   │
│  Native Web Search (per-agent) │                                 │
│  ├── Claude: web_search tool   │                                 │
│  ├── ChatGPT: Responses API    │                                 │
│  ├── Gemini: Google grounding  │                                 │
│  └── Perplexity: built-in      │                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Rules Reference

Detailed implementation guides are in `.claude/rules/`:

| Rule                                       | When to Use                      |
| ------------------------------------------ | -------------------------------- |
| [adding-agents.md](rules/adding-agents.md) | Adding new AI provider agents    |
| [adding-modes.md](rules/adding-modes.md)   | Creating debate modes with hooks |
| [adding-tools.md](rules/adding-tools.md)   | Adding MCP or Agent tools        |
| [code-style.md](rules/code-style.md)       | Code style and conventions       |
| [testing.md](rules/testing.md)             | Writing and running tests        |

## Documentation

- **All documentation must be written in English**
- Code comments: English
- Commit messages: English (Korean body allowed for detailed explanation)
- README, docs/*, and inline documentation: English only

## Directory Structure

```
src/
├── agents/           # AI Agent implementations (organized by provider)
│   ├── anthropic/    # Claude agent (web_search tool)
│   ├── openai/       # ChatGPT agent (Responses API)
│   ├── google/       # Gemini agent (Google grounding)
│   ├── perplexity/   # Perplexity agent (built-in search)
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
  images?: ImageResult[];    // Perplexity search images
  relatedQuestions?: string[]; // Perplexity related questions
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
  contextResults?: ContextResult[];  // Results from previous context requests
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

| Provider   | Model                  |
| ---------- | ---------------------- |
| Anthropic  | claude-sonnet-4-5      |
| OpenAI     | gpt-5.2                |
| Google     | gemini-3-flash-preview |
| Perplexity | sonar-pro              |

### Light Models (Consensus Analysis)

| Provider   | Model                 |
| ---------- | --------------------- |
| Anthropic  | claude-haiku-4-5      |
| OpenAI     | gpt-5-mini            |
| Google     | gemini-2.5-flash-lite |
| Perplexity | sonar                 |

## Exit Criteria System

Automatic debate termination based on configurable criteria:

| Condition   | Default  | Description                      |
| ----------- | -------- | -------------------------------- |
| Consensus   | >= 0.9   | Agreement level threshold        |
| Convergence | 2 rounds | Positions stable across N rounds |
| Confidence  | >= 0.85  | All agents confidence threshold  |
| Max Rounds  | varies   | Fallback termination             |

**Environment Variables:**
```bash
ROUNDTABLE_EXIT_ENABLED=true
ROUNDTABLE_EXIT_CONSENSUS_THRESHOLD=0.9
ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS=2
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

### Toolkit Tools (All Agents)

| Tool              | Description                                     |
| ----------------- | ----------------------------------------------- |
| `fact_check`      | Verify claims with debate history               |
| `request_context` | Request additional context from caller (SOTA AI)|

Note: `get_context` and `submit_response` were removed as redundant:
- Context is already in system prompt via `buildSystemPrompt()` and `buildUserMessage()`
- Response parsing is handled by `BaseAgent.extractResponseFromToolCallsOrText()`

### Native Web Search (Provider-Specific)

Each agent uses its provider's native web search capability for evidence gathering:

| Agent      | Web Search Method              | Citation Format     |
| ---------- | ------------------------------ | ------------------- |
| Claude     | Anthropic `web_search` tool    | URL citations       |
| ChatGPT    | OpenAI Responses API           | URL annotations     |
| Gemini     | Google Search grounding        | Grounding metadata  |
| Perplexity | Built-in search (always on)    | search_results      |

This architecture ensures each agent uses its provider's optimized search capabilities,
resulting in more accurate citations and better search results.

## Debate Modes Quick Reference

| Mode               | Execution  | Use Case                                 |
| ------------------ | ---------- | ---------------------------------------- |
| collaborative      | Parallel   | Consensus building, brainstorming        |
| adversarial        | Sequential | Stress-testing ideas                     |
| socratic           | Sequential | Deep exploration via questions           |
| expert-panel       | Parallel   | Independent expert assessments           |
| devils-advocate    | Sequential | Forced opposition (YES/NO/NEUTRAL roles) |
| delphi             | Parallel   | Anonymized iterative consensus           |
| red-team-blue-team | Hybrid     | Security/risk analysis                   |

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
