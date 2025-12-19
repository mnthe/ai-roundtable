# AI Roundtable - Design Document

**Version:** 1.0
**Date:** 2024-12-19
**Status:** Approved

## 1. Overview

AI Roundtable은 여러 AI 모델(Claude, GPT-4, Gemini, Perplexity)이 주제에 대해 구조화된 토론을 수행하는 MCP(Model Context Protocol) 서버입니다.

### 1.1 Core Value Proposition
- **Multi-perspective Analysis**: 단일 AI의 편향을 보완하는 다각적 분석
- **Structured Deliberation**: 다양한 토론 모드 지원
- **Consensus Building**: AI 간 합의점 도출 및 불일치 영역 명확화
- **MCP Integration**: Claude Desktop 및 기타 MCP 클라이언트와 원활한 통합

## 2. Key Design Decisions

| 결정 항목 | 선택 | 이유 |
|-----------|------|------|
| AI Agent 추상화 | Agent SDK 추상화 | Tool use 지원, 새 AI 추가 용이 |
| 초기 AI Provider | Claude + GPT-4 | 가장 성숙한 Agent SDK |
| 후속 AI Provider | Gemini + Perplexity | 이후 Step에서 추가 |
| 공통 도구 | submit_response, get_context, search_web, fact_check | 표준 세트 |
| 저장소 | SQLite | 로컬 MCP 서버 용도 |
| 초기 토론 모드 | Collaborative | 가장 간단, 이후 확장 |
| 테스트 전략 | Unit (Mock) + Integration (선택적) | 빠른 피드백 + 현실적 검증 |

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MCP Client (Claude Desktop)                   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     AI Roundtable MCP Server                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    MCP Tools (public)                      │  │
│  │  start_roundtable | continue_roundtable | get_consensus   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                │                                 │
│                                ▼                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                     Debate Engine                          │  │
│  │         (orchestrates rounds, manages turns)               │  │
│  └───────────────────────────────────────────────────────────┘  │
│            │                                    │                │
│            ▼                                    ▼                │
│  ┌──────────────────┐              ┌──────────────────────────┐ │
│  │  Mode Strategy   │              │   Agent Registry         │ │
│  │  (Collaborative) │              │   (Claude, GPT-4, ...)   │ │
│  └──────────────────┘              └──────────────────────────┘ │
│                                              │                   │
│                                              ▼                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Agent Abstraction Layer                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │  │
│  │  │ ClaudeAgent │  │  GPT4Agent  │  │ GeminiAgent │ (후속) │  │
│  │  └─────────────┘  └─────────────┘  └─────────────┘        │  │
│  │         │                │                │                │  │
│  │         ▼                ▼                ▼                │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │           Common Tools (Agent용 내부 도구)           │  │  │
│  │  │   search_web | fact_check | get_context | submit    │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                │                                 │
│                                ▼                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │              Storage (SQLite)                              │  │
│  │         Sessions | Responses | Consensus                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## 4. Core Components

### 4.1 Agent Abstraction Layer

```typescript
interface AgentConfig {
  id: string;
  name: string;
  provider: 'anthropic' | 'openai' | 'google' | 'perplexity';
  model: string;
  systemPrompt?: string;
  temperature?: number;
}

interface AgentResponse {
  agentId: string;
  position: string;
  reasoning: string;
  confidence: number;
  citations?: Citation[];
  toolCalls?: ToolCall[];
}

abstract class BaseAgent {
  constructor(
    protected config: AgentConfig,
    protected tools: AgentToolkit
  ) {}

  abstract generateResponse(context: DebateContext): Promise<AgentResponse>;
  protected buildPrompt(context: DebateContext): string { /* ... */ }
  protected parseResponse(raw: string): AgentResponse { /* ... */ }
}
```

### 4.2 Common Tools (AgentToolkit)

| 도구 | 설명 |
|------|------|
| `get_context` | 토론 컨텍스트 조회 (topic, round, 다른 응답) |
| `search_web` | 웹 검색 (Perplexity API 활용) |
| `fact_check` | 다른 AI 주장 검증 요청 |
| `submit_response` | 구조화된 응답 제출 |

### 4.3 Debate Modes (Strategy Pattern)

```typescript
interface DebateModeStrategy {
  readonly name: string;
  executeRound(agents: BaseAgent[], context: DebateContext): Promise<AgentResponse[]>;
  buildAgentPrompt(agent: BaseAgent, context: DebateContext): string;
}
```

**초기 구현:** Collaborative Mode
**후속 구현:** Adversarial, Socratic, Expert Panel, Devil's Advocate

## 5. Directory Structure

```
ai-roundtable/
├── src/
│   ├── agents/           # AI Agent 추상화
│   │   ├── base.ts
│   │   ├── claude.ts
│   │   ├── gpt4.ts
│   │   └── registry.ts
│   ├── core/             # 핵심 로직
│   │   ├── debate-engine.ts
│   │   ├── session-manager.ts
│   │   └── consensus-analyzer.ts
│   ├── modes/            # 토론 모드 전략
│   │   ├── base.ts
│   │   ├── collaborative.ts
│   │   └── registry.ts
│   ├── tools/            # 공통 도구
│   │   ├── toolkit.ts
│   │   ├── web-search.ts
│   │   └── fact-check.ts
│   ├── storage/          # 데이터 영구화
│   │   └── sqlite.ts
│   ├── mcp/              # MCP 서버 인터페이스
│   │   ├── server.ts
│   │   └── tools.ts
│   ├── types/            # 타입 정의
│   │   └── index.ts
│   └── index.ts          # 엔트리포인트
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
└── config/
```

## 6. Future Work (Phase 3+)

- 확장 도구: `request_clarification`, `cite_source`, `update_confidence`
- 추가 AI: Gemini, Perplexity
- 추가 모드: Adversarial, Socratic, Expert Panel, Devil's Advocate
- Streaming Response 지원
- OpenTelemetry 통합
