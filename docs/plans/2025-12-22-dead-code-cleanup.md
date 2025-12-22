# Dead Code Cleanup Plan

> **For Claude:** Execute this plan task-by-task, fixing issues and verifying after each step.

**Goal:** Clean up dead code identified by knip while preserving intentional public API exports

**Analysis Date:** 2025-12-22

---

## Overview

Knip analysis found:
- 14 unused files
- 4 unresolved imports
- 41 unused exports
- 44 unused exported types

## Decision Matrix

### Files to KEEP (Barrel Exports)

These index.ts files are barrel exports - a standard pattern for public API surfaces. They may not be internally used but are important for external consumers.

| File | Reason to Keep |
|------|----------------|
| `src/agents/index.ts` | Public API for agents |
| `src/agents/anthropic/index.ts` | Provider-specific exports |
| `src/agents/google/index.ts` | Provider-specific exports |
| `src/agents/openai/index.ts` | Provider-specific exports |
| `src/core/index.ts` | Core module public API |
| `src/core/utils/index.ts` | Core utilities public API |
| `src/modes/index.ts` | Modes public API |
| `src/mcp/index.ts` | MCP server public API |
| `src/utils/index.ts` | Utilities public API |
| `src/benchmark/index.ts` | Benchmark public API |

### Files to REMOVE (Dead Scripts)

| File | Reason to Remove |
|------|------------------|
| `scripts/benchmark/index.ts` | Unused benchmark script |
| `scripts/multi-topic-benchmark.ts` | Unused benchmark script |
| `scripts/test-context-request.ts` | One-off test script |
| `scripts/test-schema-output.ts` | One-off test script |

---

## Task Breakdown

### Task 1: Fix Integration Test Imports (BLOCKING)

**Problem:** Integration tests have broken import paths after the agents refactoring.

**Files:**
- `tests/integration/real-agents.test.ts`

**Changes:**
```typescript
// Before (broken)
import { ClaudeAgent } from '../../src/agents/claude.js';
import { ChatGPTAgent } from '../../src/agents/chatgpt.js';
import { GeminiAgent } from '../../src/agents/gemini.js';
import { ConsensusAnalyzer } from '../../src/core/consensus-analyzer.js';

// After (fixed)
import { ClaudeAgent } from '../../src/agents/anthropic/claude.js';
import { ChatGPTAgent } from '../../src/agents/openai/chatgpt.js';
import { GeminiAgent } from '../../src/agents/google/gemini.js';
import { AIConsensusAnalyzer as ConsensusAnalyzer } from '../../src/core/ai-consensus-analyzer.js';
```

**Verification:** `pnpm typecheck`

---

### Task 2: Remove Dead Scripts

**Files to delete:**
- `scripts/benchmark/index.ts`
- `scripts/multi-topic-benchmark.ts`
- `scripts/test-context-request.ts`
- `scripts/test-schema-output.ts`
- `scripts/benchmark/types.ts` (only used by index.ts)

**Verification:** `npx knip --include files | grep -c "Unused files"` should decrease

---

### Task 3: Clean Unused Exports from Core Utils

**Problem:** `src/core/utils/json-parser.ts` has many exported functions not used elsewhere.

**Exports to remove (make private or remove):**
- `extractNumber` - internal helper
- `extractStringArray` - internal helper
- `extractClusters` - internal helper
- `extractNuances` - internal helper
- `extractGroupthinkWarning` - internal helper
- `parseJsonToResult` - internal helper

**Strategy:** Remove `export` keyword from these internal helpers.

**File:** `src/core/utils/json-parser.ts`

**Verification:** `pnpm typecheck && pnpm test`

---

### Task 4: Clean Unused Exports from Light Agent Selector

**File:** `src/core/utils/light-agent-selector.ts`

**Export to make private:**
- `selectAndCreateLightAgent` - internal helper

---

### Task 5: Clean Unused Exports from Modes Utils

**File:** `src/modes/utils/prompt-builder.ts`

**Exports to make private:**
- `buildStructuralEnforcement` - used internally
- `formatPreviousResponses` - used internally
- `buildRoundContext` - used internally

**Also update index re-exports:**
- `src/modes/utils/index.ts` - remove re-exports of now-private functions

---

### Task 6: Clean Unused Exports from Tools

**Files:**
- `src/tools/schemas.ts`
- `src/tools/index.ts`

**Exports to review:**
- `FactCheckInputSchema` - keep if part of public API
- `RequestContextInputSchema` - keep if part of public API
- `TOOL_INPUT_SCHEMAS` - consider making private
- `validateToolInput` - consider making private

**Decision:** Keep Zod schemas public (useful for consumers), make validation helpers private.

---

### Task 7: Clean Unused Exports from Types

**File:** `src/types/schemas.ts`

**Exports to review:**
- `ParallelizationLevelSchema` - remove if unused
- `ContextResultSchema` - remove if unused

---

### Task 8: Clean Duplicate Type Exports

Many types are exported from both their source file AND index.ts. Keep only index.ts exports.

**Pattern:**
```typescript
// src/tools/toolkit.ts - REMOVE type exports
export type { AgentTool, AgentToolkit, ToolDefinition, ToolExecutor } from './types.js';

// src/tools/index.ts - KEEP as single source
export type { AgentTool, AgentToolkit, ToolExecutor, ToolDefinition } from './types.js';
```

**Files to clean:**
- `src/tools/toolkit.ts` - remove re-export types
- `src/agents/base.ts` - check AgentTool export
- `src/storage/sqlite.ts` - check storage type exports

---

### Task 9: Keep Test Mocks (No Action)

**Reasoning:** Test utility functions in `tests/utils/mocks.ts` may appear unused but:
1. They are designed for test use, not production code
2. May be used in future tests
3. Removing them could break test patterns

**Decision:** SKIP - keep all test mocks

---

### Task 10: Configure Knip to Ignore Intentional Patterns

**Add knip configuration to package.json or knip.json:**

```json
{
  "ignore": [
    "scripts/**",
    "src/**/index.ts"
  ],
  "ignoreDependencies": [],
  "ignoreExportsUsedInFile": true
}
```

---

## Execution Order

1. **Task 1** - Fix integration imports (blocking)
2. **Task 2** - Remove dead scripts
3. **Tasks 3-7** - Clean unused exports (parallel)
4. **Task 8** - Clean duplicate types
5. **Task 10** - Configure knip

## Expected Results

After cleanup:
- 0 unresolved imports
- ~4 unused files (kept barrel exports)
- ~10 unused exports (intentional public API)
- ~15 unused types (intentional public API types)

## Verification Commands

```bash
# After each task
pnpm typecheck
pnpm test

# Final verification
npx knip
pnpm build
```
