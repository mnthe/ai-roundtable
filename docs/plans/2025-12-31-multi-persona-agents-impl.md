# Multi-Persona Agents Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable a single API key to spawn multiple persona agents with distinct perspectives for rich debates.

**Architecture:** Instance replication with persona system prompts. Each persona gets a unique AgentConfig with persona-specific systemPrompt. Round-robin distribution across available providers when multiple API keys are configured.

**Tech Stack:** TypeScript, Zod validation, Vitest testing

---

## Pre-Implementation Setup

**Step 1: Create feature branch**

Run: `git checkout -b feature/multi-persona-agents`
Expected: Switched to new branch

**Step 2: Verify clean state**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: All checks pass

---

## Task 1: Agent Limits Configuration

**Files:**
- Create: `src/config/agent-limits.ts`
- Modify: `src/config/index.ts`
- Test: `tests/unit/config/agent-limits.test.ts`

### Step 1: Write the failing tests

Create `tests/unit/config/agent-limits.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadAgentLimitsConfig, DEFAULT_MAX_AGENTS, DEFAULT_AGENT_COUNT } from '../../../src/config/agent-limits.js';

describe('Agent Limits Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('loadAgentLimitsConfig', () => {
    it('should return default values when no env vars set', () => {
      delete process.env.ROUNDTABLE_MAX_AGENTS;
      delete process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT;

      const config = loadAgentLimitsConfig();

      expect(config.maxAgents).toBe(DEFAULT_MAX_AGENTS);
      expect(config.defaultCount).toBe(DEFAULT_AGENT_COUNT);
    });

    it('should use ROUNDTABLE_MAX_AGENTS when set', () => {
      process.env.ROUNDTABLE_MAX_AGENTS = '10';

      const config = loadAgentLimitsConfig();

      expect(config.maxAgents).toBe(10);
    });

    it('should use ROUNDTABLE_DEFAULT_AGENT_COUNT when set', () => {
      process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT = '3';

      const config = loadAgentLimitsConfig();

      expect(config.defaultCount).toBe(3);
    });

    it('should handle invalid number by falling back to default', () => {
      process.env.ROUNDTABLE_MAX_AGENTS = 'invalid';

      const config = loadAgentLimitsConfig();

      expect(config.maxAgents).toBe(DEFAULT_MAX_AGENTS);
    });

    it('should cap defaultCount at maxAgents', () => {
      process.env.ROUNDTABLE_MAX_AGENTS = '3';
      process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT = '10';

      const config = loadAgentLimitsConfig();

      expect(config.defaultCount).toBe(3);
    });
  });

  describe('DEFAULT_MAX_AGENTS', () => {
    it('should be 5', () => {
      expect(DEFAULT_MAX_AGENTS).toBe(5);
    });
  });

  describe('DEFAULT_AGENT_COUNT', () => {
    it('should be 4', () => {
      expect(DEFAULT_AGENT_COUNT).toBe(4);
    });
  });
});
```

### Step 2: Run tests to verify they fail

Run: `pnpm test tests/unit/config/agent-limits.test.ts`
Expected: FAIL with "Cannot find module '../../../src/config/agent-limits.js'"

### Step 3: Write minimal implementation

Create `src/config/agent-limits.ts`:

```typescript
/**
 * Agent Limits Configuration
 *
 * Controls the number of persona agents that can be created per debate.
 */

/**
 * Default maximum number of agents allowed per debate
 */
export const DEFAULT_MAX_AGENTS = 5;

/**
 * Default number of agents when not specified in request
 */
export const DEFAULT_AGENT_COUNT = 4;

/**
 * Configuration interface for agent limits
 */
export interface AgentLimitsConfig {
  /** Maximum allowed agents per debate (hard limit) */
  maxAgents: number;
  /** Default agent count when not specified */
  defaultCount: number;
}

/**
 * Load agent limits configuration from environment variables
 *
 * Environment variables:
 * - ROUNDTABLE_MAX_AGENTS: Maximum agents per debate (default: 5)
 * - ROUNDTABLE_DEFAULT_AGENT_COUNT: Default count (default: 4)
 */
export function loadAgentLimitsConfig(): AgentLimitsConfig {
  const maxAgents = parseIntOrDefault(
    process.env.ROUNDTABLE_MAX_AGENTS,
    DEFAULT_MAX_AGENTS
  );

  const rawDefaultCount = parseIntOrDefault(
    process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT,
    DEFAULT_AGENT_COUNT
  );

  // Cap defaultCount at maxAgents
  const defaultCount = Math.min(rawDefaultCount, maxAgents);

  return { maxAgents, defaultCount };
}

/**
 * Parse integer from string with fallback to default
 */
function parseIntOrDefault(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}
```

