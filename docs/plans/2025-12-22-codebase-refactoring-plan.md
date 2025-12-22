# Codebase Refactoring Plan

**Date**: 2025-12-22
**Status**: Draft
**Analysis Method**: 6 Explore agents + 1 Plan agent (parallel analysis)

## Executive Summary

Comprehensive codebase analysis identified areas for improvement in maintainability, reusability, and architecture compliance. The codebase demonstrates **excellent overall quality (8/10)** with well-applied design patterns and strong type safety.

---

## Analysis Results

### 1. Architecture Analysis

**Overall Assessment: Good**

| Aspect | Rating | Notes |
|--------|--------|-------|
| Layer Separation | A | Clear MCP → Core → Agents/Modes → Storage → Types |
| Design Patterns | A | Template Method, Strategy, Registry patterns well-applied |
| Abstractions | A | BaseAgent, BaseModeStrategy are well-designed |
| Type Safety | A+ | No `any` usage, comprehensive Zod validation |

**Issues Identified:**

| Priority | Issue | Location | Impact |
|----------|-------|----------|--------|
| P2 | Core→Modes dependency | `core/debate-engine.ts:9` imports `getGlobalModeRegistry` | Layer violation |
| P2 | Core→Agents dependency | `core/ai-consensus-analyzer.ts:14` imports agent utilities | Layer violation |
| P2 | Global singletons | `agents/registry.ts`, `modes/registry.ts` | Hidden dependencies |
| P3 | Type re-export inversion | `types/index.ts:403` re-exports from Core | Minor layer issue |

---

### 2. Code Quality Analysis

**Overall Assessment: Excellent**

| Aspect | Rating | Notes |
|--------|--------|-------|
| Error Handling | A+ | Unified RoundtableError hierarchy, consistent conversion |
| Naming Conventions | A | Consistent with documented standards |
| Code Duplication | B+ | Some duplication in agent patterns |
| Complexity | A- | Complex methods are well-documented and justified |

**Issues Identified:**

| Priority | Issue | Location | Impact |
|----------|-------|----------|--------|
| P2 | generateRawCompletion duplication | 4 agent files | Same pattern repeated |
| P2 | Tool schema duplication | `tools/toolkit.ts` vs `tools/schemas.ts` | Zod + JSON Schema both defined |
| P3 | Magic numbers | `agents/base.ts:104-105` | `0.7`, `4096` hardcoded |

**Code Example - Duplicated Pattern:**
```typescript
// Found in claude.ts, gemini.ts, chatgpt.ts, perplexity.ts
const effectiveSystemPrompt =
  systemPrompt ?? 'You are a helpful AI assistant. Respond exactly as instructed.';
```

---

### 3. Reusability Analysis

**Overall Assessment: Good**

| Aspect | Rating | Notes |
|--------|--------|-------|
| Mode Extensibility | A | Excellent hook system, declarative configs |
| Agent Extensibility | A- | Good template method, options interface needs unification |
| Tool Extensibility | B+ | Good interface, needs schema deduplication |
| Utility Reuse | A | Well-extracted processors, validators, prompt builders |

**Issues Identified:**

| Priority | Issue | Location | Recommendation |
|----------|-------|----------|----------------|
| P1 | Tool schema duplication | `tools/toolkit.ts` | Use Zod-to-JSON-Schema |
| P2 | Agent options not unified | Each provider has different interface | Create BaseAgentOptions |
| P3 | Mode configs not externalized | Some modes have inline configs | Use `modes/configs/*.config.ts` |

---

### 4. Testing Analysis

**Overall Assessment: Good (Est. 80-85% coverage)**

| Layer | Coverage | Notes |
|-------|----------|-------|
| Agents | ~85% | Good mock patterns |
| Core | ~85-90% | Well-tested |
| Modes | ~90-95% | Excellent coverage |
| MCP Handlers | ~70-75% | **export.ts missing tests** |
| Storage | ~90%+ | Well-tested |

**Critical Missing Tests:**

