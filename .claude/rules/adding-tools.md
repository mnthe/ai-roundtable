# Adding Tools

## When to Apply

Apply this rule when:
- Adding a new MCP tool (exposed via MCP protocol)
- Adding a new Agent tool (used by agents during debates)
- Modifying existing tool behavior

## MCP Tools vs Agent Tools

| Aspect | MCP Tools | Agent Tools |
|--------|-----------|-------------|
| Purpose | External API for host clients | Internal tools for AI agents |
| Location | `src/mcp/tools.ts`, `src/mcp/handlers/` | `src/tools/toolkit.ts`, `src/tools/schemas.ts` |
| Consumers | Claude Desktop, custom MCP clients | ClaudeAgent, ChatGPTAgent, etc. |
| Validation | Zod schemas in `src/types/schemas.ts` | Zod schemas in `src/tools/schemas.ts` |

## Adding a New MCP Tool

### 1. Define Tool Schema

In `src/mcp/tools.ts`, add JSON Schema definition:

```typescript
export const mcpTools = [
  // ... existing tools ...
  {
    name: 'my_new_tool',
    description: 'Description of what this tool does',
    inputSchema: {
      type: 'object',
      properties: {
        param1: {
          type: 'string',
          description: 'Description of param1',
        },
        param2: {
          type: 'number',
          description: 'Optional parameter',
        },
      },
      required: ['param1'],
    },
  },
];
```

### 2. Create Zod Validation Schema

In `src/types/schemas.ts`:

```typescript
export const MyNewToolInputSchema = z.object({
  param1: z.string().describe('Description of param1'),
  param2: z.number().optional().describe('Optional parameter'),
});

export type MyNewToolInput = z.infer<typeof MyNewToolInputSchema>;
```

### 3. Implement Handler

Choose the appropriate handler module based on functionality:

| Module | Responsibilities |
|--------|-----------------|
| `session.ts` | Session lifecycle (start, continue, control, list) |
| `query.ts` | Data retrieval (consensus, round details, citations, thoughts) |
| `export.ts` | Export and synthesis (export_session, synthesize_debate) |
| `agents.ts` | Agent information (get_agents) |

In the appropriate `src/mcp/handlers/<module>.ts`:

```typescript
import { MyNewToolInputSchema } from '../../types/schemas.js';

export async function handleMyNewTool(
  args: unknown,
  engine: DebateEngine,
  storage: SQLiteStorage
): Promise<CallToolResult> {
  // Validate input
  const input = MyNewToolInputSchema.parse(args);

  // Implementation logic
  const result = await doSomething(input.param1, input.param2);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
```

### 4. Wire Handler in Server

In `src/mcp/server.ts`, add case to the switch statement:

```typescript
case 'my_new_tool':
  return await handleMyNewTool(request.params.arguments, engine, storage);
```

### 5. Add Tests

Create `tests/unit/mcp/my-new-tool.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleMyNewTool } from '../../../src/mcp/handlers/<module>.js';

describe('handleMyNewTool', () => {
  const mockEngine = { /* ... */ };
  const mockStorage = { /* ... */ };

  it('should handle valid input', async () => {
    const result = await handleMyNewTool(
      { param1: 'test' },
      mockEngine as any,
      mockStorage as any
    );

    expect(result.content[0].type).toBe('text');
  });

  it('should reject invalid input', async () => {
    await expect(
      handleMyNewTool({}, mockEngine as any, mockStorage as any)
    ).rejects.toThrow();
  });
});
```

## Adding a New Agent Tool

Agent tools are available to AI agents during debate rounds via `AgentToolkit`.

### 1. Define Zod Schema

In `src/tools/schemas.ts`:

```typescript
export const MyToolInputSchema = z.object({
  query: z.string().describe('The search query'),
  limit: z.number().min(1).max(10).optional().default(5),
});

export type MyToolInput = z.infer<typeof MyToolInputSchema>;
```

### 2. Register Tool in Toolkit

In `src/tools/toolkit.ts`, add to `DefaultAgentToolkit.constructor()`:

