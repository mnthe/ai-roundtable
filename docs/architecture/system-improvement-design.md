# System Improvement Design

## Overview

### Purpose

This document defines the architectural improvements for AI Roundtable to achieve:
- **Role adherence**: Prevent agents from deviating from mode-specific behavior
- **Tool correctness**: Ensure proper tool usage and validation
- **Extensibility**: Support easy addition of new tools and modes
- **Quality improvement**: Enhance AI analysis quality

### Current State Summary

| Component                   | Status        | Notes                                                                       |
| --------------------------- | ------------- | --------------------------------------------------------------------------- |
| 4-Layer Prompt Structure    | ✅ Implemented | Role Anchor, Behavioral Contract, Structural Enforcement, Verification Loop |
| 4-Layer MCP Response        | ✅ Implemented | Decision, AgentResponses, Evidence, Metadata layers                         |
| Mode Strategy Pattern       | ✅ Implemented | 7 modes with varying implementation patterns                                |
| Tool Validation (Zod)       | ✅ Implemented | Input validation for agent tools                                            |
| Response Content Validation | ❌ Missing     | No validation of AI response content                                        |
| Context Optimization        | ❌ Missing     | Full context passed every round                                             |
| Exit Criteria               | ❌ Missing     | Only round-based termination                                                |

---

## 1. Mode Structure Standardization

### Problem Statement

Custom modes (devils-advocate, delphi, red-team-blue-team) reimplement execution logic instead of extending `BaseModeStrategy`. This leads to:
- Code duplication
- Inconsistent behavior
- Difficulty adding cross-cutting features

**Current Implementation Patterns:**

| Mode               | Pattern  | Custom Logic                          |
| ------------------ | -------- | ------------------------------------- |
| collaborative      | Standard | -                                     |
| adversarial        | Standard | -                                     |
| socratic           | Standard | -                                     |
| expert-panel       | Standard | -                                     |
| devils-advocate    | Custom   | Role-based prompts, stance validation |
| delphi             | Custom   | Anonymization, statistics injection   |
| red-team-blue-team | Custom   | Team-based execution                  |

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

| Mode               | Changes Required                                                           |
| ------------------ | -------------------------------------------------------------------------- |
| devils-advocate    | Use `getAgentRole()` + `validateResponse()` hooks                          |
| delphi             | Use `transformContext()` with AnonymizationProcessor + StatisticsProcessor |
| red-team-blue-team | Use `getAgentRole()` for team assignment                                   |

---

## 2. Adopted Features

### 2.1 Prompt Enforcement Enhancement

**Current Issues:**

| Issue                | Description                                                | Impact                                                      |
| -------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- |
| Stance not provided  | Devils-advocate agents don't include YES/NO/NEUTRAL stance | System force-assigns stance, losing agent's actual judgment |
| Tool usage imbalance | Claude: 3-6 calls, ChatGPT: 0-3, Gemini: 0-2 per round     | Inconsistent evidence quality across agents                 |

#### 2.1.1 Layer 2: Behavioral Contract Enhancement

Add tool usage requirements to all modes:

```typescript
const ENHANCED_BEHAVIORAL_CONTRACT = {
  mustBehaviors: [
    // Existing...
    'Use search_web or fact_check tool for ANY factual claim',
    'Cite sources from tool results in your response',
    'Verify statistics and recent events with tools before stating',
  ],
  mustNotBehaviors: [
    // Existing...
    'Make factual claims without tool-based verification',
    'State statistics or data without source citation',
  ],
};
```

#### 2.1.2 Layer 3: Structural Enforcement Enhancement

For devils-advocate mode, make stance a required field:

```typescript
// Devils-advocate specific output format
const DEVILS_ADVOCATE_OUTPUT_FORMAT = `
Your response MUST be valid JSON with these REQUIRED fields:

{
  "stance": "YES" | "NO" | "NEUTRAL",  // ⚠️ REQUIRED - Your assigned position
  "position": "Your position statement",
  "reasoning": "Your detailed reasoning",
  "confidence": 0.0-1.0
}

⚠️ CRITICAL: Responses without explicit "stance" field will be REJECTED.
`;
```

#### 2.1.3 Layer 4: Verification Questions Enhancement

**Common checks (all modes):**

```typescript
const COMMON_VERIFICATION_CHECKS = [
  'Is every claim supported by evidence or clearly marked as inference?',
  'Have I addressed the topic directly?',
  'Is my confidence level justified by the evidence?',
  'Have I considered alternative viewpoints?',
  // NEW: Tool usage checks
  'Did I use tools (search_web, fact_check) to verify factual claims?',
  'Did I cite sources from tool results?',
];
```

