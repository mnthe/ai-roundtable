# Context Requests Enforcement

## Overview

This document describes the design for enforcing `contextRequests` handling in AI Roundtable, ensuring that required context requests cannot be ignored by callers.

## Problem Statement

### Problem 1: No Enforcement of Context Requests

When agents call `request_context` during a debate round, the requests are returned in the `contextRequests` array with `status: "needs_context"`. However, callers can currently ignore these requests and call `continue_roundtable` without providing `contextResults`.

**Current Behavior:**
```
start_roundtable → { status: "needs_context", contextRequests: [...] }
continue_roundtable(sessionId) → Proceeds anyway (no contextResults)
```

**Expected Behavior:**
```
start_roundtable → { status: "needs_context", contextRequests: [...] }
continue_roundtable(sessionId) → ERROR: Required context requests pending
continue_roundtable(sessionId, contextResults) → Proceeds normally
```

### Problem 2: Race Condition in Agent ID Tracking

In parallel execution mode, `toolkit.setCurrentAgentId()` is called for each agent before execution. Since the toolkit is shared across all agents, the last call overwrites previous values, causing `request_context` calls to be attributed to the wrong agent.

**Current Code (modes/base.ts):**
```typescript
const results = await Promise.allSettled(
  agents.map(async (agent) => {
    toolkit.setCurrentAgentId(agent.id);  // Last call wins
    return agent.generateResponse(context);
  })
);
```

## Design

### Part 1: Context Requests Enforcement

#### 1.1 Add `pendingContextRequests` to Session

**File:** `src/types/index.ts`

```typescript
export interface Session {
  id: string;
  topic: string;
  mode: DebateMode;
  agentIds: string[];
  status: SessionStatus;
  currentRound: number;
  totalRounds: number;
  responses: AgentResponse[];
  consensus?: ConsensusResult;
  pendingContextRequests?: ContextRequest[];  // NEW
  createdAt: Date;
  updatedAt: Date;
}
```

#### 1.2 Add SessionManager Methods

**File:** `src/core/session-manager.ts`

```typescript
/**
 * Set pending context requests for a session
 */
async setPendingContextRequests(
  sessionId: string,
  requests: ContextRequest[]
): Promise<void>;

/**
 * Clear fulfilled context requests
 * @param fulfilledIds - IDs of requests that have been fulfilled
 */
async clearFulfilledContextRequests(
  sessionId: string,
  fulfilledIds: string[]
): Promise<void>;

/**
 * Get pending context requests for a session
 */
async getPendingContextRequests(
  sessionId: string
): Promise<ContextRequest[]>;
```

#### 1.3 Save Pending Requests After Round Execution

**File:** `src/mcp/handlers/utils/round-executor.ts`

After `executeAndSaveRounds` completes, if there are `contextRequests`:
1. Save them to the session via `sessionManager.setPendingContextRequests()`
2. When `contextResults` are provided, clear matching requests

#### 1.4 Validate in `continue_roundtable`

**File:** `src/mcp/handlers/session.ts`

```typescript
export async function handleContinueRoundtable(
  args: unknown,
  // ... other params
): Promise<ToolResponse> {
  const input = ContinueRoundtableInputSchema.parse(args);

  // ... existing validation

  // NEW: Check for pending required context requests
  const pendingRequests = await sessionManager.getPendingContextRequests(
    input.sessionId
  );

  const requiredPending = pendingRequests.filter(
    r => r.priority === 'required'
  );

  if (requiredPending.length > 0) {
    const providedIds = new Set(
      input.contextResults?.map(r => r.requestId) ?? []
    );

    const unfulfilled = requiredPending.filter(
      r => !providedIds.has(r.id)
    );

    if (unfulfilled.length > 0) {
      return createErrorResponse(
        `Cannot continue: ${unfulfilled.length} required context request(s) pending.\n\n` +
        `You MUST provide contextResults for these requests:\n` +
        unfulfilled.map(r =>
          `- [${r.id}] (${r.agentId}): ${r.query}`
        ).join('\n') +
        `\n\nUse WebSearch or other tools to fulfill these requests, ` +
        `then call continue_roundtable with contextResults.`
      );
    }
  }

  // Clear fulfilled requests
  if (input.contextResults?.length) {
    await sessionManager.clearFulfilledContextRequests(
      input.sessionId,
      input.contextResults.map(r => r.requestId)
    );
  }

  // ... rest of the handler
}
```

