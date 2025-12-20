# 4-Layer System Implementation Work Plan

## Overview

This document defines the implementation plan for the 4-Layer Debate Prompt System improvements based on roundtable consensus (December 2024). All work items are derived from design decisions documented in `4-layer-system-design.md`.

---

## Work Item Summary

| ID | Work Item | Priority | Complexity | Dependencies |
|----|-----------|----------|------------|--------------|
| W1 | Epistemic Labeling Protocol | P0 | Medium | None |
| W2 | Strict Numeric Citation System | P0 | Low | None |
| W3 | Verification Question Framework | P1 | Medium | W1, W2 |
| W4 | Perspective Anchor System | P1 | Medium | None |
| W5 | Groupthink Detection Engine | P2 | High | W1, W3 |
| W6 | Safety Evaluator Protocol | P2 | High | W5 |
| W7 | Exit Criteria Controller | P2 | Medium | W3, W5 |
| W8 | Progressive Summarization | P3 | High | W1, W2 |
| W9 | DebateState Data Structure | P3 | High | W1, W2, W8 |
| W10 | Claim/Evidence ID System | P3 | Medium | W9 |

---

## Phase 1: Foundation (P0)

### W1: Epistemic Labeling Protocol

**Objective**: Add [FACT]/[INFER]/[ASSUME] labeling to all agent prompts and response parsing.

**Files to Modify**:
- `src/agents/base.ts` - Add epistemic labeling instructions to `buildSystemPrompt()`
- `src/types/index.ts` - Add `EpistemicLabel` type and `EpistemicClaim` interface
- `src/core/consensus-analyzer.ts` - Parse epistemic labels from responses

**Implementation Details**:

```typescript
// src/types/index.ts
export type EpistemicLabel = 'FACT' | 'INFER' | 'ASSUME';

export interface EpistemicClaim {
  text: string;
  label: EpistemicLabel;
  citationId?: number;  // Required for FACT, optional for INFER
}

export interface EnhancedAgentResponse extends AgentResponse {
  epistemicClaims?: EpistemicClaim[];
}
```

```typescript
// src/agents/base.ts - Add to buildSystemPrompt()
const EPISTEMIC_LABELING_PROMPT = `
=== EPISTEMIC LABELING ===

Label every substantive claim with ONE tag:
- [FACT] = directly verifiable; requires citation [n]
- [INFER] = logical derivation from stated facts
- [ASSUME] = unverified premise or value choice

Format: "Your claim here.[FACT][1]"

Citation Rules:
- MANDATORY for [FACT] claims
- ENCOURAGED for [INFER] when relying on specific data
- [ASSUME] MUST NOT carry citations
`;
```

**Acceptance Criteria**:
- [ ] All mode prompts include epistemic labeling instructions
- [ ] Response parser extracts epistemic labels
- [ ] Unit tests verify label extraction accuracy
- [ ] Integration test confirms agents produce labeled claims

---

### W2: Strict Numeric Citation System

**Objective**: Enforce `[1][2]` citation format across all agents with mandatory References section.

**Files to Modify**:
- `src/agents/base.ts` - Update citation instructions in prompts
- `src/types/index.ts` - Add `NumericCitation` interface
- `src/utils/citation-parser.ts` - Create citation extraction utility

**Implementation Details**:

```typescript
// src/utils/citation-parser.ts
export interface NumericCitation {
  id: number;
  title: string;
  url?: string;
  snippet?: string;
}

export function extractNumericCitations(text: string): {
  citedIds: number[];
  references: NumericCitation[];
} {
  const citationPattern = /\[(\d+)(?:-(\d+))?\]/g;
  const referenceSectionPattern = /References:\n([\s\S]+)$/;
  // Implementation...
}

export function validateCitationIntegrity(
  text: string,
  references: NumericCitation[]
): { valid: boolean; errors: string[] } {
  // Verify all cited [n] have corresponding reference
  // Implementation...
}
```