**Mode-specific checks:**

```typescript
const MODE_SPECIFIC_CHECKS: Record<DebateMode, string[]> = {
  'devils-advocate': [
    'Did I explicitly include my stance (YES/NO/NEUTRAL) in the response?',
    'Does my reasoning support my assigned stance?',
  ],
  'expert-panel': [
    'Did I analyze from my assigned perspective?',
  ],
  // Other modes...
};
```

#### 2.1.4 Tool Usage Guidelines

```typescript
interface ToolUsageGuideline {
  /** Triggers that REQUIRE tool usage */
  requiredTriggers: string[];

  /** Minimum recommended calls per round */
  minRecommendedCalls: number;
}

const TOOL_USAGE_GUIDELINE: ToolUsageGuideline = {
  requiredTriggers: [
    'Factual claims (statistics, dates, events)',
    'References to external sources',
    'Claims about current/recent events',
    'Comparison with industry standards',
  ],
  minRecommendedCalls: 1,  // At least 1 tool call per round
};
```

**Implementation:**
- Update `buildBehavioralContract()` in prompt-builder with tool usage rules
- Update `buildStructuralEnforcement()` for devils-advocate stance requirement
- Standardize `buildVerificationLoop()` with common + mode-specific checks
- Add tool usage guideline to system prompt preamble

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

### 2.5 Sequential Mode Performance

**Problem:** Sequential modes (adversarial, socratic, devils-advocate) are significantly slower than parallel modes.

| Mode                     | Execution Time | Comparison |
| ------------------------ | -------------- | ---------- |
| Collaborative (parallel) | ~80s           | Baseline   |
| Adversarial (sequential) | ~241s          | 3x slower  |

**Root Causes:**
1. Sequential execution is by design (Agent N must see Agent 1~N-1 responses)
2. Excessive tool calls (Claude: up to 6 per response)
3. Redundant searches when info already exists in context

#### 2.5.1 Mode-Aware Tool Usage Policy

```typescript
interface ToolUsagePolicy {
  minCalls: number;
  maxCalls: number;
  guidance: string;
}

type ExecutionPattern = 'parallel' | 'sequential';

const TOOL_USAGE_POLICIES: Record<ExecutionPattern, ToolUsagePolicy> = {
  parallel: {
    minCalls: 1,
    maxCalls: 6,
    guidance: 'Use tools freely to gather comprehensive evidence.',
  },
  sequential: {
    minCalls: 1,
    maxCalls: 2,
    guidance: 'Leverage previous responses; limit to 1-2 essential tool calls.',
  },
};

// Map modes to execution patterns
const MODE_EXECUTION_PATTERN: Record<DebateMode, ExecutionPattern> = {
  'collaborative': 'parallel',
  'expert-panel': 'parallel',
  'delphi': 'parallel',
  'adversarial': 'sequential',
  'socratic': 'sequential',
  'devils-advocate': 'sequential',
  'red-team-blue-team': 'parallel',  // Teams run in parallel
};
```

#### 2.5.2 Sequential Mode Prompt Addition

Add to Layer 2 (Behavioral Contract) for sequential modes:

```typescript
const SEQUENTIAL_MODE_TOOL_GUIDANCE = `
## Tool Usage in Sequential Discussion

Previous participants have already gathered evidence and research.
Before making a tool call, check if the information already exists in their responses.

MUST:
- Review previous responses for existing evidence before searching
- Limit tool calls to 1-2 essential searches only
- Focus on NEW information not already covered

MUST NOT:
- Repeat searches that previous agents have done
- Use more than 2 tool calls per response
- Search for information already present in context
`;
```

#### 2.5.3 Additional Optimizations (P2)

| Optimization                            | Expected Impact | Complexity |
| --------------------------------------- | --------------- | ---------- |
| Lightweight model option for sequential | 40-60% faster   | Medium     |
| Reduced max_tokens for sequential       | 10-20% faster   | Low        |
| Tool result caching across agents       | 20-30% faster   | Medium     |

```typescript
interface SequentialModeConfig {
  /** Use lighter/faster model for sequential modes */
  useLightModel?: boolean;

  /** Reduced max tokens for faster responses */
  maxTokens?: number;  // Default: 2048 instead of 4096

  /** Cache tool results for reuse by subsequent agents */
  cacheToolResults?: boolean;
}
```

