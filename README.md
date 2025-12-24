# AI Roundtable

[![CI](https://github.com/mnthe/ai-roundtable/actions/workflows/ci.yml/badge.svg)](https://github.com/mnthe/ai-roundtable/actions/workflows/ci.yml)

A Multi-AI debate platform that enables structured discussions between different AI models (Claude, ChatGPT, Gemini, Perplexity) through the Model Context Protocol (MCP).

## Key Features

- **4 AI Providers**: Claude (Anthropic), ChatGPT (OpenAI), Gemini (Google), Perplexity
- **7 Debate Modes**: Collaborative, Adversarial, Socratic, Expert Panel, Devil's Advocate, Delphi, Red Team/Blue Team
- **AI-Powered Analysis**: Semantic consensus analysis using lightweight AI models
- **Native Web Search**: Each agent uses its provider's native search capability
- **MCP Protocol**: Standard interface for Claude Desktop and other MCP clients

## Quick Start

### Installation

```bash
# Option 1: Run directly with npx (Recommended)
npx github:mnthe/ai-roundtable

# Option 2: Clone and build locally
git clone https://github.com/mnthe/ai-roundtable.git
cd ai-roundtable
pnpm install
pnpm build
```

### Environment Setup

Create a `.env` file with your API keys:

```bash
# Required: At least one API key
ANTHROPIC_API_KEY=sk-ant-...     # For Claude agents
OPENAI_API_KEY=sk-...            # For ChatGPT agents
GOOGLE_API_KEY=...               # For Gemini agents
PERPLEXITY_API_KEY=pplx-...      # For Perplexity agents
```

### MCP Client Configuration

Add to your MCP client configuration (e.g., Claude Desktop, IDE plugins):

```json
{
  "mcpServers": {
    "ai-roundtable": {
      "command": "npx",
      "args": ["-y", "github:mnthe/ai-roundtable"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "OPENAI_API_KEY": "sk-...",
        "GOOGLE_API_KEY": "...",
        "PERPLEXITY_API_KEY": "pplx-..."
      }
    }
  }
}
```

## MCP Tools

| Tool                  | Description                                     |
| --------------------- | ----------------------------------------------- |
| `start_roundtable`    | Start a new debate session                      |
| `continue_roundtable` | Continue existing debate with additional rounds |
| `get_consensus`       | Analyze consensus level in a session            |
| `get_agents`          | List available AI agents                        |
| `list_sessions`       | List debate sessions with filters               |
| `get_round_details`   | Get responses for a specific round              |
| `get_response_detail` | Get detailed response from a specific agent     |
| `get_citations`       | Get citations from the debate                   |
| `get_thoughts`        | Get agent's reasoning evolution                 |
| `synthesize_debate`   | AI-powered debate synthesis                     |
| `export_session`      | Export session (markdown/JSON)                  |
| `control_session`     | Pause/resume/stop session                       |

See [API Reference](docs/API.md) for detailed parameters and responses.

## Debate Modes

| Mode                   | Execution  | Use Case                          |
| ---------------------- | ---------- | --------------------------------- |
| **Collaborative**      | Parallel   | Consensus building, brainstorming |
| **Adversarial**        | Sequential | Stress-testing ideas              |
| **Socratic**           | Sequential | Deep exploration via questions    |
| **Expert Panel**       | Parallel   | Independent expert assessments (supports custom perspectives) |
| **Devil's Advocate**   | Sequential | Preventing groupthink             |
| **Delphi**             | Parallel   | Anonymized iterative consensus    |
| **Red Team/Blue Team** | Hybrid     | Security/risk analysis            |

See [Architecture](docs/ARCHITECTURE.md) for detailed mode descriptions and execution patterns.

## Documentation

| Document                                 | Description                                                  |
| ---------------------------------------- | ------------------------------------------------------------ |
| [Architecture](docs/ARCHITECTURE.md)     | System architecture, debate flow, 4-layer response structure |
| [API Reference](docs/API.md)             | Complete API documentation, types, error handling            |
| [Development Guide](docs/DEVELOPMENT.md) | Contributing, testing, adding providers/modes                |
| [Testing Guide](docs/TESTING.md)         | Testing patterns and practices                               |

## Development

```bash
pnpm install      # Install dependencies
pnpm build        # Build
pnpm dev          # Development (watch mode)
pnpm test         # Run tests
pnpm typecheck    # Type check
pnpm lint         # Lint
```

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make changes with tests
4. Run checks: `pnpm typecheck && pnpm lint && pnpm test`
5. Push and create PR

See [Development Guide](docs/DEVELOPMENT.md) for detailed contribution guidelines.
