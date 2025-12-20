# System Improvement Design

## Overview

### Purpose

This document defines the architectural improvements for AI Roundtable to achieve:
- **Role adherence**: Prevent agents from deviating from mode-specific behavior
- **Tool correctness**: Ensure proper tool usage and validation
- **Extensibility**: Support easy addition of new tools and modes
- **Quality improvement**: Enhance AI analysis quality

### Current State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| 4-Layer Prompt Structure | ✅ Implemented | Role Anchor, Behavioral Contract, Structural Enforcement, Verification Loop |
| 4-Layer MCP Response | ✅ Implemented | Decision, AgentResponses, Evidence, Metadata layers |
| Mode Strategy Pattern | ✅ Implemented | 7 modes with varying implementation patterns |
| Tool Validation (Zod) | ✅ Implemented | Input validation for agent tools |
| Response Content Validation | ❌ Missing | No validation of AI response content |
| Context Optimization | ❌ Missing | Full context passed every round |
| Exit Criteria | ❌ Missing | Only round-based termination |

---

## 1. Mode Structure Standardization

### Problem Statement

Custom modes (devils-advocate, delphi, red-team-blue-team) reimplement execution logic instead of extending `BaseModeStrategy`. This leads to:
- Code duplication
- Inconsistent behavior
- Difficulty adding cross-cutting features

**Current Implementation Patterns:**

| Mode | Pattern | Custom Logic |
|------|---------|--------------|
| collaborative | Standard | - |
| adversarial | Standard | - |
| socratic | Standard | - |
| expert-panel | Standard | - |
| devils-advocate | Custom | Role-based prompts, stance validation |
| delphi | Custom | Anonymization, statistics injection |
| red-team-blue-team | Custom | Team-based execution |

### Solution: Hook System

Add extension points to `BaseModeStrategy`:

```typescript
abstract class BaseModeStrategy implements DebateModeStrategy {
  // Existing abstract methods
  abstract readonly name: string;
  abstract buildAgentPrompt(context: DebateContext): string;

  // NEW: Optional hooks for customization

  /**
   * Transform context before passing to agent
   * Use case: Delphi anonymization, statistics injection
   */
  protected transformContext?(
    context: DebateContext,
    agent: BaseAgent
  ): DebateContext;

  /**
   * Validate and potentially modify response after generation
   * Use case: Devils-advocate stance enforcement
   */
  protected validateResponse?(
    response: AgentResponse,
    context: DebateContext
  ): AgentResponse;

  /**
   * Get role identifier for an agent
   * Use case: Devils-advocate PRIMARY/OPPOSITION/EVALUATOR
   */
  protected getAgentRole?(
    agent: BaseAgent,
    index: number,
    context: DebateContext
  ): string | undefined;
}
```

### Solution: Response Validators

Standardized interface for response validation:

```typescript
interface ResponseValidator {
  name: string;
  validate(response: AgentResponse, context: DebateContext): AgentResponse;
}

// Built-in validators
class StanceValidator implements ResponseValidator {
  constructor(private expectedStance: Stance) {}
  name = 'stance';

  validate(response: AgentResponse, context: DebateContext): AgentResponse {
    if (response.stance !== this.expectedStance) {
      return { ...response, stance: this.expectedStance };
    }
    return response;
  }
}

class ConfidenceRangeValidator implements ResponseValidator {
  name = 'confidence-range';

  validate(response: AgentResponse): AgentResponse {
    const clamped = Math.max(0, Math.min(1, response.confidence));
    return { ...response, confidence: clamped };
  }
}
```

### Solution: Context Processors

Reusable context transformations:

```typescript
interface ContextProcessor {
  name: string;
  process(context: DebateContext, agent?: BaseAgent): DebateContext;
}

// Built-in processors
class AnonymizationProcessor implements ContextProcessor {
  name = 'anonymization';

  process(context: DebateContext): DebateContext {
    return {
      ...context,
      previousResponses: context.previousResponses.map((r, i) => ({
        ...r,
        agentId: `participant-${i + 1}`,
        agentName: `Participant ${i + 1}`,
      })),
    };
  }
}

class StatisticsProcessor implements ContextProcessor {
  name = 'statistics';

  process(context: DebateContext): DebateContext {
    const stats = this.calculateStats(context.previousResponses);
    return {
      ...context,
      modePrompt: context.modePrompt + `\n\nRound Statistics:\n${stats}`,
    };
  }
}
```

### Refactoring Plan

| Mode | Changes Required |
|------|------------------|
| devils-advocate | Use `getAgentRole()` + `validateResponse()` hooks |
| delphi | Use `transformContext()` with AnonymizationProcessor + StatisticsProcessor |
| red-team-blue-team | Use `getAgentRole()` for team assignment |