| Priority | File | Risk |
|----------|------|------|
| P0 | `mcp/handlers/export.ts` | Export/synthesis handlers untested |
| P0 | `core/utils/json-parser.ts` | JSON parsing logic untested |
| P1 | `agents/anthropic/web-search.ts` | Web search extraction |
| P1 | `agents/google/grounding.ts` | Google grounding logic |
| P1 | `agents/perplexity/search.ts` | Perplexity search handling |

---

### 5. Performance Analysis

**Overall Assessment: Good**

| Aspect | Rating | Notes |
|--------|--------|-------|
| Async Patterns | B+ | Some unnecessary sequential operations |
| Caching | B | Missing TTL cache for health checks |
| Parallel Execution | A- | Most operations properly parallelized |
| API Efficiency | A | Good retry with exponential backoff |

**Issues Identified:**

| Priority | Issue | Location | Impact |
|----------|-------|----------|--------|
| P1 | No tool call iteration limits | `claude.ts:93`, `gemini.ts:172` | Potential infinite loop |
| P2 | Sequential response saving | `round-executor.ts:77-80` | Slower persistence |
| P2 | Sequential executeSimpleRound | `debate-engine.ts:224-241` | Slower fallback |
| P2 | Health check on every call | `key-points-extractor.ts:156-182` | Extra API calls |

**Code Example - Unbounded Loop:**
```typescript
// src/agents/anthropic/claude.ts:93
while (response.stop_reason === 'tool_use') {  // No iteration limit!
  // ... tool handling
}
```

---

### 6. Security Analysis

**Overall Assessment: Good**

| Aspect | Rating | Notes |
|--------|--------|-------|
| API Key Handling | A | Environment variables, no hardcoding |
| Input Validation | A | Comprehensive Zod schemas |
| SQL Injection | A+ | Parameterized queries throughout |
| Error Exposure | B | Stack traces exposed in toJSON() |

**Issues Identified:**

| Priority | Issue | Location | Impact |
|----------|-------|----------|--------|
| P1 | Stack trace in error toJSON() | `errors/index.ts:42` | Internal path exposure |
| P2 | No max length on topic | `types/schemas.ts` | Memory exhaustion risk |
| P3 | Debug logging sensitive data | `json-parser.ts:329-335` | AI response exposure |

---

## Refactoring Plan

### Phase 1: Quick Wins (Low Risk)

Independent improvements that can be parallelized.

| ID | Task | Files | Complexity | Risk |
|----|------|-------|------------|------|
| 1.1 | Extract magic numbers to constants | `config/agent-defaults.ts` (new), `agents/base.ts` | S | Low |
| 1.2 | Add tool call iteration limits | `agents/anthropic/claude.ts`, `agents/google/gemini.ts` | M | Low |
| 1.3 | Remove stack trace from error toJSON | `errors/index.ts` | S | Low |
| 1.4 | Parallelize response saving | `mcp/handlers/utils/round-executor.ts` | S | Low |
| 1.5 | Parallelize executeSimpleRound | `core/debate-engine.ts` | S | Low |

**Implementation Details:**

#### 1.1 Extract Magic Numbers
```typescript
// NEW: src/config/agent-defaults.ts
export const AGENT_DEFAULTS = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 4096,
  MAX_TOOL_ITERATIONS: 10,
} as const;

// UPDATE: src/agents/base.ts:104-105
import { AGENT_DEFAULTS } from '../config/agent-defaults.js';
this.temperature = config.temperature ?? AGENT_DEFAULTS.TEMPERATURE;
this.maxTokens = config.maxTokens ?? AGENT_DEFAULTS.MAX_TOKENS;
```

#### 1.2 Add Tool Iteration Limits
```typescript
// UPDATE: src/agents/anthropic/claude.ts (around line 92)
let iterationCount = 0;
while (response.stop_reason === 'tool_use' && iterationCount < AGENT_DEFAULTS.MAX_TOOL_ITERATIONS) {
  iterationCount++;
  // ... existing logic
}
if (iterationCount >= AGENT_DEFAULTS.MAX_TOOL_ITERATIONS) {
  logger.warn({ agentId: this.id }, 'Tool call loop limit reached');
}
```