**Implementation:**
- Add `executionPattern` property to `BaseModeStrategy`
- Inject tool policy based on execution pattern in `buildBehavioralContract()`
- Add sequential-specific guidance to prompt builder

#### 2.5.4 Sequential Parallelization Strategy

Based on AI Roundtable evaluation, apply mode-specific parallelization:

| Mode            | Parallelization | Rationale                                           |
| --------------- | --------------- | --------------------------------------------------- |
| devils-advocate | ✅ Full          | Roles are independent; evaluator synthesizes at end |
| socratic        | ⚠️ Conditional   | Question-answer chains need some sequentiality      |
| adversarial     | ❌ Minimal       | Direct rebuttal requires seeing opponent's argument |

**Implementation:**

```typescript
type ParallelizationLevel = 'none' | 'last-only' | 'full';

const MODE_PARALLELIZATION: Record<DebateMode, ParallelizationLevel> = {
  'collaborative': 'full',
  'expert-panel': 'full',
  'delphi': 'full',
  'devils-advocate': 'last-only',  // Evaluator sees all
  'socratic': 'none',              // Keep sequential
  'adversarial': 'none',           // Keep sequential
  'red-team-blue-team': 'full',    // Teams parallel
};
```

**Last-Only Execution:**

```typescript
async executeLastOnly(agents, context, toolkit) {
  if (agents.length <= 1) {
    return this.executeSequential(agents, context, toolkit);
  }

  const lastAgent = agents[agents.length - 1];
  const otherAgents = agents.slice(0, -1);

  // Others run in parallel (see only previous round)
  const parallelResponses = await Promise.all(
    otherAgents.map(agent => agent.generateResponse(context))
  );

  // Last agent sees all current round responses
  const lastResponse = await lastAgent.generateResponse({
    ...context,
    previousResponses: [...context.previousResponses, ...parallelResponses],
  });

  return [...parallelResponses, lastResponse];
}
```

**Expected Impact:** ~60% latency reduction for devils-advocate mode.

---

## 3. Feature Flags & Benchmarking

### 3.1 Feature Flag System

Enable gradual rollout and A/B testing of new features.

```typescript
interface FeatureFlags {
  /** Sequential mode parallelization */
  sequentialParallelization: {
    enabled: boolean;
    level: ParallelizationLevel;
    modes?: DebateMode[];  // Override per mode
  };

  /** Tool usage enforcement */
  toolEnforcement: {
    enabled: boolean;
    level: 'strict' | 'normal' | 'relaxed';
    minCalls?: number;
    maxCalls?: number;
  };

  /** Groupthink detection */
  groupthinkDetection: {
    enabled: boolean;
    threshold?: number;  // Agreement level to trigger warning
  };

  /** Exit criteria */
  exitCriteria: {
    enabled: boolean;
    consensusThreshold?: number;
    convergenceRounds?: number;
  };
}

const DEFAULT_FLAGS: FeatureFlags = {
  sequentialParallelization: { enabled: false, level: 'none' },
  toolEnforcement: { enabled: true, level: 'normal' },
  groupthinkDetection: { enabled: true, threshold: 0.9 },
  exitCriteria: { enabled: false },
};
```

### 3.1.1 Configuration Sources

Flags can be set from multiple sources with clear precedence:

```typescript
type FlagSource = 'session' | 'env' | 'default';

interface FlagResolution {
  value: unknown;
  source: FlagSource;
}
```

**Resolution Order (highest to lowest):**

| Priority | Source        | Use Case                                |
| -------- | ------------- | --------------------------------------- |
| 1        | Session-level | Per-debate override via MCP tool params |
| 2        | Environment   | MCP server config (.env, mcp.json)      |
| 3        | Default       | Hardcoded fallback                      |

### 3.1.2 Environment Variable Configuration

```bash
# .env or MCP server environment

# Sequential parallelization
ROUNDTABLE_PARALLEL_ENABLED=true
ROUNDTABLE_PARALLEL_LEVEL=last-only  # none | last-only | full

# Tool enforcement
ROUNDTABLE_TOOL_ENFORCEMENT=normal   # strict | normal | relaxed
ROUNDTABLE_TOOL_MIN_CALLS=1
ROUNDTABLE_TOOL_MAX_CALLS=6

# Groupthink detection
ROUNDTABLE_GROUPTHINK_ENABLED=true
ROUNDTABLE_GROUPTHINK_THRESHOLD=0.9

# Exit criteria
ROUNDTABLE_EXIT_ENABLED=false
ROUNDTABLE_EXIT_CONSENSUS=0.9
ROUNDTABLE_EXIT_CONVERGENCE_ROUNDS=2
```

