# AI Roundtable - Project Overview

## Purpose
MCP server enabling structured debates between multiple AI models (Claude, ChatGPT, Gemini, Perplexity).

## Tech Stack
- TypeScript (ESM)
- Node.js 20+
- SQLite (sql.js)
- MCP Protocol SDK

## Key Directories
- `src/agents/` - AI Agent implementations (BaseAgent, Claude, ChatGPT, Gemini, Perplexity)
- `src/core/` - Core logic (DebateEngine, SessionManager, ConsensusAnalyzer)
- `src/modes/` - Debate mode strategies (7 modes)
- `src/tools/` - Agent tools (DefaultAgentToolkit)
- `src/storage/` - SQLite persistence
- `src/mcp/` - MCP server interface

## Code Style
- Files: kebab-case.ts
- Classes/Types: PascalCase
- Functions/Methods: camelCase
- Constants: UPPER_SNAKE_CASE
