# 4-Layer Debate Prompt System Design

## Overview

This document describes the 4-Layer prompt system used across all debate modes, the proposed improvements from AI roundtable consensus, and the context passing mechanism between agents.

---

## 1. 4-Layer Framework Structure

Each debate mode implements a 4-layer prompt structure to ensure consistent, high-quality agent behavior:

```
+------------------------------------------------------------------+
|  LAYER 1: ROLE ANCHOR                                            |
|  - Identity definition ("YOU ARE A...")                          |
|  - Mission statement                                              |
|  - Persistence instruction                                        |
|  - Mode-specific "being helpful" redefinition                     |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|  LAYER 2: BEHAVIORAL CONTRACT                                    |
|  - MUST (Required Behaviors) - checkbox list                     |
|  - MUST NOT (Prohibited Behaviors) - X-marked list               |
|  - PRIORITY HIERARCHY (numbered)                                  |
|  - FAILURE MODE definition                                        |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|  LAYER 3: STRUCTURAL ENFORCEMENT                                 |
|  - REQUIRED OUTPUT STRUCTURE                                      |
|  - Section headers with descriptions                              |
|  - Round-specific variations (First Round vs Subsequent)          |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|  LAYER 4: VERIFICATION LOOP                                      |
|  - Pre-submission checklist                                       |
|  - "If any check fails, revise before submitting"                |
|  - Focus question handling                                        |
+------------------------------------------------------------------+
```

### Current Implementation by Mode

| Mode               | L1 Role                          | L2 Key Constraint                      | L3 Structure                               | L4 Checks         |
| ------------------ | -------------------------------- | -------------------------------------- | ------------------------------------------ | ----------------- |
| collaborative      | Synthesizer                      | Find agreement > Highlight differences | Points of Agreement, Building, Synthesis   | 5 checks          |
| adversarial        | Challenger                       | Find flaws > Find agreement            | Steel-man, Weaknesses, Counter-arguments   | 4 checks          |
| socratic           | Questioner                       | Ask questions > Provide answers        | Questioning, Examining, Exploring          | 4 checks          |
| expert-panel       | Domain Expert                    | Accuracy > Agreeableness               | Assessment, Evidence, Consensus/Divergence | 5 checks          |
| devils-advocate    | Role-assigned (YES/NO/NEUTRAL)   | Maintain assigned stance               | Role-specific structure                    | 4 checks + stance |
| delphi             | Anonymous Expert                 | Honest assessment > Social conformity  | Position, Confidence, Response to Group    | 5 checks          |
| red-team-blue-team | RED (Attacker) / BLUE (Defender) | Team-specific constraints              | Team-specific structure                    | 4 checks          |

---

## 2. Proposed Improvements (87% Consensus)

### P0: Evidence-Grounding Protocol (L2)

**Add to LAYER 2 in all modes:**

```
=== EPISTEMIC LABELING ===

Label every substantive claim with ONE tag:
- [FACT] = directly verifiable; requires citation
- [INFER] = logical derivation from stated facts
- [ASSUME] = unverified premise or value choice

Format: "Your claim here.[FACT][1]"

Citation Rules:
- MANDATORY for [FACT] claims
- ENCOURAGED for [INFER] when relying on specific data
- [ASSUME] MUST NOT carry citations
```

### P1: Exit Criteria (L4)

**Add to LAYER 4 / Debate Controller:**

```
=== EXIT CRITERIA ===

TERMINATE when ANY trigger fires:

1. CONSENSUS THRESHOLD:
   - >=80% agents vote ACCEPT or MINOR
   - Zero BLOCKER objections unresolved
   - All agents confidence >=0.70

2. CONVERGENCE PLATEAU:
   - <10% change across 2 consecutive rounds
   - No new [FACT] claims introduced

3. ROUND CAP:
   - Maximum rounds reached (default: 5-6)

VOTE RUBRIC:
- ACCEPT = supports shipping as-is
- MINOR = acceptable with small edits
- BLOCKER = must change before acceptance
```

### P2: Anti-Conformity Mechanism (L3)

