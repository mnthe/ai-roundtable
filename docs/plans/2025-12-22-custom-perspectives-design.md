# Custom Perspectives for Expert Panel Mode

> **Status**: Approved (Updated)
> **Created**: 2025-12-22
> **Updated**: 2025-12-24
> **Priority**: P1

## Overview

Extend Expert Panel mode to support user-defined custom perspectives instead of the fixed 4 perspectives (technical, economic, ethical, social). This allows more flexible multi-angle analysis while maintaining the Roundtable philosophy of structured debate.

**Key Enhancements (2025-12-24):**
- Perspective with optional description support
- Light Model auto-generation when perspectives not provided
- Enhanced prompts for perspective differentiation
- Round-based behavior evolution

## Motivation

The current Expert Panel mode assigns fixed perspectives to agents:
- Technical, Economic, Ethical, Social

**Problems:**
1. Fixed perspectives don't match all topics (e.g., "Determinism/Free Will" needs Physics/Philosophy/Neuroscience)
2. Generic prompts lead to overlapping analysis between agents
3. No perspective-specific guidance for evidence types or key questions

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Perspective format | Name required + Description optional | Simple cases stay simple, detailed when needed |
| Assignment method | Round-robin only | YAGNI - array order provides control |
| Default handling | Light Model auto-generation | Topic-appropriate perspectives automatically |
| Prompt enhancement | Autogen includes prompts | Single API call for perspectives + guidance |

## API Design

### Input Schema

```typescript
// src/types/schemas.ts

// Perspective can be string or object with optional description
const PerspectiveSchema = z.union([
  z.string().min(1),
  z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  }),
]);

export const StartRoundtableInputSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(2000),
  mode: DebateModeSchema.optional().default('collaborative'),
  agents: z.array(z.string().min(1)).optional(),
  rounds: z.number().int().positive().optional().default(3),
  exitOnConsensus: z.boolean().optional(),

  // NEW: Custom perspectives for expert-panel mode
  perspectives: z.array(PerspectiveSchema)
    .optional()
    .describe('Custom analysis perspectives for expert-panel mode'),
});
```

### Usage Examples

```typescript
// Example 1: Auto-generated perspectives (Light Model)
start_roundtable({
  topic: "Is the universe deterministic?",
  mode: "expert-panel",
  agents: ["anthropic-default", "openai-default", "google-default"]
})
// → Light Model generates: ["Physics perspective", "Philosophy perspective", "Neuroscience perspective"]

// Example 2: Simple custom perspectives (names only)
start_roundtable({
  topic: "AI regulation policy",
  mode: "expert-panel",
  perspectives: [
    "Technical feasibility",
    "Legal implications",
    "Economic impact"
  ]
})

// Example 3: Detailed custom perspectives (with descriptions)
start_roundtable({
  topic: "Quantum computing adoption",
  mode: "expert-panel",
  perspectives: [
    { name: "Hardware perspective", description: "Focus on qubit stability, error correction, and scalability" },
    { name: "Algorithm perspective", description: "Focus on quantum advantage, NISQ limitations, and use cases" },
    { name: "Industry perspective" }  // description optional
  ]
})
```

### Behavior Rules

| Condition | Behavior |
|-----------|----------|
| `mode !== 'expert-panel'` | `perspectives` ignored |
| `perspectives` not provided | **Light Model auto-generates** based on topic and agent count |
| `perspectives: []` (empty) | Light Model auto-generates |
| `perspectives` provided | Use provided perspectives |

### Assignment Logic (Round-Robin)

```
perspectives: [A, B, C]
agents: [Claude, ChatGPT, Gemini]

Assignment:
  Claude   → A
  ChatGPT  → B
  Gemini   → C

Code: perspectives[agentIndex % perspectives.length]
```

## Light Model Auto-Generation

### When Triggered

- `mode === 'expert-panel'` AND `perspectives` not provided (or empty)

### Generation Process

```typescript
// 1. Build prompt for Light Model
const prompt = `
Topic: "${topic}"
Number of agents: ${agents.length}

Generate ${agents.length} distinct analysis perspectives for this topic.
Each perspective should:
- Be clearly different from others (no overlap)
- Be relevant to the topic
- Have depth potential for expert analysis

