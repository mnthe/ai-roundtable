# MCP Response & Input Improvements Plan

**Date**: 2026-01-04  
**Branch**: `feature/mcp-response-improvements`  
**Status**: Planning Phase

## Executive Summary

Comprehensive analysis of AI Roundtable MCP system revealed opportunities for improvement in three key areas:
1. **Debug mode** for verbose responses
2. **exitOnConsensus** parameter implementation
3. **Enhanced AI prompts** for richer, more detailed responses

---

## 📊 Analysis Findings

### 1. Unused Parameter: `exitOnConsensus`

**Status**: ❌ Defined but not implemented

**Current Flow**:
```
StartRoundtableInputSchema (validates exitOnConsensus)
  ↓
handleStartRoundtable (parses but ignores)
  ↓
DebateConfig (doesn't include exitOnConsensus)
  ↓
Session (doesn't store exitOnConsensus)
  ↓
debateEngine.executeRounds (uses global EXIT_CRITERIA_CONFIG.enabled)
```

**Impact**: Users can set `exitOnConsensus: true` but it has zero effect. Exit criteria are globally controlled, not per-session.

**Required Changes**:
- Add to `DebateConfig` interface
- Add to `Session` interface  
- Store in SQLite sessions table
- Pass to debate engine
- Override global exit criteria per-session

---

### 2. Hardcoded Thresholds in Response Builders

**Locations Found**:

| File | Line | Threshold | Purpose |
|------|------|-----------|---------|
| `decision-layer.ts` | 14 | `0.7` | High consensus level |
| `decision-layer.ts` | 15 | `0.4` | Medium consensus level |
| `decision-layer.ts` | 28 | `0.8` | High confidence + high consensus |
| `decision-layer.ts` | 36 | `0.6` | Low confidence threshold |
| `decision-layer.ts` | 44 | `0.5` | Very low confidence |
| `metadata-layer.ts` | 20 | `0.6` | Low confidence agents filter |
| `metadata-layer.ts` | 42 | `0.5` | Min reasoning length ratio |
| `analysis-layer.ts` | 73 | `0.04` | Confidence variance threshold |
| `response-builder/index.ts` | 151 | `200` | Consensus summary max length |

**Impact**: No flexibility for different use cases. Production quality thresholds are hardcoded.

---

### 3. Response Field Analysis

**ToolCallRecord.input/output**:
- ✅ **Keep**: Stored internally for debugging/auditing
- ⚠️ **Conditionally expose**: Only in debug mode for MCP clients

**consensusSummary truncation**:
- ❌ **Issue**: Hard cut at 200 chars, breaks sentences
- ✅ **Solution**: Smart truncation at sentence boundaries + debug mode bypass

---

### 4. AI Response Quality Analysis

**Current Prompt Structure** (4 layers):
1. **Role Anchor**: Mode-specific identity
2. **Behavioral Contract**: Required/prohibited behaviors
3. **Structural Enforcement**: Output format requirements  
4. **Verification Loop**: Self-check before submission

**Output Format Requirements**:
```json
{
  "position": "Clear stance",
  "reasoning": "Detailed explanation",
  "confidence": 0.0-1.0
}
```

**Issues Identified**:
- ✅ Prompts are well-structured and comprehensive
- ⚠️ **Opportunity**: Add explicit length/detail requirements
- ⚠️ **Opportunity**: Add examples of high-quality vs low-quality responses
- ⚠️ **Opportunity**: Enforce minimum reasoning depth

---

## 🎯 Improvement Plan

### Phase 1: Debug Mode Infrastructure (Priority: HIGH)

#### 1.1 Create Response Configuration System

**New File**: `src/config/response.ts`

```typescript
interface ResponseConfig {
  debugMode: boolean;
  debugToolCalls: boolean;
  consensusSummaryMaxLength: number;
  thresholds: {
    lowConfidence: number;
    confidenceVariance: number;
    minReasoningLengthRatio: number;
    highConsensus: number;
    mediumConsensus: number;
  };
}
```