### Part 2: Race Condition Fix

#### 2.1 Add `agentId` Parameter to `executeTool`

**File:** `src/tools/types.ts`

```typescript
export interface AgentToolkit {
  getTools(): AgentTool[];
  executeTool(name: string, input: unknown, agentId?: string): Promise<unknown>;
  setContext(context: DebateContext): void;

  // Deprecated - will be removed
  setCurrentAgentId(agentId: string): void;

  // ... rest
}
```

**File:** `src/tools/toolkit.ts`

```typescript
async executeTool(
  name: string,
  input: unknown,
  agentId?: string
): Promise<unknown> {
  // Use provided agentId, fallback to currentAgentId for backwards compat
  const effectiveAgentId = agentId ?? this.currentAgentId;

  // ... validation

  // For request_context, use effectiveAgentId
  if (name === 'request_context') {
    return this.executeRequestContext(input, effectiveAgentId);
  }

  // ... rest
}

private async executeRequestContext(
  input: unknown,
  agentId: string  // Now passed explicitly
): Promise<ToolResult<{ requestId: string; message: string }>> {
  const data = input as RequestContextInput;

  const request: ContextRequest = {
    id: this.generateRequestId(),
    agentId: agentId,  // Use passed agentId
    query: data.query,
    reason: data.reason,
    priority: data.priority as ContextRequestPriority,
    timestamp: new Date(),
  };

  this.pendingContextRequests.push(request);

  return {
    success: true,
    data: {
      requestId: request.id,
      message: 'Context request queued.',
    },
  };
}
```

#### 2.2 Pass `agentId` from BaseAgent

**File:** `src/agents/base.ts`

When calling toolkit methods, pass `this.id`:

```typescript
// In tool execution loop
const result = await this.toolkit?.executeTool(
  toolCall.name,
  toolCall.args,
  this.id  // Pass agent ID explicitly
);
```

#### 2.3 Remove `setCurrentAgentId` Calls

**File:** `src/modes/base.ts`

Remove or deprecate `toolkit.setCurrentAgentId(agent.id)` calls in both `executeParallel` and `executeSequential`.

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/index.ts` | Add `pendingContextRequests` to Session |
| `src/core/session-manager.ts` | Add pending requests management methods |
| `src/storage/sqlite.ts` | Update storage for new Session field |
| `src/mcp/handlers/session.ts` | Add validation in `handleContinueRoundtable` |
| `src/mcp/handlers/utils/round-executor.ts` | Save pending requests after round |
| `src/tools/types.ts` | Update `executeTool` signature |
| `src/tools/toolkit.ts` | Add `agentId` parameter, update `executeRequestContext` |
| `src/agents/base.ts` | Pass `agentId` when calling toolkit |
| `src/modes/base.ts` | Remove `setCurrentAgentId` calls |

## Testing Plan

### Unit Tests

1. **session.ts**
   - `continue_roundtable` returns error when required requests pending
   - `continue_roundtable` succeeds when all required requests fulfilled
   - Optional requests don't block continuation

2. **toolkit.ts**
   - `executeTool` uses provided `agentId`
   - Falls back to `currentAgentId` when not provided (backwards compat)

3. **session-manager.ts**
   - `setPendingContextRequests` stores requests correctly
   - `clearFulfilledContextRequests` removes only specified requests
   - `getPendingContextRequests` returns correct requests

### Integration Tests

1. **Parallel execution**
   - Multiple agents call `request_context` in parallel
   - Each request has correct `agentId`

2. **Full flow**
   - Start roundtable → get `needs_context`
   - Try continue without results → get error
   - Provide results → continue successfully

## Migration

This is a non-breaking change:
- New `pendingContextRequests` field is optional
- `executeTool` `agentId` parameter is optional with fallback
- Existing sessions without pending requests continue to work