Return JSON array:
[
  {
    "name": "Perspective name",
    "description": "What this perspective focuses on",
    "focusAreas": ["area1", "area2"],
    "evidenceTypes": ["type1", "type2"],
    "keyQuestions": ["question1", "question2"],
    "antiPatterns": ["what NOT to do from this perspective"]
  }
]
`;

// 2. Call Light Model (claude-haiku-4-5 / gpt-5-mini / etc.)
const generated = await lightAgent.generateRawCompletion(prompt);

// 3. Parse and use
const perspectives = JSON.parse(generated);
```

### Generated Perspective Schema

```typescript
interface GeneratedPerspective {
  name: string;
  description: string;
  focusAreas: string[];
  evidenceTypes: string[];
  keyQuestions: string[];
  antiPatterns: string[];
}
```

### Example Generation

**Input:**
```
Topic: "Is the universe deterministic?"
Agents: 3
```

**Output:**
```json
[
  {
    "name": "Physics perspective",
    "description": "Analyze through quantum mechanics, causality, and physical laws",
    "focusAreas": ["Quantum indeterminacy", "Causal chains", "Physical constants"],
    "evidenceTypes": ["Experimental data", "Mathematical proofs", "Physical models"],
    "keyQuestions": ["Does quantum randomness break determinism?", "Can physical laws predict all outcomes?"],
    "antiPatterns": ["Making moral judgments", "Reducing consciousness to physics"]
  },
  {
    "name": "Philosophy perspective",
    "description": "Analyze through metaphysics, free will debates, and logical arguments",
    "focusAreas": ["Compatibilism vs incompatibilism", "Moral responsibility", "Agency"],
    "evidenceTypes": ["Logical arguments", "Thought experiments", "Philosophical traditions"],
    "keyQuestions": ["Is free will compatible with determinism?", "What does 'could have done otherwise' mean?"],
    "antiPatterns": ["Claiming empirical proof for metaphysical claims", "Ignoring established philosophical frameworks"]
  },
  {
    "name": "Neuroscience perspective",
    "description": "Analyze through brain mechanisms, decision-making processes, and consciousness",
    "focusAreas": ["Neural correlates of decision", "Libet experiments", "Predictive processing"],
    "evidenceTypes": ["Brain imaging studies", "Clinical observations", "Computational models"],
    "keyQuestions": ["Do brain states determine decisions?", "When does 'deciding' happen neurally?"],
    "antiPatterns": ["Equating correlation with causation", "Claiming neuroscience resolves philosophical questions"]
  }
]
```

## Prompt Enhancement

### P0-1: Perspective Differentiation

**Added to transformContext:**

```typescript
// Inject perspective context
const perspectiveContext = {
  yours: perspective.name,
  others: allPerspectives.filter(p => p.name !== perspective.name).map(p => p.name),
};

const differentiationPrompt = `
## Your Perspective Assignment

You are analyzing from: **${perspectiveContext.yours}**
Other panelists cover: ${perspectiveContext.others.join(', ')}

**Critical Rules:**
- DO NOT analyze areas belonging to other perspectives
- If referencing another domain, state "This is outside my expertise, but..."
- Your value = DEPTH in your perspective, not BREADTH across all
`;
```

### P0-2: Output Structure Enhancement

**Updated sections in config:**

```typescript
// First round sections
firstRoundSections: createOutputSections([
  ['[ANALYTICAL FRAMEWORK]', "The lens/methodology you're using"],
  ['[UNIQUE INSIGHT]', 'What ONLY this perspective can reveal (others cannot see this)'],
  ['[KEY FINDINGS]', 'Main conclusions from your expertise'],
  ['[BLIND SPOTS]', 'What this perspective CANNOT adequately address (be honest)'],
  ['[CONFIDENCE & LIMITATIONS]', 'Certainty levels and knowledge gaps'],
]),

// Subsequent round sections
subsequentRoundSections: createOutputSections([
  ['[PERSPECTIVE UPDATE]', 'How other perspectives informed/challenged your view'],
  ['[UNIQUE INSIGHT]', 'New insights only YOUR perspective provides'],
  ['[REVISED FINDINGS]', 'Updated conclusions incorporating other views'],
  ['[REMAINING BLIND SPOTS]', 'What your perspective still cannot address'],
  ['[CROSS-PERSPECTIVE SYNTHESIS]', 'How your view connects with others'],
]),
```