**Add to LAYER 3:**

```
=== ANTI-CONFORMITY MECHANISM ===

PERSPECTIVE ANCHORS (assign per agent):
- Agent A: "Practical implementation & feasibility"
- Agent B: "Theoretical rigor & edge cases"
- Agent C: "User experience & accessibility"

UNIQUE CONTRIBUTION REQUIREMENT:
Before agreeing with consensus, MUST:
1. Identify >=1 concern/limitation NOT yet raised
2. Propose >=1 alternative approach (even if inferior)

STEELMAN-FIRST:
"Restate the proposal's strongest rationale before critiquing."

EVIDENCE-TETHERED DISSENT:
Disagreements must cite [FACT] conflicts or [INFER] gaps.
```

### P3: Safety Constraints (L2)

**Add to LAYER 2 for adversarial/red-team modes:**

```
=== SAFETY CONSTRAINTS ===

ALLOWED:
- High-level discussion of threats and vulnerabilities
- Identification of failure modes and misuse scenarios
- Proposing mitigations and safer designs

DISALLOWED:
- Step-by-step exploit instructions
- Guidance to evade security/safety safeguards
- Personalized manipulation or harassment

RULE: For each vulnerability, MUST propose >=1 mitigation.
```

### P4: Verification Checklist (L4)

**Replace existing verification with standardized 7 questions:**

```
=== 7 UNIVERSAL VERIFICATION QUESTIONS ===

[] 1. CLARITY: Core position stated explicitly?
[] 2. GROUNDING: All [FACT] claims cited?
[] 3. ALTERNATIVES: >=2 alternatives considered with rejection rationale?
[] 4. RISKS: Top 3 failure modes + mitigations identified?
[] 5. UNCERTAINTY: What remains uncertain? What evidence resolves it?
[] 6. CONSISTENCY: Any internal contradictions?
[] 7. SAFETY: Avoids harmful guidance? Considers misuse?

MODE-SPECIFIC ADDITIONS:
- Collaborative: +Built on others' insights? +Synthesis opportunities?
- Adversarial: +Steel-manned opponent? +Strongest counter-argument?
- Red-Team: +Covered threat actors? +Provided mitigations for each risk?
```

---

## 3. Context Passing Architecture

### 3.1 Data Flow Overview

```
                    SESSION
                       |
    +------------------+------------------+
    |                                     |
    v                                     v
 ROUND 1                              ROUND N
    |                                     |
    v                                     v
+--------+  +--------+  +--------+    +--------+
| Agent1 |  | Agent2 |  | Agent3 |    | Agent1 |  ...
+--------+  +--------+  +--------+    +--------+
    |           |           |             |
    v           v           v             v
+-----------------------------------------------+
|              previousResponses[]              |
|  (accumulated across all previous rounds)     |
+-----------------------------------------------+
```

### 3.2 DebateContext Structure

```typescript
interface DebateContext {
  sessionId: string;        // Unique session identifier
  topic: string;            // Debate topic
  mode: DebateMode;         // collaborative | adversarial | ...
  currentRound: number;     // 1-indexed round number
  totalRounds: number;      // Total planned rounds
  previousResponses: AgentResponse[];  // ALL prior responses
  focusQuestion?: string;   // Optional focus for this round
  modePrompt?: string;      // Mode-specific prompt (set by strategy)
}
```

### 3.3 AgentResponse Structure

```typescript
interface AgentResponse {
  agentId: string;          // Agent identifier
  agentName: string;        // Human-readable name
  stance?: Stance;          // YES | NO | NEUTRAL (mode-specific)
  position: string;         // Core position statement
  reasoning: string;        // Detailed reasoning
  confidence: number;       // 0.0 - 1.0
  citations?: Citation[];   // Source citations
  toolCalls?: ToolCallRecord[];  // Tool usage log
  timestamp: Date;          // Response timestamp
}
```

### 3.4 Information Flow Diagram

