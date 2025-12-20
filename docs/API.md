# API Reference

Complete API documentation for AI Roundtable.

## Table of Contents

- [Types](#types)
- [Agents](#agents)
- [Modes](#modes)
- [Tools](#tools)
- [Core](#core)
- [Storage](#storage)
- [MCP Server](#mcp-server)
- [Error Handling](#error-handling)
- [Error Response Format](#error-response-format)

---

## Types

### AIProvider

```typescript
type AIProvider = 'anthropic' | 'openai' | 'google' | 'perplexity';
```

### AgentConfig

Configuration for creating an AI agent.

```typescript
interface AgentConfig {
  id: string;           // Unique identifier
  name: string;         // Display name
  provider: AIProvider; // AI provider
  model: string;        // Model name (e.g., 'claude-sonnet-4-5')
  systemPrompt?: string; // Custom system prompt
  temperature?: number;  // 0.0-1.0 (default: 0.7)
  maxTokens?: number;    // Max response tokens (default: 4096)
}
```

### AgentResponse

Response from an AI agent.

```typescript
interface AgentResponse {
  agentId: string;
  agentName: string;
  position: string;           // Agent's position on the topic
  reasoning: string;          // Supporting reasoning
  confidence: number;         // 0.0-1.0
  citations?: Citation[];     // Source citations
  toolCalls?: ToolCallRecord[]; // Tools used
  images?: ImageResult[];     // Images (Perplexity)
  relatedQuestions?: string[]; // Related questions (Perplexity)
  timestamp: Date;
}
```

### DebateMode

Available debate modes.

```typescript
type DebateMode =
  | 'collaborative'      // Parallel - Find common ground, build consensus
  | 'adversarial'        // Sequential - Challenge opposing viewpoints
  | 'socratic'           // Sequential - Explore through questioning
  | 'expert-panel'       // Parallel - Independent expert assessments
  | 'devils-advocate'    // Sequential - Structured opposition and challenge
  | 'delphi'             // Parallel - Anonymized iterative consensus building
  | 'red-team-blue-team'; // Parallel (teams) - Attack/defense team analysis
```

### DebateConfig

Configuration for starting a debate.

```typescript
interface DebateConfig {
  topic: string;        // Debate topic
  mode: DebateMode;     // Debate mode
  agents: string[];     // Agent IDs to participate
  rounds?: number;      // Number of rounds (default: 3)
  focusQuestion?: string; // Optional focus question
}
```

### DebateContext

Context passed to agents during debate.

```typescript
interface DebateContext {
  sessionId: string;
  topic: string;
  mode: DebateMode;
  currentRound: number;
  totalRounds: number;
  previousResponses: AgentResponse[];
  focusQuestion?: string;
  modePrompt?: string;    // Mode-specific prompt additions (set by mode strategy)
}
```

### Session

Debate session state.

```typescript
interface Session {
  id: string;
  topic: string;
  mode: DebateMode;
  agentIds: string[];
  status: SessionStatus;  // 'active' | 'paused' | 'completed' | 'error'
  currentRound: number;
  totalRounds: number;
  responses: AgentResponse[];
  consensus?: ConsensusResult;
  createdAt: Date;
  updatedAt: Date;
}
```

### ConsensusResult

Analysis of agreement/disagreement.

```typescript
interface ConsensusResult {
  agreementLevel: number;     // 0.0-1.0
  commonGround: string[];     // Points of agreement
  disagreementPoints: string[]; // Points of disagreement
  summary: string;            // Overall summary
}
```

### Citation

Source citation.

```typescript
interface Citation {
  title: string;
  url: string;
  snippet?: string;
}
```

### ImageResult

Image from search results.

```typescript
interface ImageResult {
  url: string;
  description?: string;
}
```

### AIConsensusResult

Enhanced AI-based consensus result with semantic analysis.

```typescript
interface AIConsensusResult extends ConsensusResult {
  /** Position clusters identified by AI */
  clusters?: {
    theme: string;
    agentIds: string[];
    summary: string;
  }[];
  /** Nuanced aspects that rule-based analysis would miss */
  nuances?: {
    partialAgreements: string[];
    conditionalPositions: string[];
    uncertainties: string[];
  };
  /** AI's reasoning for the analysis */
  reasoning?: string;
  /** ID of the agent that performed the analysis */
  analyzerId?: string;
}
```

### SynthesisResult

Result of AI-powered debate synthesis.

```typescript
interface SynthesisResult {
  commonGround: string[];
  keyDifferences: string[];
  evolutionSummary: string;
  conclusion: string;
  recommendation: string;
  confidence: number;
  synthesizerId: string;
  timestamp: Date;
}
```

---

## 4-Layer Response Types

Enhanced response structure for MCP tool outputs, designed for efficient main agent decision-making.

### ConsensusLevel

```typescript
type ConsensusLevel = 'high' | 'medium' | 'low';
// high: agreementScore >= 0.7
// medium: agreementScore >= 0.4
// low: agreementScore < 0.4
```

### ActionRecommendationType

```typescript
type ActionRecommendationType = 'proceed' | 'verify' | 'query_detail';
```

### RoundtableResponse

Main 4-layer response structure.

```typescript
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
```

### DecisionLayer (Layer 1)

Quick decision-making information.

```typescript
interface DecisionLayer {
  consensusLevel: ConsensusLevel;
  agreementScore: number;           // 0.0-1.0
  actionRecommendation: {
    type: ActionRecommendationType;
    reason: string;
  };
}
```

### AgentResponseSummary (Layer 2)

Per-agent reasoning information.

```typescript
interface AgentResponseSummary {
  agentId: string;
  agentName: string;
  position: string;
  keyPoints: string[];              // 2-3 key reasoning points
  confidence: number;
  confidenceChange?: {
    delta: number;
    previousRound: number;
    reason: string;
  };
  evidenceUsed: {
    webSearches: number;
    citations: number;
    toolCalls: string[];
  };
}
```

### EvidenceLayer (Layer 3)

Aggregated evidence information.

```typescript
interface EvidenceLayer {
  totalCitations: number;
  conflicts: {
    issue: string;
    positions: { agentId: string; stance: string }[];
  }[];
  consensusSummary: string;
}
```

### MetadataLayer (Layer 4)

References for deep dive analysis.

```typescript
interface MetadataLayer {
  detailReference: {
    tool: string;
    params: Record<string, unknown>;
  };
  verificationHints: {
    field: string;
    reason: string;
    suggestedTool: string;
  }[];
  hasMoreDetails: boolean;
}
```

---

## Agents

### BaseAgent

Abstract base class for all agents.

```typescript
abstract class BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly provider: AIProvider;
  readonly model: string;

  constructor(config: AgentConfig);

  // Must be implemented by subclasses
  abstract generateResponse(context: DebateContext): Promise<AgentResponse>;

  // Set the toolkit for tool use
  setToolkit(toolkit: AgentToolkit): void;

  // Protected helpers
  protected buildSystemPrompt(context: DebateContext): string;
  protected buildUserMessage(context: DebateContext): string;
  protected parseResponse(rawText: string, context: DebateContext): ParsedResponse;
}
```

### ClaudeAgent

Anthropic Claude agent with tool use support.

```typescript
class ClaudeAgent extends BaseAgent {
  constructor(config: AgentConfig, options?: ClaudeAgentOptions);
}

interface ClaudeAgentOptions {
  apiKey?: string;        // Default: ANTHROPIC_API_KEY env
  client?: Anthropic;     // Custom client (testing)
}

// Factory function
function createClaudeAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: ClaudeAgentOptions
): ClaudeAgent;
```

### ChatGPTAgent

OpenAI ChatGPT agent with tool use support.

```typescript
class ChatGPTAgent extends BaseAgent {
  constructor(config: AgentConfig, options?: ChatGPTAgentOptions);
}

interface ChatGPTAgentOptions {
  apiKey?: string;        // Default: OPENAI_API_KEY env
  client?: OpenAI;        // Custom client (testing)
}

function createChatGPTAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: ChatGPTAgentOptions
): ChatGPTAgent;
```

### GeminiAgent

Google Gemini agent with function calling.

```typescript
class GeminiAgent extends BaseAgent {
  constructor(config: AgentConfig, options?: GeminiAgentOptions);
}

interface GeminiAgentOptions {
  apiKey?: string;        // Default: GOOGLE_API_KEY env
  client?: GoogleGenAI;   // Custom client (testing)
}

function createGeminiAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: GeminiAgentOptions
): GeminiAgent;
```

### PerplexityAgent

Perplexity agent with built-in web search.

```typescript
class PerplexityAgent extends BaseAgent {
  constructor(config: AgentConfig, options?: PerplexityAgentOptions);

  // Update search options dynamically
  setSearchOptions(options: PerplexitySearchOptions): void;
  getSearchOptions(): PerplexitySearchOptions;
}

interface PerplexityAgentOptions {
  apiKey?: string;                    // Default: PERPLEXITY_API_KEY env
  client?: OpenAI;                    // Custom client (testing)
  searchOptions?: PerplexitySearchOptions;
}

interface PerplexitySearchOptions {
  recencyFilter?: 'hour' | 'day' | 'week' | 'month';
  domainFilter?: string[];    // Max 3 domains
  returnImages?: boolean;
  returnRelatedQuestions?: boolean;
}

function createPerplexityAgent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: PerplexityAgentOptions
): PerplexityAgent;
```

### AgentRegistry

Registry for managing agent providers and instances.

```typescript
class AgentRegistry {
  // Register a provider
  registerProvider(
    provider: AIProvider,
    factory: AgentFactory,
    defaultModel: string
  ): void;

  // Create an agent
  createAgent(config: AgentConfig): BaseAgent;

  // Get available providers
  getAvailableProviders(): AIProvider[];

  // Check if provider is registered
  hasProvider(provider: AIProvider): boolean;

  // Get default model for provider
  getDefaultModel(provider: AIProvider): string;
}

// Global registry
function getGlobalRegistry(): AgentRegistry;
function resetGlobalRegistry(): void;
```

---

## Modes

### DebateModeStrategy

Interface for debate execution strategies.

```typescript
interface DebateModeStrategy {
  readonly name: string;

  executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]>;

  buildAgentPrompt(context: DebateContext): string;
}
```

### CollaborativeMode

Agents find common ground and build consensus in parallel.

```typescript
class CollaborativeMode implements DebateModeStrategy {
  readonly name = 'collaborative';
  // Parallel execution, consensus-building prompts
}
```

### AdversarialMode

Agents challenge opposing viewpoints sequentially.

```typescript
class AdversarialMode implements DebateModeStrategy {
  readonly name = 'adversarial';
  // Sequential execution, counter-argument prompts
}
```

### SocraticMode

Agents explore through questioning sequentially.

```typescript
class SocraticMode implements DebateModeStrategy {
  readonly name = 'socratic';
  // Sequential execution, questioning prompts
}
```

### ExpertPanelMode

Agents provide parallel expert assessments.

```typescript
class ExpertPanelMode implements DebateModeStrategy {
  readonly name = 'expert-panel';
  // Parallel execution, expert assessment prompts
}
```

### ModeRegistry

Registry for debate modes.

```typescript
class ModeRegistry {
  registerMode(mode: DebateMode, strategy: DebateModeStrategy): void;
  getMode(mode: DebateMode): DebateModeStrategy;
  hasMode(mode: DebateMode): boolean;
  getAvailableModes(): DebateMode[];
  removeMode(mode: DebateMode): boolean;
  clear(): void;
  reset(): void;
}

function getGlobalModeRegistry(): ModeRegistry;
function resetGlobalModeRegistry(): void;
```

---

## Tools

### AgentToolkit

Interface for toolkit that agents use.

```typescript
interface AgentToolkit {
  getTools(): AgentTool[];
  executeTool(name: string, input: unknown): Promise<unknown>;
}

interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
```

### DefaultAgentToolkit

Default implementation with standard tools.

```typescript
class DefaultAgentToolkit implements AgentToolkit {
  constructor(
    webSearchProvider?: WebSearchProvider,
    sessionDataProvider?: SessionDataProvider,
    perplexitySearchProvider?: PerplexitySearchProvider
  );

  setContext(context: DebateContext): void;
  registerTool(definition: ToolDefinition): void;
  getTools(): AgentTool[];
  executeTool(name: string, input: unknown): Promise<unknown>;
}

function createDefaultToolkit(
  webSearchProvider?: WebSearchProvider,
  sessionDataProvider?: SessionDataProvider,
  perplexitySearchProvider?: PerplexitySearchProvider
): DefaultAgentToolkit;
```

### Built-in Tools

#### get_context

Get current debate context.

```typescript
// Input: none
// Output:
{
  success: true,
  data: {
    topic: string;
    mode: string;
    currentRound: number;
    totalRounds: number;
    previousResponses: Array<{
      agentName: string;
      position: string;
      confidence: number;
    }>;
    focusQuestion?: string;
  }
}
```

#### submit_response

Submit structured response (validation only).

```typescript
// Input:
{
  position: string;     // Required
  reasoning: string;    // Required
  confidence: number;   // 0.0-1.0
}

// Output:
{
  success: true,
  data: {
    position: string;
    reasoning: string;
    confidence: number;  // Clamped to 0-1
  }
}
```

#### search_web

Basic web search.

```typescript
// Input:
{
  query: string;        // Required
  max_results?: number; // Default: 5, max: 10
}

// Output:
{
  success: true,
  data: {
    results: Array<{
      title: string;
      url: string;
      snippet: string;
      publishedDate?: string;
    }>;
  }
}
```

#### fact_check

Verify claims with evidence.

```typescript
// Input:
{
  claim: string;        // Required
  source_agent?: string; // Agent who made the claim
}

// Output:
{
  success: true,
  data: {
    claim: string;
    sourceAgent: string;
    webEvidence: SearchResult[];
    debateEvidence: Array<{
      agentName: string;
      evidence: string;
      confidence: number;
    }>;
  }
}
```

#### perplexity_search

Advanced search with Perplexity AI.

```typescript
// Input:
{
  query: string;              // Required
  recency_filter?: 'hour' | 'day' | 'week' | 'month';
  domain_filter?: string[];   // Max 3 domains
  return_images?: boolean;
  return_related_questions?: boolean;
}

// Output:
{
  success: true,
  data: {
    answer: string;
    citations?: Array<{ title: string; url: string; snippet?: string }>;
    images?: Array<{ url: string; description?: string }>;
    related_questions?: string[];
  }
}
```

### Provider Interfaces

```typescript
interface WebSearchProvider {
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}

interface PerplexitySearchProvider {
  search(input: PerplexitySearchInput): Promise<PerplexitySearchResult>;
}

interface SessionDataProvider {
  getSession(sessionId: string): Promise<SessionData | null>;
  findRelatedEvidence(claim: string): Promise<Evidence[]>;
}
```

---

## Core

### DebateEngine

Main orchestrator for debates.

```typescript
class DebateEngine {
  constructor(
    sessionManager: SessionManager,
    agentRegistry: AgentRegistry,
    modeRegistry: ModeRegistry,
    toolkit: AgentToolkit
  );

  // Start a new debate
  async startDebate(config: DebateConfig): Promise<Session>;

  // Run one round
  async runRound(sessionId: string, focusQuestion?: string): Promise<RoundResult>;

  // Get consensus analysis
  async getConsensus(sessionId: string): Promise<ConsensusResult>;

  // Get session
  async getSession(sessionId: string): Promise<Session | null>;

  // List all sessions
  async listSessions(): Promise<Session[]>;
}
```

### SessionManager

Manages debate sessions.

```typescript
class SessionManager {
  constructor(storage: StorageProvider);

  createSession(config: DebateConfig): Promise<Session>;
  getSession(id: string): Promise<Session | null>;
  updateSession(session: Session): Promise<void>;
  addResponse(sessionId: string, response: AgentResponse): Promise<void>;
  listSessions(): Promise<Session[]>;
  deleteSession(id: string): Promise<void>;
}
```

### ConsensusAnalyzer

Analyzes consensus among agents.

```typescript
class ConsensusAnalyzer {
  analyze(responses: AgentResponse[]): ConsensusResult;
}
```

---

## Storage

### SQLiteStorage

SQLite-based persistence.

```typescript
class SQLiteStorage implements StorageProvider {
  constructor(dbPath?: string);  // Default: './data/roundtable.db'

  // Session operations
  saveSession(session: Session): Promise<void>;
  getSession(id: string): Promise<Session | null>;
  getAllSessions(): Promise<Session[]>;
  deleteSession(id: string): Promise<void>;

  // Response operations
  addResponse(sessionId: string, response: AgentResponse): Promise<void>;
  getResponses(sessionId: string): Promise<AgentResponse[]>;

  // Maintenance
  close(): void;
}
```

---

## MCP Server

### MCP Tools

Tools exposed through MCP protocol.

#### start_roundtable

```typescript
// Input schema
{
  topic: string;        // Required: Debate topic
  mode?: DebateMode;    // Default: 'collaborative'
  agents?: string[];    // Default: all available
  rounds?: number;      // Default: 3
}

// Returns: Session
```

#### continue_roundtable

```typescript
// Input schema
{
  sessionId: string;    // Required
  rounds?: number;      // Additional rounds to run
  focusQuestion?: string;
}

// Returns: RoundResult
```

#### get_consensus

```typescript
// Input schema
{
  sessionId: string;    // Required
}

// Returns: ConsensusResult
```

#### get_agents

```typescript
// Input: none
// Returns: Array of available agents with metadata
```

#### list_sessions

```typescript
// Input: none
// Returns: Array of sessions with status
```

### Server Setup

```typescript
import { createMCPServer } from './mcp/server.js';

const server = createMCPServer({
  debateEngine: engine,
  agentRegistry: registry,
});

// Start server (stdio transport)
await server.start();
```

---

## Environment Variables

| Variable             | Description                  | Required                             |
| -------------------- | ---------------------------- | ------------------------------------ |
| `ANTHROPIC_API_KEY`  | Anthropic API key for Claude | For Claude agents                    |
| `OPENAI_API_KEY`     | OpenAI API key for ChatGPT   | For ChatGPT agents                   |
| `GOOGLE_API_KEY`  | Google AI API key for Gemini | For Gemini agents                    |
| `PERPLEXITY_API_KEY` | Perplexity API key           | For Perplexity agents                |
| `DATABASE_PATH`      | SQLite database path         | No (default: `./data/roundtable.db`) |

---

## Error Handling

All tools return results in this format:

```typescript
interface ToolResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
```

Agents handle errors gracefully and continue operation where possible.

---

## Error Response Format

AI Roundtable uses a hierarchical error system with structured error responses.

### Error Structure

All errors extend `RoundtableError` and provide consistent JSON serialization:

```typescript
interface ErrorResponse {
  name: string;           // Error class name
  message: string;        // Human-readable error message
  code: string;           // Machine-readable error code
  provider?: string;      // AI provider that caused the error (if applicable)
  retryable: boolean;     // Whether the operation can be retried
  stack?: string;         // Stack trace (debug only)
  cause?: string;         // Original error message (if wrapped)
}
```

### Error Hierarchy

```
RoundtableError (base)
├── APIRateLimitError     (retryable: true)
├── APIAuthError          (retryable: false)
├── APINetworkError       (retryable: true)
├── APITimeoutError       (retryable: true)
├── AgentError            (retryable: false)
└── SessionError          (retryable: false)
```

### Error Types Reference

#### APIRateLimitError

API provider rate limit exceeded.

| Property   | Value                      |
| ---------- | -------------------------- |
| Code       | `API_RATE_LIMIT`           |
| Retryable  | `true`                     |
| Default Message | `API rate limit exceeded` |

**When it occurs:**
- Too many requests sent to AI provider within time window
- Token quota exceeded
- Concurrent request limit reached

**Client handling:**
1. Implement exponential backoff (recommended: 1s, 2s, 4s, 8s...)
2. Check provider's `Retry-After` header if available
3. Consider reducing concurrent agent count
4. Cache responses where applicable

**Example response:**
```json
{
  "name": "APIRateLimitError",
  "message": "API rate limit exceeded for anthropic",
  "code": "API_RATE_LIMIT",
  "provider": "anthropic",
  "retryable": true
}
```

---

#### APIAuthError

API authentication or authorization failure.

| Property   | Value                       |
| ---------- | --------------------------- |
| Code       | `API_AUTH_FAILED`           |
| Retryable  | `false`                     |
| Default Message | `API authentication failed` |

**When it occurs:**
- Invalid or expired API key
- API key lacks required permissions
- Account suspended or deactivated

**Client handling:**
1. Verify API key is correctly set in environment variables
2. Check API key permissions in provider dashboard
3. Regenerate API key if compromised
4. Do NOT retry - manual intervention required

**Example response:**
```json
{
  "name": "APIAuthError",
  "message": "Invalid API key for openai",
  "code": "API_AUTH_FAILED",
  "provider": "openai",
  "retryable": false
}
```

---

#### APINetworkError

Network connectivity issue with AI provider.

| Property   | Value                      |
| ---------- | -------------------------- |
| Code       | `API_NETWORK_ERROR`        |
| Retryable  | `true`                     |
| Default Message | `Network error occurred` |

**When it occurs:**
- DNS resolution failure
- Connection refused or reset
- SSL/TLS handshake failure
- Network timeout during connection establishment

**Client handling:**
1. Check network connectivity
2. Verify provider's service status page
3. Retry with exponential backoff
4. Consider fallback to alternative provider

**Example response:**
```json
{
  "name": "APINetworkError",
  "message": "Failed to connect to api.anthropic.com",
  "code": "API_NETWORK_ERROR",
  "provider": "anthropic",
  "retryable": true
}
```

---

#### APITimeoutError

API request exceeded time limit.

| Property   | Value                       |
| ---------- | --------------------------- |
| Code       | `API_TIMEOUT`               |
| Retryable  | `true`                      |
| Default Message | `API request timed out` |

**When it occurs:**
- Request processing exceeded timeout threshold
- Provider under heavy load
- Complex request requiring extended processing
- Large response generation

**Client handling:**
1. Retry with same parameters
2. Consider increasing `maxTokens` if response was truncated
3. Simplify request (shorter context, fewer agents)
4. Retry during off-peak hours

**Example response:**
```json
{
  "name": "APITimeoutError",
  "message": "Request to google timed out after 30000ms",
  "code": "API_TIMEOUT",
  "provider": "google",
  "retryable": true
}
```

---

#### AgentError

Error during agent execution or response generation.

| Property   | Value            |
| ---------- | ---------------- |
| Code       | `AGENT_ERROR`    |
| Retryable  | `false`          |
| Default Message | (custom)     |

**When it occurs:**
- Agent failed to parse response from provider
- Invalid tool call attempted
- Response validation failed
- Agent-specific processing error

**Client handling:**
1. Check agent configuration (model, temperature, maxTokens)
2. Verify toolkit is properly configured
3. Review previous responses for context issues
4. Try different agent or provider

**Example response:**
```json
{
  "name": "AgentError",
  "message": "Failed to parse response from claude-debate-1",
  "code": "AGENT_ERROR",
  "provider": "anthropic",
  "retryable": false,
  "cause": "Invalid JSON in response"
}
```

---

#### SessionError

Error related to session management.

| Property   | Value             |
| ---------- | ----------------- |
| Code       | `SESSION_ERROR`   |
| Retryable  | `false`           |
| Default Message | (custom)      |

**When it occurs:**
- Session not found (invalid sessionId)
- Session in incompatible state (e.g., already completed)
- Session data corruption
- Storage operation failed

**Client handling:**
1. Verify sessionId is valid (use `list_sessions` to confirm)
2. Check session status before operations
3. Create new session if current one is corrupted
4. Check storage permissions and disk space

**Example response:**
```json
{
  "name": "SessionError",
  "message": "Session 'abc-123' not found",
  "code": "SESSION_ERROR",
  "retryable": false
}
```

---

### Retry Strategy Recommendations

For retryable errors, implement exponential backoff:

```typescript
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!error.retryable || attempt === maxRetries) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Retry limit exceeded');
}
```

### Error Code Summary

| Error Code          | Retryable | Typical Cause                  |
| ------------------- | --------- | ------------------------------ |
| `API_RATE_LIMIT`    | Yes       | Too many requests              |
| `API_AUTH_FAILED`   | No        | Invalid/expired API key        |
| `API_NETWORK_ERROR` | Yes       | Network connectivity issues    |
| `API_TIMEOUT`       | Yes       | Request processing too slow    |
| `AGENT_ERROR`       | No        | Agent execution failure        |
| `SESSION_ERROR`     | No        | Invalid session state/ID       |
