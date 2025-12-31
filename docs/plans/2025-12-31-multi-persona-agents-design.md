# Multi-Persona Agents Design

> **Date**: 2025-12-31
> **Status**: Approved
> **Decision Method**: AI Roundtable (expert-panel mode, 3 rounds, 87% consensus)

## Problem Statement

Currently, AI Roundtable has a 1:1 relationship between API keys and agents. Users with only one API key (e.g., only `ANTHROPIC_API_KEY`) can only have one agent participate in debates, making meaningful multi-perspective discussions impossible.

**Goal**: Enable a single API key to spawn multiple "Persona Agents" with distinct perspectives, allowing rich debates even with limited API access.

## Design Decision

### Chosen Approach: Instance Replication with Persona System Prompts

Based on AI Roundtable debate (session: `083fdebf-d900-4be8-9f24-6e4606dd4c4d`):

- **Option 1 (Selected)**: Create actual Agent instances per persona
- ~~Option 2: Virtual Agent wrapper~~ (rejected: unnecessary complexity)
- ~~Option 3: Context injection~~ (rejected: identity/accountability concerns)

**Rationale**:
1. Clean separation of concerns - each agent has distinct identity
2. Accountability - actions traceable to specific persona configuration
3. Existing architecture support - `AgentRegistry` already allows multiple agents per provider
4. BaseAgent is stateless - instance replication cost is minimal

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Available Providers                   │
│            (based on configured API keys)               │
│         [anthropic, openai, google, perplexity]         │
└─────────────────────────────────────────────────────────┘
                            │
                   Round-robin assignment
                            │
            ┌───────────────┼───────────────┬───────────────┐
            ▼               ▼               ▼               ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ anthropic-   │ │ openai-      │ │ anthropic-   │ │ openai-      │
    │ persona-1    │ │ persona-2    │ │ persona-3    │ │ persona-4    │
    │              │ │              │ │              │ │              │
    │ "Analyst"    │ │ "Critic"     │ │ "Optimist"   │ │ "Pragmatist" │
    └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

## API Changes

### start_roundtable Parameters

```typescript
// BEFORE
{
  topic: string;
  mode?: DebateMode;
  agents?: string[];        // ❌ REMOVED
  rounds?: number;
  perspectives?: Perspective[];
}

// AFTER
{
  topic: string;
  mode?: DebateMode;
  agentCount?: number;      // ✅ NEW (default: 4, max: 5)
  rounds?: number;
  perspectives?: Perspective[];
}
```

### Environment Variables

```bash
# Maximum allowed Persona Agents (hard limit)
ROUNDTABLE_MAX_AGENTS=5

# Default agent count when not specified
ROUNDTABLE_DEFAULT_AGENT_COUNT=4
```

### Configuration Priority

1. `agentCount` parameter in API call
2. `ROUNDTABLE_DEFAULT_AGENT_COUNT` env var
3. Hardcoded default: 4

All values are capped at `ROUNDTABLE_MAX_AGENTS`.

## Persona Assignment Strategy

### Multi-Provider Round-Robin

When multiple API keys are configured, agents are distributed across providers:

```
agentCount=4, providers=[anthropic, openai]

Result:
├── anthropic-persona-1 (Analyst)
├── openai-persona-2 (Critic)
├── anthropic-persona-3 (Optimist)
└── openai-persona-4 (Pragmatist)
```

### Mode-Specific Persona Sets

| Mode | Persona Strategy |
|------|------------------|
| `collaborative` | Synthesizer, Analyst, Creative, Pragmatist |
| `adversarial` | Proponent, Opponent (alternating) |
| `socratic` | Questioner, Respondent |
| `expert-panel` | Use provided `perspectives` directly |
| `devils-advocate` | Advocate (YES), Challenger (NO), Evaluator (NEUTRAL) |
| `delphi` | Generic Participant (anonymized) |
| `red-team-blue-team` | Red Team, Blue Team (alternating) |

### Persona System Prompt Injection

```typescript
const systemPrompt = `You are ${persona.name}, an AI participant with a ${persona.trait} perspective.
Maintain this perspective consistently throughout the debate.
Your role is to provide insights from your unique viewpoint while engaging constructively with others.`;
```

## Implementation Plan

### New Files

| File | Purpose |
|------|---------|
| `src/config/agent-limits.ts` | Load MAX_AGENTS, DEFAULT_COUNT from env |
| `src/agents/persona-factory.ts` | Persona Agent creation logic |

### Modified Files

| File | Changes |
|------|---------|
| `src/types/index.ts` | Remove `agents`, add `agentCount` to StartRoundtableInput |
| `src/types/schemas.ts` | Update StartRoundtableInputSchema |
| `src/mcp/tools.ts` | Update tool description |
| `src/mcp/handlers/session.ts` | Call persona factory in handleStartRoundtable |
| `src/config/index.ts` | Export agent-limits module |
| `.env.example` | Document new env vars |

### Implementation Phases

**Phase 1: Foundation (30 min)**
1. Create `src/config/agent-limits.ts`
2. Update `src/types/schemas.ts`
3. Update `src/types/index.ts`

**Phase 2: Core Logic (1 hour)**
4. Create `src/agents/persona-factory.ts`
   - MODE_PERSONA_SETS definition
   - createPersonaAgents() implementation
   - getPersonasForMode() implementation
5. Export from `src/agents/index.ts`

**Phase 3: Integration (30 min)**
6. Update `src/mcp/handlers/session.ts`
7. Update `src/mcp/tools.ts` description
8. Update `.env.example`

**Phase 4: Testing (1 hour)**
9. Write `tests/unit/agents/persona-factory.test.ts`
10. Write `tests/unit/config/agent-limits.test.ts`
11. Update existing tests for removed `agents` parameter

### Estimated Effort

- **Lines changed**: ~200 added, ~50 modified
- **Time**: 3-4 hours

## Rate Limiting Consideration

**Deferred to Phase 2**: Provider-level rate limiting was discussed but intentionally excluded from MVP.

Current mitigation:
- Existing `withRetry()` handles individual agent errors
- Sequential modes naturally avoid concurrent API calls
- Parallel modes may hit rate limits with same-provider agents

Future enhancement (if needed):
- Provider-level concurrency cap
- Token bucket rate limiter
- Fair queuing across personas

## Compatibility Notes

- **Breaking Change**: `agents` parameter removed from `start_roundtable`
- **Migration**: Callers should use `agentCount` instead
- **Existing sessions**: Unaffected (agentIds stored in session)

## Success Criteria

1. Single API key can spawn 2-5 distinct persona agents
2. Multiple API keys are utilized via round-robin distribution
3. Each mode produces appropriate persona assignments
4. Existing tests pass with updated parameters
5. New unit tests cover persona factory logic
