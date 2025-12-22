# Codebase Refactoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve maintainability, reusability, and architecture compliance across all layers

**Architecture:** Refactoring is organized by layer (MCP, Modes, Agents, Core, Types) with clear dependency order. Changes start from leaf modules (constants, utils) and propagate to dependent modules.

**Tech Stack:** TypeScript, Zod schemas, Template Method pattern

---

## Executive Summary

10개의 sub-agent가 전체 코드베이스를 분석한 결과:

| Layer | P0 | P1 | P2 | P3 | Total |
|-------|----|----|----|----|-------|
| MCP Handlers | 0 | 0 | 4 | 4 | 8 |
| Modes | 0 | 0 | 4 | 4 | 8 |
| Agents | 0 | 0 | 5 | 3 | 8 |
| Core | 0 | 0 | 4 | 5 | 9 |
| Storage/Tools | 0 | 0 | 2 | 2 | 4 |
| Types/Utils | 0 | 0 | 2 | 3 | 5 |
| **Total** | **0** | **0** | **21** | **21** | **42** |

**Critical(P0/P1) 이슈 없음** - 코드베이스는 전반적으로 건강합니다.

---

## Task 1: MCP Handlers - Error Messages 통합

**Priority:** P2
**Estimated Changes:** 4 files

**Files:**
- Modify: `src/mcp/handlers/constants.ts:1-11`
- Modify: `src/mcp/handlers/session.ts`
- Modify: `src/mcp/handlers/query.ts`
- Modify: `src/mcp/handlers/export.ts`

**Step 1: Expand ERROR_MESSAGES constant**

```typescript
// src/mcp/handlers/constants.ts
export const ERROR_MESSAGES = {
  // Existing
  AI_ANALYZER_NOT_AVAILABLE: 'AI consensus analyzer not available. Ensure API keys are configured.',

  // Session errors
  SESSION_NOT_FOUND: (sessionId: string) => `Session "${sessionId}" not found`,
  NO_AGENTS_AVAILABLE: 'No agents available. Please register agents first.',
  NO_ROUND_RESULTS: 'No round results available',

  // Query errors
  ROUND_NOT_EXIST: (round: number, current: number) =>
    `Round ${round} does not exist. Current round is ${current}`,
  NO_RESPONSES_FOR_ROUND: (round: number) => `No responses found for round ${round}`,
  AGENT_NOT_FOUND: (agentId: string) => `Agent "${agentId}" not found`,
  AGENT_NOT_PARTICIPATE: (agentId: string, round: number) =>
    `Agent "${agentId}" did not participate in round ${round}`,
  NO_CITATIONS: 'No citations found in this debate',

  // Export errors
  SESSION_NO_RESPONSES: (sessionId: string) =>
    `Session "${sessionId}" has no responses to export`,
} as const;
```

**Step 2: Update session.ts to use ERROR_MESSAGES**

Replace inline strings with constants:
- Line 45: `'No agents available...'` → `ERROR_MESSAGES.NO_AGENTS_AVAILABLE`
- Line 84: `'No round results available'` → `ERROR_MESSAGES.NO_ROUND_RESULTS`

**Step 3: Update query.ts to use ERROR_MESSAGES**

Replace inline strings with function calls:
- Line 65: Template literal → `ERROR_MESSAGES.ROUND_NOT_EXIST(round, session.currentRound)`
- Line 188: Template literal → `ERROR_MESSAGES.AGENT_NOT_FOUND(input.agentId)`

**Step 4: Update export.ts to use ERROR_MESSAGES**

Similar replacements for session/export error messages.