**Prompt Addition**:
```
=== CITATION FORMAT ===

Use strict numeric citations:
- Single reference: [1]
- Multiple: [1][2] or [1-3]

End response with mandatory References section:
References:
[1] Author (Year). Title. Source.
[2] ...
```

**Acceptance Criteria**:
- [ ] Citation parser correctly extracts `[1]`, `[1][2]`, `[1-3]` patterns
- [ ] Validation catches orphan citations (cited but not in references)
- [ ] Validation catches unused references (in references but not cited)
- [ ] All agent prompts enforce numeric citation format

---

## Phase 2: Verification & Anti-Conformity (P1)

### W3: Verification Question Framework

**Objective**: Implement 7 universal + 2 mode-specific + 1 opt-in verification questions.

**Files to Modify**:
- `src/modes/base.ts` - Add verification question interface
- `src/modes/*.ts` - Add mode-specific questions to each mode
- `src/types/index.ts` - Add `VerificationResult` type
- `src/core/debate-engine.ts` - Add verification execution

**Implementation Details**:

```typescript
// src/types/index.ts
export interface VerificationQuestion {
  id: string;
  category: 'universal' | 'mode-specific' | 'high-stakes';
  question: string;
  checker?: (response: AgentResponse) => boolean;
}

export interface VerificationResult {
  questionId: string;
  passed: boolean;
  reason?: string;
}

// src/modes/base.ts
export const UNIVERSAL_VERIFICATION_QUESTIONS: VerificationQuestion[] = [
  { id: 'U1', category: 'universal', question: 'Core position stated explicitly?' },
  { id: 'U2', category: 'universal', question: 'All [FACT] claims cited?' },
  { id: 'U3', category: 'universal', question: '>=2 alternatives considered with rejection rationale?' },
  { id: 'U4', category: 'universal', question: 'Top 3 failure modes + mitigations identified?' },
  { id: 'U5', category: 'universal', question: 'What remains uncertain explicitly stated?' },
  { id: 'U6', category: 'universal', question: 'No internal contradictions?' },
  { id: 'U7', category: 'universal', question: 'Avoids harmful guidance?' },
];

export interface DebateModeStrategy {
  readonly name: string;
  readonly modeSpecificQuestions: VerificationQuestion[];  // NEW
  executeRound(...): Promise<AgentResponse[]>;
  buildAgentPrompt(context: DebateContext): string;
}
```

**Mode-Specific Questions**:
```typescript
// src/modes/adversarial.ts
readonly modeSpecificQuestions: VerificationQuestion[] = [
  { id: 'ADV1', category: 'mode-specific', question: 'Opponent position steel-manned?' },
  { id: 'ADV2', category: 'mode-specific', question: 'Strongest counter-argument provided?' },
];

// src/modes/devils-advocate.ts
readonly modeSpecificQuestions: VerificationQuestion[] = [
  { id: 'DA1', category: 'mode-specific', question: 'Assigned stance maintained throughout?' },
  { id: 'DA2', category: 'mode-specific', question: 'Consensus actively challenged?' },
];
```

**Opt-in High-Stakes Question**:
```typescript
// src/types/index.ts
export interface SessionConfig {
  // ... existing fields
  highStakesOptIn?: boolean;
  highStakesCategory?: 'security' | 'medical-legal' | 'agentic' | 'safety-critical';
}

// High-stakes question added when opted-in
const HIGH_STAKES_QUESTION: VerificationQuestion = {
  id: 'HS1',
  category: 'high-stakes',
  question: 'Safety controls defined? (scope boundaries, approval gates, abort mechanisms)',
};
```

**Acceptance Criteria**:
- [ ] All 7 universal questions embedded in base verification
- [ ] Each mode has exactly 2 mode-specific questions
- [ ] High-stakes opt-in mechanism in `start_roundtable` MCP tool
- [ ] Verification results included in round metadata

---

### W4: Perspective Anchor System

**Objective**: Assign fixed perspective anchors to agents with flexible contribution intensity.

**Files to Modify**:
- `src/types/index.ts` - Add `PerspectiveAnchor` type
- `src/agents/base.ts` - Add anchor to agent config
- `src/core/debate-engine.ts` - Anchor assignment logic
- `src/modes/base.ts` - Include anchor in context