**Environment Variables**:
```bash
ROUNDTABLE_DEBUG_MODE=false
ROUNDTABLE_DEBUG_TOOL_CALLS=false
ROUNDTABLE_CONSENSUS_SUMMARY_MAX_LENGTH=200
ROUNDTABLE_LOW_CONFIDENCE_THRESHOLD=0.6
ROUNDTABLE_CONFIDENCE_VARIANCE_THRESHOLD=0.04
ROUNDTABLE_MIN_REASONING_LENGTH_RATIO=0.5
ROUNDTABLE_HIGH_CONSENSUS_THRESHOLD=0.7
ROUNDTABLE_MEDIUM_CONSENSUS_THRESHOLD=0.4
```

#### 1.2 Update Response Builders

**Files to modify**:
- `src/mcp/handlers/response-builder/index.ts`
- `src/mcp/handlers/response-builder/decision-layer.ts`
- `src/mcp/handlers/response-builder/metadata-layer.ts`
- `src/mcp/handlers/response-builder/analysis-layer.ts`
- `src/mcp/handlers/utils/response-mapper.ts`

**Changes**:
- Replace hardcoded thresholds with `RESPONSE_CONFIG` values
- Add `truncateIfNeeded()` utility with sentence-boundary logic
- Include `consensusSummaryFull` in debug mode
- Include `toolCall.input/output` in debug mode
- Add `_debug` metadata field in debug mode

#### 1.3 Update Types

**src/types/index.ts**:
```typescript
export interface EvidenceLayer {
  totalCitations: number;
  conflicts: {...};
  consensusSummary: string;
  consensusSummaryFull?: string;  // Debug only
}

export interface DebugMetadata {
  agentId: string;
  agentName: string;
  rawReasoningLength: number;
  toolCallsCount: number;
  citationsCount: number;
  roleViolation?: {...};
}
```

---

### Phase 2: exitOnConsensus Implementation (Priority: HIGH)

#### 2.1 Type System Updates

**src/types/index.ts**:
```typescript
export interface DebateConfig {
  topic: string;
  mode: DebateMode;
  agents: string[];
  rounds?: number;
  focusQuestion?: string;
  perspectives?: Array<string | Perspective>;
  exitOnConsensus?: boolean;  // NEW
}

export interface Session {
  // ... existing fields ...
  exitOnConsensus?: boolean;  // NEW
}
```

#### 2.2 Storage Updates

**src/storage/sqlite.ts**:
```typescript
// Add column to sessions table
exit_on_consensus INTEGER DEFAULT 0
```

#### 2.3 Handler Updates

**src/mcp/handlers/session.ts**:
```typescript
const config: DebateConfig = {
  topic: input.topic,
  mode,
  agents: agentIds,
  rounds: input.rounds || 3,
  perspectives: input.perspectives,
  exitOnConsensus: input.exitOnConsensus,  // NEW: pass through
};
```

#### 2.4 Debate Engine Updates

**src/core/debate-engine.ts**:
```typescript
async executeRounds(...): Promise<RoundResult[]> {
  // ...
  // Check exit criteria if enabled (globally OR per-session)
  const exitEnabled = 
    this.exitCriteriaConfig.enabled || 
    session.exitOnConsensus === true;
    
  if (exitEnabled && i < numRounds - 1) {
    // ... existing exit criteria check
  }
}
```

---

### Phase 3: Enhanced AI Response Prompts (Priority: MEDIUM)

#### 3.1 Add Response Quality Layer

**New Layer**: "Output Quality Expectations" (Layer 2.5)

Insert after Behavioral Contract, before Structural Enforcement:

```typescript
export interface OutputQualityConfig {
  minReasoningLength: number;
  minKeyPoints: number;
  requireEvidence: boolean;
  requireCounterarguments: boolean;
  exampleGood?: string;
  exampleBad?: string;
}
```