### Step 4: Run tests to verify they pass

Run: `pnpm test tests/unit/config/agent-limits.test.ts`
Expected: PASS

### Step 5: Export from config index

Modify `src/config/index.ts` - add export:

```typescript
// Agent limits configuration
export {
  type AgentLimitsConfig,
  DEFAULT_MAX_AGENTS,
  DEFAULT_AGENT_COUNT,
  loadAgentLimitsConfig,
} from './agent-limits.js';
```

### Step 6: Run full test suite

Run: `pnpm test`
Expected: PASS

### Step 7: Commit

```bash
git add src/config/agent-limits.ts src/config/index.ts tests/unit/config/agent-limits.test.ts
git commit -m "feat(config): add agent limits configuration

- Add DEFAULT_MAX_AGENTS (5) and DEFAULT_AGENT_COUNT (4)
- Support ROUNDTABLE_MAX_AGENTS and ROUNDTABLE_DEFAULT_AGENT_COUNT env vars
- Cap defaultCount at maxAgents automatically"
```

---

## Task 2: Update Zod Schemas (Remove agents, Add agentCount)

**Files:**
- Modify: `src/types/schemas.ts:154-167`
- Modify: `src/types/index.ts:269-274`
- Test: `tests/unit/types/schemas.test.ts` (new)

### Step 1: Write the failing tests

Create `tests/unit/types/schemas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { StartRoundtableInputSchema } from '../../../src/types/schemas.js';

describe('StartRoundtableInputSchema', () => {
  describe('agentCount field', () => {
    it('should accept valid agentCount', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
        agentCount: 4,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentCount).toBe(4);
      }
    });

    it('should reject agentCount below 2', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
        agentCount: 1,
      });

      expect(result.success).toBe(false);
    });

    it('should reject agentCount above 10', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
        agentCount: 11,
      });

      expect(result.success).toBe(false);
    });

    it('should allow omitting agentCount', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentCount).toBeUndefined();
      }
    });
  });

  describe('agents field removal', () => {
    it('should not accept agents field', () => {
      const result = StartRoundtableInputSchema.safeParse({
        topic: 'Test topic',
        agents: ['claude', 'chatgpt'],
      });

      // With strict schema, unknown keys are stripped or rejected
      // Our schema should not have 'agents' in output
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>).agents).toBeUndefined();
      }
    });
  });
});
```

### Step 2: Run tests to verify they fail

