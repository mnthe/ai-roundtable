# Agent Directory Restructure Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure `src/agents/` to organize agent implementations by AI provider, improving code organization and maintainability.

**Current Structure:**
```
src/agents/
├── base.ts          # BaseAgent abstract class (shared)
├── chatgpt.ts       # ChatGPTAgent
├── claude.ts        # ClaudeAgent
├── gemini.ts        # GeminiAgent
├── perplexity.ts    # PerplexityAgent
├── index.ts         # Main exports
├── registry.ts      # Agent registry (shared)
├── setup.ts         # Provider setup (shared)
└── utils/           # Shared utilities
    ├── error-converter.ts
    ├── index.ts
    ├── light-model-factory.ts
    ├── openai-responses.ts  # Only used by ChatGPT
    └── tool-converters.ts
```

**Target Structure:**
```
src/agents/
├── anthropic/
│   ├── claude.ts
│   └── index.ts
├── openai/
│   ├── chatgpt.ts
│   ├── responses.ts  # Moved from utils/openai-responses.ts
│   └── index.ts
├── google/
│   ├── gemini.ts
│   └── index.ts
├── perplexity/
│   ├── perplexity.ts
│   └── index.ts
├── base.ts          # Shared (stays at root)
├── index.ts         # Updated exports
├── registry.ts      # Shared (stays at root)
├── setup.ts         # Updated imports
└── utils/           # Shared utilities (provider-agnostic)
    ├── error-converter.ts
    ├── index.ts
    ├── light-model-factory.ts
    └── tool-converters.ts
```

**Tech Stack:** TypeScript, ESM modules

---

## Task 1: Create Anthropic Directory and Move Claude

**Files:**
- Create: `src/agents/anthropic/claude.ts`
- Create: `src/agents/anthropic/index.ts`
- Delete: `src/agents/claude.ts`

### Step 1.1: Create anthropic directory

```bash
mkdir -p src/agents/anthropic
```

### Step 1.2: Move claude.ts to anthropic directory

```bash
mv src/agents/claude.ts src/agents/anthropic/claude.ts
```

### Step 1.3: Update imports in anthropic/claude.ts

Change relative imports:
```typescript
// Before
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import { convertSDKError } from './utils/index.js';

// After
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from '../base.js';
import { withRetry } from '../../utils/retry.js';
import { convertSDKError } from '../utils/index.js';
```

### Step 1.4: Create anthropic/index.ts

```typescript
/**
 * Anthropic (Claude) Agent exports
 */
export { ClaudeAgent, createClaudeAgent, type ClaudeAgentOptions, type WebSearchConfig } from './claude.js';
```

### Step 1.5: Run typecheck to verify

```bash
pnpm typecheck
```

---

## Task 2: Create OpenAI Directory and Move ChatGPT

**Files:**
- Create: `src/agents/openai/chatgpt.ts`
- Create: `src/agents/openai/responses.ts` (moved from utils/)
- Create: `src/agents/openai/index.ts`
- Delete: `src/agents/chatgpt.ts`
- Delete: `src/agents/utils/openai-responses.ts`

### Step 2.1: Create openai directory

```bash
mkdir -p src/agents/openai
```

### Step 2.2: Move chatgpt.ts to openai directory

```bash
mv src/agents/chatgpt.ts src/agents/openai/chatgpt.ts
```

### Step 2.3: Move openai-responses.ts to openai directory

```bash
mv src/agents/utils/openai-responses.ts src/agents/openai/responses.ts
```

### Step 2.4: Update imports in openai/chatgpt.ts

```typescript
// Before
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import {
  executeResponsesCompletion,
  // ...
} from './utils/openai-responses.js';

// After
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from '../base.js';
import { withRetry } from '../../utils/retry.js';
import {
  executeResponsesCompletion,
  // ...
} from './responses.js';
```

### Step 2.5: Update imports in openai/responses.ts

```typescript
// Before
import { withRetry } from '../../utils/retry.js';
import { createLogger } from '../../utils/logger.js';
import type { AgentToolkit } from '../base.js';

// After
import { withRetry } from '../../utils/retry.js';
import { createLogger } from '../../utils/logger.js';
import type { AgentToolkit } from '../base.js';
// (paths stay the same since it moved one level up from utils/)
```