**Prompt Addition**:
```
===================================================
LAYER 2.5: OUTPUT QUALITY EXPECTATIONS
===================================================

REASONING DEPTH:
□ Minimum 300 words (aim for 500-800 for complex topics)
□ Provide at least 3 distinct key points
□ Each point must have supporting evidence or logic
□ Address potential counterarguments proactively

EVIDENCE REQUIREMENTS:
□ Cite specific data, studies, or examples
□ Use search_web tool for recent information
□ Use fact_check tool for disputed claims
□ Provide source attribution for all factual claims

RESPONSE QUALITY INDICATORS:
✓ GOOD: "According to a 2025 MIT study [citation], AI adoption increased by 47% in manufacturing. This suggests three key trends: (1) cost reduction drives adoption (avg. 23% savings), (2) workforce retraining is critical (65% of companies report skill gaps), (3) regulatory clarity accelerates deployment (EU AI Act correlation)."

✗ BAD: "AI is becoming more popular in many industries. Companies are adopting it because it's useful. There are some challenges though."

MINIMUM STANDARDS:
- Reasoning length: 300+ words
- Key points: 3+ distinct arguments
- Evidence citations: 2+ sources
- Confidence justification: Explicit reasoning for confidence score
```

#### 3.2 Update Mode Configs

**Files to modify**:
- All mode config files in `src/modes/configs/`

**Add to each config**:
```typescript
const COLLABORATIVE_CONFIG: ModePromptConfig = {
  // ... existing config ...
  outputQuality: {
    minReasoningLength: 300,
    minKeyPoints: 3,
    requireEvidence: true,
    requireCounterarguments: false,
  },
};
```

#### 3.3 Update Prompt Builder

**src/modes/utils/prompt-builder.ts**:

```typescript
export function buildOutputQualityLayer(
  config: OutputQualityConfig
): string {
  // Build quality expectations layer
}

export function buildModePrompt(
  config: ModePromptConfig, 
  context: DebateContext
): string {
  let prompt = `Mode: ${config.modeName}`;
  
  prompt += buildRoleAnchor(config.roleAnchor);
  prompt += buildBehavioralContract(config.behavioralContract, context.mode);
  prompt += buildOutputQualityLayer(config.outputQuality);  // NEW
  prompt += buildStructuralEnforcement(config.structuralEnforcement, context);
  prompt += buildVerificationLoop(config.verificationLoop, context.mode);
  prompt += buildFocusQuestionSection(context, config.focusQuestion);
  
  return prompt;
}
```

#### 3.4 Add Response Validation

**New utility**: `src/modes/utils/response-validator.ts`

```typescript
export interface ValidationResult {
  valid: boolean;
  warnings: string[];
  suggestions: string[];
}

export function validateResponseQuality(
  response: AgentResponse,
  qualityConfig: OutputQualityConfig
): ValidationResult {
  const warnings: string[] = [];
  const suggestions: string[] = [];
  
  // Check reasoning length
  if (response.reasoning.length < qualityConfig.minReasoningLength) {
    warnings.push(
      `Reasoning too short (${response.reasoning.length} chars, min: ${qualityConfig.minReasoningLength})`
    );
    suggestions.push('Expand reasoning with more detailed analysis and examples');
  }
  
  // Check key points
  const keyPoints = extractKeyPoints(response.reasoning);
  if (keyPoints.length < qualityConfig.minKeyPoints) {
    warnings.push(
      `Insufficient key points (${keyPoints.length}, min: ${qualityConfig.minKeyPoints})`
    );
    suggestions.push('Add more distinct arguments or perspectives');
  }
  
  // Check evidence
  if (qualityConfig.requireEvidence && (!response.citations || response.citations.length === 0)) {
    warnings.push('No citations provided');
    suggestions.push('Use search_web or fact_check tools to gather evidence');
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
    suggestions,
  };
}
```

---

### Phase 4: Testing & Documentation (Priority: HIGH)