Run: `pnpm test tests/unit/types/schemas.test.ts`
Expected: FAIL (agentCount field doesn't exist)

### Step 3: Update StartRoundtableInputSchema

Modify `src/types/schemas.ts` lines 154-167:

```typescript
export const StartRoundtableInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(2000, 'Topic cannot exceed 2000 characters'),
  mode: DebateModeSchema.optional().default('collaborative'),
  agentCount: z
    .number()
    .int()
    .min(2, 'At least 2 agents required')
    .max(10, 'Maximum 10 agents allowed')
    .optional()
    .describe('Number of persona agents to create (default: 4, max determined by ROUNDTABLE_MAX_AGENTS)'),
  rounds: z.number().int().positive().optional().default(3),
  exitOnConsensus: z
    .boolean()
    .optional()
    .describe('Whether to exit early when consensus is reached'),
  perspectives: z
    .array(PerspectiveSchema)
    .optional()
    .describe('Custom perspectives for expert-panel mode (overrides auto-generation)'),
});
```

### Step 4: Run tests to verify they pass

Run: `pnpm test tests/unit/types/schemas.test.ts`
Expected: PASS

### Step 5: Update types/index.ts

Modify `src/types/index.ts` lines 269-274:

```typescript
export interface StartRoundtableInput {
  topic: string;
  mode?: DebateMode;
  agentCount?: number;
  rounds?: number;
}
```

### Step 6: Run type check

Run: `pnpm typecheck`
Expected: Errors in session.ts (expects `agents` field)

### Step 7: Commit schema changes

```bash
git add src/types/schemas.ts src/types/index.ts tests/unit/types/schemas.test.ts
git commit -m "feat(types): replace agents with agentCount in StartRoundtableInput

BREAKING CHANGE: agents parameter removed from start_roundtable
- Add agentCount field (min: 2, max: 10, optional)
- Remove agents array field
- Update StartRoundtableInput interface"
```

---

## Task 3: Mode-Specific Persona Sets

**Files:**
- Create: `src/agents/personas/index.ts`
- Create: `src/agents/personas/persona-sets.ts`
- Create: `src/agents/personas/types.ts`
- Test: `tests/unit/agents/personas/persona-sets.test.ts`

### Step 1: Write the failing tests

Create `tests/unit/agents/personas/persona-sets.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  getPersonasForMode,
  PersonaTemplate,
} from '../../../../src/agents/personas/index.js';
import type { DebateMode } from '../../../../src/types/index.js';

describe('getPersonasForMode', () => {
  const modes: DebateMode[] = [
    'collaborative',
    'adversarial',
    'socratic',
    'expert-panel',
    'devils-advocate',
    'delphi',
    'red-team-blue-team',
  ];

  it.each(modes)('should return personas for %s mode', (mode) => {
    const personas = getPersonasForMode(mode, 4);

    expect(personas).toHaveLength(4);
    personas.forEach((persona: PersonaTemplate) => {
      expect(persona.name).toBeDefined();
      expect(persona.trait).toBeDefined();
    });
  });

  describe('collaborative mode', () => {
    it('should return synthesizer, analyst, creative, pragmatist', () => {
      const personas = getPersonasForMode('collaborative', 4);

      expect(personas[0].name).toBe('Synthesizer');
      expect(personas[1].name).toBe('Analyst');
      expect(personas[2].name).toBe('Creative');
      expect(personas[3].name).toBe('Pragmatist');
    });
  });

  describe('adversarial mode', () => {
    it('should alternate proponent and opponent', () => {
      const personas = getPersonasForMode('adversarial', 4);

      expect(personas[0].name).toBe('Proponent');
      expect(personas[1].name).toBe('Opponent');
      expect(personas[2].name).toBe('Proponent');
      expect(personas[3].name).toBe('Opponent');
    });
  });

  describe('devils-advocate mode', () => {
    it('should have advocate, challenger, and evaluator', () => {
      const personas = getPersonasForMode('devils-advocate', 3);

      expect(personas[0].name).toBe('Advocate');
      expect(personas[1].name).toBe('Challenger');
      expect(personas[2].name).toBe('Evaluator');
    });
  });

  describe('red-team-blue-team mode', () => {
    it('should alternate red team and blue team', () => {
      const personas = getPersonasForMode('red-team-blue-team', 4);

      expect(personas[0].name).toBe('Red Team');
      expect(personas[1].name).toBe('Blue Team');
      expect(personas[2].name).toBe('Red Team');
      expect(personas[3].name).toBe('Blue Team');
    });
  });

  describe('delphi mode', () => {
    it('should return generic participants', () => {
      const personas = getPersonasForMode('delphi', 4);

      expect(personas[0].name).toBe('Participant 1');
      expect(personas[1].name).toBe('Participant 2');
      expect(personas[2].name).toBe('Participant 3');
      expect(personas[3].name).toBe('Participant 4');
    });
  });

  it('should handle count greater than defined personas by cycling', () => {
    const personas = getPersonasForMode('collaborative', 6);

    expect(personas).toHaveLength(6);
    expect(personas[4].name).toBe('Synthesizer'); // Cycles back
    expect(personas[5].name).toBe('Analyst');
  });

  it('should handle count less than defined personas', () => {
    const personas = getPersonasForMode('collaborative', 2);

    expect(personas).toHaveLength(2);
    expect(personas[0].name).toBe('Synthesizer');
    expect(personas[1].name).toBe('Analyst');
  });
});
```

### Step 2: Run tests to verify they fail

Run: `pnpm test tests/unit/agents/personas/persona-sets.test.ts`
Expected: FAIL with "Cannot find module"

### Step 3: Create types file

Create `src/agents/personas/types.ts`:

```typescript
/**
 * Persona Types
 */

/**
 * Template for creating a persona agent
 */
export interface PersonaTemplate {
  /** Display name for the persona */
  name: string;
  /** Character trait or perspective description */
  trait: string;
}
```

### Step 4: Create persona sets

Create `src/agents/personas/persona-sets.ts`:

```typescript
/**
 * Mode-Specific Persona Sets
 *
 * Defines the default personas for each debate mode.
 */

import type { DebateMode } from '../../types/index.js';
import type { PersonaTemplate } from './types.js';

/**
 * Collaborative mode personas - focus on building consensus
 */
const COLLABORATIVE_PERSONAS: PersonaTemplate[] = [
  { name: 'Synthesizer', trait: 'finding common ground and building consensus' },
  { name: 'Analyst', trait: 'analytical and evidence-based reasoning' },
  { name: 'Creative', trait: 'innovative thinking and exploring alternatives' },
  { name: 'Pragmatist', trait: 'practical implementation and feasibility focus' },
];

/**
 * Adversarial mode personas - opposing viewpoints
 */
const ADVERSARIAL_PERSONAS: PersonaTemplate[] = [
  { name: 'Proponent', trait: 'strongly advocating FOR the proposition' },
  { name: 'Opponent', trait: 'strongly advocating AGAINST the proposition' },
];

/**
 * Socratic mode personas - inquiry-based dialogue
 */
const SOCRATIC_PERSONAS: PersonaTemplate[] = [
  { name: 'Questioner', trait: 'asking probing questions to deepen understanding' },
  { name: 'Respondent', trait: 'providing thoughtful answers and explanations' },
];

/**
 * Expert panel mode personas - independent expert perspectives
 * Note: When perspectives are provided, those override these defaults
 */
const EXPERT_PANEL_PERSONAS: PersonaTemplate[] = [
  { name: 'Domain Expert', trait: 'deep domain knowledge and technical expertise' },
  { name: 'Generalist', trait: 'broad perspective and cross-domain connections' },
  { name: 'Skeptic', trait: 'critical evaluation and identifying weaknesses' },
  { name: 'Innovator', trait: 'forward-thinking and emerging trends focus' },
];

/**
 * Devils advocate mode personas - structured opposition
 */
const DEVILS_ADVOCATE_PERSONAS: PersonaTemplate[] = [
  { name: 'Advocate', trait: 'presenting and defending the main position' },
  { name: 'Challenger', trait: 'systematically challenging and finding flaws' },
  { name: 'Evaluator', trait: 'neutral evaluation and judgment' },
];

/**
 * Delphi mode personas - anonymized participants
 * Generated dynamically as "Participant N"
 */
const DELPHI_PERSONA_TEMPLATE: PersonaTemplate = {
  name: 'Participant',
  trait: 'providing independent, unbiased analysis',
};

/**
 * Red Team / Blue Team mode personas - security analysis
 */
const RED_TEAM_BLUE_TEAM_PERSONAS: PersonaTemplate[] = [
  { name: 'Red Team', trait: 'attacking, finding vulnerabilities and exploits' },
  { name: 'Blue Team', trait: 'defending, securing and patching vulnerabilities' },
];

/**
 * Map of debate modes to their persona sets
 */
const MODE_PERSONA_SETS: Record<DebateMode, PersonaTemplate[]> = {
  collaborative: COLLABORATIVE_PERSONAS,
  adversarial: ADVERSARIAL_PERSONAS,
  socratic: SOCRATIC_PERSONAS,
  'expert-panel': EXPERT_PANEL_PERSONAS,
  'devils-advocate': DEVILS_ADVOCATE_PERSONAS,
  delphi: [], // Special case: generated dynamically
  'red-team-blue-team': RED_TEAM_BLUE_TEAM_PERSONAS,
};

/**
 * Get personas for a specific mode and count
 *
 * @param mode - The debate mode
 * @param count - Number of personas needed
 * @returns Array of PersonaTemplates
 */
export function getPersonasForMode(mode: DebateMode, count: number): PersonaTemplate[] {
  // Special case: Delphi mode generates numbered participants
  if (mode === 'delphi') {
    return Array.from({ length: count }, (_, i) => ({
      name: `Participant ${i + 1}`,
      trait: DELPHI_PERSONA_TEMPLATE.trait,
    }));
  }

  const personas = MODE_PERSONA_SETS[mode];
  const result: PersonaTemplate[] = [];

  // Cycle through personas if count exceeds available
  for (let i = 0; i < count; i++) {
    result.push(personas[i % personas.length]);
  }

  return result;
}
```

### Step 5: Create index file

Create `src/agents/personas/index.ts`:

```typescript
/**
 * Persona System
 *
 * Provides persona templates and creation logic for multi-persona agents.
 */

export { getPersonasForMode } from './persona-sets.js';
export type { PersonaTemplate } from './types.js';
```

### Step 6: Run tests to verify they pass

Run: `pnpm test tests/unit/agents/personas/persona-sets.test.ts`
Expected: PASS

### Step 7: Commit

```bash
git add src/agents/personas/
git add tests/unit/agents/personas/
git commit -m "feat(agents): add mode-specific persona sets

- Define persona templates for all 7 debate modes
- Collaborative: Synthesizer, Analyst, Creative, Pragmatist
- Adversarial: Proponent/Opponent alternating
- Socratic: Questioner/Respondent
- Expert Panel: Domain Expert, Generalist, Skeptic, Innovator
- Devils Advocate: Advocate, Challenger, Evaluator
- Delphi: Generic numbered participants
- Red Team/Blue Team: alternating teams"
```

---

## Task 4: Persona Factory

**Files:**
- Create: `src/agents/persona-factory.ts`
- Modify: `src/agents/index.ts`
- Test: `tests/unit/agents/persona-factory.test.ts`

### Step 1: Write the failing tests

Create `tests/unit/agents/persona-factory.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPersonaAgents, PersonaAgentOptions } from '../../../src/agents/persona-factory.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import type { AgentConfig } from '../../../src/types/index.js';

describe('createPersonaAgents', () => {
  let registry: AgentRegistry;
  let mockFactory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    registry = new AgentRegistry();

    // Create mock factory that returns mock agents
    mockFactory = vi.fn((config: AgentConfig) => ({
      id: config.id,
      getInfo: () => config,
      setToolkit: vi.fn(),
      generateResponse: vi.fn(),
    }));

    // Register mock providers
    registry.registerProvider('anthropic', mockFactory as any, 'claude-sonnet-4-5');
    registry.registerProvider('openai', mockFactory as any, 'gpt-5.2');
  });

  describe('single provider', () => {
    it('should create agents with unique IDs', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 4,
        providers: ['anthropic'],
      };

      const agentIds = createPersonaAgents(registry, options);

      expect(agentIds).toHaveLength(4);
      expect(new Set(agentIds).size).toBe(4); // All unique
    });

    it('should create agents with persona system prompts', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 2,
        providers: ['anthropic'],
      };

      createPersonaAgents(registry, options);

      expect(mockFactory).toHaveBeenCalledTimes(2);

      const firstCall = mockFactory.mock.calls[0][0] as AgentConfig;
      expect(firstCall.systemPrompt).toContain('Synthesizer');
      expect(firstCall.systemPrompt).toContain('finding common ground');

      const secondCall = mockFactory.mock.calls[1][0] as AgentConfig;
      expect(secondCall.systemPrompt).toContain('Analyst');
    });
  });

  describe('multiple providers (round-robin)', () => {
    it('should distribute agents across providers', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 4,
        providers: ['anthropic', 'openai'],
      };

      const agentIds = createPersonaAgents(registry, options);

      // Check that we have calls to both providers
      const configs = mockFactory.mock.calls.map((call) => call[0] as AgentConfig);
      const providers = configs.map((c) => c.provider);

      expect(providers).toEqual(['anthropic', 'openai', 'anthropic', 'openai']);
    });

    it('should use correct models for each provider', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 2,
        providers: ['anthropic', 'openai'],
      };

      createPersonaAgents(registry, options);

      const configs = mockFactory.mock.calls.map((call) => call[0] as AgentConfig);

      expect(configs[0].model).toBe('claude-sonnet-4-5');
      expect(configs[1].model).toBe('gpt-5.2');
    });
  });

  describe('agent naming', () => {
    it('should name agents as Provider-PersonaName', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 2,
        providers: ['anthropic'],
      };

      createPersonaAgents(registry, options);

      const configs = mockFactory.mock.calls.map((call) => call[0] as AgentConfig);

      expect(configs[0].name).toBe('Claude (Synthesizer)');
      expect(configs[1].name).toBe('Claude (Analyst)');
    });
  });

  describe('error handling', () => {
    it('should throw if no providers available', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 4,
        providers: [],
      };

      expect(() => createPersonaAgents(registry, options)).toThrow('No providers available');
    });

    it('should throw if provider not registered', () => {
      const options: PersonaAgentOptions = {
        mode: 'collaborative',
        count: 4,
        providers: ['perplexity'], // Not registered
      };

      expect(() => createPersonaAgents(registry, options)).toThrow('Provider "perplexity" is not registered');
    });
  });
});
```

### Step 2: Run tests to verify they fail

Run: `pnpm test tests/unit/agents/persona-factory.test.ts`
Expected: FAIL with "Cannot find module"

### Step 3: Write implementation

Create `src/agents/persona-factory.ts`:

```typescript
/**
 * Persona Factory
 *
 * Creates multiple persona agents from available providers.
 * Uses round-robin distribution when multiple providers are available.
 */

import type { AgentConfig, AIProvider, DebateMode } from '../types/index.js';
import type { AgentRegistry } from './registry.js';
import { getPersonasForMode, type PersonaTemplate } from './personas/index.js';
import { DEFAULT_AGENT_NAMES } from '../config/providers.js';

/**
 * Options for creating persona agents
 */
export interface PersonaAgentOptions {
  /** Debate mode (determines persona set) */
  mode: DebateMode;
  /** Number of agents to create */
  count: number;
  /** Available providers (in priority order) */
  providers: AIProvider[];
}

/**
 * Provider display names for agent naming
 */
const PROVIDER_DISPLAY_NAMES: Record<AIProvider, string> = DEFAULT_AGENT_NAMES;

/**
 * Build system prompt for a persona
 */
function buildPersonaSystemPrompt(persona: PersonaTemplate): string {
  return `You are ${persona.name}, an AI participant with a perspective focused on ${persona.trait}.

Maintain this perspective consistently throughout the debate.
Your role is to provide insights from your unique viewpoint while engaging constructively with others.

Key behaviors:
- Stay true to your ${persona.name} perspective
- Support your positions with evidence and reasoning
- Acknowledge valid points from other perspectives
- Be willing to refine your position based on new information`;
}

/**
 * Create multiple persona agents using round-robin provider distribution
 *
 * @param registry - Agent registry to create agents in
 * @param options - Persona agent creation options
 * @returns Array of created agent IDs
 */
export function createPersonaAgents(
  registry: AgentRegistry,
  options: PersonaAgentOptions
): string[] {
  const { mode, count, providers } = options;

  if (providers.length === 0) {
    throw new Error('No providers available for creating persona agents');
  }

  // Validate all providers are registered
  for (const provider of providers) {
    if (!registry.hasProvider(provider)) {
      throw new Error(
        `Provider "${provider}" is not registered. ` +
        `Available: ${registry.getRegisteredProviders().join(', ')}`
      );
    }
  }

  // Get personas for the mode
  const personas = getPersonasForMode(mode, count);

  // Create agents with round-robin provider distribution
  const agentIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const provider = providers[i % providers.length];
    const persona = personas[i];
    const defaultModel = registry.getDefaultModel(provider);

    if (!defaultModel) {
      throw new Error(`No default model for provider "${provider}"`);
    }

    const agentId = `${provider}-persona-${i + 1}`;
    const displayName = PROVIDER_DISPLAY_NAMES[provider];

    const config: AgentConfig = {
      id: agentId,
      name: `${displayName} (${persona.name})`,
      provider,
      model: defaultModel,
      systemPrompt: buildPersonaSystemPrompt(persona),
    };

    registry.createAgent(config);
    agentIds.push(agentId);
  }

  return agentIds;
}
```

### Step 4: Run tests to verify they pass

Run: `pnpm test tests/unit/agents/persona-factory.test.ts`
Expected: PASS

### Step 5: Export from agents index

Modify `src/agents/index.ts` - add export:

```typescript
// Persona system
export { createPersonaAgents, type PersonaAgentOptions } from './persona-factory.js';
export { getPersonasForMode, type PersonaTemplate } from './personas/index.js';
```

### Step 6: Run full tests

Run: `pnpm test`
Expected: Some failures in session handler tests (expected)

### Step 7: Commit

```bash
git add src/agents/persona-factory.ts src/agents/index.ts tests/unit/agents/persona-factory.test.ts
git commit -m "feat(agents): add persona factory for creating multi-persona agents

- Round-robin distribution across available providers
- Persona-specific system prompts
- Agent naming: Provider (Persona)
- Validation for provider registration"
```

---

## Task 5: Update Session Handler

**Files:**
- Modify: `src/mcp/handlers/session.ts`
- Test: Update existing tests

### Step 1: Update handleStartRoundtable

Modify `src/mcp/handlers/session.ts`:

```typescript
// Add imports at top
import { createPersonaAgents } from '../../agents/persona-factory.js';
import { loadAgentLimitsConfig } from '../../config/agent-limits.js';
import { checkProviderAvailability } from '../../config/providers.js';

// Replace the agent determination logic in handleStartRoundtable (lines 51-69):

export async function handleStartRoundtable(
  args: unknown,
  debateEngine: DebateEngine,
  sessionManager: SessionManager,
  agentRegistry: AgentRegistry,
  keyPointsExtractor: KeyPointsExtractor | null
): Promise<ToolResponse> {
  try {
    // Validate input
    const input = StartRoundtableInputSchema.parse(args);

    // Load agent limits configuration
    const limitsConfig = loadAgentLimitsConfig();

    // Determine agent count
    let agentCount = input.agentCount ?? limitsConfig.defaultCount;
    agentCount = Math.min(agentCount, limitsConfig.maxAgents);

    // Get available providers
    const availability = checkProviderAvailability();
    const availableProviders = availability.available;

    if (availableProviders.length === 0) {
      return createErrorResponse(ERROR_MESSAGES.NO_AGENTS_AVAILABLE);
    }

    // Create persona agents
    const mode = input.mode || 'collaborative';
    const agentIds = createPersonaAgents(agentRegistry, {
      mode,
      count: agentCount,
      providers: availableProviders,
    });

    // Create debate config
    const config: DebateConfig = {
      topic: input.topic,
      mode,
      agents: agentIds,
      rounds: input.rounds || 3,
      perspectives: input.perspectives,
    };

    // ... rest of the function remains the same
```

### Step 2: Write integration test

Create `tests/unit/mcp/handlers/session-personas.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleStartRoundtable } from '../../../../src/mcp/handlers/session.js';
import { AgentRegistry } from '../../../../src/agents/registry.js';

describe('handleStartRoundtable with persona agents', () => {
  let mockRegistry: AgentRegistry;
  let mockDebateEngine: any;
  let mockSessionManager: any;

  beforeEach(() => {
    vi.resetModules();

    // Set up environment
    process.env.ROUNDTABLE_MAX_AGENTS = '5';
    process.env.ROUNDTABLE_DEFAULT_AGENT_COUNT = '4';

    mockRegistry = new AgentRegistry();

    // Register mock provider
    mockRegistry.registerProvider(
      'anthropic',
      (config) => ({
        ...config,
        setToolkit: vi.fn(),
        generateResponse: vi.fn().mockResolvedValue({
          agentId: config.id,
          agentName: config.name,
          position: 'Test position',
          reasoning: 'Test reasoning',
          confidence: 0.8,
          timestamp: new Date(),
        }),
        getInfo: () => config,
      }) as any,
      'claude-sonnet-4-5'
    );

    mockDebateEngine = {
      executeRounds: vi.fn().mockResolvedValue([
        {
          roundNumber: 1,
          responses: [],
          consensus: { agreementLevel: 0.5, commonGround: [], disagreementPoints: [], summary: 'Test' },
        },
      ]),
    };

    mockSessionManager = {
      createSession: vi.fn().mockResolvedValue({
        id: 'test-session',
        topic: 'Test',
        mode: 'collaborative',
        agentIds: [],
        status: 'active',
        currentRound: 1,
        totalRounds: 3,
        responses: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      saveResponses: vi.fn(),
    };
  });

  it('should create persona agents with default count', async () => {
    const result = await handleStartRoundtable(
      { topic: 'Test topic' },
      mockDebateEngine,
      mockSessionManager,
      mockRegistry,
      null
    );

    // Should have created 4 agents (default)
    expect(mockRegistry.getAllAgentIds()).toHaveLength(4);
  });

  it('should respect agentCount parameter', async () => {
    const result = await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 2 },
      mockDebateEngine,
      mockSessionManager,
      mockRegistry,
      null
    );

    expect(mockRegistry.getAllAgentIds()).toHaveLength(2);
  });

  it('should cap agentCount at maxAgents', async () => {
    const result = await handleStartRoundtable(
      { topic: 'Test topic', agentCount: 10 },
      mockDebateEngine,
      mockSessionManager,
      mockRegistry,
      null
    );

    // Should be capped at 5 (ROUNDTABLE_MAX_AGENTS)
    expect(mockRegistry.getAllAgentIds()).toHaveLength(5);
  });
});
```

### Step 3: Run tests

Run: `pnpm test tests/unit/mcp/handlers/session-personas.test.ts`
Expected: PASS

### Step 4: Run full test suite and fix failures

Run: `pnpm test`
Fix any test failures related to the schema changes.

### Step 5: Commit

```bash
git add src/mcp/handlers/session.ts tests/unit/mcp/handlers/session-personas.test.ts
git commit -m "feat(mcp): integrate persona factory in start_roundtable handler

- Create persona agents based on agentCount parameter
- Round-robin distribution across available providers
- Respect ROUNDTABLE_MAX_AGENTS and ROUNDTABLE_DEFAULT_AGENT_COUNT"
```

---

## Task 6: Update Tool Description and Documentation

**Files:**
- Modify: `src/mcp/tools.ts`
- Modify: `.env.example`
- Modify: `README.md`

### Step 1: Update tool description

Modify `src/mcp/tools.ts` (START_ROUNDTABLE_TOOL):

```typescript
const START_ROUNDTABLE_TOOL: Tool = {
  name: 'start_roundtable',
  description: `Start a new AI debate roundtable on a given topic.

## How It Works

Creates multiple "persona agents" with distinct perspectives based on the debate mode.
Each persona has a unique viewpoint and system prompt to ensure diverse discussion.

## Agent Distribution

- **Single API key**: All personas use the same provider
- **Multiple API keys**: Personas are distributed round-robin across providers

## Parameters

- **topic** (required): The debate topic
- **mode** (optional): Debate mode (collaborative, adversarial, socratic, expert-panel, devils-advocate, delphi, red-team-blue-team)
- **agentCount** (optional): Number of persona agents (default: 4, max: 5)
- **rounds** (optional): Number of debate rounds (default: 3)
- **perspectives** (optional): Custom perspectives for expert-panel mode

## Example

\`\`\`json
{
  "topic": "Should AI systems have consciousness?",
  "mode": "collaborative",
  "agentCount": 4,
  "rounds": 3
}
\`\`\``,
  inputSchema: toMcpJsonSchema(StartRoundtableInputSchema),
};
```

### Step 2: Update .env.example

Add to `.env.example`:

```bash
# Agent Limits Configuration
# Maximum number of persona agents per debate (default: 5)
ROUNDTABLE_MAX_AGENTS=5
# Default agent count when not specified (default: 4)
ROUNDTABLE_DEFAULT_AGENT_COUNT=4
```

### Step 3: Commit

```bash
git add src/mcp/tools.ts .env.example
git commit -m "docs: update tool description and environment variables

