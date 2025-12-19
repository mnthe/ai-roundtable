# AI Roundtable - Project Rules

## Project Overview

AI Roundtable은 여러 AI 모델이 구조화된 토론을 수행하는 MCP 서버입니다.

## Key Design Decisions (변경 시 문서 업데이트 필수)

| 항목 | 결정 | 이유 |
|------|------|------|
| Language | TypeScript (ESM) | Type safety, Node.js 20+ |
| AI Abstraction | Agent SDK 추상화 | Tool use 지원, 확장성 |
| Initial Providers | Claude + ChatGPT | 성숙한 Agent SDK |
| Storage | SQLite only | 로컬 MCP 서버 용도 |
| Testing | Unit (Mock) + Integration (선택적) | 빠른 피드백 |

## Architecture Rules

### Agent 추가 규칙
1. `BaseAgent` 추상 클래스 상속
2. `generateResponse()` 메서드 구현
3. `AgentRegistry`에 등록
4. Unit 테스트 필수 (Mock provider 사용)

### Mode 추가 규칙
1. `DebateModeStrategy` 인터페이스 구현
2. `ModeRegistry`에 등록
3. `buildAgentPrompt()` 메서드에서 모드별 프롬프트 정의

### Tool 추가 규칙
1. `AgentToolkit`에 메서드 추가
2. `getToolDefinitions()` 업데이트 (Anthropic 형식)
3. `getOpenAIToolDefinitions()` 업데이트 (OpenAI 형식)

## Code Style

- ESLint + Prettier 준수
- 함수/메서드: camelCase
- 클래스/타입: PascalCase
- 상수: UPPER_SNAKE_CASE
- 파일명: kebab-case.ts

## Testing Rules

- 각 Step 완료 시 `npm run test` 통과 필수
- Unit 테스트: Mock provider 사용
- Integration 테스트: `npm run test:integration` (선택적)
- 테스트 파일: `tests/unit/*.test.ts`, `tests/integration/*.test.ts`

## Directory Structure

```
src/
├── agents/       # AI Agent 추상화 (BaseAgent, Claude, ChatGPT)
├── core/         # 핵심 로직 (DebateEngine, SessionManager)
├── modes/        # 토론 모드 전략 (Collaborative, etc.)
├── tools/        # 공통 도구 (AgentToolkit, WebSearch)
├── storage/      # SQLite 영구화
├── mcp/          # MCP 서버 인터페이스
├── types/        # 타입 정의
└── index.ts      # 엔트리포인트
```
