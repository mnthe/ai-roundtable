# Adding New Debate Modes

## When to Apply

Apply this rule when:
- Creating a new debate mode
- Modifying existing mode behavior
- Adding mode-specific prompts

## Required Steps

### 1. Create Mode Class

Create `src/modes/<mode-name>.ts`:

```typescript
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { AgentResponse, DebateContext } from '../types/index.js';
import { BaseModeStrategy } from './base.js';
import {
  buildModePrompt,
  createOutputSections,
  type ModePromptConfig,
} from './utils/prompt-builder.js';

/**
 * My Custom Mode
 *
 * Brief description of what this mode does and when to use it.
 */
export class MyMode extends BaseModeStrategy {
  readonly name = 'my-mode';

  // Optional: Disable groupthink detection for modes with structural opposition
  // readonly needsGroupthinkDetection = false;

  /**
   * Execute one round of debate
   *
   * Choose execution pattern based on mode characteristics:
   * - executeParallel: All agents respond simultaneously (see only previous rounds)
   * - executeSequential: Agents respond one by one (see accumulated current round responses)
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Option 1: Parallel execution (collaborative, expert-panel, delphi)
    return this.executeParallel(agents, context, toolkit);

    // Option 2: Sequential execution (adversarial, socratic)
    // return this.executeSequential(agents, context, toolkit);
  }

  /**
   * Build mode-specific prompt using 4-layer structure
   */
  buildAgentPrompt(context: DebateContext): string {
    const config: ModePromptConfig = {
      modeName: 'My Custom Discussion',
      roleAnchor: {
        emoji: '🎯',
        title: 'MY CUSTOM ROLE',
        definition: 'You are a participant in a custom discussion format.',
        mission: 'Describe the agent\'s primary objective in this mode.',
        persistence: 'Maintain this role throughout all rounds of discussion.',
        helpfulMeans: 'What being helpful means in this mode',
        helpfulNotMeans: 'What to avoid',
        additionalContext: 'Optional extra context',
      },
      behavioralContract: {
        mustBehaviors: [
          'Always provide evidence-based reasoning',
          'Acknowledge others\' valid points',
          'State confidence levels honestly',
        ],
        mustNotBehaviors: [
          'Make claims without justification',
          'Dismiss others without engagement',
          'Pretend certainty when uncertain',
        ],
        priorityHierarchy: [
          'Accuracy and truthfulness',
          'Constructive engagement',
          'Clear communication',
        ],
        failureMode: 'Responses that [describe failure criteria] will be rejected.',
      },
      structuralEnforcement: {
        firstRoundSections: createOutputSections([
          ['[INITIAL POSITION]', 'State your position on the topic clearly'],
          ['[SUPPORTING EVIDENCE]', 'Provide reasoning and evidence'],
          ['[CONFIDENCE]', 'Express your confidence level (0-100%)'],
        ]),
        subsequentRoundSections: createOutputSections([
          ['[ENGAGEMENT]', 'Address points from previous responses'],
          ['[UPDATED POSITION]', 'Refine or maintain your position'],
          ['[NEW EVIDENCE]', 'Add new supporting information'],
          ['[CONFIDENCE]', 'Updated confidence level with reason for change'],
        ]),
        prefix: 'Your response must include the following sections:',
        suffix: 'Maintain this structure for consistent analysis.',
      },
      verificationLoop: {
        checklistItems: [
          'Have I addressed the topic directly?',
          'Is my reasoning sound and evidence-based?',
          'Have I acknowledged relevant points from others?',
          'Is my confidence level justified?',
        ],
      },
      focusQuestion: {
        instructions: 'Prioritize addressing the focus question in your response.',
      },
    };

    return buildModePrompt(config, context);
  }
}
```

### 2. Update Types

In `src/types/index.ts`, add mode to `DebateMode`:

```typescript
export type DebateMode =
  | 'collaborative'
  | 'adversarial'
  | 'socratic'
  | 'expert-panel'
  | 'devils-advocate'
  | 'delphi'
  | 'red-team-blue-team'
  | 'my-mode';  // Add here
```

### 3. Register Mode

In `src/modes/registry.ts`:

```typescript
import { MyMode } from './my-mode.js';

private registerDefaultModes(): void {
  this.registerMode('collaborative', new CollaborativeMode());
  this.registerMode('adversarial', new AdversarialMode());
  // ...existing modes...
  this.registerMode('my-mode', new MyMode());  // Add here
}
```

