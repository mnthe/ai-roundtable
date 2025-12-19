# AI Roundtable - Step-by-Step Implementation Plan

**Date:** 2024-12-19
**Language:** TypeScript (Node.js 20+, ESM)

## Implementation Principles

1. **각 Step은 독립적으로 검증 가능** (테스트 통과, 빌드 성공)
2. **코드와 테스트를 함께 작성**
3. **점진적 통합** (각 Step 완료 시 전체 테스트 통과)

---

## Step 1: Project Foundation

**목표:** 프로젝트 구조 설정, 빌드/린트/테스트 환경 구축

### 작업 내용
- [ ] package.json 생성 (ESM, TypeScript 5.x)
- [ ] tsconfig.json 설정 (strict mode)
- [ ] ESLint + Prettier 설정
- [ ] Vitest 설정
- [ ] 디렉토리 구조 생성
- [ ] 기본 타입 정의 (src/types/index.ts)

### 검증 기준
```bash
npm run build    # 성공
npm run lint     # 에러 없음
npm run test     # 기본 테스트 통과
```

### 산출물
- 빌드 가능한 빈 프로젝트
- CI-ready 구조

---

## Step 2: Core Types & Interfaces

**목표:** 핵심 타입 및 인터페이스 정의

### 작업 내용
- [ ] AgentConfig, AgentResponse 타입
- [ ] DebateContext, DebateConfig 타입
- [ ] Session, RoundResult 타입
- [ ] ToolResult, ToolCall 타입
- [ ] Zod 스키마 정의 (런타임 검증용)

### 검증 기준
```bash
npm run build           # 타입 에러 없음
npm run test            # 스키마 검증 테스트 통과
```

### 테스트
- Zod 스키마 유효성 테스트
- 타입 가드 함수 테스트

---

## Step 3: Agent Abstraction Layer (Base)

**목표:** BaseAgent 추상 클래스 및 AgentRegistry 구현

### 작업 내용
- [ ] BaseAgent 추상 클래스 (src/agents/base.ts)
- [ ] AgentRegistry 클래스 (src/agents/registry.ts)
- [ ] MockAgent (테스트용)

### 검증 기준
```bash
npm run test -- --grep "BaseAgent"
npm run test -- --grep "AgentRegistry"
```

### 테스트
- MockAgent를 사용한 BaseAgent 계약 검증
- AgentRegistry CRUD 테스트

---

## Step 4: Claude Agent Implementation

**목표:** ClaudeAgent 구현 (Anthropic SDK 연동)

### 작업 내용
- [ ] ClaudeAgent 클래스 (src/agents/claude.ts)
- [ ] Anthropic SDK 연동 (@anthropic-ai/sdk)
- [ ] Tool use 처리 로직
- [ ] 응답 파싱 로직

### 검증 기준
```bash
npm run test                        # Unit 테스트 (Mock)
npm run test:integration -- --grep "Claude"  # Integration (실제 API, 선택적)
```

### 테스트
- Unit: Mock Anthropic client로 요청/응답 흐름 검증
- Integration: 실제 API 호출 (API 키 필요, CI에서 선택적)

---

## Step 5: GPT-4 Agent Implementation

**목표:** GPT4Agent 구현 (OpenAI SDK 연동)

### 작업 내용
- [ ] GPT4Agent 클래스 (src/agents/gpt4.ts)
- [ ] OpenAI SDK 연동 (openai)
- [ ] Function calling 처리 로직
- [ ] 응답 파싱 로직

### 검증 기준
```bash
npm run test                        # Unit 테스트 (Mock)
npm run test:integration -- --grep "GPT4"  # Integration (실제 API, 선택적)
```

### 테스트
- Unit: Mock OpenAI client로 요청/응답 흐름 검증
- Integration: 실제 API 호출

---

## Step 6: Common Tools (AgentToolkit)

**목표:** Agent가 사용하는 공통 도구 구현

### 작업 내용
- [ ] AgentToolkit 클래스 (src/tools/toolkit.ts)
- [ ] get_context 도구
- [ ] submit_response 도구
- [ ] Provider별 도구 정의 변환 (Anthropic/OpenAI 형식)

### 검증 기준
```bash
npm run test -- --grep "AgentToolkit"
```

### 테스트
- 각 도구 함수 Unit 테스트
- 도구 정의 형식 변환 테스트

---

## Step 7: Web Search & Fact Check Tools

**목표:** search_web, fact_check 도구 구현

### 작업 내용
- [ ] WebSearchProvider 인터페이스
- [ ] PerplexitySearchProvider 구현 (또는 간단한 fallback)
- [ ] search_web 도구 (src/tools/web-search.ts)
- [ ] fact_check 도구 (src/tools/fact-check.ts)

### 검증 기준
```bash
npm run test -- --grep "WebSearch"
npm run test -- --grep "FactCheck"
```

### 테스트
- Mock provider로 Unit 테스트
- Integration 테스트 (선택적)

---

## Step 8: Session Manager & Storage