**Parsing:**

```typescript
function loadFlagsFromEnv(): Partial<FeatureFlags> {
  return {
    sequentialParallelization: {
      enabled: process.env.ROUNDTABLE_PARALLEL_ENABLED === 'true',
      level: (process.env.ROUNDTABLE_PARALLEL_LEVEL as ParallelizationLevel) ?? 'none',
    },
    toolEnforcement: {
      enabled: true,
      level: (process.env.ROUNDTABLE_TOOL_ENFORCEMENT as 'strict' | 'normal' | 'relaxed') ?? 'normal',
      minCalls: parseInt(process.env.ROUNDTABLE_TOOL_MIN_CALLS ?? '1'),
      maxCalls: parseInt(process.env.ROUNDTABLE_TOOL_MAX_CALLS ?? '6'),
    },
    // ... other flags
  };
}
```

### 3.1.3 Session-Level Override (MCP Tool Params)

```typescript
// start_roundtable tool input extension
interface StartRoundtableInput {
  topic: string;
  mode?: DebateMode;
  agents?: string[];
  rounds?: number;

  // NEW: Feature flag overrides
  flags?: Partial<FeatureFlags>;
}

// Example MCP call
{
  "tool": "start_roundtable",
  "params": {
    "topic": "AI safety debate",
    "mode": "adversarial",
    "flags": {
      "sequentialParallelization": { "enabled": true, "level": "last-only" },
      "toolEnforcement": { "level": "strict" }
    }
  }
}
```

### 3.1.4 Flag Resolution Implementation

```typescript
class FeatureFlagResolver {
  private envFlags: Partial<FeatureFlags>;
  private defaultFlags: FeatureFlags = DEFAULT_FLAGS;

  constructor() {
    this.envFlags = loadFlagsFromEnv();
  }

  resolve(sessionOverride?: Partial<FeatureFlags>): FeatureFlags {
    return deepMerge(
      this.defaultFlags,      // Lowest priority
      this.envFlags,          // Middle priority
      sessionOverride ?? {}   // Highest priority
    );
  }

  // For debugging/logging
  resolveWithSource(sessionOverride?: Partial<FeatureFlags>): Record<string, FlagResolution> {
    // Returns each flag value with its source
  }
}
```

---

### 3.2 Benchmark Framework

Measure impact of feature flags on quality and performance.

#### 3.2.1 Metrics

```typescript
interface BenchmarkMetrics {
  // Performance
  latency: {
    totalMs: number;
    perRoundMs: number[];
    perAgentMs: Record<string, number>;
  };

  // Quality - Interaction
  interaction: {
    crossReferenceCount: number;    // How often agents reference each other
    rebuttalDepth: number;          // Levels of argument-counterargument
    questionResponsePairs: number;  // For socratic mode
  };

  // Quality - Content
  content: {
    avgConfidence: number;
    confidenceVariance: number;
    toolCallsPerAgent: Record<string, number>;
    citationCount: number;
  };

  // Quality - Consensus
  consensus: {
    agreementLevel: number;
    convergenceRound: number | null;  // When positions stabilized
    groupthinkWarning: boolean;
  };
}
```

#### 3.2.2 Benchmark Scenarios

```typescript
interface BenchmarkScenario {
  name: string;
  topic: string;
  mode: DebateMode;
  agents: string[];
  rounds: number;
  flags: Partial<FeatureFlags>;
}

const BENCHMARK_SCENARIOS: BenchmarkScenario[] = [
  // Baseline (no optimization)
  {
    name: 'adversarial-baseline',
    topic: 'Standard benchmark topic',
    mode: 'adversarial',
    agents: ['claude', 'chatgpt', 'gemini'],
    rounds: 2,
    flags: { sequentialParallelization: { enabled: false, level: 'none' } },
  },
  // With parallelization
  {
    name: 'adversarial-parallel',
    topic: 'Standard benchmark topic',
    mode: 'adversarial',
    agents: ['claude', 'chatgpt', 'gemini'],
    rounds: 2,
    flags: { sequentialParallelization: { enabled: true, level: 'last-only' } },
  },
  // ... more scenarios
];
```

#### 3.2.3 Comparison Report

