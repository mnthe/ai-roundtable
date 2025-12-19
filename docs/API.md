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
  model: string;        // Model name (e.g., 'claude-3-5-sonnet-20241022')
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
type DebateMode = 'collaborative' | 'adversarial' | 'socratic' | 'expert-panel';
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
  commonPoints: string[];     // Points of agreement
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

### GPT4Agent

OpenAI GPT-4 agent with tool use support.

```typescript
class GPT4Agent extends BaseAgent {
  constructor(config: AgentConfig, options?: GPT4AgentOptions);
}

interface GPT4AgentOptions {
  apiKey?: string;        // Default: OPENAI_API_KEY env
  client?: OpenAI;        // Custom client (testing)
}

function createGPT4Agent(
  config: AgentConfig,
  toolkit?: AgentToolkit,
  options?: GPT4AgentOptions
): GPT4Agent;
```

### GeminiAgent

Google Gemini agent with function calling.

```typescript
class GeminiAgent extends BaseAgent {
  constructor(config: AgentConfig, options?: GeminiAgentOptions);
}

interface GeminiAgentOptions {
  apiKey?: string;              // Default: GOOGLE_AI_API_KEY env
  genAI?: GoogleGenerativeAI;   // Custom client (testing)
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

Agents build on each other's ideas sequentially.

```typescript
class CollaborativeMode implements DebateModeStrategy {
  readonly name = 'collaborative';
  // Sequential execution, consensus-building prompts
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
  setContext?(context: DebateContext): void;
}

interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
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

| Variable | Description | Required |
|----------|-------------|----------|
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | For Claude agents |
| `OPENAI_API_KEY` | OpenAI API key for GPT-4 | For GPT-4 agents |
| `GOOGLE_AI_API_KEY` | Google AI API key for Gemini | For Gemini agents |
| `PERPLEXITY_API_KEY` | Perplexity API key | For Perplexity agents |
| `DATABASE_PATH` | SQLite database path | No (default: `./data/roundtable.db`) |

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
