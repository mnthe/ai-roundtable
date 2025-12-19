# AI Roundtable Architecture

This document visualizes the debate flow and system architecture of AI Roundtable.

## Table of Contents

- [System Overview](#system-overview)
- [Debate Flow](#debate-flow)
- [Round Execution](#round-execution)
- [Debate Modes](#debate-modes)
- [Consensus Analysis](#consensus-analysis)
- [MCP Tool Structure](#mcp-tool-structure)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MCP Client                                      │
│                    (Claude Desktop, IDE, Custom App)                         │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ MCP Protocol
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           AI Roundtable Server                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  MCP Server  │  │ DebateEngine │  │   Session    │  │  Consensus   │    │
│  │   (tools)    │──│              │──│   Manager    │──│   Analyzer   │    │
│  └──────────────┘  └──────┬───────┘  └──────────────┘  └──────────────┘    │
│                           │                                                  │
│         ┌─────────────────┼─────────────────┐                               │
│         │                 │                 │                               │
│         ▼                 ▼                 ▼                               │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐                          │
│  │Mode Registry│   │Agent Registry│  │   SQLite   │                          │
│  │ (7 modes)  │   │ (4 providers)│  │  Storage   │                          │
│  └────────────┘   └──────┬───────┘  └────────────┘                          │
└──────────────────────────┼──────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┬─────────────────┐
         │                 │                 │                 │
         ▼                 ▼                 ▼                 ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
   │  Claude  │     │ ChatGPT  │     │  Gemini  │     │Perplexity│
   │(Anthropic)│     │ (OpenAI) │     │ (Google) │     │          │
   └──────────┘     └──────────┘     └──────────┘     └──────────┘
```

---

## Debate Flow

### High-Level Flow

```mermaid
flowchart TD
    Start([User: start_roundtable]) --> Validate[Validate Config]
    Validate --> CreateSession[Create Session]
    CreateSession --> SelectAgents[Select Active Agents]
    SelectAgents --> SelectMode[Load Mode Strategy]

    SelectMode --> Round1[Execute Round 1]
    Round1 --> Analyze1[Analyze Consensus]
    Analyze1 --> Store1[Store Responses]

    Store1 --> MoreRounds{More Rounds?}
    MoreRounds -->|Yes| NextRound[Execute Next Round]
    NextRound --> AnalyzeN[Analyze Consensus]
    AnalyzeN --> StoreN[Store Responses]
    StoreN --> MoreRounds

    MoreRounds -->|No| Complete([Session Complete])

    style Start fill:#e1f5fe
    style Complete fill:#c8e6c9
    style Round1 fill:#fff3e0
    style NextRound fill:#fff3e0
```

### Detailed Session Lifecycle

```
┌────────────────────────────────────────────────────────────────────────────┐
│                           Session Lifecycle                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│   │ Created │───▶│ Active  │───▶│ Paused  │───▶│ Active  │───▶│Complete │ │
│   └─────────┘    └────┬────┘    └─────────┘    └────┬────┘    └─────────┘ │
│                       │              ▲              │                       │
│                       │              │              │                       │
│                       └──────────────┴──────────────┘                       │
│                          pause/resume controls                              │
│                                                                              │
│   Status Transitions:                                                        │
│   • Created → Active: First round starts                                    │
│   • Active → Paused: User pauses                                            │
│   • Paused → Active: User resumes                                           │
│   • Active → Completed: All rounds finished                                 │
│   • Any → Error: Unrecoverable error                                        │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Round Execution

### Single Round Flow

```mermaid
sequenceDiagram
    participant DE as DebateEngine
    participant MR as ModeRegistry
    participant MS as ModeStrategy
    participant AR as AgentRegistry
    participant A1 as Agent 1
    participant A2 as Agent 2
    participant CA as ConsensusAnalyzer

    DE->>MR: getStrategy(mode)
    MR-->>DE: ModeStrategy

    DE->>AR: getActiveAgents()
    AR-->>DE: [Agent1, Agent2, ...]

    DE->>MS: executeRound(agents, context)

    Note over MS: Mode determines execution pattern

    alt Parallel Execution (collaborative, expert-panel)
        MS->>A1: generateResponse(context)
        MS->>A2: generateResponse(context)
        A1-->>MS: Response 1
        A2-->>MS: Response 2
    else Sequential Execution (socratic, adversarial)
        MS->>A1: generateResponse(context)
        A1-->>MS: Response 1
        Note over MS: Add R1 to context
        MS->>A2: generateResponse(context + R1)
        A2-->>MS: Response 2
    end

    MS-->>DE: [Response1, Response2]

    DE->>CA: analyzeConsensus(responses, topic)
    CA-->>DE: ConsensusResult

    DE-->>DE: Store & Return RoundResult
```

### Agent Response Generation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Agent Response Generation                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐                                                        │
│   │  Build Prompt   │                                                        │
│   │  (system +      │                                                        │
│   │   user + prev)  │                                                        │
│   └────────┬────────┘                                                        │
│            │                                                                 │
│            ▼                                                                 │
│   ┌─────────────────┐     ┌─────────────────┐                               │
│   │   API Call      │────▶│  Tool Calls?    │                               │
│   │   (Provider)    │     └────────┬────────┘                               │
│   └─────────────────┘              │                                         │
│                           ┌────────┴────────┐                               │
│                           │                 │                               │
│                     Yes   ▼           No    ▼                               │
│              ┌─────────────────┐  ┌─────────────────┐                       │
│              │  Execute Tools  │  │  Parse Response │                       │
│              │  - web_search   │  │                 │                       │
│              │  - fact_check   │  │                 │                       │
│              │  - submit_resp  │  │                 │                       │
│              └────────┬────────┘  └────────┬────────┘                       │
│                       │                    │                                 │
│                       ▼                    │                                 │
│              ┌─────────────────┐           │                                 │
│              │  Continue with  │           │                                 │
│              │  Tool Results   │           │                                 │
│              └────────┬────────┘           │                                 │
│                       │                    │                                 │
│                       └────────┬───────────┘                                 │
│                                │                                             │
│                                ▼                                             │
│                       ┌─────────────────┐                                   │
│                       │ AgentResponse   │                                   │
│                       │ {position,      │                                   │
│                       │  reasoning,     │                                   │
│                       │  confidence,    │                                   │
│                       │  citations,     │                                   │
│                       │  toolCalls}     │                                   │
│                       └─────────────────┘                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Debate Modes

### Mode Comparison

| Mode | Execution | Agents See Previous | Use Case |
|------|-----------|---------------------|----------|
| **Collaborative** | Parallel | All previous rounds | Building consensus |
| **Adversarial** | Sequential | Immediate predecessor | Stress-testing ideas |
| **Socratic** | Sequential | All + questions | Deep exploration |
| **Expert Panel** | Parallel | All previous rounds | Multi-perspective analysis |
| **Devil's Advocate** | Sequential | All (one opposes) | Identifying weaknesses |
| **Delphi** | Parallel + Revise | Anonymous summaries | Reducing bias |
| **Red Team/Blue Team** | Team-based | Team members only | Security/risk analysis |

### Mode Execution Patterns

```mermaid
flowchart LR
    subgraph Parallel["Parallel Modes"]
        direction TB
        P1[Agent 1] --> PR[Responses]
        P2[Agent 2] --> PR
        P3[Agent 3] --> PR
    end

    subgraph Sequential["Sequential Modes"]
        direction TB
        S1[Agent 1] --> S2[Agent 2]
        S2 --> S3[Agent 3]
    end

    subgraph TeamBased["Team-Based"]
        direction TB
        subgraph Red["Red Team"]
            R1[Attacker 1]
            R2[Attacker 2]
        end
        subgraph Blue["Blue Team"]
            B1[Defender 1]
            B2[Defender 2]
        end
        Red --> Blue
        Blue --> Red
    end
```

### Collaborative Mode

```
Round 1:
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Claude  │  │ ChatGPT │  │ Gemini  │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┼────────────┘
                  │
                  ▼ (parallel)
           ┌──────────────┐
           │  Consensus   │
           │   Analysis   │
           └──────────────┘

Round 2 (all agents see Round 1 responses):
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Claude  │  │ ChatGPT │  │ Gemini  │
│ +R1 ctx │  │ +R1 ctx │  │ +R1 ctx │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┼────────────┘
                  ▼
```

### Adversarial Mode

```
Round 1:
┌─────────┐
│ Claude  │ ──▶ Position A
└─────────┘
     │
     ▼ (Claude's response in context)
┌─────────┐
│ ChatGPT │ ──▶ Challenge A, Position B
└─────────┘
     │
     ▼ (Both responses in context)
┌─────────┐
│ Gemini  │ ──▶ Challenge B, Position C
└─────────┘
```

### Delphi Mode (Anonymous Consensus Building)

```
Round 1: Initial Positions (Parallel)
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Claude  │  │ ChatGPT │  │ Gemini  │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     └────────────┼────────────┘
                  ▼
         ┌───────────────┐
         │   Anonymize   │
         │   & Summarize │
         └───────┬───────┘
                 │
Round 2: Revision Based on Anonymous Summary
┌─────────┐  ┌─────────┐  ┌─────────┐
│ Claude  │  │ ChatGPT │  │ Gemini  │
│+summary │  │+summary │  │+summary │
└────┬────┘  └────┬────┘  └────┬────┘
     │            │            │
     ▼            ▼            ▼
   Revise      Revise       Revise
   Position    Position     Position
```

---

## Consensus Analysis

### Rule-Based vs AI-Based Analysis

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Consensus Analysis Flow                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Input: AgentResponse[]                                                     │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    AIConsensusAnalyzer                               │   │
│   │                                                                       │   │
│   │   ┌───────────────────┐     ┌───────────────────┐                   │   │
│   │   │ AI Agent Available│ Yes │  Semantic Analysis │                   │   │
│   │   │       ?           │────▶│  (Light Model)     │                   │   │
│   │   └─────────┬─────────┘     │                    │                   │   │
│   │             │ No            │  • Understand      │                   │   │
│   │             ▼               │    meaning         │                   │   │
│   │   ┌───────────────────┐     │  • Detect negation │                   │   │
│   │   │  Fallback to      │     │  • Find nuances    │                   │   │
│   │   │  Rule-Based       │     │  • Cluster themes  │                   │   │
│   │   └───────────────────┘     └───────────────────┘                   │   │
│   │                                                                       │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   Output: AIConsensusResult                                                  │
│   {                                                                          │
│     agreementLevel: 0.75,                                                    │
│     clusters: [{theme, agentIds, summary}],                                  │
│     commonGround: ["Point A", "Point B"],                                    │
│     disagreementPoints: ["Difference 1"],                                    │
│     nuances: {                                                               │
│       partialAgreements: [...],                                              │
│       conditionalPositions: [...],                                           │
│       uncertainties: [...]                                                   │
│     },                                                                       │
│     reasoning: "AI's analysis explanation"                                   │
│   }                                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### AI Semantic Analysis Advantages

```
┌─────────────────────────────────────┬────────────────────────────────────────┐
│         Rule-Based                  │           AI-Based                      │
├─────────────────────────────────────┼────────────────────────────────────────┤
│                                     │                                         │
│  "developers" ≠ "software engineers"│  "developers" = "software engineers"   │
│  (different keywords)               │  (same meaning)                         │
│                                     │                                         │
│  "AI is dangerous"                  │  "AI is dangerous"                      │
│       =                             │       ≠                                 │
│  "AI is not dangerous"              │  "AI is not dangerous"                  │
│  (keyword overlap)                  │  (negation detected)                    │
│                                     │                                         │
│  Binary: agree/disagree             │  Nuanced: partial, conditional,         │
│                                     │           uncertain                     │
│                                     │                                         │
│  Template summaries                 │  Natural language summaries             │
│                                     │                                         │
└─────────────────────────────────────┴────────────────────────────────────────┘
```

---

## MCP Tool Structure

### Available Tools

```mermaid
flowchart TB
    subgraph Session["Session Management"]
        start[start_roundtable]
        continue[continue_roundtable]
        control[control_session]
        list[list_sessions]
    end

    subgraph Analysis["Analysis & Query"]
        consensus[get_consensus]
        thoughts[get_thoughts]
        export[export_session]
        synthesize[synthesize_debate]
    end

    subgraph Detail["Detailed Data"]
        round[get_round_details]
        response[get_response_detail]
        citations[get_citations]
    end

    subgraph Info["Information"]
        agents[get_agents]
    end

    start --> continue
    continue --> consensus
    continue --> synthesize
```

### Tool Call Flow

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          MCP Tool Call Flow                                  │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   User Request                                                               │
│        │                                                                     │
│        ▼                                                                     │
│   ┌─────────────────────┐                                                   │
│   │  MCP Client         │                                                   │
│   │  (Claude Desktop)   │                                                   │
│   └──────────┬──────────┘                                                   │
│              │ tool call                                                     │
│              ▼                                                               │
│   ┌─────────────────────┐      ┌─────────────────────┐                     │
│   │  AI Roundtable      │      │  Tool Definitions   │                     │
│   │  MCP Server         │◀────▶│  (12 tools)         │                     │
│   └──────────┬──────────┘      └─────────────────────┘                     │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────────────────────────────────┐                       │
│   │              Tool Handlers                       │                       │
│   │                                                  │                       │
│   │  start_roundtable ──▶ handleStartRoundtable     │                       │
│   │  get_consensus    ──▶ handleGetConsensus        │                       │
│   │  synthesize_debate──▶ handleSynthesizeDebate    │                       │
│   │  ...                                             │                       │
│   └──────────┬──────────────────────────────────────┘                       │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────┐                                                   │
│   │  Core Services      │                                                   │
│   │  • DebateEngine     │                                                   │
│   │  • SessionManager   │                                                   │
│   │  • AgentRegistry    │                                                   │
│   │  • AIConsensus      │                                                   │
│   └─────────────────────┘                                                   │
│                                                                              │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Complete Data Flow                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. START                                                                    │
│     User ──▶ start_roundtable(topic, mode, rounds)                          │
│                     │                                                        │
│  2. SETUP           ▼                                                        │
│     ┌─────────────────────────────┐                                         │
│     │ • Create Session            │                                         │
│     │ • Select Active Agents      │                                         │
│     │ • Load Mode Strategy        │                                         │
│     └──────────────┬──────────────┘                                         │
│                    │                                                         │
│  3. EXECUTE        ▼                                                        │
│     ┌─────────────────────────────┐                                         │
│     │ For each round:             │◀──┐                                     │
│     │   • Build context           │   │                                     │
│     │   • Execute mode strategy   │   │                                     │
│     │   • Collect responses       │   │ continue_roundtable                 │
│     │   • Analyze consensus       │   │                                     │
│     │   • Store results           │───┘                                     │
│     └──────────────┬──────────────┘                                         │
│                    │                                                         │
│  4. ANALYZE        ▼                                                        │
│     ┌─────────────────────────────┐                                         │
│     │ • get_consensus             │                                         │
│     │ • get_round_details         │                                         │
│     │ • get_thoughts              │                                         │
│     │ • synthesize_debate         │                                         │
│     └──────────────┬──────────────┘                                         │
│                    │                                                         │
│  5. EXPORT         ▼                                                        │
│     ┌─────────────────────────────┐                                         │
│     │ export_session(format)      │                                         │
│     │   • Markdown                │                                         │
│     │   • JSON                    │                                         │
│     └─────────────────────────────┘                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── agents/              # AI Agent implementations
│   ├── base.ts          # BaseAgent abstract class
│   ├── claude.ts        # Anthropic Claude
│   ├── chatgpt.ts       # OpenAI ChatGPT
│   ├── gemini.ts        # Google Gemini
│   ├── perplexity.ts    # Perplexity
│   ├── registry.ts      # Agent registration & health tracking
│   └── setup.ts         # Auto-setup with API keys
│
├── core/                # Core business logic
│   ├── DebateEngine.ts  # Main orchestrator
│   ├── session-manager.ts
│   ├── consensus-analyzer.ts      # Rule-based
│   └── ai-consensus-analyzer.ts   # AI-based
│
├── modes/               # Debate mode strategies
│   ├── collaborative.ts
│   ├── adversarial.ts
│   ├── socratic.ts
│   ├── expert-panel.ts
│   ├── devils-advocate.ts
│   ├── delphi.ts
│   └── red-team-blue-team.ts
│
├── mcp/                 # MCP server interface
│   ├── server.ts        # Server setup & handlers
│   └── tools.ts         # Tool definitions
│
├── storage/             # Persistence
│   └── sqlite.ts        # SQLite storage
│
├── tools/               # Agent tools
│   └── toolkit.ts       # Web search, fact check
│
├── types/               # TypeScript definitions
│   ├── index.ts
│   └── schemas.ts       # Zod schemas
│
├── utils/               # Utilities
│   ├── logger.ts
│   └── retry.ts
│
└── errors/              # Custom error types
    └── index.ts
```