- Update start_roundtable description with persona agent info
- Document ROUNDTABLE_MAX_AGENTS and ROUNDTABLE_DEFAULT_AGENT_COUNT"
```

---

## Task 7: Final Verification

### Step 1: Run full test suite

Run: `pnpm test`
Expected: All tests pass

### Step 2: Run type check

Run: `pnpm typecheck`
Expected: No errors

### Step 3: Run linter

Run: `pnpm lint`
Expected: No errors

### Step 4: Format code

Run: `pnpm format`
Expected: Files formatted

### Step 5: Run integration test (optional)

If API keys available:
Run: `pnpm test:integration`

### Step 6: Final commit

```bash
git add -A
git commit -m "chore: final cleanup and verification"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Agent Limits Config | `src/config/agent-limits.ts` |
| 2 | Update Zod Schemas | `src/types/schemas.ts`, `src/types/index.ts` |
| 3 | Mode-Specific Personas | `src/agents/personas/` |
| 4 | Persona Factory | `src/agents/persona-factory.ts` |
| 5 | Session Handler | `src/mcp/handlers/session.ts` |
| 6 | Documentation | `src/mcp/tools.ts`, `.env.example` |
| 7 | Verification | All files |

**Total new files:** 5
**Total modified files:** 6
**Total test files:** 4
