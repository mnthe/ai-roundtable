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
| Mode Pattern      | Strategy Pattern                       | Easy to add new debate modes    |
| Prompt System     | 4-Layer Prompt Structure               | Role anchor, contracts, verification |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                       MCP Server Layer                           │
│  server.ts → handlers/ (session, query, export, agents, utils)  │
├─────────────────────────────────────────────────────────────────┤
│                        Core Layer                                │
│  DebateEngine ←→ SessionManager ←→ ConsensusAnalyzer            │
│                         ↓                                        │
│              AIConsensusAnalyzer (AI-based, primary)             │
│              KeyPointsExtractor (for 4-layer responses)          │
├─────────────────────────────────────────────────────────────────┤
│       Agents Layer              │        Modes Layer             │
│  BaseAgent (Template Method)    │   DebateModeStrategy           │
│  ├── ClaudeAgent               │   ├── CollaborativeMode        │
│  ├── ChatGPTAgent              │   ├── AdversarialMode          │
│  ├── GeminiAgent               │   ├── SocraticMode             │
│  └── PerplexityAgent           │   ├── ExpertPanelMode          │
│                                 │   ├── DevilsAdvocateMode       │
│  agents/utils/                  │   ├── DelphiMode               │
│  ├── openai-completion.ts      │   └── RedTeamBlueTeamMode       │
│  ├── error-converter.ts        │                                 │
│  ├── tool-converters.ts        │   Execution Patterns:           │
│  └── light-model-factory.ts    │   - Parallel (Promise.allSettled)│
│                                 │   - Sequential (for...of)       │
│                                 │   - Hybrid (team-based)         │
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

## Architecture Rules

### Adding a New Agent

1. Extend `BaseAgent` abstract class
2. Implement 3 abstract methods
3. Register in `AgentRegistry` via `setup.ts`
4. Unit tests required (use mock provider)

**Required abstract methods:**
```typescript
// Primary response generation
protected abstract callProviderApi(context: DebateContext): Promise<ProviderApiResult>;

// Health check implementation
protected abstract performHealthCheck(): Promise<void>;

// Raw completion for synthesis/analysis (public - used by AIConsensusAnalyzer)
abstract generateRawCompletion(prompt: string, systemPrompt?: string): Promise<string>;
```

**Template Method pattern in BaseAgent:**
```typescript
// generateResponse() is NOT abstract - it's a template method that:
// 1. Logs start time
// 2. Calls callProviderApi() [abstract]
// 3. Extracts response from tool calls or text
// 4. Builds standardized AgentResponse
// 5. Logs completion

// Override convertError() for provider-specific error conversion
protected convertError(error: unknown): Error;
```

**Shared utilities (agents/utils/):**
- `openai-completion.ts` - Reusable for OpenAI SDK-based agents (ChatGPT, Perplexity)
- `error-converter.ts` - Converts SDK errors to RoundtableError types
- `tool-converters.ts` - Converts AgentToolkit to provider-specific formats
- `light-model-factory.ts` - Creates lightweight model agents for analysis

### Adding a New Mode

1. Extend `BaseModeStrategy` abstract class (or implement `DebateModeStrategy` interface)
2. Register in `ModeRegistry`
3. Implement `buildAgentPrompt()` with 4-layer prompt structure
4. Choose execution pattern (parallel/sequential)

**Interface:**
```typescript
interface DebateModeStrategy {
  readonly name: string;
  executeRound(agents: BaseAgent[], context: DebateContext, toolkit: AgentToolkit): Promise<AgentResponse[]>;
  buildAgentPrompt(context: DebateContext): string;
}
```

**Execution patterns in BaseModeStrategy:**
- `executeParallel()` - All agents respond simultaneously (collaborative, expert-panel, delphi)
- `executeSequential()` - Agents respond one by one, seeing previous responses (adversarial, socratic)

**4-Layer Prompt Structure (modes/utils/prompt-builder.ts):**
```
Layer 1: Role Anchor      - Identity, mission, persistence
Layer 2: Behavioral Contract - MUST/MUST NOT rules, priority hierarchy
Layer 3: Structural Enforcement - Required output sections per round
Layer 4: Verification Loop - Self-check before submission
```

### Adding a New MCP Tool

1. Define tool schema in `src/mcp/tools.ts`
2. Create handler in appropriate `src/mcp/handlers/` module
3. Add Zod validation schema in `src/types/schemas.ts`
4. Wire handler in `src/mcp/server.ts` switch statement