**Updated verification loop:**

```typescript
verificationLoop: {
  checklistItems: [
    // Existing
    'Is every major claim supported by evidence or reasoning?',
    'Did I clearly state my confidence levels?',
    'Did I acknowledge limitations and uncertainties?',
    // New
    'Does my UNIQUE INSIGHT offer something others genuinely cannot?',
    'Did I honestly acknowledge my BLIND SPOTS?',
    'Am I providing depth in MY area, not shallow coverage of all?',
    'Did I stay focused on my assigned perspective?',
  ],
}
```

### P1: Round-Based Behavior Evolution

```typescript
function buildRoleAnchorForRound(round: number, perspective: GeneratedPerspective): RoleAnchorConfig {
  if (round === 1) {
    return {
      emoji: '🎯',
      title: `${perspective.name.toUpperCase()} EXPERT - ESTABLISHING POSITION`,
      mission: 'Stake out your unique analytical territory. Be bold.',
      additionalContext: `
Round 1: Other experts have NOT yet spoken.
Your job: Establish what ${perspective.name} uniquely reveals.
Do NOT hedge or anticipate others - state your perspective clearly.

Focus areas: ${perspective.focusAreas.join(', ')}
Key questions to address: ${perspective.keyQuestions.join('; ')}
      `,
    };
  } else {
    return {
      emoji: '🔄',
      title: `${perspective.name.toUpperCase()} EXPERT - SYNTHESIS MODE`,
      mission: 'Integrate insights while defending your unique contribution.',
      additionalContext: `
Round ${round}: You have seen other perspectives.
Your job:
1. Acknowledge valid points from other perspectives
2. Defend/refine what makes YOUR perspective essential
3. Identify where perspectives complement or conflict
4. Propose synthesis where possible

Maintain focus on: ${perspective.focusAreas.join(', ')}
      `,
    };
  }
}
```

### P2: Evidence Type Differentiation

**Injected into prompts when using generated perspectives:**

```typescript
const evidencePrompt = perspective.evidenceTypes ? `
## Evidence Standards for ${perspective.name}

Acceptable evidence types:
${perspective.evidenceTypes.map(e => `- ${e}`).join('\n')}

What NOT to do:
${perspective.antiPatterns.map(a => `- ${a}`).join('\n')}
` : '';
```

## Data Flow

```
MCP Input
    ↓
handleStartRoundtable()
    ↓
perspectives provided? ─── NO ──→ Light Model generates perspectives
    │                                       ↓
    YES                              GeneratedPerspective[]
    ↓                                       ↓
Normalize to GeneratedPerspective[] ←───────┘
    ↓
DebateConfig { perspectives: GeneratedPerspective[] }
    ↓
SessionManager.createSession()
    ↓
Session { perspectives } → SQLiteStorage (JSON)
    ↓
[continue_roundtable]
    ↓
DebateEngine.executeRounds()
    ↓
DebateContext { perspectives }
    ↓
ExpertPanelMode.executeRound()
    ├── Build perspectiveContext (yours/others)
    ├── Build round-specific prompts
    └── transformContext with enhanced prompts
```

## Implementation Details

### Type Changes (src/types/index.ts)

```typescript
/**
 * Perspective definition for expert-panel mode
 */
export interface Perspective {
  name: string;
  description?: string;
}

/**
 * Generated perspective with full prompt context
 */
export interface GeneratedPerspective extends Perspective {
  focusAreas: string[];
  evidenceTypes: string[];
  keyQuestions: string[];
  antiPatterns: string[];
}

export interface Session {
  // ... existing fields ...
  perspectives?: GeneratedPerspective[];
}

export interface DebateConfig {
  // ... existing fields ...
  perspectives?: Array<string | Perspective>;
}

export interface DebateContext {
  // ... existing fields ...
  perspectives?: GeneratedPerspective[];
}
```

### Storage Changes (src/storage/sqlite.ts)

```sql
CREATE TABLE sessions (
  -- ... existing columns ...
  perspectives TEXT  -- JSON array of GeneratedPerspective or NULL
);
```

### New Module: Perspective Generator