### Step 2.6: Create openai/index.ts

```typescript
/**
 * OpenAI (ChatGPT) Agent exports
 */
export { ChatGPTAgent, createChatGPTAgent, type ChatGPTAgentOptions } from './chatgpt.js';
export {
  executeResponsesCompletion,
  executeSimpleResponsesCompletion,
  buildResponsesTools,
  extractCitationsFromResponseOutput,
  extractTextFromResponse,
  recordWebSearchToolCall,
  type ResponsesCompletionParams,
  type ResponsesCompletionResult,
  type ResponsesWebSearchConfig,
  type SimpleResponsesCompletionParams,
} from './responses.js';
```

### Step 2.7: Update utils/index.ts to remove openai-responses exports

Remove the openai-responses exports from utils/index.ts since they're now in openai/index.ts.

### Step 2.8: Run typecheck to verify

```bash
pnpm typecheck
```

---

## Task 3: Create Google Directory and Move Gemini

**Files:**
- Create: `src/agents/google/gemini.ts`
- Create: `src/agents/google/index.ts`
- Delete: `src/agents/gemini.ts`

### Step 3.1: Create google directory

```bash
mkdir -p src/agents/google
```

### Step 3.2: Move gemini.ts to google directory

```bash
mv src/agents/gemini.ts src/agents/google/gemini.ts
```

### Step 3.3: Update imports in google/gemini.ts

```typescript
// Before
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import { convertSDKError } from './utils/index.js';
import { LIGHT_MODELS } from './setup.js';

// After
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from '../base.js';
import { withRetry } from '../../utils/retry.js';
import { convertSDKError } from '../utils/index.js';
import { LIGHT_MODELS } from '../setup.js';
```

### Step 3.4: Create google/index.ts

```typescript
/**
 * Google (Gemini) Agent exports
 */
export { GeminiAgent, createGeminiAgent, type GeminiAgentOptions, type GoogleSearchConfig } from './gemini.js';
```

### Step 3.5: Run typecheck to verify

```bash
pnpm typecheck
```

---

## Task 4: Create Perplexity Directory and Move Perplexity

**Files:**
- Create: `src/agents/perplexity/perplexity.ts`
- Create: `src/agents/perplexity/index.ts`
- Delete: `src/agents/perplexity.ts`

### Step 4.1: Create perplexity directory

```bash
mkdir -p src/agents/perplexity
```

### Step 4.2: Move perplexity.ts to perplexity directory

```bash
mv src/agents/perplexity.ts src/agents/perplexity/perplexity.ts
```

### Step 4.3: Update imports in perplexity/perplexity.ts

```typescript
// Before
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from './base.js';
import { withRetry } from '../utils/retry.js';
import { convertSDKError } from './utils/index.js';

// After
import { BaseAgent, type AgentToolkit, type ProviderApiResult } from '../base.js';
import { withRetry } from '../../utils/retry.js';
import { convertSDKError } from '../utils/index.js';
```

### Step 4.4: Create perplexity/index.ts

```typescript
/**
 * Perplexity Agent exports
 */
export {
  PerplexityAgent,
  createPerplexityAgent,
  type PerplexityAgentOptions,
  type PerplexitySearchOptions,
  type SearchRecencyFilter,
} from './perplexity.js';
```

### Step 4.5: Run typecheck to verify

```bash
pnpm typecheck
```

---

## Task 5: Update Main Index and Setup Files

**Files:**
- Modify: `src/agents/index.ts`
- Modify: `src/agents/setup.ts`

### Step 5.1: Update src/agents/index.ts

```typescript
/**
 * AI Agents - Multi-provider AI agent implementations
 */

// Base agent and types
export {
  BaseAgent,
  MockAgent,
  type AgentToolkit,
  type ProviderApiResult,
} from './base.js';

// Provider-specific agents
export * from './anthropic/index.js';
export * from './openai/index.js';
export * from './google/index.js';
export * from './perplexity/index.js';

// Registry and setup
export { AgentRegistry } from './registry.js';
export {
  setupProviders,
  detectApiKeys,
  LIGHT_MODELS,
  type ApiKeyConfig,
  type SetupResult,
} from './setup.js';

// Shared utilities
export * from './utils/index.js';
```

### Step 5.2: Update src/agents/setup.ts imports