**Implementation Details**:

```typescript
// src/types/index.ts
export type PerspectiveAnchor =
  | 'Risk-Attentive'
  | 'Implementation-Focused'
  | 'Evidence-Calibrated'
  | 'Systems-Aware';

export const PERSPECTIVE_ANCHOR_DEFINITIONS: Record<PerspectiveAnchor, string> = {
  'Risk-Attentive': 'Focus on safety, robustness, failure modes, adversarial scenarios, worst-case analysis',
  'Implementation-Focused': 'Focus on practicality, feasibility, cost, timeline, resource constraints',
  'Evidence-Calibrated': 'Focus on data quality, uncertainty quantification, empirical grounding, confidence bounds',
  'Systems-Aware': 'Focus on long-term effects, second-order consequences, ecosystem impact',
};

export interface AgentConfig {
  // ... existing fields
  perspectiveAnchor?: PerspectiveAnchor;
}
```

```typescript
// src/core/debate-engine.ts
function assignPerspectiveAnchors(agents: BaseAgent[]): void {
  const anchors: PerspectiveAnchor[] = [
    'Risk-Attentive',
    'Implementation-Focused',
    'Evidence-Calibrated',
    'Systems-Aware',
  ];

  agents.forEach((agent, index) => {
    agent.config.perspectiveAnchor = anchors[index % anchors.length];
  });
}
```

**Prompt Integration**:
```typescript
// Add to buildSystemPrompt()
if (this.config.perspectiveAnchor) {
  prompt += `
=== YOUR PERSPECTIVE ANCHOR ===
Framework: ${this.config.perspectiveAnchor}
Focus: ${PERSPECTIVE_ANCHOR_DEFINITIONS[this.config.perspectiveAnchor]}

Apply this lens when relevant to the topic. Contribution intensity should match topic relevance.
`;
}
```

**Acceptance Criteria**:
- [ ] Agents automatically receive anchor assignment at session start
- [ ] Anchor appears in agent prompts with definition
- [ ] Anchor included in AgentResponse for analytics
- [ ] Unit test verifies round-robin assignment

---

## Phase 3: Safety & Detection (P2)

### W5: Groupthink Detection Engine

**Objective**: Implement hybrid 2-stage groupthink detection with automatic intervention.

**Files to Create**:
- `src/core/groupthink-detector.ts` - Detection engine

**Files to Modify**:
- `src/core/debate-engine.ts` - Integrate detector into round execution
- `src/types/index.ts` - Add detection types

**Implementation Details**:

```typescript
// src/types/index.ts
export interface GroupthinkTrigger {
  type: 'stagnation' | 'early-convergence';
  round: number;
  details: StagnationDetails | EarlyConvergenceDetails;
}

export interface StagnationDetails {
  newFactsPerAgent: number;
  meanConfidenceChange: number;
  stanceStdDev: number;
  consecutiveRounds: number;
}

export interface EarlyConvergenceDetails {
  highConfidenceAgentRatio: number;
  sourceCount: number;
  premiseOverlap: number;
  semanticClusters: number;
}

// src/core/groupthink-detector.ts
export class GroupthinkDetector {
  private readonly STAGNATION_THRESHOLDS = {
    newFactsPerAgent: 1,
    meanConfidenceChange: 0.10,
    stanceStdDev: 0.15,
    consecutiveRounds: 2,
  };

  private readonly EARLY_CONVERGENCE_THRESHOLDS = {
    round: 2,
    highConfidenceRatio: 0.75,
    confidenceThreshold: 0.85,
    minSources: 3,
    maxPremiseOverlap: 0.70,
    minSemanticClusters: 2,
  };

  checkStagnation(
    currentRound: number,
    responses: AgentResponse[],
    previousResponses: AgentResponse[]
  ): GroupthinkTrigger | null {
    // Implementation...
  }

  checkEarlyConvergence(
    currentRound: number,
    responses: AgentResponse[]
  ): GroupthinkTrigger | null {
    // Implementation...
  }

  async triggerCriticalObjectionRound(
    agents: BaseAgent[],
    context: DebateContext,
    trigger: GroupthinkTrigger
  ): Promise<AgentResponse[]> {
    const objectionContext: DebateContext = {
      ...context,
      modePrompt: `