```
+------------------+     +-----------------+     +------------------+
|  SessionManager  |     |  DebateEngine   |     |  ModeStrategy    |
+------------------+     +-----------------+     +------------------+
         |                       |                       |
         |  1. Create Session    |                       |
         |---------------------->|                       |
         |                       |                       |
         |  2. Get Session       |                       |
         |<----------------------|                       |
         |                       |                       |
         |                       |  3. executeRound()    |
         |                       |---------------------->|
         |                       |                       |
         |                       |     4. Build Context  |
         |                       |     +---------------+ |
         |                       |     | DebateContext | |
         |                       |     | - topic       | |
         |                       |     | - mode        | |
         |                       |     | - round       | |
         |                       |     | - prevResp[]  | |
         |                       |     | - modePrompt  | |
         |                       |     +---------------+ |
         |                       |                       |
         |                       |     5. For each Agent:|
         |                       |     +---------------+ |
         |                       |     | buildSystem() | |
         |                       |     | buildUser()   | |
         |                       |     | -> API Call   | |
         |                       |     | parseResp()   | |
         |                       |     +---------------+ |
         |                       |                       |
         |                       |  6. Return responses  |
         |                       |<----------------------|
         |                       |                       |
         |  7. Store responses   |                       |
         |<----------------------|                       |
         |                       |                       |
```

### 3.5 What Each Agent Receives

#### System Prompt (buildSystemPrompt)

```
[Base System Prompt - Agent identity]
  |
  v
[Mode Prompt - 4-Layer structure]
  |
  v
[Debate Metadata]
  - Topic: {topic}
  - Mode: {mode}
  - Round {current} of {total}
  - Focus Question: {focusQuestion}
  |
  v
[Instructions]
  - Provide position clearly
  - Support with reasoning
  - Express confidence (0-1)
  - Cite sources if using tools
```

#### User Message (buildUserMessage)

```
[Previous Responses Section]
  |
  +-- For each response in previousResponses[]:
  |     --- {agentName} ---
  |     Position: {position}
  |     Reasoning: {reasoning}
  |     Confidence: {confidence}%
  |     Sources: {citations}
  |
  v
[Response Format Instruction]
  {
    "stance": "YES" | "NO" | "NEUTRAL",
    "position": "...",
    "reasoning": "...",
    "confidence": 0.0 to 1.0
  }
```

### 3.6 Parallel vs Sequential Execution

```
PARALLEL (collaborative, expert-panel, delphi):
+------------------------------------------------------------------+
|  Round N                                                          |
|                                                                   |
|  +----------+  +----------+  +----------+                        |
|  | Agent 1  |  | Agent 2  |  | Agent 3  |  <- Same context       |
|  | (sees    |  | (sees    |  | (sees    |     (previous rounds)  |
|  |  R1-R{N-1})|  R1-R{N-1})|  R1-R{N-1})|                        |
|  +----------+  +----------+  +----------+                        |
|       |             |             |                               |
|       +-------------+-------------+                               |
|                     |                                             |
|                     v                                             |
|              [Round N Responses]                                  |
+------------------------------------------------------------------+

SEQUENTIAL (adversarial, socratic, devils-advocate):
+------------------------------------------------------------------+
|  Round N                                                          |
|                                                                   |
|  +----------+                                                     |
|  | Agent 1  | <- sees R1-R{N-1}                                  |
|  +----------+                                                     |
|       |                                                           |
|       v                                                           |
|  +----------+                                                     |
|  | Agent 2  | <- sees R1-R{N-1} + Agent1's response              |
|  +----------+                                                     |
|       |                                                           |
|       v                                                           |
|  +----------+                                                     |
|  | Agent 3  | <- sees R1-R{N-1} + Agent1 + Agent2's responses    |
|  +----------+                                                     |
|       |                                                           |
|       v                                                           |
|              [Round N Responses]                                  |
+------------------------------------------------------------------+
```

---

## 4. Current Limitations in Context Passing

### 4.1 What IS Passed

| Element      | Included | Format                         |
| ------------ | -------- | ------------------------------ |
| Agent Name   | Yes      | Plain text                     |
| Position     | Yes      | Full text                      |
| Reasoning    | Yes      | Full text                      |
| Confidence   | Yes      | Percentage                     |
| Citations    | Yes      | Title list only                |
| Timestamp    | No       | -                              |
| Tool Calls   | No       | -                              |
| Stance       | No       | (only in JSON response format) |
| Round Number | No       | (implicit from order)          |