---

## 2. Adopted Features

### 2.1 Verification Questions Enhancement

**Current State:** Layer 4 (Verification Loop) exists but varies by mode.

**Improvement:** Standardize verification checklist across modes.

```typescript
interface VerificationConfig {
  // Common checks for all modes
  commonChecks: string[];
  // Mode-specific additional checks
  modeSpecificChecks: string[];
}

const COMMON_VERIFICATION_CHECKS = [
  'Is every claim supported by evidence or clearly marked as inference?',
  'Have I addressed the topic directly?',
  'Is my confidence level justified by the evidence?',
  'Have I considered alternative viewpoints?',
];
```

**Implementation:**
- Add `commonChecks` to `buildVerificationLoop()` in prompt-builder
- Each mode adds `modeSpecificChecks` on top

### 2.2 Groupthink Detection

**Purpose:** Warn when agents reach consensus too easily without sufficient critical examination.

**Implementation:**

```typescript
interface GroupthinkWarning {
  detected: boolean;
  indicators: string[];
  recommendation: string;
}

function detectGroupthink(responses: AgentResponse[]): GroupthinkWarning {
  const indicators: string[] = [];

  // Check 1: All agents have high confidence agreement
  const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;
  const allHighConfidence = responses.every(r => r.confidence >= 0.8);

  if (allHighConfidence && avgConfidence >= 0.85) {
    indicators.push('All agents show high confidence (≥80%)');
  }

  // Check 2: No dissenting positions in adversarial/devils-advocate modes
  const stances = responses.map(r => r.stance).filter(Boolean);
  const uniqueStances = new Set(stances);
  if (stances.length > 0 && uniqueStances.size === 1) {
    indicators.push('No dissenting stances detected');
  }

  // Check 3: Position similarity too high (using existing consensus logic)
  // Leverage ConsensusAnalyzer.agreementLevel

  return {
    detected: indicators.length >= 2,
    indicators,
    recommendation: indicators.length >= 2
      ? 'Consider additional rounds with devil\'s advocate role or manual review'
      : '',
  };
}
```

**Integration Points:**
- Add to `ConsensusAnalyzer.analyze()` return type
- Include in `RoundtableResponse.evidence` layer
- Display warning in `export_session` output

### 2.3 Exit Criteria

**Purpose:** Automatically terminate debate when meaningful progress is unlikely.

**Implementation:**

```typescript
interface ExitCriteria {
  // Consensus reached
  consensusThreshold?: number;  // Default: 0.9

  // Convergence detected (no position changes)
  convergenceRounds?: number;   // Default: 2

  // All agents confident
  confidenceThreshold?: number; // Default: 0.85

  // Maximum rounds (existing)
  maxRounds: number;
}

interface ExitResult {
  shouldExit: boolean;
  reason: 'consensus' | 'convergence' | 'confidence' | 'max_rounds' | null;
  details: string;
}

function checkExitCriteria(
  session: Session,
  criteria: ExitCriteria
): ExitResult {
  const latestResponses = getLatestRoundResponses(session);
  const consensus = analyzeConsensus(latestResponses);

  // Check consensus threshold
  if (criteria.consensusThreshold && consensus.agreementLevel >= criteria.consensusThreshold) {
    return {
      shouldExit: true,
      reason: 'consensus',
      details: `Agreement level ${consensus.agreementLevel} >= threshold ${criteria.consensusThreshold}`,
    };
  }

  // Check convergence (position stability)
  if (criteria.convergenceRounds) {
    const isConverged = checkPositionConvergence(session, criteria.convergenceRounds);
    if (isConverged) {
      return {
        shouldExit: true,
        reason: 'convergence',
        details: `Positions stable for ${criteria.convergenceRounds} rounds`,
      };
    }
  }

  // Check confidence threshold
  if (criteria.confidenceThreshold) {
    const allConfident = latestResponses.every(r => r.confidence >= criteria.confidenceThreshold!);
    if (allConfident) {
      return {
        shouldExit: true,
        reason: 'confidence',
        details: `All agents confidence >= ${criteria.confidenceThreshold}`,
      };
    }
  }

  // Check max rounds
  if (session.currentRound >= criteria.maxRounds) {
    return {
      shouldExit: true,
      reason: 'max_rounds',
      details: `Reached maximum rounds (${criteria.maxRounds})`,
    };
  }

  return { shouldExit: false, reason: null, details: '' };
}
```

**Integration Points:**
- Add `exitCriteria` to `DebateConfig`
- Check in `DebateEngine.executeRound()` after each round
- Return exit reason in `RoundtableResponse.metadata`