```typescript
// src/modes/utils/perspective-generator.ts

export async function generatePerspectives(
  topic: string,
  agentCount: number,
  lightAgent: BaseAgent
): Promise<GeneratedPerspective[]> {
  const prompt = buildGenerationPrompt(topic, agentCount);
  const response = await lightAgent.generateRawCompletion(prompt);
  return parsePerspectives(response);
}

export function normalizePerspectives(
  input: Array<string | Perspective> | undefined,
  generated: GeneratedPerspective[]
): GeneratedPerspective[] {
  if (!input || input.length === 0) {
    return generated;
  }

  return input.map(p => {
    if (typeof p === 'string') {
      return {
        name: p,
        description: '',
        focusAreas: [],
        evidenceTypes: [],
        keyQuestions: [],
        antiPatterns: [],
      };
    }
    return {
      name: p.name,
      description: p.description || '',
      focusAreas: [],
      evidenceTypes: [],
      keyQuestions: [],
      antiPatterns: [],
    };
  });
}
```

## Files to Change

| # | File | Change | Complexity |
|---|------|--------|------------|
| 1 | `src/types/index.ts` | Add Perspective, GeneratedPerspective interfaces | Low |
| 2 | `src/types/schemas.ts` | Update StartRoundtableInputSchema with PerspectiveSchema | Low |
| 3 | `src/storage/sqlite.ts` | Add perspectives column, update CRUD | Low |
| 4 | `src/core/session-manager.ts` | Pass perspectives in createSession | Low |
| 5 | `src/core/debate-engine.ts` | Include perspectives in DebateContext, trigger generation | Medium |
| 6 | `src/mcp/handlers/session.ts` | Pass perspectives from input | Low |
| 7 | `src/modes/utils/perspective-generator.ts` | **NEW** - Light Model generation logic | Medium |
| 8 | `src/modes/expert-panel.ts` | Use GeneratedPerspective, enhanced prompts | Medium |
| 9 | `src/modes/configs/expert-panel.config.ts` | Updated sections and verification | Low |
| 10 | `tests/unit/modes/expert-panel.test.ts` | Add custom/generated perspectives tests | Medium |
| 11 | `tests/unit/modes/perspective-generator.test.ts` | **NEW** - Generator tests | Low |

**Estimated changes:** ~300-400 lines

## Test Cases

### Unit Tests

```typescript
describe('Perspective Generator', () => {
  it('should generate topic-appropriate perspectives');
  it('should generate correct number of perspectives for agent count');
  it('should include all required fields in generated perspectives');
  it('should handle Light Model errors gracefully');
});

describe('ExpertPanelMode - Custom Perspectives', () => {
  it('should use default perspectives when not provided (backwards compat)');
  it('should trigger Light Model generation when perspectives empty');
  it('should use provided string perspectives');
  it('should use provided object perspectives with descriptions');
  it('should build differentiation prompts with yours/others context');
  it('should use round-specific role anchors');
  it('should include UNIQUE INSIGHT and BLIND SPOTS sections');
});

describe('SQLiteStorage - Perspectives', () => {
  it('should store and retrieve GeneratedPerspective[]');
  it('should handle null perspectives (legacy sessions)');
  it('should handle migration from string[] to GeneratedPerspective[]');
});
```

## Migration

**No breaking changes** - existing sessions without perspectives continue to work.

| Scenario | Behavior |
|----------|----------|
| Legacy session (no perspectives) | `NULL` → Light Model generates on next round |
| New session without perspectives | Light Model generates before first round |
| New session with string[] | Normalized to GeneratedPerspective[] |
| New session with Perspective[] | Normalized with empty arrays for missing fields |

## Performance Considerations

| Operation | Latency | Notes |
|-----------|---------|-------|
| Light Model generation | 1-2 seconds | One-time at session start |
| Debate round | 60+ seconds | Perspectives don't add overhead after generation |

Light Model generation adds minimal latency compared to total debate time.

## Documentation Updates

| File | Update |
|------|--------|
| `.claude/CLAUDE.md` | Add perspectives option, auto-generation behavior |
| `.claude/rules/adding-modes.md` | Reference perspective system for expert-panel |
| `README.md` | Add custom perspectives examples |

## Future Improvements

1. **Perspective similarity detection**: Warn if user-provided perspectives overlap too much
2. **Perspective templates**: Pre-built perspective sets for common domains (legal, technical, business)
3. **Cross-mode perspectives**: Allow perspectives in other modes (e.g., red-team/blue-team with custom attack vectors)