=== CRITICAL OBJECTION ROUND ===
Groupthink detected: ${trigger.type}

You MUST:
1. Provide at least ONE counterargument to current consensus
2. Identify ONE alternative hypothesis not yet considered
3. Challenge ONE assumption that has been taken for granted

This is a mandatory intervention. Do not simply agree with prior positions.
`,
    };
    // Execute objection round...
  }
}
```

**Acceptance Criteria**:
- [ ] Stagnation detection fires after 2 consecutive rounds of low activity
- [ ] Early convergence detection fires by round 2 with diversity gate
- [ ] Critical Objection Round executes automatically when triggered
- [ ] Human escalation path exists for failed objection rounds
- [ ] All thresholds configurable

---

### W6: Safety Evaluator Protocol

**Objective**: Implement 3-tier Adaptive Safety Protocol.

**Files to Create**:
- `src/core/safety-evaluator.ts` - Safety evaluation logic
- `src/core/safety-triggers.ts` - Trigger definitions

**Files to Modify**:
- `src/core/debate-engine.ts` - Integrate safety checks
- `src/types/index.ts` - Add safety types

**Implementation Details**:

```typescript
// src/types/index.ts
export type SafetyTier = 'lightweight' | 'triggered' | 'full-evaluation';

export interface SafetyTrigger {
  category: 'mode' | 'topic' | 'intent' | 'context';
  triggered: boolean;
  reason?: string;
}

export interface SafetyEvaluation {
  tier: SafetyTier;
  triggers: SafetyTrigger[];
  passed: boolean;
  concerns?: string[];
  recommendations?: string[];
}

// src/core/safety-triggers.ts
export const MODE_TRIGGERS: DebateMode[] = ['adversarial', 'red-team-blue-team', 'devils-advocate'];

export const TOPIC_PATTERNS: RegExp[] = [
  /security|vulnerabilit|exploit|attack/i,
  /medical|diagnos|treatment|prescription/i,
  /legal|lawsuit|liability|regulation/i,
];

export const INTENT_PATTERNS: RegExp[] = [
  /how to (harm|attack|exploit|bypass)/i,
  /step.by.step.*(attack|exploit|hack)/i,
];

// src/core/safety-evaluator.ts
export class SafetyEvaluator {
  evaluateTier(context: DebateContext, response?: AgentResponse): SafetyTier {
    // Tier 1: Always-on lightweight checks
    // Tier 2: Check triggers
    // Tier 3: Full evaluation if triggered
  }

  runLightweightCheck(text: string): { passed: boolean; flags: string[] } {
    // Fast pattern matching, ~1-2% overhead
  }

  runFullEvaluation(
    context: DebateContext,
    responses: AgentResponse[]
  ): SafetyEvaluation {
    // Comprehensive analysis, ~20-30% overhead
  }
}
```

**Acceptance Criteria**:
- [ ] Tier 1 lightweight checks run on every response
- [ ] Tier 2 triggers activate for configured modes/topics/intents
- [ ] Tier 3 full evaluation only runs when triggered
- [ ] Safety evaluation results included in response metadata
- [ ] Blocked content returns clear rejection reason

---

### W7: Exit Criteria Controller

**Objective**: Implement automatic debate termination based on consensus/convergence/cap.

**Files to Create**:
- `src/core/exit-controller.ts` - Exit criteria logic

**Files to Modify**:
- `src/core/debate-engine.ts` - Integrate exit checks after each round
- `src/types/index.ts` - Add exit criteria types

**Implementation Details**:

```typescript
// src/types/index.ts
export type ExitReason = 'consensus' | 'convergence' | 'round-cap' | 'user-stop';

export type Vote = 'ACCEPT' | 'MINOR' | 'BLOCKER';

export interface ExitCriteria {
  consensusThreshold: number;        // Default: 0.80
  convergenceDeltaThreshold: number; // Default: 0.10
  convergenceRounds: number;         // Default: 2
  roundCap: number;                  // Default: 6
}

export interface ExitEvaluation {
  shouldExit: boolean;
  reason?: ExitReason;
  details: {
    consensusScore?: number;
    hasBlockers?: boolean;
    convergenceDelta?: number;
    currentRound?: number;
  };
}

// src/core/exit-controller.ts
export class ExitController {
  private criteria: ExitCriteria;

  evaluateExit(
    currentRound: number,
    responses: AgentResponse[],
    previousResponses: AgentResponse[],
    votes?: Vote[]
  ): ExitEvaluation {
    // Check consensus threshold
    if (this.checkConsensusThreshold(responses, votes)) {
      return { shouldExit: true, reason: 'consensus', ... };
    }

    // Check convergence plateau
    if (this.checkConvergencePlateau(responses, previousResponses)) {
      return { shouldExit: true, reason: 'convergence', ... };
    }

    // Check round cap
    if (currentRound >= this.criteria.roundCap) {
      return { shouldExit: true, reason: 'round-cap', ... };
    }

    return { shouldExit: false };
  }

  private checkConsensusThreshold(
    responses: AgentResponse[],
    votes?: Vote[]
  ): boolean {
    // >=80% ACCEPT or MINOR votes
    // Zero unresolved BLOCKERs
    // All agents confidence >= 0.70
  }

  private checkConvergencePlateau(
    current: AgentResponse[],
    previous: AgentResponse[]
  ): boolean {
    // <10% change across 2 consecutive rounds
    // No new [FACT] claims introduced
  }
}
```

**Acceptance Criteria**:
- [ ] Automatic exit when consensus threshold met
- [ ] Automatic exit on convergence plateau
- [ ] Hard stop at round cap
- [ ] Exit reason reported in session metadata
- [ ] User can override to continue despite exit criteria

---

## Phase 4: Context Optimization (P3)

### W8: Progressive Summarization

**Objective**: Implement round-based summarization to control context growth.

**Files to Create**:
- `src/core/summarizer.ts` - Summarization logic

**Files to Modify**:
- `src/agents/base.ts` - Use summarized context in `buildUserMessage()`
- `src/types/index.ts` - Add summary types

**Implementation Details**:

```typescript
// src/types/index.ts
export interface RoundSummary {
  round: number;
  oneLiner: string;  // <=35 tokens
  newClaims: string[];
  newEvidence: string[];
  decisions: string[];
  agentSummaries: AgentRoundSummary[];
  contested: ContestedClaim[];
}

export interface AgentRoundSummary {
  agent: string;
  stance: Stance;
  confidence: number;
  confidenceDelta: number;
  keyMoves: string[];  // <=20 tokens each
}

// src/core/summarizer.ts
export class ProgressiveSummarizer {
  private readonly TOKEN_BUDGET = {
    debateState: 2000,
    historicalRoundSummary: 300,
    previousRoundFull: 4000,
    currentInstructions: 150,
    total: 8000,
  };

  summarizeRound(
    round: number,
    responses: AgentResponse[]
  ): RoundSummary {
    // Extract key information
    // Compress to token budget
  }

  buildContextWindow(
    currentRound: number,
    allResponses: AgentResponse[][],
    debateState: DebateState
  ): ContextWindow {
    // Round N: Instructions only
    // Round N-1: Full fidelity
    // Round N-2 to N-3: Structured summary
    // Older: Merged into DebateState
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);  // Rough estimate
  }
}
```

**Summarization Policy**:
```
ROUND POSITION    | TREATMENT           | TOKEN BUDGET
------------------|---------------------|-------------
Current (N)       | Instructions only   | 150
Previous (N-1)    | Full fidelity       | 4000
N-2 to N-3        | Structured summary  | 300/round
Older             | Merged into State   | Part of 2000
```