#### 1.3 Remove Stack Trace
```typescript
// UPDATE: src/errors/index.ts:35-45
toJSON(): Record<string, unknown> {
  return {
    name: this.name,
    message: this.message,
    code: this.code,
    provider: this.provider,
    retryable: this.retryable,
    // stack: this.stack,  // REMOVED for security
    cause: this.cause?.message,
  };
}
```

#### 1.4 Parallelize Response Saving
```typescript
// UPDATE: src/mcp/handlers/utils/round-executor.ts:77-81
for (const result of roundResults) {
  await Promise.all(
    result.responses.map(response =>
      sessionManager.addResponse(session.id, response, result.roundNumber)
    )
  );
}
```

#### 1.5 Parallelize executeSimpleRound
```typescript
// UPDATE: src/core/debate-engine.ts:224-240
private async executeSimpleRound(
  agents: BaseAgent[],
  context: DebateContext
): Promise<AgentResponse[]> {
  const results = await Promise.allSettled(
    agents.map(agent => agent.generateResponse(context))
  );
  return results
    .filter((r): r is PromiseFulfilledResult<AgentResponse> => r.status === 'fulfilled')
    .map(r => r.value);
}
```

---

### Phase 2: Testing Coverage

Add missing tests before major refactoring.

| ID | Task | Files | Complexity |
|----|------|-------|------------|
| 2.1 | Add export handler tests | `tests/unit/mcp/handlers/export.test.ts` (new) | M |
| 2.2 | Add json-parser tests | `tests/unit/core/utils/json-parser.test.ts` (new) | M |
| 2.3 | Add web search utility tests | `tests/unit/agents/*/` (3 new files) | M |

**Test Coverage Needed:**

- `handleExportSession`: JSON format, Markdown format, missing session, empty responses
- `handleSynthesizeDebate`: Valid synthesis, no responses, synthesizer not found
- `parseAIConsensusResponse`: Valid JSON, malformed JSON, truncated JSON
- Web search utilities: Citation extraction, error handling

---

### Phase 3: Code Quality

Reduce duplication and improve maintainability.

| ID | Task | Files | Complexity | Risk |
|----|------|-------|------------|------|
| 3.1 | Unify generateRawCompletion pattern | `agents/base.ts` + 4 agent files | M | Medium |
| 3.2 | Unify agent options interface | `agents/types/base-options.ts` (new) | L | Medium |
| 3.3 | Implement Zod-to-JSON-Schema | `tools/toolkit.ts` | L | Medium |

**Implementation Details:**

#### 3.1 Unify generateRawCompletion
```typescript
// UPDATE: src/agents/base.ts
protected static readonly DEFAULT_RAW_SYSTEM_PROMPT =
  'You are a helpful AI assistant. Respond exactly as instructed.';

protected getEffectiveSystemPrompt(systemPrompt?: string): string {
  return systemPrompt ?? BaseAgent.DEFAULT_RAW_SYSTEM_PROMPT;
}
```

#### 3.2 Unified Agent Options
```typescript
// NEW: src/agents/types/base-options.ts
export interface BaseAgentOptions<TClient = unknown> {
  apiKey?: string;
  client?: TClient;
}

export interface WebSearchCapableOptions {
  webSearch?: { enabled?: boolean };
}
```

#### 3.3 Zod-to-JSON-Schema
```typescript
// UPDATE: src/tools/toolkit.ts
import { z } from 'zod';

private zodToToolParameters(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  return (jsonSchema as { properties?: Record<string, unknown> }).properties ?? {};
}
```

---

### Phase 4: Architecture

Fix layer dependency violations.

| ID | Task | Files | Complexity | Risk |
|----|------|-------|------------|------|
| 4.1 | Extract exit criteria types | `types/exit-criteria.ts` (new) | S | Medium |
| 4.2 | Break Core→Agents dependency | `core/ai-consensus-analyzer.ts` | M | Medium |
| 4.3 | Break Core→Modes dependency | `core/debate-engine.ts` | M | Medium |
| 4.4 | Replace global singletons with DI | `context/app-context.ts` (new) | L | High |