```typescript
// Before
import { ClaudeAgent } from './claude.js';
import { ChatGPTAgent } from './chatgpt.js';
import { GeminiAgent } from './gemini.js';
import { PerplexityAgent } from './perplexity.js';

// After
import { ClaudeAgent } from './anthropic/claude.js';
import { ChatGPTAgent } from './openai/chatgpt.js';
import { GeminiAgent } from './google/gemini.js';
import { PerplexityAgent } from './perplexity/perplexity.js';
```

### Step 5.3: Run typecheck to verify

```bash
pnpm typecheck
```

---

## Task 6: Update Test Imports

**Files:**
- Modify: `tests/unit/agents/claude.test.ts`
- Modify: `tests/unit/agents/chatgpt.test.ts`
- Modify: `tests/unit/agents/gemini.test.ts`
- Modify: `tests/unit/agents/perplexity.test.ts`
- Modify: `tests/unit/agents/utils/openai-responses.test.ts`

### Step 6.1: Update test imports

For each test file, update the import path:

```typescript
// Before
import { ClaudeAgent } from '../../../src/agents/claude.js';

// After
import { ClaudeAgent } from '../../../src/agents/anthropic/claude.js';
```

Or use the index exports:
```typescript
import { ClaudeAgent } from '../../../src/agents/index.js';
```

### Step 6.2: Move/update openai-responses test

```bash
mkdir -p tests/unit/agents/openai
mv tests/unit/agents/utils/openai-responses.test.ts tests/unit/agents/openai/responses.test.ts
```

Update imports in the test file.

### Step 6.3: Run all tests

```bash
pnpm test
```

---

## Task 7: Update Documentation and Rules

**Files:**
- Modify: `.claude/CLAUDE.md` (Architecture section)
- Modify: `.claude/rules/adding-agents.md` (directory structure)

### Step 7.1: Update CLAUDE.md architecture diagram

Update the directory structure in the documentation to reflect the new organization.

### Step 7.2: Update adding-agents.md

Add guidance for creating new agents in the provider-specific directory structure.

---

## Task 8: Final Verification

### Step 8.1: Run full test suite

```bash
pnpm test
```

### Step 8.2: Run type check

```bash
pnpm typecheck
```

### Step 8.3: Run lint

```bash
pnpm lint
```

### Step 8.4: Commit all changes

```bash
git add -A
git commit -m "refactor(agents): restructure by provider directory

- Move ClaudeAgent to src/agents/anthropic/
- Move ChatGPTAgent to src/agents/openai/
- Move GeminiAgent to src/agents/google/
- Move PerplexityAgent to src/agents/perplexity/
- Move openai-responses.ts to openai/ (only used by ChatGPT)
- Update all imports and exports
- Maintain backward compatibility via index.ts re-exports"
```

---

## Summary

### Files Created
- `src/agents/anthropic/claude.ts`
- `src/agents/anthropic/index.ts`
- `src/agents/openai/chatgpt.ts`
- `src/agents/openai/responses.ts`
- `src/agents/openai/index.ts`
- `src/agents/google/gemini.ts`
- `src/agents/google/index.ts`
- `src/agents/perplexity/perplexity.ts`
- `src/agents/perplexity/index.ts`
- `tests/unit/agents/openai/responses.test.ts`

### Files Deleted
- `src/agents/claude.ts`
- `src/agents/chatgpt.ts`
- `src/agents/gemini.ts`
- `src/agents/perplexity.ts`
- `src/agents/utils/openai-responses.ts`
- `tests/unit/agents/utils/openai-responses.test.ts`

### Files Modified
- `src/agents/index.ts`
- `src/agents/setup.ts`
- `src/agents/utils/index.ts`
- `tests/unit/agents/claude.test.ts`
- `tests/unit/agents/chatgpt.test.ts`
- `tests/unit/agents/gemini.test.ts`
- `tests/unit/agents/perplexity.test.ts`
- `.claude/CLAUDE.md`
- `.claude/rules/adding-agents.md`

### Benefits
1. **Organization**: Clear separation by AI provider
2. **Scalability**: Easy to add new providers in dedicated directories
3. **Encapsulation**: Provider-specific utilities live with their agents
4. **Discoverability**: Intuitive file location based on provider name