**Handler module organization:**
- `session.ts` - Session lifecycle (start, continue, control, list)
- `query.ts` - Data retrieval (consensus, round details, citations, thoughts)
- `export.ts` - Export and synthesis (export_session, synthesize_debate)
- `agents.ts` - Agent information (get_agents)
- `utils.ts` - 4-layer response builder

### Adding a New Agent Tool

1. Define tool with Zod schema in `src/tools/schemas.ts`
2. Register tool definition in `DefaultAgentToolkit.constructor()`
3. Implement executor function

**Tool definition structure:**
```typescript
// In schemas.ts
export const MyToolInputSchema = z.object({
  param1: z.string().describe('Description'),
  param2: z.number().optional(),
});

// In toolkit.ts
this.registerTool({
  name: 'my_tool',
  description: '...',
  parameters: { param1: { type: 'string', description: '...' } },
  executor: async (input) => {
    const validated = MyToolInputSchema.parse(input);
    // Implementation
    return { success: true, data: result };
  },
});
```

## Code Style

- ESLint + Prettier enforced
- Functions/methods: camelCase
- Classes/types: PascalCase
- Constants: UPPER_SNAKE_CASE
- Filenames: kebab-case.ts

## Documentation

- **All documentation must be written in English**
- Code comments: English
- Commit messages: English (Korean body allowed for detailed explanation)
- README, docs/*, and inline documentation: English only

## Testing Rules

- Run `pnpm test` before committing
- Unit tests: Use mock providers (no API calls)
- Integration tests: `pnpm test:integration` (requires API keys)
- Test files: `tests/unit/<module>/*.test.ts`, `tests/integration/*.test.ts`

**Mock client pattern:**
```typescript
const mockClient = {
  messages: { create: vi.fn().mockResolvedValue({...}) }
};
const agent = new ClaudeAgent(config, { client: mockClient as any });
```

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
│       ├── openai-completion.ts   # OpenAI SDK completion helpers
│       ├── error-converter.ts     # SDK error → RoundtableError
│       ├── tool-converters.ts     # Toolkit → provider format
│       └── light-model-factory.ts # Light model agent factory
├── core/             # Core logic
│   ├── debate-engine.ts        # Main orchestrator
│   ├── session-manager.ts      # Session CRUD operations
│   ├── consensus-analyzer.ts   # Rule-based consensus (fallback)
│   ├── ai-consensus-analyzer.ts # AI-based consensus (primary)
│   └── key-points-extractor.ts # Key points for 4-layer response
├── modes/            # Debate mode strategies
│   ├── base.ts              # BaseModeStrategy abstract class
│   ├── registry.ts          # ModeRegistry
│   ├── collaborative.ts     # Parallel, consensus-building
│   ├── adversarial.ts       # Sequential, counter-arguments
│   ├── socratic.ts          # Sequential, questioning
│   ├── expert-panel.ts      # Parallel, independent experts
│   ├── devils-advocate.ts   # Role-based (primary/opposition/evaluator)
│   ├── delphi.ts            # Parallel with anonymization
│   ├── red-team-blue-team.ts # Team-based (attack/defense)
│   └── utils/               # Prompt builder utilities
├── tools/            # Agent toolkit
│   ├── toolkit.ts       # DefaultAgentToolkit
│   ├── schemas.ts       # Zod validation for tool inputs
│   └── types.ts         # AgentToolkit interface
├── mcp/              # MCP server interface
│   ├── server.ts        # Server setup and tool routing
│   ├── tools.ts         # MCP tool definitions (JSON Schema)
│   └── handlers/        # Domain-specific handlers
│       ├── session.ts   # start, continue, control, list
│       ├── query.ts     # consensus, round_details, citations, thoughts
│       ├── export.ts    # export_session, synthesize_debate
│       ├── agents.ts    # get_agents
│       └── utils.ts     # buildRoundtableResponse (4-layer)
├── storage/          # SQLite persistence
│   └── sqlite.ts        # sql.js implementation
├── types/            # TypeScript types
│   ├── index.ts         # Core type definitions
│   └── schemas.ts       # Zod schemas for MCP inputs
├── utils/            # Utilities
│   ├── logger.ts        # pino-based structured logging
│   ├── retry.ts         # withRetry utility
│   ├── env.ts           # Environment variable utilities
│   └── index.ts         # Module exports
├── errors/           # Custom error types
│   └── index.ts         # RoundtableError hierarchy
└── index.ts          # Entry point
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
  stance?: 'YES' | 'NO' | 'NEUTRAL';  // For devils-advocate mode
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
  modePrompt?: string;    // Mode-specific prompt (set by mode strategy)
}
```

### 4-Layer Response Types

```typescript
type ConsensusLevel = 'high' | 'medium' | 'low';  // high >= 0.7, medium >= 0.4
type ActionRecommendationType = 'proceed' | 'verify' | 'query_detail';

interface RoundtableResponse {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  roundNumber: number;
  totalRounds: number;
  decision: DecisionLayer;           // Layer 1: Quick decision info
  agentResponses: AgentResponseSummary[];  // Layer 2: Per-agent summaries
  evidence: EvidenceLayer;           // Layer 3: Aggregated evidence
  metadata: MetadataLayer;           // Layer 4: Deep dive references
}

// Layer 1: Decision
interface DecisionLayer {
  consensusLevel: ConsensusLevel;
  agreementScore: number;  // 0.0-1.0
  actionRecommendation: {
    type: ActionRecommendationType;  // proceed, verify, query_detail
    reason: string;
  };
}

// Layer 2: Agent Responses
interface AgentResponseSummary {
  agentId: string;
  agentName: string;
  stance?: 'YES' | 'NO' | 'NEUTRAL';
  position: string;
  keyPoints: string[];  // 2-4 key points (AI or rule-based extraction)
  confidence: number;
  confidenceChange?: { delta: number; previousRound: number; reason: string };
  evidenceUsed: { webSearches: number; citations: number; toolCalls: string[] };
}

// Layer 3: Evidence
interface EvidenceLayer {
  totalCitations: number;
  conflicts: { issue: string; positions: { agentId: string; stance: string }[] }[];
  consensusSummary: string;  // Max 200 chars
}

// Layer 4: Metadata
interface MetadataLayer {
  detailReference: { tool: string; params: Record<string, unknown> };
  verificationHints: { field: string; reason: string; suggestedTool: string }[];
  hasMoreDetails: boolean;
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
├── StorageError          // Storage/database error (retryable: false)
└── ConfigurationError    // Invalid configuration (retryable: false)
```

**Error conversion pattern:**
```typescript
// In agents/utils/error-converter.ts
convertSDKError(error, provider) → RoundtableError subclass
isRetryableError(error) → boolean
```

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

## AI Consensus Analysis

The platform supports two consensus analysis modes with graceful degradation:

### AIConsensusAnalyzer (Primary)

Uses lightweight AI models for semantic analysis of debate positions:
- Understands meaning, not just keywords
- Detects negation ("AI is dangerous" vs "AI is not dangerous")
- Clusters similar positions semantically
- Provides nuanced analysis (partial agreements, conditional positions)
- 3-tier JSON parsing resilience (jsonrepair → partial-json → regex extraction)

**Light Models Used:**
| Provider   | Model                 |
| ---------- | --------------------- |
| Anthropic  | claude-haiku-4-5      |
| OpenAI     | gpt-5-mini            |
| Google     | gemini-2.5-flash-lite |
| Perplexity | sonar                 |

### ConsensusAnalyzer (Fallback)

Rule-based fallback using Jaccard similarity and word stemming. Automatically used when AI analysis is unavailable.

**Algorithm:**
- `agreementLevel = 0.7 * positionScore + 0.3 * confidenceScore`
- Negation detection (English + Korean)
- Stance word analysis (support/oppose, 찬성/반대)
- Greedy position clustering (similarity threshold: 0.35)

## Health Check System

Agents undergo health checks on startup via `runHealthChecks()`:
- Tests API connectivity with minimal request
- Deactivates unhealthy agents automatically
- Runs in parallel for performance

## MCP Tools

| Tool                  | Description                      | Handler Module |
| --------------------- | -------------------------------- | -------------- |
| `start_roundtable`    | Start new debate session         | session.ts     |
| `continue_roundtable` | Continue existing debate         | session.ts     |
| `control_session`     | Pause/resume/stop session        | session.ts     |
| `list_sessions`       | List debate sessions             | session.ts     |
| `get_consensus`       | Get consensus analysis           | query.ts       |
| `get_round_details`   | Get responses for specific round | query.ts       |
| `get_response_detail` | Get agent's detailed response    | query.ts       |
| `get_citations`       | Get citations from debate        | query.ts       |
| `get_thoughts`        | Get agent's reasoning evolution  | query.ts       |
| `export_session`      | Export session (markdown/JSON)   | export.ts      |
| `synthesize_debate`   | AI-powered debate synthesis      | export.ts      |
| `get_agents`          | List available agents            | agents.ts      |

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

## Known Issues / Future Improvements

1. **Tool result caching**: Web search results are not cached between agents in the same round.
2. **Delphi clustering**: Uses string comparison for position distribution (not semantic).
3. **Registry toolkit duplication**: toolkit is set both in factory and createAgent().