**Acceptance Criteria**:
- [ ] Rounds older than N-1 are summarized
- [ ] Token budget respected (<8K total)
- [ ] Key claims/evidence preserved in summaries
- [ ] Full responses available via `get_round_details` tool

---

### W9: DebateState Data Structure

**Objective**: Implement canonical DebateState structure for context management.

**Files to Create**:
- `src/core/debate-state.ts` - State management

**Files to Modify**:
- `src/types/index.ts` - Add DebateState types
- `src/storage/sqlite.ts` - Persist DebateState

**Implementation Details**:

```typescript
// src/types/index.ts
export interface DebateState {
  topic: string;
  round: number;
  participants: string[];
  claims: Claim[];
  evidence: Evidence[];
  decisions: Decision[];
  agentStatus: AgentStatus[];
}

export interface Claim {
  id: string;  // C1, C2, ...
  text: string;  // <=30 tokens
  label: 'FACT' | 'INFER' | 'ASSUME' | 'OPEN';
  status: 'accepted' | 'contested' | 'retracted' | 'open';
  introducedRound: number;
  lastUpdatedRound: number;
  support: string[];  // Evidence IDs
  opposition: string[];  // Claim IDs
}

export interface Evidence {
  id: string;  // E1, E2, ...
  kind: 'citation' | 'tool_output' | 'calculation';
  title: string;
  url?: string;
  supports: string[];  // Claim IDs
  gist: string;  // <=25 tokens
  addedRound: number;
}

// src/core/debate-state.ts
export class DebateStateManager {
  private state: DebateState;
  private claimCounter = 0;
  private evidenceCounter = 0;

  addClaim(text: string, label: EpistemicLabel, round: number): string {
    const id = `C${++this.claimCounter}`;
    this.state.claims.push({ id, text, label, status: 'open', ... });
    return id;
  }

  addEvidence(evidence: Omit<Evidence, 'id'>): string {
    const id = `E${++this.evidenceCounter}`;
    this.state.evidence.push({ id, ...evidence });
    return id;
  }

  updateClaimStatus(id: string, status: Claim['status']): void {
    const claim = this.state.claims.find(c => c.id === id);
    if (claim) claim.status = status;
  }

  toContextString(): string {
    // Serialize to token-efficient format for prompts
  }
}
```

**Acceptance Criteria**:
- [ ] DebateState persisted in SQLite
- [ ] Claims and evidence get stable IDs
- [ ] State serializes to <2000 tokens
- [ ] State recoverable for session resume

---

### W10: Claim/Evidence ID System

**Objective**: Enable stable references to claims and evidence across rounds.

**Files to Modify**:
- `src/agents/base.ts` - Extract and assign IDs
- `src/core/debate-state.ts` - ID management

**Implementation Details**:

```typescript
// src/agents/base.ts
export abstract class BaseAgent {
  protected extractClaimsFromResponse(
    response: string,
    stateManager: DebateStateManager,
    round: number
  ): string[] {
    const claimIds: string[] = [];

    // Extract [FACT], [INFER], [ASSUME] labeled claims
    const claimPattern = /([^.!?]+)\.\[(FACT|INFER|ASSUME)\](?:\[(\d+)\])?/g;
    let match;

    while ((match = claimPattern.exec(response)) !== null) {
      const [, text, label, citationId] = match;
      const claimId = stateManager.addClaim(text.trim(), label as EpistemicLabel, round);

      if (citationId) {
        stateManager.linkClaimToEvidence(claimId, `E${citationId}`);
      }

      claimIds.push(claimId);
    }

    return claimIds;
  }
}
```

**Reference Format in Prompts**:
```
=== DEBATE STATE ===

CLAIMS:
- C1 [FACT/accepted]: "Claim text" (supports: E1, E2)
- C2 [INFER/contested]: "Claim text" (opposes: C1)
- C3 [ASSUME/open]: "Claim text"

EVIDENCE:
- E1 [citation]: "Title" - "gist" (supports: C1)
- E2 [tool_output]: "Search result" - "gist" (supports: C1)

You can reference claims by ID (e.g., "Building on C1..." or "Challenging C2...")
```

