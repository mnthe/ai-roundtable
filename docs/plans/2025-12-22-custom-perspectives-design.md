# Custom Perspectives for Expert Panel Mode

> **Status**: Approved
> **Date**: 2025-12-22
> **Priority**: P1

## Overview

Extend Expert Panel mode to support user-defined custom perspectives instead of the fixed 4 perspectives (technical, economic, ethical, social). This allows more flexible multi-angle analysis while maintaining the Roundtable philosophy of structured debate.

## Motivation

The current Expert Panel mode assigns fixed perspectives to agents:
- Technical, Economic, Ethical, Social

Users may want to analyze topics from different angles specific to their domain:
- Security, Performance, Cost, User Experience
- Legal, Political, Environmental
- Any custom set of analysis dimensions

## API Design

### Input Schema

```typescript
// src/types/schemas.ts
export const StartRoundtableInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required'),
  mode: DebateModeSchema.optional().default('collaborative'),
  agents: z.array(z.string().min(1)).optional(),
  rounds: z.number().int().positive().optional().default(3),
  parallel: ParallelizationLevelSchema.optional(),
  exitOnConsensus: z.boolean().optional(),

  // NEW
  perspectives: z.array(z.string().min(1))
    .optional()
    .describe('Custom analysis perspectives for expert-panel mode'),
});
```

### Usage Examples

```typescript
// Default (fixed 4 perspectives)
start_roundtable({
  topic: "AI regulation policy",
  mode: "expert-panel"
})

// Custom perspectives
start_roundtable({
  topic: "AI regulation policy",
  mode: "expert-panel",
  perspectives: [
    "Technical feasibility",
    "Global regulatory trends",
    "Industry impact",
    "Consumer protection",
    "National security"
  ]
})
```

### Behavior Rules

| Condition | Behavior |
|-----------|----------|
| `mode !== 'expert-panel'` | `perspectives` ignored |
| `perspectives` not provided | Use default 4 perspectives |
| `perspectives: []` (empty) | Use default 4 perspectives |
| `perspectives` provided | Use custom perspectives |

### Assignment Logic (Round-Robin)

```
perspectives: [A, B, C, D, E]  (5)
agents: [Claude, ChatGPT, Gemini]  (3)

Assignment:
  Claude   → A, D    (index 0, 3)
  ChatGPT  → B, E    (index 1, 4)
  Gemini   → C       (index 2)

Code: perspectives[i % agents.length]
```

## Data Flow

```
MCP Input (perspectives)
    ↓
handleStartRoundtable()
    ↓
DebateConfig { perspectives }
    ↓
SessionManager.createSession()
    ↓
Session { perspectives }
    ↓
SQLiteStorage (JSON string)
    ↓
[continue_roundtable]
    ↓
SQLiteStorage.getSession() → Session { perspectives }
    ↓
DebateEngine.executeRounds()
    ↓
DebateContext { perspectives }
    ↓
ExpertPanelMode.executeRound()
    ↓
currentPerspectives used for assignment
```

## Implementation Details

### Type Changes (src/types/index.ts)

```typescript
export interface Session {
  // ... existing fields ...
  perspectives?: string[];
}

export interface DebateConfig {
  // ... existing fields ...
  perspectives?: string[];
}

export interface DebateContext {
  // ... existing fields ...
  perspectives?: string[];
}
```

### Storage Changes (src/storage/sqlite.ts)

```sql
CREATE TABLE sessions (
  -- ... existing columns ...
  perspectives TEXT  -- JSON array or NULL
);
```

```typescript
// createSession: JSON.stringify(perspectives)
// getSession: JSON.parse(perspectives) or undefined
```

### ExpertPanelMode Changes (src/modes/expert-panel.ts)