### 4. Export from Index

In `src/modes/index.ts`:

```typescript
export { MyMode } from './my-mode.js';
```

### 5. Add Tests

Create `tests/unit/modes/my-mode.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MyMode } from '../../../src/modes/my-mode.js';
import type { DebateContext, AgentToolkit } from '../../../src/types/index.js';

describe('MyMode', () => {
  let mode: MyMode;
  let mockToolkit: AgentToolkit;

  beforeEach(() => {
    mode = new MyMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
    };
  });

  const createMockAgent = (id: string, mockResponse: any) => ({
    id,
    setToolkit: vi.fn(),
    generateResponse: vi.fn().mockResolvedValue({
      agentId: id,
      agentName: `Agent ${id}`,
      position: `Position from ${id}`,
      reasoning: `Reasoning from ${id}`,
      confidence: 0.8,
      timestamp: new Date(),
      ...mockResponse,
    }),
  });

  const defaultContext: DebateContext = {
    sessionId: 'test-session',
    topic: 'Test topic',
    mode: 'my-mode',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
  };

  it('should have correct name', () => {
    expect(mode.name).toBe('my-mode');
  });

  it('should execute round with all agents', async () => {
    const agents = [createMockAgent('1', {}), createMockAgent('2', {})];
    const responses = await mode.executeRound(agents as any, defaultContext, mockToolkit);

    expect(responses).toHaveLength(2);
    expect(responses[0].agentId).toBe('1');
    expect(responses[1].agentId).toBe('2');
  });

  it('should handle agent errors gracefully', async () => {
    const workingAgent = createMockAgent('1', {});
    const failingAgent = {
      id: '2',
      setToolkit: vi.fn(),
      generateResponse: vi.fn().mockRejectedValue(new Error('API Error')),
    };

    const responses = await mode.executeRound(
      [workingAgent, failingAgent] as any,
      defaultContext,
      mockToolkit
    );

    // Should continue with working agents
    expect(responses).toHaveLength(1);
    expect(responses[0].agentId).toBe('1');
  });

  it('should build prompt with 4-layer structure', () => {
    const prompt = mode.buildAgentPrompt(defaultContext);

    expect(prompt).toContain('LAYER 1: ROLE ANCHOR');
    expect(prompt).toContain('LAYER 2: BEHAVIORAL CONTRACT');
    expect(prompt).toContain('LAYER 3: STRUCTURAL ENFORCEMENT');
    expect(prompt).toContain('LAYER 4: VERIFICATION LOOP');
    expect(prompt).toContain('my-mode');
  });

  it('should use first round sections for round 1', () => {
    const prompt = mode.buildAgentPrompt(defaultContext);
    expect(prompt).toContain('[INITIAL POSITION]');
  });

  it('should use subsequent round sections for later rounds', () => {
    const context = {
      ...defaultContext,
      currentRound: 2,
      previousResponses: [{ agentId: '1', position: 'Test' }],
    };
    const prompt = mode.buildAgentPrompt(context as any);
    expect(prompt).toContain('[ENGAGEMENT]');
    expect(prompt).toContain('[UPDATED POSITION]');
  });
});
```

## 4-Layer Prompt Structure

All modes should use the 4-layer prompt structure via `modes/utils/prompt-builder.ts`:

```
┌─────────────────────────────────────────────────────────────┐
│ LAYER 1: ROLE ANCHOR                                        │
│ - Emoji + Title (e.g., "🤝 COLLABORATIVE SYNTHESIZER")     │
│ - Role Definition: What the agent IS                        │
│ - Mission: Primary objective                                │
│ - Persistence: "Maintain this role throughout"              │
│ - What "helpful" means / does NOT mean                      │
├─────────────────────────────────────────────────────────────┤
│ LAYER 2: BEHAVIORAL CONTRACT                                │
│ - MUST behaviors (required)                                 │
│ - MUST NOT behaviors (prohibited)                           │
│ - Priority Hierarchy (numbered, ordered)                    │
│ - Failure Mode: What causes rejection                       │
├─────────────────────────────────────────────────────────────┤
│ LAYER 3: STRUCTURAL ENFORCEMENT                             │
│ - First Round sections (different from subsequent)          │
│ - Required Output Structure with [SECTION HEADERS]          │
│ - Each section has description in parentheses               │
├─────────────────────────────────────────────────────────────┤
│ LAYER 4: VERIFICATION LOOP                                  │
│ - Self-check checklist before submission                    │
│ - "If any check fails, revise before submitting"            │
└─────────────────────────────────────────────────────────────┘
```

