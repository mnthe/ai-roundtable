# AI Roundtable - Project Rules

## Project Overview

AI Roundtable is an MCP server that enables structured debates between multiple AI models (Claude, ChatGPT, Gemini, Perplexity).

## Key Design Decisions (Update docs when changing)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Language | TypeScript (ESM) | Type safety, Node.js 20+ |
| AI Abstraction | Agent SDK abstraction | Tool use support, extensibility |
| Initial Providers | Claude + ChatGPT + Gemini + Perplexity | Mature Agent SDKs |
| Storage | SQLite only | Local MCP server use case |
| Testing | Unit (Mock) + Integration (optional) | Fast feedback |
| Mode Pattern | Strategy Pattern | Easy to add new debate modes |

## Architecture Rules

### Adding a New Agent

1. Extend `BaseAgent` abstract class
2. Implement `generateResponse()` method
3. Register in `AgentRegistry` via `setup.ts`
4. Unit tests required (use mock provider)

**Required methods:**
```typescript
abstract generateResponse(context: DebateContext): Promise<AgentResponse>;
```

**Optional methods:**
```typescript
async healthCheck(): Promise<{ healthy: boolean; error?: string }>;
```

### Adding a New Mode

1. Implement `DebateModeStrategy` interface
2. Register in `ModeRegistry`
3. Define mode-specific prompt in `buildAgentPrompt()` method

**Interface:**
```typescript
interface DebateModeStrategy {
  readonly name: string;
  executeRound(agents: BaseAgent[], context: DebateContext, toolkit: AgentToolkit): Promise<AgentResponse[]>;
  buildAgentPrompt(context: DebateContext): string;
}
```

**Execution patterns:**
- **Parallel**: `Promise.all(agents.map(...))`
- **Sequential**: `for...of` loop with context accumulation

### Adding a New Tool

1. Add method to `DefaultAgentToolkit`
2. Update `getTools()` with tool definition
3. Implement `executeTool()` case handler

**Tool definition structure:**
```typescript
{
  name: string;
  description: string;
  parameters: Record<string, { type: string; description: string }>;
}
```

## Code Style

- ESLint + Prettier enforced
- Functions/methods: camelCase
- Classes/types: PascalCase
- Constants: UPPER_SNAKE_CASE
- Filenames: kebab-case.ts

## Testing Rules

- Run `pnpm test` before committing
- Unit tests: Use mock providers (no API calls)
- Integration tests: `pnpm test:integration` (requires API keys)
- Test files: `tests/unit/*.test.ts`, `tests/integration/*.test.ts`

## Directory Structure

```
src/
├── agents/       # AI Agent abstraction (BaseAgent, Claude, ChatGPT, Gemini, Perplexity)
├── core/         # Core logic (DebateEngine, SessionManager, ConsensusAnalyzer, AIConsensusAnalyzer)
├── modes/        # Debate mode strategies (7 modes)
├── tools/        # Agent tools (DefaultAgentToolkit)
├── storage/      # SQLite persistence
├── mcp/          # MCP server interface
├── types/        # Type definitions
├── utils/        # Logger, retry utilities
├── errors/       # Custom error types
└── index.ts      # Entry point
```

## Type Definitions

### Core Types

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
  citations?: Citation[];
  toolCalls?: ToolCallRecord[];
  images?: ImageResult[];           // Perplexity only
  relatedQuestions?: string[];      // Perplexity only
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
}
```

### 4-Layer Response Types

```typescript
type ConsensusLevel = 'high' | 'medium' | 'low';
type ActionRecommendationType = 'proceed' | 'verify' | 'query_detail';

interface RoundtableResponse {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  roundNumber: number;
  totalRounds: number;
  decision: DecisionLayer;           // Layer 1
  agentResponses: AgentResponseSummary[];  // Layer 2
  evidence: EvidenceLayer;           // Layer 3
  metadata: MetadataLayer;           // Layer 4
}

interface DecisionLayer {
  consensusLevel: ConsensusLevel;
  agreementScore: number;
  actionRecommendation: { type: ActionRecommendationType; reason: string };
}

interface AgentResponseSummary {
  agentId: string;
  agentName: string;
  position: string;
  keyPoints: string[];
  confidence: number;
  confidenceChange?: { delta: number; previousRound: number; reason: string };
  evidenceUsed: { webSearches: number; citations: number; toolCalls: string[] };
}
```

## Error Handling

Use custom error types from `src/errors/index.ts`:

```typescript
RoundtableError           // Base error
├── APIRateLimitError     // Rate limit (retryable: true)
├── APIAuthError          // Auth failure (retryable: false)
├── APINetworkError       // Network issue (retryable: true)
├── APITimeoutError       // Timeout (retryable: true)
├── AgentError            // Agent execution error
└── SessionError          // Session-related error
```

## Dependencies

### Production
- `@anthropic-ai/sdk` - Claude API
- `openai` - ChatGPT and Perplexity APIs
- `@google/generative-ai` - Gemini API
- `@modelcontextprotocol/sdk` - MCP protocol
- `sql.js` - SQLite (WebAssembly)
- `pino` - Logging
- `zod` - Schema validation

### Development
- `vitest` - Testing
- `typescript` - Type checking
- `eslint` + `prettier` - Code quality

## AI Consensus Analysis

The platform supports two consensus analysis modes:

### AIConsensusAnalyzer (Primary)

Uses lightweight AI models for semantic analysis of debate positions:
- Understands meaning, not just keywords
- Detects negation ("AI is dangerous" vs "AI is not dangerous")
- Clusters similar positions semantically
- Provides nuanced analysis (partial agreements, conditional positions)

**Light Models Used:**
| Provider | Model |
|----------|-------|
| Anthropic | claude-haiku-4-5-20251022 |
| OpenAI | gpt-5-mini |
| Google | gemini-2.5-flash-lite |
| Perplexity | sonar |

### ConsensusAnalyzer (Fallback)

Rule-based fallback using Jaccard similarity and word stemming. Automatically used when AI analysis is unavailable.

## Health Check System

Agents undergo health checks on startup via `runHealthChecks()`:
- Tests API connectivity with minimal request
- Deactivates unhealthy agents automatically
- Runs in parallel for performance

## MCP Tools

| Tool | Description |
|------|-------------|
| `start_roundtable` | Start new debate session |
| `continue_roundtable` | Continue existing debate |
| `get_consensus` | Get consensus analysis |
| `get_agents` | List available agents |
| `list_sessions` | List debate sessions |
| `get_round_details` | Get responses for specific round |
| `get_response_detail` | Get agent's detailed response |
| `get_citations` | Get citations from debate |
| `get_thoughts` | Get agent's reasoning evolution |
| `export_session` | Export session (markdown/JSON) |
| `control_session` | Pause/resume/stop session |
| `synthesize_debate` | AI-powered debate synthesis |

## Known Issues / Future Improvements

1. **Mode prompts**: `buildAgentPrompt()` is defined but not yet integrated into BaseAgent's prompt building.
2. **Tool result caching**: Web search results are not cached between agents in the same round.