**Verification:**
```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## Task 2: MCP Handlers - Response Mapping 개선

**Priority:** P2/P3
**Estimated Changes:** 2 files

**Files:**
- Modify: `src/mcp/handlers/utils.ts:22-55`

**Step 1: Add stance field to MappedResponse**

```typescript
// src/mcp/handlers/utils.ts
export interface MappedResponse {
  position: string;
  reasoning: string;
  confidence: number;
  stance?: 'YES' | 'NO' | 'NEUTRAL';  // Add this line
  citations?: AgentResponse['citations'];
  toolCalls?: { toolName: string; timestamp: Date }[];
  timestamp: Date;
}
```

**Step 2: Update mapResponseForOutput to include stance**

```typescript
export function mapResponseForOutput(response: AgentResponse): MappedResponse {
  return {
    position: response.position,
    reasoning: response.reasoning,
    confidence: response.confidence,
    stance: response.stance,  // Add this line
    citations: response.citations,
    toolCalls: response.toolCalls?.map((tc) => ({
      toolName: tc.toolName,
      timestamp: tc.timestamp,
    })),
    timestamp: response.timestamp,
  };
}
```

**Verification:**
```bash
pnpm typecheck && pnpm test tests/unit/mcp/
```

---

## Task 3: Modes - buildModePrompt() 일관성 개선

**Priority:** P2
**Estimated Changes:** 3 files

**Files:**
- Modify: `src/modes/devils-advocate.ts:443-466`
- Modify: `src/modes/red-team-blue-team.ts:258-290`
- Modify: `src/modes/delphi.ts:183-204`

**Step 1: Update delphi.ts to pass mode parameter**

```typescript
// src/modes/delphi.ts - buildAgentPrompt method
buildAgentPrompt(context: DebateContext): string {
  let prompt = buildRoleAnchor(DELPHI_ROLE_ANCHOR);
  prompt += buildBehavioralContract(DELPHI_BEHAVIORAL_CONTRACT, context.mode);  // Add mode
  // ... rest of the method
  prompt += buildVerificationLoop(DELPHI_VERIFICATION_LOOP, context.mode);  // Add mode
  return prompt;
}
```

**Step 2: Update devils-advocate.ts similarly**

Update `buildPrimaryPrompt`, `buildOppositionPrompt`, `buildEvaluatorPrompt` methods to pass `context.mode` to `buildBehavioralContract` and `buildVerificationLoop`.

**Step 3: Update red-team-blue-team.ts similarly**

Update `buildRedTeamPrompt` and `buildBlueTeamPrompt` methods.

**Verification:**
```bash
pnpm test tests/unit/modes/
```

---

## Task 4: Modes - transformContext modePrompt 중복 제거

**Priority:** P2
**Estimated Changes:** 4 files

**Files:**
- Modify: `src/modes/base.ts:158-175`
- Modify: `src/modes/expert-panel.ts:241-253`
- Modify: `src/modes/devils-advocate.ts:317-328`
- Modify: `src/modes/red-team-blue-team.ts:222-236`

**Step 1: Modify base.ts executeParallel flow**

Option A: Remove modePrompt setting from base.ts, let transformContext handle it
Option B: Make transformContext NOT set modePrompt, only transform context

Recommended: Option B (less invasive)

```typescript
// src/modes/expert-panel.ts - transformContext
protected override transformContext(
  context: DebateContext,
  agent: BaseAgent
): DebateContext {
  const agentIndex = this.getAgentIndexFromId(agent.id);
  const perspective = this.agentPerspectives.get(agentIndex) || 'General perspective';

  // Only add perspective to existing modePrompt, don't rebuild
  const perspectiveAddition = `\n\n## Your Expert Perspective\n${perspective}`;

  return {
    ...context,
    modePrompt: (context.modePrompt || '') + perspectiveAddition,
  };
}
```

**Verification:**
```bash
pnpm test tests/unit/modes/
```

---

## Task 5: Agents - executeSimpleCompletion 중복 제거

**Priority:** P2
**Estimated Changes:** 4 files

**Files:**
- Modify: `src/agents/base.ts`
- Modify: `src/agents/anthropic/claude.ts:233-259`
- Modify: `src/agents/google/gemini.ts:292-320`
- Modify: `src/agents/perplexity/perplexity.ts:347-375`

**Step 1: Add executeSimpleCompletion to BaseAgent**

```typescript
// src/agents/base.ts
/**
 * Execute a simple completion without tool handling
 * Default implementation that can be overridden by specific agents
 */
protected async executeSimpleCompletion(
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  return this.generateRawCompletion(userMessage, systemPrompt);
}
```

**Step 2: Update claude.ts to use shared pattern**

Remove duplicate implementation, use base class method or override with minimal changes.

**Step 3: Update gemini.ts and perplexity.ts similarly**

**Verification:**
```bash
pnpm test tests/unit/agents/
```

---

## Task 6: Agents - Tool Converter 통합

**Priority:** P2
**Estimated Changes:** 3 files

**Files:**
- Modify: `src/agents/utils/tool-converters.ts`
- Modify: `src/agents/anthropic/claude.ts`
- Modify: `src/agents/google/gemini.ts`

**Step 1: Add Anthropic tool converter**

```typescript
// src/agents/utils/tool-converters.ts
import type Anthropic from '@anthropic-ai/sdk';

export function convertToolkitToAnthropicTools(
  toolkit: AgentToolkit
): Anthropic.Tool[] {
  return toolkit.getTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: tool.parameters,
      required: Object.keys(tool.parameters),
    },
  }));
}
```

**Step 2: Add Gemini tool converter**

```typescript
export function convertToolkitToGeminiTools(
  toolkit: AgentToolkit
): GeminiTool[] {
  return toolkit.getTools().map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        Object.entries(tool.parameters).map(([key, value]) => [
          key,
          { type: 'string', description: String(value.description || '') }
        ])
      ),
      required: Object.keys(tool.parameters),
    },
  }));
}
```

**Step 3: Update agents to use converters**

Replace inline tool conversion code with imported converters.

**Verification:**
```bash
pnpm test tests/unit/agents/
```

---

## Task 7: Types - ExitCriteria 중복 정의 제거

**Priority:** P2
**Estimated Changes:** 2 files

**Files:**
- Modify: `src/types/index.ts:405-417`
- Modify: `src/config/exit-criteria.ts`

**Step 1: Use z.infer pattern**

```typescript
// src/config/exit-criteria.ts
import { z } from 'zod';

