# Benchmark Script Design

## Overview

A script to run AI Roundtable MCP with various configurations and record results for data collection and improvement analysis.

## Goals

- **Primary**: Compare debate modes (7 modes) × round depth (1, 3, 5, etc.)
- **Secondary**: Agent combinations × topic variations
- **Output**: All intermediate and final data for later analysis

## Architecture

### Directory Structure

```
scripts/
├── benchmark/
│   ├── runner.ts          # Main execution engine
│   ├── config.ts          # Config loader/validator
│   ├── collector.ts       # Data collector
│   └── cli.ts             # CLI interface
├── configs/
│   └── experiments/
│       ├── mode-comparison.yaml    # Mode comparison experiment
│       ├── depth-analysis.yaml     # Round depth analysis
│       └── full-matrix.yaml        # Full combination experiment
results/
└── {YYYY-MM-DD}/
    └── {experiment-name}/
        └── {mode}/
            └── {topic-slug}/
                ├── session.json      # Full session data
                ├── rounds/
                │   ├── round-1.json  # Per-round details
                │   └── round-2.json
                ├── consensus.json    # Consensus analysis
                └── metadata.json     # Execution environment
```

## Configuration Format

```yaml
# configs/experiments/mode-comparison.yaml
name: mode-comparison
description: Compare consensus quality across 7 debate modes

# Experiment variables
variables:
  modes:
    - collaborative
    - adversarial
    - socratic
    - expert-panel
    - devils-advocate
    - delphi
    - red-team-blue-team

  rounds: [1, 3, 5]

  topics:
    - "Should AI be regulated at the cost of innovation?"
    - "Impact of remote work on productivity"

  agents:
    - default  # All available agents

# Execution options
options:
  parallel: false        # Sequential execution (API cost management)
  delay_between: 5000    # Delay between runs (ms)
  retry_on_failure: 2    # Retry count on failure

# Output options
output:
  include_raw_responses: true
  include_tool_calls: true
  include_citations: true
```

## Execution Engine

```typescript
// scripts/benchmark/runner.ts
import { DebateEngine } from '../../src/core/debate-engine.js';
import { SessionManager } from '../../src/core/session-manager.js';
import { setupProviders } from '../../src/agents/setup.js';

interface ExperimentRun {
  mode: DebateMode;
  topic: string;
  rounds: number;
  agents: string[];
}

class BenchmarkRunner {
  private engine: DebateEngine;
  private sessionManager: SessionManager;
  private collector: DataCollector;

  async runExperiment(config: ExperimentConfig): Promise<void> {
    const runs = this.generateMatrix(config.variables);
    // Example: 7 modes × 3 rounds × 2 topics = 42 runs

    for (const run of runs) {
      const result = await this.executeSingleRun(run);
      await this.collector.save(result);
    }
  }

  private async executeSingleRun(run: ExperimentRun): Promise<RunResult> {
    // 1. Start session
    const session = await this.engine.startDebate({
      topic: run.topic,
      mode: run.mode,
      rounds: run.rounds,
      agents: run.agents,
    });

    // 2. Collect per-round data
    const roundsData = [];
    for (let i = 1; i <= run.rounds; i++) {
      const roundResult = await this.engine.executeRound(session.id);
      roundsData.push(roundResult);
    }

    // 3. Analyze consensus
    const consensus = await this.engine.analyzeConsensus(session.id);

    return { session, roundsData, consensus, metadata: this.getMetadata() };
  }
}
```

## CLI Interface

```typescript
// scripts/benchmark/cli.ts
import { Command } from 'commander';

const program = new Command();

// 1. Batch execution with config file
program
  .command('run <config>')
  .description('Run experiment batch with config file')
  .option('--dry-run', 'Print matrix without execution')
  .option('--filter-mode <mode>', 'Run specific mode only')
  .action(async (configPath, options) => {
    const runner = new BenchmarkRunner();
    await runner.runExperiment(configPath, options);
  });

// 2. Single run (interactive)
program
  .command('single')
  .description('Run single experiment')
  .requiredOption('-t, --topic <topic>', 'Debate topic')
  .requiredOption('-m, --mode <mode>', 'Debate mode')
  .option('-r, --rounds <n>', 'Number of rounds', '3')
  .option('-o, --output <dir>', 'Output directory')
  .action(async (options) => {
    const runner = new BenchmarkRunner();
    await runner.runSingle(options);
  });

// 3. List results
program
  .command('list')
  .description('List experiment results')
  .option('--date <date>', 'Filter by date')
  .action(async (options) => { /* ... */ });
```

### Usage Examples

```bash
# Batch execution
pnpm benchmark run configs/experiments/mode-comparison.yaml

# Single run
pnpm benchmark single -t "AI regulation" -m collaborative -r 3

# Dry run (check matrix)
pnpm benchmark run configs/experiments/full-matrix.yaml --dry-run
```

## Output Format

### metadata.json

Execution environment and configuration.

```json
{
  "experimentName": "mode-comparison",
  "runId": "run-2024-12-19-001",
  "startedAt": "2024-12-19T10:30:00Z",
  "completedAt": "2024-12-19T10:35:42Z",
  "durationMs": 342000,
  "config": { "mode": "collaborative", "rounds": 3, "topic": "..." },
  "agents": [
    { "id": "claude-1", "provider": "anthropic", "model": "claude-3-5-sonnet" },
    { "id": "gpt-1", "provider": "openai", "model": "gpt-4o" }
  ]
}
```

### rounds/round-N.json

Per-round detailed responses.

```json
{
  "roundNumber": 1,
  "responses": [
    {
      "agentId": "claude-1",
      "position": "...",
      "reasoning": "...",
      "confidence": 0.85,
      "citations": [],
      "toolCalls": []
    }
  ],
  "consensusSnapshot": { "level": "low", "score": 0.3 }
}
```

### consensus.json

Final consensus analysis with progression.

```json
{
  "finalLevel": "medium",
  "finalScore": 0.72,
  "progression": [
    { "round": 1, "score": 0.3 },
    { "round": 2, "score": 0.55 },
    { "round": 3, "score": 0.72 }
  ],
  "agreements": ["Acknowledged need for AI regulation"],
  "disagreements": ["Scope and timing of regulation"]
}
```

### session.json

Full session export (equivalent to `export_session` tool output).

## Implementation Notes

- **Communication**: Direct API calls to `DebateEngine` (no MCP overhead)
- **Execution**: Sequential by default to manage API costs
- **Storage**: Directory hierarchy + JSON files for easy browsing and analysis

## Analysis Use Cases

| File | Use Case |
|------|----------|
| `metadata.json` | Filter by experiment conditions |
| `consensus.json` | Compare consensus scores by mode/rounds |
| `rounds/*.json` | Track confidence changes per round |
| `session.json` | Full data for deep analysis |