```typescript
this.registerTool({
  name: 'my_tool',
  description: 'Description shown to AI agents when selecting tools',
  parameters: {
    query: {
      type: 'string',
      description: 'The search query',
    },
    limit: {
      type: 'number',
      description: 'Maximum results (1-10, default 5)',
    },
  },
  executor: async (input) => {
    const validated = MyToolInputSchema.parse(input);
    return this.executeMyTool(validated);
  },
});
```

### 3. Implement Executor

In `src/tools/toolkit.ts`, add executor method:

```typescript
private async executeMyTool(input: MyToolInput): Promise<ToolResult> {
  try {
    const results = await this.searchProvider?.search(input.query, {
      limit: input.limit,
    });

    return {
      success: true,
      data: {
        results: results ?? [],
        query: input.query,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

### 4. Extract Citations (If Applicable)

If your tool returns citable sources, use the helper in `BaseAgent`:

```typescript
// In agent's callProviderApi() method
const result = await this.toolkit?.executeTool('my_tool', args);
citations.push(...this.extractCitationsFromToolResult('my_tool', result));
```

### 5. Add Tests

In `tests/unit/tools/toolkit.test.ts`:

```typescript
describe('my_tool', () => {
  it('should execute search and return results', async () => {
    const mockSearchProvider = {
      search: vi.fn().mockResolvedValue([
        { title: 'Result', url: 'https://example.com', snippet: 'Test' },
      ]),
    };

    const toolkit = new DefaultAgentToolkit({ searchProvider: mockSearchProvider });
    toolkit.setContext(defaultContext);

    const result = await toolkit.executeTool('my_tool', { query: 'test' });

    expect(result.success).toBe(true);
    expect(result.data.results).toHaveLength(1);
  });

  it('should handle missing search provider', async () => {
    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(defaultContext);

    const result = await toolkit.executeTool('my_tool', { query: 'test' });

    expect(result.success).toBe(true);
    expect(result.data.results).toHaveLength(0);
  });
});
```

## Existing Tools Reference

### MCP Tools

| Tool | Description | Handler |
|------|-------------|---------|
| `start_roundtable` | Start new debate session | session.ts |
| `continue_roundtable` | Continue existing debate | session.ts |
| `control_session` | Pause/resume/stop session | session.ts |
| `list_sessions` | List debate sessions | session.ts |
| `get_consensus` | Get consensus analysis | query.ts |
| `get_round_details` | Get responses for specific round | query.ts |
| `get_response_detail` | Get agent's detailed response | query.ts |
| `get_citations` | Get citations from debate | query.ts |
| `get_thoughts` | Get agent's reasoning evolution | query.ts |
| `export_session` | Export session (markdown/JSON) | export.ts |
| `synthesize_debate` | AI-powered debate synthesis | export.ts |
| `get_agents` | List available agents | agents.ts |

### Agent Tools (Toolkit)

| Tool | Description |
|------|-------------|
| `get_context` | Get current debate context |
| `submit_response` | Submit structured response with validation |
| `fact_check` | Verify claims with debate history |

### Native Web Search (Provider-Specific)

Each agent uses its provider's native web search capability:

| Agent | Web Search Method |
|-------|-------------------|
| Claude | Anthropic `web_search` tool |
| ChatGPT | OpenAI Responses API with `web_search` tool |
| Gemini | Google Search grounding |
| Perplexity | Built-in search (always on) |

## Checklist

### MCP Tool
- [ ] JSON Schema defined in `src/mcp/tools.ts`
- [ ] Zod schema in `src/types/schemas.ts`
- [ ] Handler in appropriate `src/mcp/handlers/` module
- [ ] Handler wired in `src/mcp/server.ts` switch
- [ ] Unit tests cover valid/invalid input
- [ ] Documentation updated

### Agent Tool
- [ ] Zod schema in `src/tools/schemas.ts`
- [ ] Tool registered in `DefaultAgentToolkit.constructor()`
- [ ] Executor method implemented
- [ ] Citation extraction if applicable
- [ ] Unit tests cover success/error cases
- [ ] Documentation updated