### 4.2 What is NOT Passed

1. **Structured epistemic labels** - No [FACT]/[INFER]/[ASSUME] tagging
2. **Round boundaries** - Unclear which responses are from which round
3. **Vote status** - No ACCEPT/MINOR/BLOCKER tracking
4. **Confidence changes** - No delta tracking between rounds
5. **Key disagreements** - Not explicitly highlighted
6. **Tool call details** - Only citations extracted, not full tool usage

### 4.3 Potential Issues

```
ISSUE 1: Context Inflation
+---------------------------+
|  Round 1: 3 responses     |  ~3K tokens
|  Round 2: +3 responses    |  ~6K tokens
|  Round 3: +3 responses    |  ~9K tokens
|  Round 4: +3 responses    |  ~12K tokens
|  ...                      |
+---------------------------+
Problem: Linear growth in context size
```

```
ISSUE 2: Lost Structure
+---------------------------+
|  Original Response:       |
|  "Based on [FACT][1]..."  |
|                           |
|  Passed as:               |
|  "Based on ..."           |  <- Labels stripped
+---------------------------+
Problem: Epistemic labels not preserved
```

```
ISSUE 3: No Summarization
+---------------------------+
|  Round 1-5: Full content  |
|  Round 6: Still full      |  <- No compression
|  Round 7: Still full      |
+---------------------------+
Problem: No progressive summarization
```

---

## 5. Proposed Context Passing Improvements

### 5.1 Enhanced AgentResponse Structure

```typescript
interface EnhancedAgentResponse {
  // Existing fields
  agentId: string;
  agentName: string;
  position: string;
  reasoning: string;
  confidence: number;

  // New fields
  roundNumber: number;           // Explicit round tagging
  stance?: Stance;               // YES/NO/NEUTRAL
  epistemicClaims?: {
    facts: string[];             // [FACT] labeled claims
    inferences: string[];        // [INFER] labeled claims
    assumptions: string[];       // [ASSUME] labeled claims
  };
  vote?: 'ACCEPT' | 'MINOR' | 'BLOCKER';
  confidenceChange?: {
    delta: number;
    previousRound: number;
    reason: string;
  };
  keyPoints?: string[];          // Extracted key points (2-3)
  perspectiveAnchor?: string;    // Assigned focus area
}
```

### 5.2 Summarized Context Format

```
=== ROUND {N} SUMMARY ===

CONSENSUS STATUS: {HIGH|MEDIUM|LOW} ({score}%)

KEY AGREEMENTS:
- {agreement 1}
- {agreement 2}

UNRESOLVED DISAGREEMENTS:
- {disagreement 1}: Agent A (YES) vs Agent B (NO)
- {disagreement 2}: ...

AGENT POSITIONS:
+------------+--------+-------+--------+------------------+
| Agent      | Stance | Conf  | Vote   | Key Point        |
+------------+--------+-------+--------+------------------+
| Claude     | YES    | 85%   | ACCEPT | {2-line summary} |
| ChatGPT    | NO     | 78%   | MINOR  | {2-line summary} |
| Perplexity | NEUTRAL| 80%   | ACCEPT | {2-line summary} |
+------------+--------+-------+--------+------------------+

NEW EVIDENCE THIS ROUND:
- [FACT][1]: {claim} (Source: {citation})
- [FACT][2]: {claim} (Source: {citation})

=== FULL RESPONSES (expandable) ===
[Previous full response content, optionally collapsed]
```

### 5.3 Progressive Summarization Strategy

```
ROUND 1-2: Full responses (building context)
           |
           v
ROUND 3+:  Summary of R1-2 + Full R3
           |
           v
ROUND 5+:  Summary of R1-4 + Full R5
           |
           v
Final:     Executive summary + Key evidence + Final positions
```

---

## 6. Implementation Checklist