```typescript
interface BenchmarkComparison {
  baseline: BenchmarkMetrics;
  variant: BenchmarkMetrics;

  delta: {
    latencyReduction: number;      // Percentage
    interactionChange: number;     // Percentage (negative = degradation)
    qualityScore: number;          // Composite score
  };

  recommendation: 'adopt' | 'reject' | 'conditional';
  conditions?: string[];  // e.g., "Only for devils-advocate mode"
}
```

### 3.3 Rollout Strategy

| Phase | Scope                | Flags Enabled             | Duration |
| ----- | -------------------- | ------------------------- | -------- |
| 1     | Internal testing     | All (opt-in)              | 1 week   |
| 2     | devils-advocate only | sequentialParallelization | 2 weeks  |
| 3     | Expand to socratic   | + toolEnforcement         | 2 weeks  |
| 4     | Full rollout         | All features              | -        |

**Rollback Trigger:**
- Latency improvement < 30% OR
- Interaction quality drop > 20% OR
- User-reported quality issues

---

## 4. Implementation Roadmap

### P0 - Immediate (Foundation)

| Item                     | Description                                                                    | Effort |
| ------------------------ | ------------------------------------------------------------------------------ | ------ |
| Feature Flag System      | Implement FeatureFlags interface and resolution                                | Medium |
| Hook System              | Add `transformContext`, `validateResponse`, `getAgentRole` to BaseModeStrategy | Medium |
| Response Validators      | Create validator interface and built-in validators                             | Low    |
| Refactor devils-advocate | Use hooks instead of custom execution                                          | Medium |

### P1 - Short-term (Core Features)

| Item                   | Description                                                    | Effort |
| ---------------------- | -------------------------------------------------------------- | ------ |
| Benchmark Framework    | Implement metrics collection and comparison                    | Medium |
| Context Processors     | Create processor interface, implement Anonymization/Statistics | Low    |
| Refactor delphi        | Use context processors                                         | Low    |
| Exit Criteria          | Implement criteria checking in DebateEngine                    | Medium |
| Groupthink Detection   | Add to ConsensusAnalyzer                                       | Low    |
| Sequential Tool Policy | Mode-aware tool usage limits (1-2 calls for sequential)        | Low    |

### P2 - Medium-term (Quality)

| Item                        | Description                                                 | Effort |
| --------------------------- | ----------------------------------------------------------- | ------ |
| Prompt Enforcement          | Layer 2-4 enhancement (tool usage, stance, verification)    | Medium |
| Sequential Parallelization  | Implement last-only execution for devils-advocate           | Medium |
| Refactor red-team-blue-team | Use hooks for team assignment                               | Medium |
| Perspective Anchors         | Add perspective assignment to expert-panel mode             | Low    |
| Sequential Performance      | Light model option, reduced max_tokens, tool result caching | Medium |

---

## 5. Deferred Features (Reference Only)

These features were considered but not planned for implementation.

### 5.1 Epistemic Labeling

**Concept:** Tag claims as `[FACT]`, `[INFER]`, `[ASSUME]`

**Deferral Reason:**
- AI consistency in applying tags is unreliable
- Requires parsing logic for extraction
- Benefit unclear without downstream tooling

**Reconsider When:** Need for automated fact-checking pipeline

### 5.2 Numeric Citation

**Concept:** Reference sources as `[1]`, `[2]` inline

**Deferral Reason:**
- `AgentResponse.citations` already captures source information
- Inline numbers require parsing and may be inconsistent

**Reconsider When:** Need for inline citation rendering in export

### 5.3 Safety Evaluator

**Concept:** 3-tier safety filtering (warn, review, reject)

**Deferral Reason:**
- Each AI provider (Claude, GPT, Gemini) has built-in safety filters
- Redundant implementation

**Reconsider When:** Need for custom safety policies beyond provider defaults

### 5.4 Progressive Summarization

**Concept:** Compress older rounds to save context window

**Deferral Reason:**
- Summarization quality affects debate continuity
- Requires additional AI calls (cost)
- Current round limits (typically 3-5) don't exhaust context

**Reconsider When:** Supporting 10+ round debates

### 5.5 DebateState & Claim ID

**Concept:** Assign IDs to claims, track rebuttals and revisions across rounds

**Deferral Reason:**
- High implementation complexity (schema changes, ID generation, reference tracking)
- AI may not consistently reference claim IDs
- Benefit unclear for typical 3-5 round debates

**Reconsider When:** Need for detailed argument mapping or visualization

---

## 6. Deleted Documents

The following documents are superseded by this design:

- `docs/architecture/4-layer-system-design.md`
- `docs/architecture/implementation-work-plan.md`

Historical context from these documents has been incorporated where relevant.