**Prompt Builder Utilities:**
- `buildModePrompt(config, context)` - Build complete 4-layer prompt
- `buildRoleAnchor(config)` - Layer 1 only
- `buildBehavioralContract(config)` - Layer 2 only
- `buildStructuralEnforcement(config, context)` - Layer 3 only
- `buildVerificationLoop(config)` - Layer 4 only
- `buildFocusQuestionSection(context, config)` - Optional focus question
- `buildRoundContext(context)` - Build round context section
- `formatPreviousResponses(responses)` - Format responses for context
- `createOutputSections([...])` - Helper to create section arrays

## Execution Patterns

### Parallel Execution (BaseModeStrategy.executeParallel)

- Uses `Promise.allSettled` for graceful error handling
- Each agent only sees previous rounds' responses
- Errors logged but don't stop other agents
- Best for: Collaborative, Expert Panel, Delphi

**How it works:**
```typescript
// Context includes modePrompt from buildAgentPrompt()
const contextWithModePrompt = {
  ...context,
  modePrompt: this.buildAgentPrompt(context),
};

// All agents execute in parallel
const results = await Promise.allSettled(
  agents.map(agent => agent.generateResponse(contextWithModePrompt))
);

// Failed agents are logged but don't break the round
```

### Sequential Execution (BaseModeStrategy.executeSequential)

- Each agent sees accumulated responses from current round
- Errors caught per-agent, allowing continuation
- Context and modePrompt rebuild for each agent
- Best for: Adversarial, Socratic, Devil's Advocate

**How it works:**
```typescript
const responses: AgentResponse[] = [];

for (const agent of agents) {
  try {
    // Rebuild context with accumulated responses
    const currentContext = {
      ...context,
      previousResponses: [...context.previousResponses, ...responses],
      modePrompt: this.buildAgentPrompt({
        ...context,
        previousResponses: [...context.previousResponses, ...responses],
      }),
    };

    const response = await agent.generateResponse(currentContext);
    responses.push(response);
  } catch (error) {
    logger.error({ err: error, agentId: agent.id }, 'Error from agent');
    // Continue with next agent
  }
}
```

### Hybrid Patterns

Some modes use custom execution (e.g., Red Team/Blue Team):

```typescript
async executeRound(agents, context, toolkit) {
  // Split into teams by index (even = red, odd = blue)
  const redTeam: BaseAgent[] = [];
  const blueTeam: BaseAgent[] = [];
  agents.forEach((agent, i) => (i % 2 === 0 ? redTeam : blueTeam).push(agent));

  // Execute both teams in parallel (using a private executeTeam method)
  const [redResponses, blueResponses] = await Promise.all([
    this.executeTeam(redTeam, 'red', context, toolkit),
    this.executeTeam(blueTeam, 'blue', context, toolkit),
  ]);

  // Interleave responses to maintain original agent order
  const responses: AgentResponse[] = [];
  const maxLength = Math.max(redResponses.length, blueResponses.length);
  for (let i = 0; i < maxLength; i++) {
    if (redResponses[i]) responses.push(redResponses[i]);
    if (blueResponses[i]) responses.push(blueResponses[i]);
  }
  return responses;
}
```

## Optional Hooks

BaseModeStrategy provides optional hooks for advanced mode customization. These hooks are called automatically by `executeParallel()` and `executeSequential()`.

### transformContext

Transform the debate context before passing it to an agent. Use for anonymization, statistics injection, or context modification.

```typescript
/**
 * Example: Anonymize previous responses for Delphi mode
 */
protected override transformContext(
  context: DebateContext,
  agent: BaseAgent
): DebateContext {
  return {
    ...context,
    previousResponses: context.previousResponses.map((r, i) => ({
      ...r,
      agentId: `participant-${i + 1}`,
      agentName: `Participant ${i + 1}`,
    })),
  };
}
```

### validateResponse

Validate and potentially modify a response after generation. Use for stance enforcement or response correction.

```typescript
/**
 * Example: Enforce stance requirement for Devils Advocate mode
 */
protected override validateResponse(
  response: AgentResponse,
  context: DebateContext
): AgentResponse {
  if (!response.stance) {
    // Default to NEUTRAL if stance is missing
    return { ...response, stance: 'NEUTRAL' };
  }
  return response;
}
```