**Dependency Injection Pattern:**
```typescript
// UPDATE: src/core/debate-engine.ts
export interface DebateEngineOptions {
  toolkit?: AgentToolkit;
  aiConsensusAnalyzer?: AIConsensusAnalyzer;
  exitCriteriaConfig?: ExitCriteriaConfig;
  getModeRegistry?: () => ModeRegistry;  // NEW: Inject dependency
}
```

---

### Phase 5: Performance

Optimize runtime performance.

| ID | Task | Files | Complexity | Risk |
|----|------|-------|------------|------|
| 5.1 | Add TTL cache for health checks | `agents/utils/health-cache.ts` (new) | M | Low |
| 5.2 | Add topic length validation | `types/schemas.ts` | S | Low |

---

## Execution Strategy

### Sub-Agent Parallelization

| Phase | Agents | Distribution |
|-------|--------|--------------|
| 1 | 3 | A: 1.1+1.3, B: 1.2, C: 1.4+1.5 |
| 2 | 3 | A: 2.1, B: 2.2, C: 2.3 |
| 3 | 2 | A: 3.1+3.2, B: 3.3 |
| 4 | 2 | A: 4.1+4.2, B: 4.3+4.4 |
| 5 | 2 | A: 5.1, B: 5.2 |

### Verification Steps

After each phase:
```bash
pnpm typecheck  # Type errors
pnpm lint       # Linting
pnpm test       # All tests
pnpm build      # Build success
```

---

## Priority Summary

### P0 (Critical)
- 2.1, 2.2: Missing test coverage for critical paths

### P1 (High)
- 1.2: Tool iteration limits (prevent infinite loops)
- 1.3: Stack trace security fix
- 3.3: Tool schema deduplication

### P2 (Medium)
- 1.1, 1.4, 1.5: Quick wins
- 3.1, 3.2: Code quality improvements
- 4.1-4.3: Architecture fixes

### P3 (Low)
- 4.4: Full DI refactoring
- 5.1, 5.2: Performance optimizations

---

## Critical Files Reference

```
src/
├── agents/
│   ├── base.ts                    # Lines 104-105: Magic numbers
│   ├── anthropic/claude.ts        # Line 93: Unbounded while loop
│   ├── google/gemini.ts           # Line 172: Unbounded while loop
│   └── types/base-options.ts      # NEW
├── config/
│   └── agent-defaults.ts          # NEW
├── context/
│   └── app-context.ts             # NEW (Phase 4.4)
├── core/
│   ├── debate-engine.ts           # Lines 9, 78, 224-241
│   ├── ai-consensus-analyzer.ts   # Line 14
│   └── utils/json-parser.ts       # NEEDS TESTS
├── errors/
│   └── index.ts                   # Line 42: Stack trace
├── mcp/handlers/
│   ├── export.ts                  # NEEDS TESTS
│   └── utils/round-executor.ts    # Lines 77-80
├── tools/
│   └── toolkit.ts                 # Schema duplication
└── types/
    ├── exit-criteria.ts           # NEW (Phase 4.1)
    └── schemas.ts                 # Topic length validation
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing tests | Run full test suite after each change |
| API compatibility | Maintain public interfaces, deprecate gradually |
| Circular dependencies | Use interface-based injection |
| Performance regression | Benchmark before/after critical changes |

---

## Appendix: Analysis Agent Reports

This plan was created based on comprehensive analysis by 6 specialized agents:

1. **Architecture Analysis Agent** - Layer separation, dependency flow, abstractions
2. **Code Quality Agent** - Duplication, error handling, type safety
3. **Reusability Analysis Agent** - Extensibility patterns, configuration
4. **Testing Analysis Agent** - Coverage gaps, test quality, patterns
5. **Performance Analysis Agent** - Async patterns, caching, parallelization
6. **Security Analysis Agent** - API keys, validation, SQL injection, error exposure