**목표:** 세션 관리 및 SQLite 영구 저장

### 작업 내용
- [ ] SessionManager 클래스 (src/core/session-manager.ts)
- [ ] SQLite 스키마 정의
- [ ] SQLiteStorage 클래스 (src/storage/sqlite.ts)
- [ ] 세션 CRUD 구현

### 검증 기준
```bash
npm run test -- --grep "SessionManager"
npm run test -- --grep "SQLiteStorage"
```

### 테스트
- In-memory SQLite로 CRUD 테스트
- 세션 상태 전이 테스트

---

## Step 9: Collaborative Mode Strategy

**목표:** 첫 번째 토론 모드 구현

### 작업 내용
- [ ] DebateModeStrategy 인터페이스 (src/modes/base.ts)
- [ ] CollaborativeMode 클래스 (src/modes/collaborative.ts)
- [ ] ModeRegistry 클래스 (src/modes/registry.ts)
- [ ] 프롬프트 빌드 로직

### 검증 기준
```bash
npm run test -- --grep "CollaborativeMode"
npm run test -- --grep "ModeRegistry"
```

### 테스트
- 프롬프트 생성 테스트
- 라운드 실행 로직 테스트 (MockAgent 사용)

---

## Step 10: Debate Engine

**목표:** 토론 오케스트레이션 엔진 구현

### 작업 내용
- [ ] DebateEngine 클래스 (src/core/debate-engine.ts)
- [ ] 라운드 실행 로직
- [ ] ConsensusAnalyzer (기본 구현)
- [ ] 전체 흐름 통합

### 검증 기준
```bash
npm run test -- --grep "DebateEngine"
```

### 테스트
- MockAgent로 전체 토론 흐름 E2E 테스트
- 멀티 라운드 시나리오 테스트

---

## Step 11: MCP Server Integration

**목표:** MCP 서버 인터페이스 구현

### 작업 내용
- [ ] MCP Server 설정 (@modelcontextprotocol/sdk)
- [ ] start_roundtable 도구
- [ ] continue_roundtable 도구
- [ ] get_consensus 도구
- [ ] get_agents 도구

### 검증 기준
```bash
npm run build
npm run test -- --grep "MCP"
# MCP Inspector로 수동 검증
npx @anthropic-ai/mcp-inspector
```

### 테스트
- 각 MCP 도구 Unit 테스트
- MCP Inspector로 통합 검증

---

## Step 12: End-to-End Integration

**목표:** 전체 시스템 통합 및 E2E 테스트

### 작업 내용
- [ ] E2E 테스트 시나리오 작성
- [ ] 에러 핸들링 강화
- [ ] 로깅 추가 (pino)
- [ ] 설정 파일 지원 (dotenv)

### 검증 기준
```bash
npm run build           # 성공
npm run lint            # 에러 없음
npm run test            # 전체 테스트 통과 (Unit)
npm run test:e2e        # E2E 테스트 통과 (MockAgent)
```

### 테스트
- 전체 토론 시나리오 E2E
- 에러 복구 시나리오

---

## Step 13: Additional Agents (Gemini, Perplexity)

**목표:** 추가 AI Provider 구현

### 작업 내용
- [ ] GeminiAgent 클래스 (@google/generative-ai)
- [ ] PerplexityAgent 클래스
- [ ] AgentRegistry에 등록

### 검증 기준
```bash
npm run test -- --grep "Gemini"
npm run test -- --grep "Perplexity"
npm run test:integration  # 전체 Integration
```

---

## Step 14: Additional Debate Modes

**목표:** 추가 토론 모드 구현

### 작업 내용
- [ ] AdversarialMode (반박 중심)
- [ ] SocraticMode (질문 중심)
- [ ] ModeRegistry에 등록

### 검증 기준
```bash
npm run test -- --grep "AdversarialMode"
npm run test -- --grep "SocraticMode"
```

---

## Step 15: Documentation & Polish

**목표:** 문서화 및 최종 정리

### 작업 내용
- [ ] README.md 작성
- [ ] API Reference 문서
- [ ] 사용 예제
- [ ] Claude Desktop 설정 가이드

### 검증 기준
- 문서 완성도 검토
- 실제 Claude Desktop에서 사용 테스트

---

## Summary

| Step | 내용 | 예상 난이도 |
|------|------|------------|
| 1 | Project Foundation | Easy |
| 2 | Core Types | Easy |
| 3 | Agent Base | Medium |
| 4 | Claude Agent | Medium |
| 5 | GPT-4 Agent | Medium |
| 6 | Common Tools | Medium |
| 7 | Web Search/Fact Check | Medium |
| 8 | Session/Storage | Medium |
| 9 | Collaborative Mode | Easy |
| 10 | Debate Engine | Hard |
| 11 | MCP Server | Medium |
| 12 | E2E Integration | Hard |
| 13 | Additional Agents | Medium |
| 14 | Additional Modes | Easy |
| 15 | Documentation | Easy |