**Acceptance Criteria**:
- [ ] Claims automatically assigned C1, C2, ... IDs
- [ ] Evidence automatically assigned E1, E2, ... IDs
- [ ] Agents can reference IDs in responses
- [ ] ID references preserved across summarization

---

## Dependency Graph

```
                    ┌─────┐
                    │ W1  │ Epistemic Labeling
                    └──┬──┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        v              v              v
    ┌─────┐        ┌─────┐        ┌─────┐
    │ W2  │        │ W3  │        │ W4  │
    │Citation│     │Verify│       │Anchor│
    └──┬──┘        └──┬──┘        └─────┘
       │              │
       │    ┌─────────┴─────────┐
       │    │                   │
       v    v                   v
    ┌─────────┐             ┌─────┐
    │   W5    │             │ W7  │
    │Groupthink│            │Exit │
    └────┬────┘             └─────┘
         │
         v
    ┌─────────┐
    │   W6    │
    │ Safety  │
    └─────────┘

    ┌─────┐     ┌─────┐     ┌─────┐
    │ W8  │────>│ W9  │────>│ W10 │
    │Summ.│     │State│     │ IDs │
    └─────┘     └─────┘     └─────┘
```

---

## Testing Strategy

### Unit Tests Required

| Work Item | Test File | Key Test Cases |
|-----------|-----------|----------------|
| W1 | `tests/unit/core/epistemic-parser.test.ts` | Label extraction, citation linking |
| W2 | `tests/unit/utils/citation-parser.test.ts` | Pattern matching, validation |
| W3 | `tests/unit/core/verification.test.ts` | Question evaluation, opt-in logic |
| W4 | `tests/unit/core/perspective-anchor.test.ts` | Assignment, prompt inclusion |
| W5 | `tests/unit/core/groupthink-detector.test.ts` | Both triggers, intervention |
| W6 | `tests/unit/core/safety-evaluator.test.ts` | All tiers, trigger detection |
| W7 | `tests/unit/core/exit-controller.test.ts` | All exit conditions |
| W8 | `tests/unit/core/summarizer.test.ts` | Token budgets, compression |
| W9 | `tests/unit/core/debate-state.test.ts` | CRUD, serialization |
| W10 | `tests/unit/core/claim-id.test.ts` | ID assignment, references |

### Integration Tests Required

| Test Scenario | Test File |
|---------------|-----------|
| Full debate with epistemic labels | `tests/integration/epistemic-debate.test.ts` |
| Groupthink detection fires correctly | `tests/integration/groupthink.test.ts` |
| Safety evaluator blocks harmful content | `tests/integration/safety.test.ts` |
| Exit criteria terminates debate | `tests/integration/exit-criteria.test.ts` |
| Progressive summarization respects budget | `tests/integration/summarization.test.ts` |

---

## Rollout Plan

### Stage 1: Shadow Mode
- Deploy W1-W4 with logging only
- Collect metrics on label/citation usage
- No behavioral changes to existing debates

### Stage 2: Opt-in Beta
- Enable W3 verification questions for opted-in sessions
- Enable W5-W7 detection/safety for high-stakes sessions
- Gather user feedback

### Stage 3: Default On
- W1-W7 enabled by default
- W8-W10 enabled for long debates (>4 rounds)
- Full monitoring and alerting

### Stage 4: Full Integration
- All work items enabled
- DebateState persisted for all sessions
- Analytics dashboard for epistemic patterns

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Epistemic label adoption | >80% of claims labeled | Parse responses |
| Citation compliance | >95% [FACT] claims cited | Validation check |
| Groupthink detection precision | >90% true positives | Manual review sample |
| Safety block accuracy | >99% harmful blocked | Audit log review |
| Context token reduction | >40% for 5+ round debates | Token counting |
| User satisfaction | No regression | Survey/feedback |

---

## References

- Design Document: `docs/architecture/4-layer-system-design.md`
- Roundtable Consensus: Section 9 of design document
- Existing Tests: `tests/unit/modes/*.test.ts`