### Phase 1: Core Improvements
- [ ] Add epistemic labels to prompt instructions (P0)
- [ ] Implement vote tracking (ACCEPT/MINOR/BLOCKER)
- [ ] Add round number to context display
- [ ] Extract and display stance field

### Phase 2: Exit Criteria
- [ ] Add consensus threshold check (>=80%)
- [ ] Implement convergence plateau detection
- [ ] Add round cap enforcement
- [ ] Create vote rubric display

### Phase 3: Anti-Conformity
- [ ] Implement perspective anchor assignment
- [ ] Add unique contribution requirement to prompts
- [ ] Add steelman-first instruction
- [ ] Implement groupthink guard trigger

### Phase 4: Context Optimization
- [ ] Implement progressive summarization
- [ ] Add key points extraction
- [ ] Create summarized context format
- [ ] Add confidence change tracking

---

## 7. Context Passing Design (Roundtable Consensus)

### 7.1 Two-Layer Protocol

```
+------------------------------------------------------------------+
|  LAYER A: DebateState (Canonical, Always Passed)                 |
|  - Claims with stable IDs (C1, C2, ...)                          |
|  - Evidence registry with IDs (E1, E2, ...)                      |
|  - Decisions & constraints                                        |
|  - Agent status (stance, confidence, vote)                        |
|  Target: 800-2000 tokens                                          |
+------------------------------------------------------------------+
                              +
+------------------------------------------------------------------+
|  LAYER B: RoundPackets (Bounded Window)                          |
|  - Historical rounds: Summarized (150-300 tokens/round)          |
|  - Previous round: Full fidelity (optional)                      |
|  - Current round: Instructions only                               |
+------------------------------------------------------------------+
```

### 7.2 DebateState Structure

```json
{
  "debateState": {
    "topic": "...",
    "round": 3,
    "participants": ["Claude", "ChatGPT", "Perplexity"],

    "claims": [
      {
        "id": "C1",
        "text": "Atomic claim text (<=30 tokens)",
        "label": "FACT|INFER|ASSUME|OPEN",
        "status": "accepted|contested|retracted|open",
        "introduced_round": 1,
        "last_updated_round": 3,
        "support": ["E1", "E6"],
        "opposition": ["C2"]
      }
    ],

    "evidence": [
      {
        "id": "E1",
        "kind": "citation|tool_output|calculation",
        "title": "Title",
        "url": "https://...",
        "supports": ["C1"],
        "gist": "<=25 tokens",
        "added_round": 1
      }
    ],

    "decisions": [
      {"id": "D1", "text": "Decision/constraint", "round": 2}
    ],

    "agent_status": [
      {
        "agent": "Claude",
        "stance": "PRO",
        "confidence": 0.85,
        "confidence_delta": 0.06,
        "vote": "MAINTAIN"
      }
    ]
  }
}
```

### 7.3 Historical Round Summary Format

```json
{
  "historicalRounds": [
    {
      "round": 1,
      "summary": {
        "global": {
          "one_liner": "<=35 tokens: what changed this round",
          "new_claims": ["C1", "C2"],
          "new_evidence": ["E1"],
          "decisions": ["D1"]
        },
        "by_agent": [
          {
            "agent": "Claude",
            "stance": "PRO",
            "confidence": 0.85,
            "confidence_delta": 0.00,
            "key_moves": [
              {"type": "claim", "ref": "C1", "note": "<=20 tokens"}
            ]
          }
        ],
        "contested": [
          {"claim": "C2", "best_pro": "<=25 tokens", "best_con": "<=25 tokens"}
        ]
      }
    }
  ]
}
```

### 7.4 Current Round Full Context

```json
{
  "previousRound": {
    "round": 2,
    "agent_responses": [
      {
        "agent": "Claude",
        "stance": "PRO",
        "vote": "MAINTAIN",
        "confidence": 0.85,
        "confidence_delta": 0.06,
        "text_full": "FULL TEXT HERE",
        "claims_touched": {
          "introduced": ["C9"],
          "reinforced": ["C1"],
          "challenged": ["C2"]
        },
        "citations_used": ["E6"],
        "direct_replies_to": ["ChatGPT"]
      }
    ]
  }
}
```

