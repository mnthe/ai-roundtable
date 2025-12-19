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
import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { AgentResponse, DebateContext } from '../types/index.js';

export class MyMode implements DebateModeStrategy {
  readonly name = 'my-mode';

  /**
   * Execute one round of debate
   *
   * Choose execution pattern based on mode characteristics:
   * - Parallel: Independent responses, no cross-agent influence within round
   * - Sequential: Each agent sees previous responses within the round
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Option 1: Parallel execution
    return this.executeParallel(agents, context, toolkit);

    // Option 2: Sequential execution
    // return this.executeSequential(agents, context, toolkit);
  }

  /**
   * Parallel execution - all agents respond simultaneously
   * Best for: Expert panel, collaborative brainstorming, independent assessments
   */
  private async executeParallel(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    return Promise.all(
      agents.map(async (agent) => {
        agent.setToolkit(toolkit);
        return agent.generateResponse(context);
      })
    );
  }

  /**
   * Sequential execution - agents respond one by one
   * Best for: Adversarial debate, Socratic dialogue, building arguments
   */
  private async executeSequential(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    const responses: AgentResponse[] = [];

    for (const agent of agents) {
      agent.setToolkit(toolkit);

      // Create context with accumulated responses from current round
      const currentContext: DebateContext = {
        ...context,
        previousResponses: [...context.previousResponses, ...responses],
      };

      const response = await agent.generateResponse(currentContext);
      responses.push(response);
    }

    return responses;
  }

  /**
   * Build mode-specific prompt for agents
   *
   * Note: This method is defined in the interface but not yet integrated
   * into BaseAgent's prompt building. Include mode-specific instructions here.
   */
  buildAgentPrompt(context: DebateContext): string {
    const basePrompt = `
## Mode: My Custom Mode

You are participating in a ${this.name} discussion.

### Your Role
- [Describe the agent's role in this mode]
- [Specific behavior expectations]
- [What to focus on]

### Guidelines
- [Guideline 1]
- [Guideline 2]
- [Guideline 3]
`;

    // Add round-specific instructions
    if (context.currentRound === 1) {
      return basePrompt + `
### First Round Instructions
- Establish your initial position clearly
- Provide foundational reasoning
- Set the stage for subsequent discussion
`;
    } else {
      return basePrompt + `
### Round ${context.currentRound} Instructions
- Build on previous responses
- Address points raised by others
- Refine and develop your position
`;
    }
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
import { MockAgent } from '../../../src/agents/base.js';
import type { DebateContext, AgentToolkit } from '../../../src/types/index.js';

describe('MyMode', () => {
  let mode: MyMode;
  let mockToolkit: AgentToolkit;

  beforeEach(() => {
    mode = new MyMode();
    mockToolkit = {
      getTools: () => [],
      executeTool: vi.fn(),
      setContext: vi.fn(),
    };
  });

  const createMockAgent = (id: string) => {
    const agent = new MockAgent({
      id,
      name: `Agent ${id}`,
      provider: 'anthropic',
      model: 'mock',
    });
    agent.setMockResponse({
      agentId: id,
      agentName: `Agent ${id}`,
      position: `Position from ${id}`,
      reasoning: `Reasoning from ${id}`,
      confidence: 0.8,
      timestamp: new Date(),
    });
    return agent;
  };

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
    const agents = [createMockAgent('1'), createMockAgent('2')];
    const responses = await mode.executeRound(agents, defaultContext, mockToolkit);

    expect(responses).toHaveLength(2);
    expect(responses[0].agentId).toBe('1');
    expect(responses[1].agentId).toBe('2');
  });

  it('should build prompt for first round', () => {
    const prompt = mode.buildAgentPrompt(defaultContext);
    expect(prompt).toContain('my-mode');
    expect(prompt).toContain('First Round');
  });

  it('should build prompt for subsequent rounds', () => {
    const context = { ...defaultContext, currentRound: 2 };
    const prompt = mode.buildAgentPrompt(context);
    expect(prompt).toContain('Round 2');
  });
});
```

## Execution Patterns

### Parallel Execution
Use when:
- Responses should be independent
- Order doesn't matter
- Want faster execution
- Reducing bias from seeing others' responses

Examples: Expert Panel, Delphi, Collaborative

### Sequential Execution
Use when:
- Agents should respond to each other
- Building arguments progressively
- Dialogue/conversation style
- Counter-arguments needed

Examples: Adversarial, Socratic, Devil's Advocate

### Hybrid Patterns
Some modes may use combinations:

```typescript
// Team-based parallel (Red Team/Blue Team)
async executeRound(agents, context, toolkit) {
  const redTeam = agents.filter((_, i) => i % 2 === 0);
  const blueTeam = agents.filter((_, i) => i % 2 !== 0);

  const [redResponses, blueResponses] = await Promise.all([
    this.executeTeam(redTeam, context, toolkit, 'red'),
    this.executeTeam(blueTeam, context, toolkit, 'blue'),
  ]);

  return this.interleaveResponses(redResponses, blueResponses);
}
```

## Checklist

- [ ] Mode class implements `DebateModeStrategy`
- [ ] `name` property set correctly
- [ ] `executeRound()` implemented with appropriate pattern
- [ ] `buildAgentPrompt()` provides mode-specific instructions
- [ ] Mode added to `DebateMode` type
- [ ] Mode registered in `ModeRegistry`
- [ ] Exported from `index.ts`
- [ ] Unit tests cover execution and prompt building
- [ ] README.md updated with mode description