export const ExitCriteriaSchema = z.object({
  enabled: z.boolean().default(true),
  consensusThreshold: z.number().min(0).max(1).default(0.9),
  convergenceRounds: z.number().min(1).default(2),
  confidenceThreshold: z.number().min(0).max(1).default(0.85),
});

export type ExitCriteria = z.infer<typeof ExitCriteriaSchema>;
```

**Step 2: Remove duplicate interface from types/index.ts**

```typescript
// src/types/index.ts
// Remove the ExitCriteria interface definition
// Re-export from config
export type { ExitCriteria } from '../config/exit-criteria.js';
```

**Verification:**
```bash
pnpm typecheck && pnpm test
```

---

## Task 8: Utils - 미사용 함수 정리

**Priority:** P3
**Estimated Changes:** 1 file

**Files:**
- Modify: `src/utils/env.ts:18-68`

**Step 1: Analyze usage of env utilities**

```bash
grep -r "getEnvOrThrow\|hasEnv\|getEnvWithDefault" src/
```

**Step 2: Remove unused functions or add deprecation notices**

If functions are unused, remove them. If they might be used in future, add JSDoc deprecation.

**Verification:**
```bash
pnpm typecheck && pnpm lint
```

---

## Task 9: Modes - 동시성 안전성 개선

**Priority:** P3
**Estimated Changes:** 3 files

**Files:**
- Modify: `src/modes/devils-advocate.ts:222-228`
- Modify: `src/modes/red-team-blue-team.ts:174`
- Modify: `src/modes/expert-panel.ts:190-195`

**Step 1: Replace instance variables with context-bound state**

```typescript
// src/modes/devils-advocate.ts
// Instead of:
private currentAgentIndex = 0;
private totalAgentsInRound = 0;

// Use context extension:
interface DevilsAdvocateContext extends DebateContext {
  _devilsAdvocate?: {
    currentAgentIndex: number;
    totalAgentsInRound: number;
  };
}

// In executeRound:
async executeRound(agents, context, toolkit) {
  const extendedContext: DevilsAdvocateContext = {
    ...context,
    _devilsAdvocate: {
      currentAgentIndex: 0,
      totalAgentsInRound: agents.length,
    },
  };
  // ... use extendedContext
}
```

**Verification:**
```bash
pnpm test tests/unit/modes/
```

---

## Task 10: prompt-builder.ts - SEPARATOR alias 제거

**Priority:** P3
**Estimated Changes:** 1 file

**Files:**
- Modify: `src/modes/utils/prompt-builder.ts:171`

**Step 1: Replace SEPARATOR with PROMPT_SEPARATOR**

```typescript
// src/modes/utils/prompt-builder.ts
// Remove: const SEPARATOR = PROMPT_SEPARATOR;
// Use PROMPT_SEPARATOR directly throughout the file
```

**Verification:**
```bash
pnpm typecheck && pnpm lint
```

---

## Execution Order

권장 실행 순서 (의존성 기준):

1. **Task 7**: Types - ExitCriteria (독립적, 타입 정의)
2. **Task 8**: Utils - 미사용 함수 정리 (독립적)
3. **Task 10**: prompt-builder SEPARATOR alias (독립적)
4. **Task 1**: MCP - Error Messages 통합 (독립적)
5. **Task 2**: MCP - Response Mapping 개선 (Task 1 이후)
6. **Task 6**: Agents - Tool Converter 통합 (독립적)
7. **Task 5**: Agents - executeSimpleCompletion 중복 제거 (독립적)
8. **Task 3**: Modes - buildModePrompt 일관성 (독립적)
9. **Task 4**: Modes - transformContext 중복 제거 (Task 3 이후)
10. **Task 9**: Modes - 동시성 안전성 (Task 4 이후)

---

## Verification Checklist

각 Task 완료 후:
- [ ] `pnpm typecheck` 통과
- [ ] `pnpm lint` 통과
- [ ] `pnpm test` 통과
- [ ] 관련 파일 수동 검토

전체 완료 후:
- [ ] `pnpm build` 성공
- [ ] Integration test 통과 (API 키 필요)
- [ ] 문서 업데이트 (.claude/CLAUDE.md 필요시)

---

## Notes

- **P0/P1 이슈 없음**: 즉시 수정이 필요한 심각한 문제는 발견되지 않았습니다.
- **점진적 적용 권장**: 모든 Task를 한 번에 적용하기보다 순차적으로 적용하고 각 단계에서 테스트를 실행하세요.
- **테스트 커버리지**: 리팩토링 전 테스트 커버리지를 확인하고, 리팩토링 후에도 동일한 커버리지를 유지하세요.