### 7.5 Token Budget Guidelines

| Component                | Target          | Max       |
| ------------------------ | --------------- | --------- |
| DebateState              | 800-2000        | 2500      |
| Historical round summary | 150-300/round   | 400/round |
| Previous round full      | 2500-4000 total | 5000      |
| Current instructions     | <150            | 200       |
| **Total context**        | **<8K**         | **10K**   |

### 7.6 Summarization Triggers

```
TRIGGER 1: Round-based
- After Round 2 → Summarize Round 1
- After Round N → Summarize Round N-2

TRIGGER 2: Token-based (backstop)
- If context > 8K tokens → Force compression of oldest material

POLICY:
+------------------+-------------------+-------------------+
| Round Position   | Treatment         | Example (Round 5) |
+------------------+-------------------+-------------------+
| Current          | Instructions only | Round 5           |
| N-1 (Previous)   | Full fidelity     | Round 4           |
| N-2 to N-3       | Structured summary| Round 2-3         |
| Older            | Merged into State | Round 1           |
+------------------+-------------------+-------------------+
```

### 7.7 Claim/Evidence ID System

```
CLAIM IDs: C1, C2, C3, ...
- Atomic, self-contained statements (<=30 tokens)
- Tagged with epistemic label: FACT|INFER|ASSUME|OPEN
- Status tracked: accepted|contested|retracted|open

EVIDENCE IDs: E1, E2, E3, ...
- Citations, tool outputs, calculations
- Linked to claims they support/oppose
- Preserved across rounds

BENEFITS:
- Agents can reference C3 instead of re-quoting
- Prevents drift when prose is summarized
- Clear chain of reasoning
```

---

## 8. Implementation Priority

### Phase 1: Foundation (Immediate)
1. Add round number to AgentResponse
2. Display round boundaries in context
3. Add stance field tracking
4. Implement vote status (ACCEPT/MINOR/BLOCKER)

### Phase 2: Epistemic Structure
1. Add epistemic labels to prompts
2. Implement claim extraction
3. Create evidence registry
4. Build DebateState structure

### Phase 3: Progressive Summarization
1. Implement round summarization
2. Add token counting
3. Create summarization triggers
4. Build historical round format

### Phase 4: Full Integration
1. Integrate DebateState with all modes
2. Add claim/evidence ID system
3. Implement confidence delta tracking
4. Create full context protocol

---

## 9. Final Roundtable Consensus (December 2024)

Six adversarial roundtables (4 rounds each) resolved remaining design disagreements:

### 9.1 Consensus Summary

| # | Topic | Final Consensus | Score |
|---|-------|-----------------|-------|
| 1 | Stance Field Scope | Keep EXCLUSIVE to devils-advocate mode | 92% |
| 2 | Safety Evaluator Role | Adaptive Safety Protocol (integral architecture + conditional role) | 92% |
| 3 | Groupthink Detection | Hybrid 2-stage trigger (stagnation + early convergence) | 92% |
| 4 | Citation Format | Strict numeric only `[1][2]` | 98% |
| 5 | Perspective Anchors | Fixed anchors with flexible intensity | 85% |
| 6 | Verification Count | 7 universal + 2 per mode + opt-in 3rd | 92% |

### 9.2 Decision Details

#### Decision 1: Stance Field Scope (92%)

```
FINAL: Keep stance field EXCLUSIVE to devils-advocate mode.

RATIONALE:
- Forcing semantically different concepts (belief vs tactical positioning vs team assignment)
  into a single field creates analytically unreliable data
- Mode-specific fields with clear semantics reduce maintenance complexity
- Cross-mode analytics achievable via separate optional `debate_alignment` field

IMPLEMENTATION:
interface AgentResponse {
  stance?: Stance;  // Only meaningful for devils-advocate mode
  debateAlignment?: string;  // Optional: mode-appropriate value for analytics
}
```

#### Decision 2: Safety Evaluator Role (92%)