### getAgentRole

Assign role identifiers to agents based on their position in the execution order. Useful for logging and role-based behavior.

```typescript
/**
 * Example: Assign PRIMARY/OPPOSITION/EVALUATOR roles
 */
protected override getAgentRole(
  agent: BaseAgent,
  index: number,
  context: DebateContext
): string | undefined {
  const roles = ['PRIMARY', 'OPPOSITION', 'EVALUATOR'];
  return roles[index % roles.length];
}
```

## Mode Extension Utilities

Reusable utilities in `src/modes/` for common mode patterns:

### Context Processors (`modes/processors/`)

Pre-built context transformers that can be composed:

```typescript
import { AnonymizationProcessor, StatisticsProcessor } from '../processors/index.js';

// In your mode class
protected override transformContext(
  context: DebateContext,
  agent: BaseAgent
): DebateContext {
  let transformed = context;
  transformed = AnonymizationProcessor.process(transformed);
  transformed = StatisticsProcessor.process(transformed);
  return transformed;
}
```

| Processor | Purpose |
|-----------|---------|
| `AnonymizationProcessor` | Remove agent identities from previous responses |
| `StatisticsProcessor` | Inject round statistics (confidence distribution, position clusters) |

### Response Validators (`modes/validators/`)

Post-response validation and correction:

```typescript
import { StanceValidator, ConfidenceRangeValidator } from '../validators/index.js';

// In your mode class
protected override validateResponse(
  response: AgentResponse,
  context: DebateContext
): AgentResponse {
  let validated = response;
  validated = StanceValidator.validate(validated, { required: true, defaultStance: 'NEUTRAL' });
  validated = ConfidenceRangeValidator.validate(validated, { min: 0.1, max: 0.95 });
  return validated;
}
```

| Validator | Purpose |
|-----------|---------|
| `StanceValidator` | Ensure stance field is present (YES/NO/NEUTRAL) |
| `ConfidenceRangeValidator` | Clamp confidence to specified range |
| `RequiredFieldsValidator` | Ensure required fields are non-empty |

### Tool Policy (`modes/tool-policy.ts`)

Mode-aware guidance for agent tool usage:

```typescript
import { getToolPolicy } from '../tool-policy.js';

// Get recommended tool usage for a mode
const policy = getToolPolicy('adversarial');
// Returns: { encouraged: ['fact_check'], discouraged: ['search_web'], reason: '...' }
```

## needsGroupthinkDetection Property

Controls whether AIConsensusAnalyzer performs groupthink detection for this mode:

```typescript
export class MyMode extends BaseModeStrategy {
  readonly name = 'my-mode';

  // Set to false for modes with built-in structural opposition
  // Default is true (groupthink detection enabled)
  readonly needsGroupthinkDetection = false;
}
```

| Mode | needsGroupthinkDetection | Rationale |
|------|--------------------------|-----------|
| collaborative | true (default) | Consensus-seeking, risk of groupthink |
| adversarial | false | Built-in opposition |
| devils-advocate | false | Structural role-based opposition |
| delphi | true (default) | Anonymous consensus, risk of conformity |

## Checklist

- [ ] Mode class extends `BaseModeStrategy`
- [ ] `name` property set as readonly
- [ ] `needsGroupthinkDetection` set appropriately (if not default)
- [ ] `executeRound()` implemented using `executeParallel()` or `executeSequential()`
- [ ] `buildAgentPrompt()` uses 4-layer structure via prompt-builder utilities
- [ ] First round sections differ from subsequent round sections
- [ ] Optional hooks implemented if needed:
  - [ ] `transformContext()` for context modification
  - [ ] `validateResponse()` for response validation
  - [ ] `getAgentRole()` for role assignment
- [ ] Mode added to `DebateMode` type in `src/types/index.ts`
- [ ] Mode registered in `ModeRegistry` (`src/modes/registry.ts`)
- [ ] Exported from `src/modes/index.ts`
- [ ] Unit tests cover:
  - [ ] Correct mode name
  - [ ] Round execution with multiple agents
  - [ ] Graceful error handling (agent failures)
  - [ ] 4-layer prompt structure
  - [ ] First round vs subsequent round sections
  - [ ] Hook behavior (if implemented)
- [ ] README.md updated with mode description
