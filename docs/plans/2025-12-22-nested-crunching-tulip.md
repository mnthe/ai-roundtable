# AI Roundtable Codebase Analysis & Refactoring Plan

## Overview

This document contains a comprehensive analysis of the ai-roundtable codebase, identifying code quality issues, architecture violations, and refactoring opportunities across all layers.

**Analysis Date:** 2025-12-22
**Total Issues Found:** 27 issues across 6 priority levels
**Layers Analyzed:** Core, Agents, Modes, MCP, Storage, Tools, Types, Utils, Config, Benchmark

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Issues by Priority](#issues-by-priority)
3. [Issues by Layer](#issues-by-layer)
4. [Detailed Issue Documentation](#detailed-issue-documentation)
5. [Refactoring Phases](#refactoring-phases)
6. [Risk Assessment](#risk-assessment)

---

## Executive Summary

### Issue Distribution

| Priority | Count | Description |
|----------|-------|-------------|
| P0 | 0 | Critical (tests passing) |
| P1 | 10 | High - Architecture/Security |
| P2 | 12 | Medium - Code Quality |
| P3 | 5 | Low - Minor Improvements |

### Layer Distribution

| Layer | Issues | Critical Files |
|-------|--------|----------------|
| Core | 5 | debate-engine.ts, ai-consensus-analyzer.ts, key-points-extractor.ts |
| Agents | 4 | perplexity.ts, chatgpt.ts |
| Modes | 4 | devils-advocate.ts, delphi.ts, expert-panel.ts |
| MCP | 3 | handlers/utils.ts, handlers/query.ts, handlers/export.ts |
| Storage | 3 | sqlite.ts |
| Tools | 2 | toolkit.ts |
| Types | 2 | schemas.ts |
| Utils | 2 | retry.ts |
| Benchmark | 2 | benchmark-runner.ts, metrics-collector.ts |

---

## Issues by Priority

### P1 - High Priority (10 issues)

1. **CORE-001**: DebateEngine mutates session object directly
2. **CORE-002**: Duplicate light agent creation logic
3. **CORE-003**: Global EXIT_CRITERIA_CONFIG coupling
4. **CORE-004**: Inconsistent error types in analyzeConsensusWithAI
5. **AGENTS-001**: PerplexityAgent duplicated API call configuration
6. **AGENTS-002**: PerplexityAgent doesn't reuse buildOpenAITools
7. **AGENTS-003**: Duplicate performSynthesis/generateRawCompletion patterns
8. **MCP-001**: Session existence check duplicated in 9 handlers
9. **MCP-002**: Response grouping by round duplicated in 3 handlers
10. **MCP-003**: Unsafe error cast in all handlers

### P2 - Medium Priority (12 issues)

1. **MODES-001**: SEPARATOR constant duplicated in 4 files
2. **MODES-002**: executionPattern property usage inconsistent
3. **MODES-003**: Dead getAgentRole in ExpertPanelMode
4. **MODES-004**: Three modes don't use buildModePrompt
5. **STORAGE-001**: LIKE pattern injection vulnerability
6. **STORAGE-002**: N+1 query problem in mapStoredSessionToSession
7. **STORAGE-003**: Unused filename option in constructor
8. **TOOLS-001**: Module-level mutable requestIdCounter
9. **TOOLS-002**: Unsafe type cast for priority
10. **UTILS-001**: Off-by-one naming in retry.ts
11. **TYPES-001**: URL validation inconsistency in schemas
12. **BENCH-001**: Memory leak in benchmark timeout

### P3 - Low Priority (5 issues)

1. **AGENTS-004**: ChatGPTAgent misleading buildSelectiveFunctionTools name
2. **AGENTS-005**: Inconsistent tool builder method naming
3. **CORE-005**: Magic string 'self' for single-response analyzer ID
4. **TYPES-002**: Generic ToolResult could use discriminated union
5. **BENCH-002**: Empty array edge case in MetricsCollector

---

## Issues by Layer

### Core Layer Issues

#### CORE-001: DebateEngine Session Mutation
- **File:** `src/core/debate-engine.ts`
- **Lines:** 171-172
- **Priority:** P1
- **Type:** Side Effect / Immutability Violation

**Problem:**
```typescript
// Lines 171-172 directly mutate session object
session.responses.push(...result.responses);
session.currentRound = currentRound;
```

**Impact:**
- Unexpected side effects when session is used after `executeRounds()`
- Violates functional programming principles
- Makes debugging difficult

**Evidence:**
- Session object passed as parameter is modified in-place
- Caller may not expect their session object to change

**Recommended Fix:**
- Option A: Return updated session data instead of mutating
- Option B: Clone session before modification
- Option C: Document mutation clearly in JSDoc

---

#### CORE-002: Duplicate Light Agent Creation Logic
- **Files:**
  - `src/core/ai-consensus-analyzer.ts` (lines 267-293)
  - `src/core/key-points-extractor.ts` (lines 161-194)
- **Priority:** P1
- **Type:** Code Duplication / DRY Violation

**Problem:**
Both files have nearly identical logic for:
1. Getting active agents from registry
2. Checking preferred provider
3. Creating light model agent
4. Caching the agent instance

**ai-consensus-analyzer.ts (lines 267-293):**
```typescript
private async getAnalysisAgent(): Promise<BaseAgent | null> {
  const activeAgents = this.registry.getActiveAgents();
  if (activeAgents.length === 0) {
    return null;
  }

  // ... 26 lines of selection logic
}
```

**key-points-extractor.ts (lines 161-194):**
```typescript
private async getOrCreateLightAgent(): Promise<BaseAgent | null> {
  if (this.lightAgent) return this.lightAgent;

  const activeAgents = this.registry.getActiveAgents();
  if (activeAgents.length === 0) return null;

  // ... 33 lines of nearly identical selection logic
}
```

**Impact:**
- Bug fixes must be applied twice
- Inconsistent behavior between analyzers
- Increased maintenance burden

**Recommended Fix:**
Create shared helper in `src/core/utils/light-agent-selector.ts`:
```typescript
export interface LightAgentSelectorConfig {
  registry: AgentRegistry;
  preferredProvider?: AIProvider;
  idSuffix: string;
  maxTokens?: number;
}

export async function selectLightAgent(
  config: LightAgentSelectorConfig
): Promise<BaseAgent | null>
```

---

#### CORE-003: Global EXIT_CRITERIA_CONFIG Coupling
- **Files:**
  - `src/config/exit-criteria.ts`
  - `src/core/debate-engine.ts` (lines 178-183)
- **Priority:** P1
- **Type:** Tight Coupling / Testability

**Problem:**
```typescript
// debate-engine.ts lines 178-183
if (EXIT_CRITERIA_CONFIG.enabled && i < numRounds - 1) {
  const exitCriteria: ExitCriteria = {
    maxRounds: session.totalRounds,
    consensusThreshold: EXIT_CRITERIA_CONFIG.consensusThreshold,
    convergenceRounds: EXIT_CRITERIA_CONFIG.convergenceRounds,
  };
```

**Impact:**
- Cannot test with different exit criteria configurations
- Config loaded at module level, cannot be reloaded at runtime
- Violates Dependency Inversion Principle

**Recommended Fix:**
Make config injectable via `DebateEngineOptions`:
```typescript
export interface DebateEngineOptions {
  toolkit?: AgentToolkit;
  aiConsensusAnalyzer?: AIConsensusAnalyzer;
  exitCriteriaConfig?: ExitCriteriaConfig; // NEW
}
```

---

#### CORE-004: Inconsistent Error Type in analyzeConsensusWithAI
- **File:** `src/core/debate-engine.ts`
- **Line:** 250
- **Priority:** P1
- **Type:** Error Handling Inconsistency

**Problem:**
```typescript
// Line 250 uses generic Error
if (!this.aiConsensusAnalyzer) {
  throw new Error('AI consensus analyzer not available...');
}
```

**Impact:**
- Inconsistent with rest of codebase using custom error types
- Cannot distinguish this error from other generic errors
- Error handling code cannot react specifically to this case

**Recommended Fix:**
```typescript
throw new ConfigurationError('AI consensus analyzer not available', {
  code: 'MISSING_CONSENSUS_ANALYZER',
});
```

---

#### CORE-005: Magic String for Single-Response Analyzer ID
- **File:** `src/core/ai-consensus-analyzer.ts`
- **Lines:** 167-183
- **Priority:** P3
- **Type:** Magic String

**Problem:**
```typescript
if (responses.length === 1) {
  return {
    // ...
    analyzerId: 'self',  // Magic string
  };
}
```

**Recommended Fix:**
Define constant: `const SELF_ANALYZER_ID = 'self';`

---

### Agents Layer Issues

#### AGENTS-001: PerplexityAgent Duplicated API Call Configuration
- **File:** `src/agents/perplexity.ts`
- **Lines:** 122-136, 175-190
- **Priority:** P1
- **Type:** Code Duplication / DRY Violation

**Problem:**
Identical API call configuration appears twice:

**First occurrence (lines 122-136):**
```typescript
this.client.chat.completions.create({
  model: this.model,
  max_tokens: this.maxTokens,
  messages,
  tools: tools.length > 0 ? tools : undefined,
  temperature: this.temperature,
  search_recency_filter: this.searchOptions.recencyFilter ?? null,
  search_domain_filter:
    this.searchOptions.domainFilter && this.searchOptions.domainFilter.length > 0
      ? this.searchOptions.domainFilter.slice(0, 3)
      : null,
})
```

**Second occurrence (lines 175-190):** (identical)

**Impact:**
- Changes must be made in two places
- Risk of inconsistency between calls
- Increased maintenance burden

**Recommended Fix:**
Extract to helper method:
```typescript
private buildApiCallParams(
  messages: ChatMessageInput[],
  tools: CompletionCreateParams.Tool[]
): CompletionCreateParams
```

---

#### AGENTS-002: PerplexityAgent Doesn't Reuse buildOpenAITools
- **File:** `src/agents/perplexity.ts`
- **Lines:** 237-254
- **Priority:** P1
- **Type:** Missed Reuse Opportunity

**Problem:**
PerplexityAgent has its own `buildPerplexityTools()` method that is nearly identical to `buildOpenAITools()` in `tool-converters.ts`.

**perplexity.ts (lines 237-254):**
```typescript
private buildPerplexityTools(): CompletionCreateParams.Tool[] {
  if (!this.toolkit) {
    return [];
  }
  return this.toolkit.getTools().map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters,
        required: Object.keys(tool.parameters),
      },
    },
  }));
}
```

**Impact:**
- Duplicate code maintenance
- Perplexity SDK uses OpenAI-compatible format
- Changes to tool format need to be applied in multiple places

**Recommended Fix:**
Replace with:
```typescript
import { buildOpenAITools } from './utils/tool-converters.js';

private buildPerplexityTools() {
  return buildOpenAITools(this.toolkit);
}
```

---

#### AGENTS-003: Duplicate performSynthesis/generateRawCompletion Patterns
- **Files:**
  - `src/agents/perplexity.ts` (lines 368-424)
  - `src/agents/claude.ts` (lines 291-316)
  - `src/agents/gemini.ts` (lines 343-367)
- **Priority:** P1
- **Type:** Code Duplication

**Problem:**
All three agents have nearly identical structure for `performSynthesis` and `generateRawCompletion`:

```typescript
protected override async performSynthesis(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  try {
    const response = await withRetry(
      () => this.client.PROVIDER_METHOD.create({...}),
      { maxRetries: 3 }
    );
    return this.extractContentText(response);
  } catch (error) {
    const convertedError = this.convertError(error);
    logger.error({ err: convertedError }, 'Failed to perform synthesis');
    throw convertedError;
  }
}
```

**Impact:**
- 3x code duplication
- Bug fixes must be applied to all agents
- ChatGPTAgent shows better pattern via utility delegation

**Recommended Fix:**
Consider adding default implementation in `BaseAgent` or extract shared utility similar to ChatGPT's `executeSimpleResponsesCompletion`.

---

#### AGENTS-004: ChatGPTAgent Misleading Method Name
- **File:** `src/agents/chatgpt.ts`
- **Lines:** 118-120
- **Priority:** P3
- **Type:** Naming

**Problem:**
```typescript
private buildSelectiveFunctionTools() {
  return buildResponsesFunctionTools(this.toolkit);
}
```

The method is named "selective" but doesn't perform any selection.

**Recommended Fix:**
Rename to `buildFunctionTools()` or call utility directly.

---

#### AGENTS-005: Inconsistent Tool Builder Method Naming
- **Files:** All agent files
- **Priority:** P3
- **Type:** Naming Inconsistency

**Problem:**
| Agent | Method Name |
|-------|-------------|
| ChatGPT | `buildSelectiveFunctionTools()` |
| Perplexity | `buildPerplexityTools()` |
| Claude | `buildAllTools()` + `buildAnthropicTools()` |
| Gemini | `buildGeminiTools()` |

**Recommended Fix:**
Standardize to `build{Provider}Tools()` pattern.

---

### Modes Layer Issues

#### MODES-001: SEPARATOR Constant Duplicated
- **Files:**
  - `src/modes/utils/prompt-builder.ts` (line 170)
  - `src/modes/devils-advocate.ts` (line 29)
  - `src/modes/delphi.ts` (line 38)
  - `src/modes/red-team-blue-team.ts` (line 43)
- **Priority:** P2
- **Type:** Code Duplication

**Problem:**
Each file defines:
```typescript
const SEPARATOR = '═══════════════════════════════════════════════════════════════════';
```

**Recommended Fix:**
Export from `src/modes/utils/constants.ts`:
```typescript
export const PROMPT_SEPARATOR = '═══════...';
```

---

#### MODES-002: executionPattern Property Usage Inconsistent
- **Files:** Various mode files
- **Priority:** P2
- **Type:** Inconsistency

**Problem:**
| Mode | Has executionPattern | Used |
|------|---------------------|------|
| ExpertPanelMode | Yes | No (tool-policy.ts used instead) |
| DevilsAdvocateMode | Yes | No |
| RedTeamBlueTeamMode | Yes | No |
| CollaborativeMode | No | - |
| AdversarialMode | No | - |
| SocraticMode | No | - |
| DelphiMode | No | - |

**Impact:**
- `tool-policy.ts` uses `MODE_EXECUTION_PATTERN` mapping as source of truth
- Property in modes is redundant

**Recommended Fix:**
Either remove from modes or use instead of tool-policy mapping.

---

#### MODES-003: Dead getAgentRole in ExpertPanelMode
- **File:** `src/modes/expert-panel.ts`
- **Lines:** 232-239
- **Priority:** P2
- **Type:** Dead Code

**Problem:**
```typescript
protected override getAgentRole(
  agent: BaseAgent,
  index: number,
  context: DebateContext
): string | undefined {
  // This hook exists but return value isn't used
  return this.assignPerspective(index).displayName;
}
```

The `getAgentRole` hook is only called in `executeSequential()`, but ExpertPanelMode uses `executeParallel()`. The actual role assignment happens via `assignPerspective()` in `executeRound()`.

**Recommended Fix:**
Remove or document as logging-only.

---

#### MODES-004: Three Modes Don't Use buildModePrompt
- **Files:**
  - `src/modes/devils-advocate.ts`
  - `src/modes/delphi.ts`
  - `src/modes/red-team-blue-team.ts`
- **Priority:** P2
- **Type:** Inconsistency (Intentional)

**Problem:**
These modes manually build 4-layer prompts instead of using `buildModePrompt()` utility.

**Analysis:**
This is intentional - these modes need role-specific prompts (PRIMARY/OPPOSITION/EVALUATOR, RED/BLUE, etc.) that don't fit the single-prompt pattern.

**Recommended Fix:**
Document as intentional variation or create `buildMultiRolePrompt()` utility.

---

### MCP Layer Issues

#### MCP-001: Session Existence Check Duplicated
- **Files:** All handler files
- **Priority:** P1
- **Type:** Code Duplication

**Problem:**
Every handler that takes sessionId has:
```typescript
const session = await sessionManager.getSession(input.sessionId);
if (!session) {
  return createErrorResponse(`Session "${input.sessionId}" not found`);
}
```

**Occurrences:** 9 handlers

**Recommended Fix:**
Create helper in `src/mcp/handlers/utils.ts`:
```typescript
export async function getSessionOrError(
  sessionManager: SessionManager,
  sessionId: string
): Promise<{ session: Session } | { error: ToolResponse }>
```

---

#### MCP-002: Response Grouping by Round Duplicated
- **Files:**
  - `src/mcp/handlers/query.ts` (lines 324-332)
  - `src/mcp/handlers/export.ts` (lines 102-110, 273-284)
- **Priority:** P1
- **Type:** Code Duplication

**Problem:**
Nearly identical response grouping logic:
```typescript
const responsesByRound: Record<number, typeof responses> = {};
for (const response of responses) {
  const roundIndex = responses.indexOf(response);
  const round = Math.floor(roundIndex / agentsPerRound) + 1;
  // ...
}
```

**Recommended Fix:**
Create utility:
```typescript
export function groupResponsesByRound(
  responses: AgentResponse[],
  agentCount: number
): Map<number, AgentResponse[]>
```

---

#### MCP-003: Unsafe Error Cast in Handlers
- **Files:** All handler files
- **Priority:** P1
- **Type:** Type Safety

**Problem:**
```typescript
catch (error) {
  return createErrorResponse(error as Error);  // Unsafe cast
}
```

**Impact:**
- Zod validation errors are ZodError, not Error
- Non-Error throws would cause issues

**Recommended Fix:**
```typescript
export function wrapError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}
```

---

### Storage Layer Issues

#### STORAGE-001: LIKE Pattern Injection Vulnerability
- **File:** `src/storage/sqlite.ts`
- **Line:** 331
- **Priority:** P2 (Security)
- **Type:** SQL Injection (Data Integrity)

**Problem:**
```typescript
conditions.push('topic LIKE ?');
params.push(`%${filters.topic}%`);  // User input in LIKE pattern
```

**Impact:**
- If `filters.topic` contains `%` or `_`, it changes search semantics
- Data integrity issue (not classic SQL injection due to parameterized query)

**Recommended Fix:**
```typescript
function escapeLikePattern(value: string): string {
  return value.replace(/[%_\\]/g, '\\$&');
}

params.push(`%${escapeLikePattern(filters.topic)}%`);
```

---

#### STORAGE-002: N+1 Query Problem
- **File:** `src/storage/sqlite.ts`
- **Lines:** 375, 516
- **Priority:** P2
- **Type:** Performance

**Problem:**
```typescript
// Line 516 - called for each session
private async mapStoredSessionToSession(stored: StoredSession): Promise<Session> {
  const responses = await this.getResponses(stored.id);  // N+1 query
```

**Impact:**
- `listSessions()` with 100 sessions = 101 queries
- Poor performance at scale

**Recommended Fix:**
Add batch loading or lazy response loading.

---

#### STORAGE-003: Unused filename Option
- **File:** `src/storage/sqlite.ts`
- **Line:** 87
- **Priority:** P2
- **Type:** Dead Code

**Problem:**
```typescript
constructor(_options: SQLiteStorageOptions = {})
```

The `filename` option is never used - always creates in-memory database.

**Recommended Fix:**
Implement file-based persistence or remove option.

---

### Tools Layer Issues

#### TOOLS-001: Module-Level Mutable requestIdCounter
- **File:** `src/tools/toolkit.ts`
- **Line:** 46
- **Priority:** P2
- **Type:** Global State

**Problem:**
```typescript
let requestIdCounter = 0;  // Module-level mutable state
```

**Impact:**
- Not thread-safe
- Resets on module reload
- Test pollution possible

**Recommended Fix:**
Move counter inside class or use UUID.

---

#### TOOLS-002: Unsafe Type Cast for Priority
- **File:** `src/tools/toolkit.ts`
- **Line:** 295
- **Priority:** P2
- **Type:** Type Safety

**Problem:**
```typescript
priority: data.priority as ContextRequestPriority,  // Cast without comment
```

**Note:** Zod schema validates this, but cast obscures validation chain.

**Recommended Fix:**
Add comment: `// Safe cast: validated by RequestContextInputSchema`

---

### Types Layer Issues

#### TYPES-001: URL Validation Inconsistency
- **File:** `src/types/schemas.ts`
- **Lines:** 29, 258-259
- **Priority:** P2
- **Type:** Validation Inconsistency

**Problem:**
```typescript
// Line 29 - Strict validation
url: z.string().url(),

// Lines 258-259 - Lenient validation
url: z.string(),  // No .url()
```

**Recommended Fix:**
Add `.url()` to `StoredCitationsArraySchema` or document why it's lenient.

---

#### TYPES-002: Generic ToolResult Could Use Discriminated Union
- **File:** `src/types/index.ts`
- **Lines:** 213-217
- **Priority:** P3
- **Type:** Type Design

**Problem:**
```typescript
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
```

**Recommended Fix:**
```typescript
type ToolResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
```

---

### Utils Layer Issues

#### UTILS-001: Off-by-One Naming in retry.ts
- **File:** `src/utils/retry.ts`
- **Line:** 140
- **Priority:** P2
- **Type:** Naming Confusion

**Problem:**
```typescript
for (let attempt = 0; attempt <= opts.maxRetries; attempt++)
```

With `maxRetries = 3`, this executes 4 attempts (0, 1, 2, 3). The parameter name is misleading.

**Recommended Fix:**
Rename to `maxAttempts` or document clearly.

---

### Benchmark Layer Issues

#### BENCH-001: Memory Leak in Benchmark Timeout
- **File:** `src/benchmark/benchmark-runner.ts`
- **Lines:** 548-554
- **Priority:** P2
- **Type:** Memory Leak

**Problem:**
```typescript
private createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {  // Timer never cleared on success
      reject(new Error(`Benchmark timeout after ${ms}ms`));
    }, ms);
  });
}
```

**Recommended Fix:**
```typescript
const timeoutId = setTimeout(...);
try {
  const result = await runFn();
  clearTimeout(timeoutId);
  return result;
} catch (error) {
  clearTimeout(timeoutId);
  throw error;
}
```

---

#### BENCH-002: Empty Array Edge Case
- **File:** `src/benchmark/metrics-collector.ts`
- **Line:** 481
- **Priority:** P3
- **Type:** Edge Case

**Problem:**
```typescript
const lastRound = Math.max(...responsesByRound.keys());  // Throws on empty
```

**Recommended Fix:**
```typescript
const keys = [...responsesByRound.keys()];
const lastRound = keys.length > 0 ? Math.max(...keys) : 0;
```

---

## Refactoring Phases

### Phase 1: Core Layer Critical Fixes (P1)
**Duration:** 4-6 hours

1. Fix session object mutation (CORE-001)
2. Extract light agent creation logic (CORE-002)
3. Make EXIT_CRITERIA_CONFIG injectable (CORE-003)
4. Use custom error type (CORE-004)

**Files:**
- `src/core/debate-engine.ts`
- `src/core/ai-consensus-analyzer.ts`
- `src/core/key-points-extractor.ts`
- `src/core/utils/light-agent-selector.ts` (new)

### Phase 2: Agents Layer Refactoring (P1)
**Duration:** 3-4 hours

1. Refactor PerplexityAgent API call configuration (AGENTS-001)
2. Reuse buildOpenAITools (AGENTS-002)
3. Extract common synthesis pattern (AGENTS-003)

**Files:**
- `src/agents/perplexity.ts`

### Phase 3: MCP Handler Consolidation (P1)
**Duration:** 2-3 hours

1. Create session helper functions (MCP-001)
2. Add response grouping utility (MCP-002)
3. Fix unsafe error cast (MCP-003)

**Files:**
- `src/mcp/handlers/utils.ts`
- All handler files

### Phase 4: Storage and Security (P2)
**Duration:** 3-4 hours

1. Fix LIKE pattern injection (STORAGE-001)
2. Fix N+1 query problem (STORAGE-002)
3. Handle unused filename option (STORAGE-003)

**Files:**
- `src/storage/sqlite.ts`

### Phase 5: Modes and Prompts Standardization (P2)
**Duration:** 2-3 hours

1. Extract SEPARATOR constant (MODES-001)
2. Resolve executionPattern inconsistency (MODES-002)
3. Remove/document dead code (MODES-003)
4. Document intentional variation (MODES-004)

**Files:**
- `src/modes/utils/constants.ts` (new)
- Various mode files

### Phase 6: Utility and Minor Fixes (P2-P3)
**Duration:** 2-3 hours

1. Fix module-level counter (TOOLS-001)
2. Add safe priority cast comment (TOOLS-002)
3. Clarify retry naming (UTILS-001)
4. Fix URL validation (TYPES-001)
5. Fix benchmark memory leak (BENCH-001)
6. Handle empty array edge case (BENCH-002)

---

## Risk Assessment

| Phase | Risk | Mitigation |
|-------|------|------------|
| 1 | Medium | Session mutation fix needs careful testing |
| 2 | Low | Well-tested agent layer, additive changes |
| 3 | Low | Handler changes are isolated |
| 4 | Medium | SQL changes need security review |
| 5 | Low | Mostly documentation/constants |
| 6 | Low | Minor fixes with good test coverage |

---

## Testing Strategy

1. **Before each phase:** Run `pnpm test`
2. **Per change:** Add/update unit tests
3. **After each phase:** Run integration tests
4. **Before merge:** Verify MCP tool contracts unchanged

---

## Appendix: Critical Files Summary

| File | Issues | Priority |
|------|--------|----------|
| `src/core/debate-engine.ts` | CORE-001, CORE-003, CORE-004 | P1 |
| `src/core/ai-consensus-analyzer.ts` | CORE-002, CORE-005 | P1, P3 |
| `src/core/key-points-extractor.ts` | CORE-002 | P1 |
| `src/agents/perplexity.ts` | AGENTS-001, AGENTS-002, AGENTS-003 | P1 |
| `src/agents/chatgpt.ts` | AGENTS-004 | P3 |
| `src/mcp/handlers/utils.ts` | MCP-001, MCP-002, MCP-003 | P1 |
| `src/storage/sqlite.ts` | STORAGE-001, STORAGE-002, STORAGE-003 | P2 |
| `src/tools/toolkit.ts` | TOOLS-001, TOOLS-002 | P2 |
| `src/types/schemas.ts` | TYPES-001 | P2 |
| `src/utils/retry.ts` | UTILS-001 | P2 |
| `src/benchmark/benchmark-runner.ts` | BENCH-001 | P2 |
| `src/benchmark/metrics-collector.ts` | BENCH-002 | P3 |
