# AI Roundtable

Multi-AI debate platform that enables structured discussions between different AI models (Claude, GPT-4, etc.) as an MCP server.

## Features

- **Multi-AI Debates**: Run structured debates with Claude, GPT-4, and more
- **Multiple Debate Modes**: Collaborative, Adversarial, Socratic (more coming)
- **Tool Use**: AI agents can search the web and fact-check claims
- **Consensus Analysis**: Automatic identification of agreement/disagreement points
- **MCP Integration**: Works with Claude Desktop and other MCP clients
- **Session Persistence**: SQLite-based storage for debate history

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file with your API keys:

```bash
cp .env.example .env
```

Required keys:
- `ANTHROPIC_API_KEY` - For Claude agents
- `OPENAI_API_KEY` - For GPT-4 agents

## Usage with Claude Desktop

Add to your Claude Desktop MCP configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ai-roundtable": {
      "command": "node",
      "args": ["/path/to/ai-roundtable/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-key",
        "OPENAI_API_KEY": "your-key"
      }
    }
  }
}
```

## MCP Tools

### start_roundtable

Start a new AI debate.

```typescript
{
  topic: string;      // Required: The debate topic
  mode?: string;      // Optional: 'collaborative' | 'adversarial' | 'socratic'
  agents?: string[];  // Optional: Agent IDs to participate
  rounds?: number;    // Optional: Number of rounds (default: 3)
}
```

### continue_roundtable

Continue an existing debate.

```typescript
{
  sessionId: string;       // Required: Session ID
  rounds?: number;         // Optional: Additional rounds
  focusQuestion?: string;  // Optional: New focus question
}
```

### get_consensus

Get consensus analysis for a debate.

```typescript
{
  sessionId: string;  // Required: Session ID
}
```

### get_agents

List available AI agents.

### list_sessions

List all debate sessions.

## Development

```bash
# Run tests
npm run test

# Run tests with coverage
npm run test:coverage

# Run integration tests (requires API keys)
npm run test:integration

# Build
npm run build

# Lint
npm run lint
```

## Architecture

```
src/
├── agents/       # AI agent implementations (Claude, GPT-4)
├── core/         # Debate engine, session manager
├── modes/        # Debate mode strategies
├── tools/        # Agent toolkit (web search, fact check)
├── storage/      # SQLite persistence
├── mcp/          # MCP server interface
└── types/        # TypeScript type definitions
```

## Adding New AI Providers

1. Create a new agent class extending `BaseAgent` in `src/agents/`
2. Implement the `generateResponse()` method
3. Register in `AgentRegistry`

Example:
```typescript
class MyAgent extends BaseAgent {
  async generateResponse(context: DebateContext): Promise<AgentResponse> {
    // Your implementation
  }
}

registry.registerProvider('my-provider', (config) => new MyAgent(config), 'default-model');
```

## License

MIT