#### 4.1 Unit Tests

**New test files**:
- `tests/unit/config/response.test.ts`
- `tests/unit/modes/utils/response-validator.test.ts`
- `tests/unit/mcp/handlers/response-builder-debug.test.ts`

**Existing test updates**:
- `tests/unit/mcp/handlers/session.test.ts` (exitOnConsensus)
- `tests/unit/storage/sqlite.test.ts` (exit_on_consensus column)

#### 4.2 Integration Tests

**New test file**: `tests/integration/debug-mode.test.ts`

Test scenarios:
- Debug mode includes full consensus summary
- Debug mode includes tool call input/output
- Debug mode includes _debug metadata
- Production mode truncates appropriately

**Update**: `tests/integration/e2e.test.ts`

Test scenarios:
- exitOnConsensus triggers early exit
- exitOnConsensus respects per-session setting

#### 4.3 Documentation Updates

**README.md**:
```markdown
### Debug Mode

Enable verbose responses for development:

\`\`\`bash
ROUNDTABLE_DEBUG_MODE=true
ROUNDTABLE_DEBUG_TOOL_CALLS=true
\`\`\`

Features:
- Full untruncated consensus summaries
- Complete tool call input/output
- Internal debugging metadata
- Performance metrics
```

**docs/API.md**:
- Add debug mode section
- Document new response fields
- Document exitOnConsensus behavior

**.env.example**:
- Add all new environment variables with descriptions

---

## 📅 Implementation Timeline

### Week 1: Phase 1 (Debug Mode)
- [ ] Day 1-2: Config system + response builder updates
- [ ] Day 3: Type updates + response mapper
- [ ] Day 4: Unit tests
- [ ] Day 5: Integration tests + documentation

### Week 2: Phase 2 (exitOnConsensus)
- [ ] Day 1: Type system updates
- [ ] Day 2: Storage updates + migration
- [ ] Day 3: Handler + debate engine updates
- [ ] Day 4: Unit tests
- [ ] Day 5: Integration tests + documentation

### Week 3: Phase 3 (Enhanced Prompts)
- [ ] Day 1-2: Output quality layer design
- [ ] Day 3: Prompt builder updates
- [ ] Day 4: Response validator
- [ ] Day 5: Testing + documentation

### Week 4: Polish & Release
- [ ] Day 1: End-to-end testing
- [ ] Day 2: Performance testing
- [ ] Day 3: Documentation review
- [ ] Day 4: Code review + fixes
- [ ] Day 5: Merge to main

---

## 🎯 Success Metrics

### Debug Mode
- ✅ All tests pass with debug mode enabled/disabled
- ✅ No performance degradation in production mode
- ✅ Full response details available in debug mode

### exitOnConsensus
- ✅ Per-session exit criteria working
- ✅ Backward compatible (null/undefined = use global setting)
- ✅ Early exit properly logged and tracked

### Enhanced Prompts
- ✅ Average reasoning length increases by 50%+
- ✅ Citation usage increases by 30%+
- ✅ Response quality validation passes 90%+

---

## 🔧 Breaking Changes

### None Expected

All changes are backward compatible:
- Debug mode defaults to `false` (production behavior unchanged)
- exitOnConsensus is optional (defaults to global setting)
- Enhanced prompts improve quality without breaking existing responses

---

## 📝 Notes

### Alternative Approaches Considered

1. **Response truncation**: Considered client-side truncation but decided server-side is better for bandwidth
2. **Exit criteria**: Considered new global flag but per-session is more flexible
3. **Prompt enhancements**: Considered few-shot examples but prompt length concerns

### Future Enhancements

- Response quality scoring system
- Adaptive prompt tuning based on response quality
- Per-mode quality thresholds
- A/B testing framework for prompt improvements

---

## 🤝 Contributors

- Analysis: Claude Code + explore agents
- Planning: Human + AI collaboration
- Implementation: TBD