```typescript
export const DEFAULT_PERSPECTIVES = [
  'technical', 'economic', 'ethical', 'social'
] as const;

export class ExpertPanelMode extends BaseModeStrategy {
  private currentPerspectives: string[] = [...DEFAULT_PERSPECTIVES];

  async executeRound(agents, context, toolkit) {
    // Use session perspectives or default
    this.currentPerspectives = context.perspectives?.length
      ? context.perspectives
      : [...DEFAULT_PERSPECTIVES];

    // Round-robin assignment
    for (const agent of agents) {
      const perspective = this.currentPerspectives[
        this.perspectiveCounter++ % this.currentPerspectives.length
      ];
      this.agentPerspectiveMap.set(agent.id, perspective);
    }

    return this.executeParallel(agents, context, toolkit);
  }
}
```

### Prompt Building for Custom Perspectives

```typescript
private buildAgentPromptWithPerspective(context, perspective) {
  const isDefault = DEFAULT_PERSPECTIVES.includes(perspective);

  if (isDefault) {
    // Use pre-defined role anchors
    return buildModePrompt(getPredefinedConfig(perspective), context);
  } else {
    // Dynamic prompt for custom perspective
    const customConfig = {
      ...EXPERT_PANEL_CONFIG,
      modeName: `Expert Panel (${perspective})`,
      roleAnchor: {
        emoji: '🔍',
        title: `YOU ARE AN EXPERT ANALYZING: ${perspective.toUpperCase()}`,
        definition: `You provide professional analysis focused on: ${perspective}`,
        mission: `Deliver objective assessment specifically regarding "${perspective}"`,
      },
    };
    return buildModePrompt(customConfig, context);
  }
}
```

## Files to Change

| # | File | Change | Complexity |
|---|------|--------|------------|
| 1 | `src/types/index.ts` | Add `perspectives?: string[]` to Session, DebateConfig, DebateContext | Low |
| 2 | `src/types/schemas.ts` | Update StartRoundtableInputSchema, SessionSchema, StoredSessionRowSchema | Low |
| 3 | `src/storage/sqlite.ts` | Add perspectives column, update CRUD | Low |
| 4 | `src/core/session-manager.ts` | Pass perspectives in createSession | Low |
| 5 | `src/core/debate-engine.ts` | Include perspectives in DebateContext | Low |
| 6 | `src/mcp/handlers/session.ts` | Pass perspectives from input | Low |
| 7 | `src/mcp/tools.ts` | Update tool description | Low |
| 8 | `src/modes/expert-panel.ts` | Custom perspectives support | Medium |
| 9 | `tests/unit/modes/expert-panel.test.ts` | Add custom perspectives tests | Low |
| 10 | `tests/unit/storage/sqlite.test.ts` | Add perspectives storage tests | Low |

**Estimated changes:** ~150-200 lines

## Test Cases

### Unit Tests

```typescript
describe('ExpertPanelMode - Custom Perspectives', () => {
  it('should use default perspectives when not provided');
  it('should use custom perspectives when provided');
  it('should wrap around when more agents than perspectives');
  it('should handle empty perspectives array as default');
  it('should build custom prompt for non-default perspectives');
});

describe('SQLiteStorage - Perspectives', () => {
  it('should store and retrieve perspectives');
  it('should handle null perspectives (legacy sessions)');
});
```

## Migration

**No breaking changes** - existing sessions without perspectives will use default values.

| Scenario | Behavior |
|----------|----------|
| Legacy session (no perspectives) | `NULL` → `undefined` → default perspectives |
| New session with perspectives | JSON stored → parsed and used |
| New session without perspectives | `NULL` stored → default perspectives |

## Documentation Updates

| File | Update |
|------|--------|
| `.claude/CLAUDE.md` | Add perspectives option to MCP Tools section |
| `README.md` | Add custom perspectives to Expert Panel description |
| `docs/API.md` | Document start_roundtable perspectives parameter |

## Future Improvements

1. **Richer custom prompts**: Allow users to provide perspective descriptions, not just names
2. **Perspective validation**: Warn if perspectives seem too similar or overlapping
3. **Perspective suggestions**: AI-powered perspective suggestions based on topic
