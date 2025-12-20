# Code Style Rules

## When to Apply

Apply these rules for all code changes in this project.

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `debate-engine.ts`, `red-team-blue-team.ts` |
| Classes | PascalCase | `DebateEngine`, `ClaudeAgent` |
| Interfaces | PascalCase | `AgentConfig`, `DebateContext` |
| Type aliases | PascalCase | `AIProvider`, `DebateMode` |
| Functions | camelCase | `createAgent`, `executeRound` |
| Methods | camelCase | `generateResponse`, `buildPrompt` |
| Variables | camelCase | `sessionId`, `currentRound` |
| Constants | UPPER_SNAKE_CASE | `DEFAULT_ROUNDS`, `MAX_TOKENS` |
| Private fields | camelCase with underscore prefix or no prefix | `_client` or `client` |

## Import Order

```typescript
// 1. Node.js built-ins (if any)
import { EventEmitter } from 'events';

// 2. External packages
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

// 3. Internal absolute imports (by layer)
import { BaseAgent } from './base.js';
import type { AgentConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

// 4. Type-only imports last
import type { DebateContext, AgentResponse } from '../types/index.js';
```

## File Structure

```typescript
// 1. License/copyright (if applicable)

// 2. JSDoc comment describing the file
/**
 * Claude Agent - Anthropic Claude implementation
 */

// 3. Imports

// 4. Constants
const DEFAULT_TEMPERATURE = 0.7;

// 5. Types/Interfaces (specific to this file)
export interface ClaudeAgentOptions {
  apiKey?: string;
  client?: Anthropic;
}

// 6. Main class/function
export class ClaudeAgent extends BaseAgent {
  // ...
}

// 7. Factory functions
export function createClaudeAgent(
  config: AgentConfig,
  options?: ClaudeAgentOptions
): ClaudeAgent {
  return new ClaudeAgent(config, options);
}
```

## TypeScript Rules

### Prefer Explicit Types

```typescript
// Good
function calculateAgreement(responses: AgentResponse[]): number {
  // ...
}

// Avoid (implicit return type)
function calculateAgreement(responses: AgentResponse[]) {
  // ...
}
```

### Use Readonly Where Possible

```typescript
// Good
export class MyMode extends BaseModeStrategy {
  readonly name = 'my-mode';
}

// Avoid
export class MyMode extends BaseModeStrategy {
  name = 'my-mode';
}
```

### Avoid `any`

```typescript
// Good
const result = response as unknown as { data: string };

// Avoid
const result = response as any;
```

### Use Type Guards

```typescript
// Good
function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

// Avoid
if ((error as any).code === 'rate_limit') { ... }
```

## Error Handling

### Use Custom Error Types

```typescript
// Good
throw new APIRateLimitError('Rate limit exceeded', {
  provider: 'anthropic',
  retryable: true,
  cause: error,
});

// Avoid
throw new Error('Rate limit exceeded');
```

### Always Catch and Log

```typescript
// Good
try {
  const response = await this.client.chat(...);
} catch (error) {
  logger.error({ err: error, sessionId }, 'Failed to generate response');
  throw new AgentError('Generation failed', { cause: error });
}

// Avoid
const response = await this.client.chat(...); // Unhandled
```

## Logging

### Use Structured Logging

```typescript
// Good
logger.info(
  { sessionId: context.sessionId, agentId: this.id, duration },
  'Response generated'
);

// Avoid
logger.info(`Response generated for session ${context.sessionId}`);
```

### Log Levels

- `error` - Errors that need attention
- `warn` - Potential issues
- `info` - Important events (start/end of operations)
- `debug` - Detailed debugging info

## Formatting (Enforced by Prettier)

- Semicolons: Yes
- Quotes: Single
- Trailing commas: ES5
- Print width: 100
- Tab width: 2
- Tabs: No (spaces)

## Commands

```bash
# Check formatting
pnpm format:check

# Fix formatting
pnpm format

# Check linting
pnpm lint

# Fix linting
pnpm lint:fix

# Type check
pnpm typecheck
```

## Pre-commit Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm test` passes