```
FINAL: Adaptive Safety Protocol with 3-tier architecture

┌─────────────────────────────────────────────────────────────┐
│  TIER 1: Lightweight Monitoring (Always-on)                 │
│  - Continuous cheap detection                               │
│  - Overhead: 1-2%                                           │
│  - Non-bypassable generation-time blocks                    │
├─────────────────────────────────────────────────────────────┤
│  TIER 2: Risk Triggers (Automatic Activation)               │
│  - Mode-based: adversarial, red-team, devils-advocate       │
│  - Topic-based: security, medical, legal                    │
│  - Intent-based: harmful patterns detected                  │
│  - Context-based: vulnerable user populations               │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: Full Safety Evaluator (When Triggered)             │
│  - Dedicated independent evaluation role                    │
│  - Overhead: 20-30%                                         │
│  - Auto-exits when risk clears                              │
└─────────────────────────────────────────────────────────────┘

KEY INSIGHT: Safety is INTEGRAL at protocol level, but Safety Evaluator ROLE
is conditionally instantiated. The role is mandatory when triggered, not optional.
```

#### Decision 3: Groupthink Detection (92%)

```
FINAL: Hybrid 2-stage trigger system

┌─────────────────────────────────────────────────────────────┐
│  PRIMARY TRIGGER: Stagnation-Based                          │
│  Fires when ALL conditions met for 2 consecutive rounds:    │
│  - New [FACT] claims per agent: < 1                         │
│  - Mean confidence change: ≤ 10%                            │
│  - Stance standard deviation: ≤ 0.15                        │
├─────────────────────────────────────────────────────────────┤
│  SECONDARY TRIGGER: Early Convergence + Diversity Gate      │
│  Fires when ALL conditions met by Round 2:                  │
│  - High confidence agents: ≥ 75% at ≥ 0.85 confidence       │
│  - PLUS diversity gate fails:                               │
│    - Sources cited: < 3, OR                                 │
│    - Premise overlap: ≥ 0.70, OR                            │
│    - Semantic clusters: < 2                                 │
├─────────────────────────────────────────────────────────────┤
│  INTERVENTION: Critical Objection Round                     │
│  - Mandatory when either trigger fires                      │
│  - Agents must provide counterarguments + alternatives      │
│  - Human escalation ONLY if objection round fails:          │
│    - No new facts generated                                 │
│    - Confidence remains ≥ 0.80                              │
│    - Belief change < 5%                                     │
└─────────────────────────────────────────────────────────────┘
```

#### Decision 4: Citation Format (98%)

```
FINAL: Strict numeric citations ONLY

FORMAT:
- Single: [1]
- Multiple: [1][2] or [1-3]
- Mandatory numbered References section at end

RATIONALE:
- Machine-parseable with simple regex: \[\d+(?:-\d+)?\]
- Enables automated validation, link-checking, deduplication
- Eliminates normalization edge cases of author-year formats
- Human readability preserved: mention names in prose, cite numerically

EXAMPLE:
"Smith argues that AI safety is paramount [1], while recent studies
suggest implementation challenges remain significant [2][3]."

References:
[1] Smith, J. (2024). AI Safety Principles. Nature AI.
[2] Chen, L. (2024). Implementation Challenges. ArXiv.
[3] Brown, A. (2024). Safety at Scale. NeurIPS.
```

#### Decision 5: Perspective Anchors (85%)

```
FINAL: Fixed anchors with flexible contribution intensity

FOUR PERMANENT FRAMEWORKS (assigned per agent):
┌────────────────────┬─────────────────────────────────────────┐
│ Risk-Attentive     │ Safety, robustness, failure modes,      │
│                    │ adversarial scenarios, worst-case       │
├────────────────────┼─────────────────────────────────────────┤
│ Implementation-    │ Practicality, feasibility, cost,        │
│ Focused            │ timeline, resource constraints          │
├────────────────────┼─────────────────────────────────────────┤
│ Evidence-          │ Data quality, uncertainty quantification│
│ Calibrated         │ empirical grounding, confidence bounds  │
├────────────────────┼─────────────────────────────────────────┤
│ Systems-Aware      │ Long-term effects, second-order         │
│                    │ consequences, ecosystem impact          │
└────────────────────┴─────────────────────────────────────────┘

FLEXIBLE INTENSITY:
- Agents receive PERMANENT anchor assignment
- Contribution intensity scales with topic relevance
- No mandatory per-round anchor arguments required
- Verification: outcome-based diversity assessment across rounds
```