### 2.4 Perspective Anchors (expert-panel only)

**Purpose:** Force analysis from multiple predefined viewpoints to ensure comprehensive coverage.

**Scope:** Only applies to `expert-panel` mode.

**Implementation:**

```typescript
const PERSPECTIVE_ANCHORS = [
  'technical',   // Technical feasibility, implementation challenges
  'economic',    // Cost, ROI, market impact
  'ethical',     // Moral implications, fairness, bias
  'social',      // User impact, accessibility, societal effects
] as const;

type Perspective = typeof PERSPECTIVE_ANCHORS[number];

interface PerspectiveConfig {
  perspectives: Perspective[];
  assignmentStrategy: 'round-robin' | 'random' | 'explicit';
}

// In expert-panel mode's buildAgentPrompt():
function buildPerspectivePrompt(
  perspective: Perspective,
  context: DebateContext
): string {
  const perspectiveDescriptions: Record<Perspective, string> = {
    technical: 'Focus on technical feasibility, implementation complexity, and engineering trade-offs.',
    economic: 'Focus on costs, return on investment, market dynamics, and financial implications.',
    ethical: 'Focus on moral implications, fairness, potential biases, and ethical considerations.',
    social: 'Focus on user impact, accessibility, societal effects, and human factors.',
  };

  return `
## Your Assigned Perspective: ${perspective.toUpperCase()}

${perspectiveDescriptions[perspective]}

While you may acknowledge other perspectives, your primary analysis MUST be through the ${perspective} lens.
`;
}
```

**Integration Points:**
- Add `perspectiveConfig` to `ExpertPanelMode`
- Assign perspectives via `getAgentRole()` hook
- Include perspective in `AgentResponseSummary` for clarity

---

## 3. Implementation Roadmap

### P0 - Immediate (Foundation)

| Item | Description | Effort |
|------|-------------|--------|
| Hook System | Add `transformContext`, `validateResponse`, `getAgentRole` to BaseModeStrategy | Medium |
| Response Validators | Create validator interface and built-in validators | Low |
| Refactor devils-advocate | Use hooks instead of custom execution | Medium |

### P1 - Short-term (Core Features)

| Item | Description | Effort |
|------|-------------|--------|
| Context Processors | Create processor interface, implement Anonymization/Statistics | Low |
| Refactor delphi | Use context processors | Low |
| Exit Criteria | Implement criteria checking in DebateEngine | Medium |
| Groupthink Detection | Add to ConsensusAnalyzer | Low |

### P2 - Medium-term (Quality)

| Item | Description | Effort |
|------|-------------|--------|
| Verification Questions | Standardize Layer 4 checks across modes | Low |
| Refactor red-team-blue-team | Use hooks for team assignment | Medium |
| Perspective Anchors | Add perspective assignment to expert-panel mode | Low |

---

## 4. Deferred Features (Reference Only)

These features were considered but not planned for implementation.

### 4.1 Epistemic Labeling

**Concept:** Tag claims as `[FACT]`, `[INFER]`, `[ASSUME]`

**Deferral Reason:**
- AI consistency in applying tags is unreliable
- Requires parsing logic for extraction
- Benefit unclear without downstream tooling

**Reconsider When:** Need for automated fact-checking pipeline

### 4.2 Numeric Citation

**Concept:** Reference sources as `[1]`, `[2]` inline

**Deferral Reason:**
- `AgentResponse.citations` already captures source information
- Inline numbers require parsing and may be inconsistent

**Reconsider When:** Need for inline citation rendering in export

### 4.3 Safety Evaluator

**Concept:** 3-tier safety filtering (warn, review, reject)

**Deferral Reason:**
- Each AI provider (Claude, GPT, Gemini) has built-in safety filters
- Redundant implementation

**Reconsider When:** Need for custom safety policies beyond provider defaults

### 4.4 Progressive Summarization

**Concept:** Compress older rounds to save context window

**Deferral Reason:**
- Summarization quality affects debate continuity
- Requires additional AI calls (cost)
- Current round limits (typically 3-5) don't exhaust context

**Reconsider When:** Supporting 10+ round debates

### 4.5 DebateState & Claim ID

**Concept:** Assign IDs to claims, track rebuttals and revisions across rounds

**Deferral Reason:**
- High implementation complexity (schema changes, ID generation, reference tracking)
- AI may not consistently reference claim IDs
- Benefit unclear for typical 3-5 round debates

**Reconsider When:** Need for detailed argument mapping or visualization

---

## 5. Deleted Documents

The following documents are superseded by this design:

- `docs/architecture/4-layer-system-design.md`
- `docs/architecture/implementation-work-plan.md`

Historical context from these documents has been incorporated where relevant.
