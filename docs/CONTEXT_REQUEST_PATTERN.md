# Context Request Pattern

## Overview

The Context Request Pattern enables AI agents during debates to request additional context or information that is not available within the debate session. This creates a clean separation of concerns:

- **Server (AI Roundtable)**: Specifies WHAT information is needed
- **Caller (MCP Client)**: Decides HOW to obtain that information

This pattern allows the MCP client to use any method to gather context - web searches, database queries, file reads, API calls, or asking the user directly.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Client                               │
│  (Claude Desktop, Custom Client, etc.)                          │
├─────────────────────────────────────────────────────────────────┤
│                           │                                     │
│   1. continue_roundtable  │  4. continue_roundtable             │
│      (no contextResults)  │     (with contextResults)           │
│                           ↓                                     │
├─────────────────────────────────────────────────────────────────┤
│                     AI Roundtable MCP Server                    │
├─────────────────────────────────────────────────────────────────┤
│                           │                                     │
│   2. Agent uses           │  5. Agent receives                  │
│      request_context tool │     context via DebateContext       │
│                           ↓                                     │
│   3. Returns with         │  6. Debate continues                │
│      status: 'needs_context'                                    │
│      contextRequests: [...]                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Core Types

### ContextRequest

Represents a request for additional information made by an agent.

```typescript
interface ContextRequest {
  /** Unique identifier for this request */
  id: string;

  /** ID of the agent that made this request */
  agentId: string;

  /** Natural language description of what information is needed */
  query: string;

  /** Why this information is needed (for audit and context) */
  reason: string;

  /** Whether this information is required to continue */
  priority: 'required' | 'optional';

  /** Timestamp when the request was made */
  timestamp: Date;
}
```

### ContextResult

The response provided by the caller for a context request.

```typescript
interface ContextResult {
  /** ID of the original ContextRequest this result corresponds to */
  requestId: string;

  /** Whether the request was successfully fulfilled */
  success: boolean;

  /** The result data (when success is true) */
  result?: string;

  /** Error message (when success is false) */
  error?: string;
}
```

### RoundtableStatus

Extended to include 'needs_context' status:

```typescript
type RoundtableStatus = 'completed' | 'needs_context' | 'in_progress';
```

## Agent Tool: request_context

Agents can use the `request_context` tool during debates to request external information.

### Parameters

| Parameter   | Type                        | Required | Description                                                |
| ----------- | --------------------------- | -------- | ---------------------------------------------------------- |
| query       | string                      | Yes      | Natural language description of what information is needed |
| reason      | string                      | Yes      | Why this information is needed for the debate              |
| priority    | 'required' \| 'optional'    | No       | Priority level (default: 'required')                       |

### Example Usage

```json
{
  "name": "request_context",
  "arguments": {
    "query": "What are the current EU AI Act compliance requirements for general-purpose AI systems?",
    "reason": "Need regulatory context to assess AI governance implications",
    "priority": "required"
  }
}
```

## MCP Tool Integration

### continue_roundtable

The `continue_roundtable` MCP tool now accepts an optional `contextResults` parameter:

```typescript
interface ContinueRoundtableInput {
  sessionId: string;
  focusQuestion?: string;
  /** Results for any pending context requests */
  contextResults?: ContextResult[];
}
```

### Response Format

When context is needed:

```json
{
  "status": "needs_context",
  "message": "Agents have requested additional context before continuing",
  "contextRequests": [
    {
      "requestId": "ctx-1234567890-1",
      "agentId": "claude-1",
      "query": "What are the latest EU AI regulations?",
      "reason": "Need current regulatory context",
      "priority": "required",
      "timestamp": "2024-12-22T10:30:00Z"
    }
  ],
  "currentRound": 2,
  "totalRounds": 5
}
```

## Workflow

### Basic Flow

1. **Start/Continue Debate**: Client calls `start_roundtable` or `continue_roundtable`

2. **Agent Execution**: Agents execute their round, potentially using `request_context`

3. **Context Check**: Server checks for pending context requests

4. **Return Status**:
   - If requests exist: Return `status: 'needs_context'` with `contextRequests`
   - If no requests: Return normal debate results

5. **Provide Context**: Client gathers information and calls `continue_roundtable` with `contextResults`

6. **Inject Context**: Server injects results into `DebateContext.providedContext`

7. **Resume Debate**: Agents continue with access to the provided context

### Code Example (MCP Client)

```typescript
// Step 1: Continue the debate
let result = await mcpClient.callTool('continue_roundtable', {
  sessionId: 'session-123'
});

// Step 2: Check if context is needed
if (result.status === 'needs_context') {
  const contextResults = [];

  // Step 3: Gather context for each request
  for (const request of result.contextRequests) {
    // Use any method to gather information
    const info = await gatherInformation(request.query);

    contextResults.push({
      requestId: request.requestId,
      content: info.content,
      source: info.source
    });
  }

  // Step 4: Continue with context
  result = await mcpClient.callTool('continue_roundtable', {
    sessionId: 'session-123',
    contextResults
  });
}

// Step 5: Process normal debate results
console.log(result.responses);
```

## Implementation Details

### DebateEngine

The `DebateEngine` handles context request collection:

```typescript
async executeRound(agents, context): Promise<RoundResult> {
  // Clear pending requests from previous operations
  this.toolkit.clearPendingRequests();

  // Execute round via mode strategy
  const responses = await strategy.executeRound(agents, context, this.toolkit);

  // Collect any context requests made during the round
  const contextRequests = this.toolkit.getPendingContextRequests();

  return {
    roundNumber: context.currentRound,
    responses,
    consensus,
    contextRequests: contextRequests.length > 0 ? contextRequests : undefined
  };
}
```

### AgentToolkit Interface

Extended with context request management:

```typescript
interface AgentToolkit {
  // ... existing methods ...

  /**
   * Execute a tool by name
   * @param name - Tool name
   * @param input - Tool input
   * @param agentId - Agent ID for request tracking (required for request_context)
   */
  executeTool(name: string, input: unknown, agentId?: string): Promise<unknown>;

  /** Get all pending context requests */
  getPendingContextRequests(): ContextRequest[];

  /** Clear all pending context requests */
  clearPendingRequests(): void;

  /** Check if there are pending requests */
  hasPendingRequests(): boolean;
}
```

## Best Practices

### For Agents

1. **Be Specific**: Provide clear, specific queries that can be answered
2. **Explain Why**: Always include a reason so the caller understands importance
3. **Use Appropriate Priority**:
   - `required`: Cannot provide meaningful response without this
   - `optional`: Would improve response quality but not critical

### For MCP Clients

1. **Handle All Priorities**: Process all requests, not just 'required' ones
2. **Provide Sources**: Include source attribution when available
3. **Timeout Handling**: Set reasonable timeouts for context gathering
4. **Fallback Gracefully**: If context cannot be gathered, provide empty string or explanation

## Limitations

1. **No Guaranteed Usage**: Agents may not always use `request_context` even when beneficial
2. **Single Round Scope**: Context requests are cleared at the start of each round
3. **No Request Editing**: Once submitted, requests cannot be modified
4. **Caller Responsibility**: Quality of context depends entirely on the caller's implementation

## Future Enhancements

- [ ] Mode-specific prompts encouraging `request_context` usage
- [ ] Request caching across rounds
- [ ] Request deduplication
- [ ] Priority-based request filtering
- [ ] Async context gathering while debate continues