#### Decision 6: Verification Questions (92%)

```
FINAL: 7 Universal + 2 Mode-specific + Opt-in 3rd

┌─────────────────────────────────────────────────────────────┐
│  7 UNIVERSAL QUESTIONS (all modes)                          │
│  1. CLARITY: Core position stated explicitly?               │
│  2. GROUNDING: All [FACT] claims cited?                     │
│  3. ALTERNATIVES: ≥2 alternatives with rejection rationale? │
│  4. RISKS: Top 3 failure modes + mitigations?               │
│  5. UNCERTAINTY: What remains uncertain?                    │
│  6. CONSISTENCY: Any internal contradictions?               │
│  7. SAFETY: Avoids harmful guidance?                        │
├─────────────────────────────────────────────────────────────┤
│  2 MODE-SPECIFIC QUESTIONS (per mode)                       │
│  - Collaborative: Built on others? Synthesis opportunities? │
│  - Adversarial: Steel-manned? Strongest counter-argument?   │
│  - Socratic: Opened inquiry? Avoided premature closure?     │
│  - Expert-Panel: Domain expertise applied? Evidence-based?  │
│  - Devils-Advocate: Maintained stance? Challenged consensus?│
│  - Delphi: Independent assessment? Avoided anchoring?       │
│  - Red-Team: Threat coverage? Mitigations provided?         │
├─────────────────────────────────────────────────────────────┤
│  1 OPT-IN SAFETY QUESTION (user-declared high-stakes)       │
│  Categories:                                                │
│  - Security/abuse potential                                 │
│  - Medical/legal implications                               │
│  - Agentic execution with real-world effects                │
│  - Real-time/safety-critical systems                        │
│                                                             │
│  Question focuses on:                                       │
│  - Scope boundaries                                         │
│  - Human approval gates                                     │
│  - Abort/rollback mechanisms                                │
├─────────────────────────────────────────────────────────────┤
│  TOTALS:                                                    │
│  - Default: 9 questions (7 + 2)                             │
│  - High-stakes opt-in: 10 questions (7 + 2 + 1)             │
│  - Hard cap: 10 questions maximum                           │
├─────────────────────────────────────────────────────────────┤
│  REVIEW: 12-month empirical review of opt-in patterns       │
└─────────────────────────────────────────────────────────────┘
```

### 9.3 Roundtable Session References

| Topic | Session ID | Rounds | Final Score |
|-------|------------|--------|-------------|
| Stance Field | `5865dbb9-a9b8-4e34-9e1c-df0132ced657` | 4 | 92% |
| Safety Evaluator | `c14f2f58-e797-4207-9db4-93615f9f35f6` | 4 | 92% |
| Groupthink Detection | `fe314a52-b4cc-4921-aa07-75c232f50059` | 4 | 92% |
| Citation Format | `d397fe06-cff4-48e5-8ee3-9217f6aeca80` | 4 | 98% |
| Perspective Anchors | `dd1076fe-3267-47ff-ab19-7b24200af755` | 4 | 85% |
| Verification Count | `f51875ad-298a-4fcd-91e7-0d9c0f49b9ac` | 4 | 92% |

---

## References

- Roundtable Session: `40edf035-2dc3-487b-930e-ec6b32316544` (Design Details)
- Roundtable Session: `17265281-b909-4cc0-a58e-e1f769f16113` (Stance Field Decision)
- Roundtable Session: `d83e321e-653a-4622-a7ae-a3b15b2ee96e` (Prompt Quality Review)
- Roundtable Session: `c468d47b-3fa7-470b-9db1-464446b4edec` (Context Passing Design)
- Roundtable Sessions: See Section 9.3 (Final Consensus Decisions)
