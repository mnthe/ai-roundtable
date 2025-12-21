#!/usr/bin/env npx tsx
/**
 * Benchmark Runner Script
 *
 * Runs quality benchmarks with real AI agents to evaluate feature flag impact.
 *
 * Usage:
 *   npx tsx scripts/run-benchmarks.ts
 *   npx tsx scripts/run-benchmarks.ts --iterations 3 --modes collaborative,adversarial
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import { AgentRegistry } from '../src/agents/registry.js';
import { setupProviders, detectApiKeys, createDefaultAgents } from '../src/agents/setup.js';
import { DebateEngine } from '../src/core/debate-engine.js';
import { AIConsensusAnalyzer } from '../src/core/ai-consensus-analyzer.js';
import { DefaultAgentToolkit } from '../src/tools/toolkit.js';
import { getGlobalModeRegistry } from '../src/modes/registry.js';
import { MetricsCollector } from '../src/benchmark/index.js';
import type { BenchmarkScenario, BenchmarkResult } from '../src/benchmark/types.js';
import { FeatureFlagResolver, type FeatureFlags } from '../src/config/feature-flags.js';
import type { DebateMode, AgentResponse, Session } from '../src/types/index.js';
import type { BaseAgent } from '../src/agents/base.js';
import { createLogger } from '../src/utils/logger.js';

const logger = createLogger('BenchmarkScript');

// ============================================
// Configuration
// ============================================

interface BenchmarkConfig {
  iterations: number;
  modes: DebateMode[];
  topic: string;
  rounds: number;
  outputFile?: string;
  /** Run flag configurations in parallel for each mode */
  parallel?: boolean;
  /** Maximum concurrent scenarios when running in parallel */
  parallelLimit?: number;
}

// All 7 debate modes
const ALL_MODES: DebateMode[] = [
  'collaborative',
  'adversarial',
  'socratic',
  'expert-panel',
  'devils-advocate',
  'delphi',
  'red-team-blue-team',
];

const DEFAULT_CONFIG: BenchmarkConfig = {
  iterations: 2,
  modes: ALL_MODES, // Now includes all 7 modes by default
  topic: 'Should AI systems be required to explain their decision-making process to users?',
  rounds: 2,
};

// Feature flag configurations to compare
const FLAG_CONFIGURATIONS: { name: string; flags: Partial<FeatureFlags> }[] = [
  {
    name: 'baseline',
    flags: {
      sequentialParallelization: { enabled: false, level: 'none' },
      toolEnforcement: { enabled: true, level: 'normal' },
      promptEnforcement: { level: 'normal' },
    },
  },
  {
    name: 'strict-enforcement',
    flags: {
      sequentialParallelization: { enabled: false, level: 'none' },
      toolEnforcement: { enabled: true, level: 'strict', minCalls: 1, maxCalls: 3 },
      promptEnforcement: { level: 'strict', requireStance: true, requireToolUsage: true },
    },
  },
  {
    name: 'parallel-optimized',
    flags: {
      sequentialParallelization: { enabled: true, level: 'last-only' },
      toolEnforcement: { enabled: true, level: 'normal' },
      promptEnforcement: { level: 'normal' },
    },
  },
  {
    name: 'full-optimization',
    flags: {
      sequentialParallelization: { enabled: true, level: 'last-only' },
      toolEnforcement: { enabled: true, level: 'strict', minCalls: 1, maxCalls: 2 },
      promptEnforcement: { level: 'strict', requireStance: true, requireToolUsage: true },
      exitCriteria: { enabled: true, consensusThreshold: 0.9, convergenceRounds: 2 },
      groupthinkDetection: { enabled: true, threshold: 0.85 },
    },
  },
];

// ============================================
// Benchmark Execution
// ============================================

async function setupAgentsForBenchmark(): Promise<{ agents: BaseAgent[]; registry: AgentRegistry }> {
  const registry = new AgentRegistry();
  const keys = detectApiKeys();
  const { warnings } = setupProviders(registry, keys);

  if (warnings.length > 0) {
    logger.warn({ warnings }, 'Setup warnings');
  }

  // Create default agents
  createDefaultAgents(registry);

  const agents = registry.getActiveAgents();
  if (agents.length === 0) {
    throw new Error('No agents available. Please set API keys.');
  }

  logger.info({ agentCount: agents.length, agents: agents.map(a => a.id) }, 'Agents initialized');
  return { agents, registry };
}

async function runSingleBenchmark(
  scenario: BenchmarkScenario,
  agents: BaseAgent[],
  registry: AgentRegistry
): Promise<BenchmarkResult> {
  const collector = new MetricsCollector({
    sessionId: `benchmark-${scenario.name}-${Date.now()}`,
    totalRounds: scenario.rounds,
  });

  const toolkit = new DefaultAgentToolkit();
  const aiConsensusAnalyzer = new AIConsensusAnalyzer({ registry });
  const engine = new DebateEngine({ toolkit, aiConsensusAnalyzer });

  // Resolve feature flags for this scenario
  const flagResolver = new FeatureFlagResolver();
  const resolvedFlags = flagResolver.resolve(scenario.flags);

  // Create session
  const session: Session = {
    id: collector.getSessionId(),
    topic: scenario.topic,
    mode: scenario.mode,
    status: 'active',
    currentRound: 0,
    totalRounds: scenario.rounds,
    responses: [],
    agentIds: agents.map(a => a.id),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const startTime = Date.now();
  let success = true;
  let error: string | undefined;

  try {
    for (let round = 1; round <= scenario.rounds; round++) {
      collector.recordRoundStart(round);

      const context = {
        sessionId: session.id,
        topic: session.topic,
        mode: session.mode,
        currentRound: round,
        totalRounds: session.totalRounds,
        previousResponses: session.responses,
        flags: resolvedFlags,
      };

      // Record agent timing
      const roundResponses: AgentResponse[] = [];
      const modeStrategy = getGlobalModeRegistry().getMode(scenario.mode);

      if (modeStrategy) {
        // Use mode strategy
        for (const agent of agents) {
          collector.recordAgentStart(agent.id, round);
        }

        const responses = await modeStrategy.executeRound(agents, context, toolkit);
        roundResponses.push(...responses);

        for (const agent of agents) {
          collector.recordAgentEnd(agent.id, round);
        }
      } else {
        // Fallback to simple execution
        for (const agent of agents) {
          collector.recordAgentStart(agent.id, round);
          const response = await agent.generateResponse(context);
          roundResponses.push(response);
          collector.recordAgentEnd(agent.id, round);
        }
      }

      collector.recordResponses(roundResponses, round);
      session.responses.push(...roundResponses);
      session.currentRound = round;

      collector.recordRoundEnd(round);
    }
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
    logger.error({ err, scenario: scenario.name }, 'Benchmark failed');
  }

  const metrics = collector.getMetrics();
  const duration = Date.now() - startTime;

  logger.info(
    {
      scenario: scenario.name,
      mode: scenario.mode,
      success,
      durationMs: duration,
      agreementLevel: metrics.consensus.agreementLevel.toFixed(2),
      crossReferences: metrics.interaction.crossReferenceCount,
    },
    'Benchmark completed'
  );

  return {
    scenario,
    metrics,
    responses: collector.getResponses(),
    timestamp: new Date(),
    success,
    error,
  };
}

async function runBenchmarks(config: BenchmarkConfig): Promise<Map<string, BenchmarkResult[]>> {
  const { agents, registry } = await setupAgentsForBenchmark();
  const results = new Map<string, BenchmarkResult[]>();

  const totalRuns = config.modes.length * FLAG_CONFIGURATIONS.length * config.iterations;
  let currentRun = 0;

  for (const mode of config.modes) {
    for (const flagConfig of FLAG_CONFIGURATIONS) {
      const scenarioResults: BenchmarkResult[] = [];
      const scenarioName = `${mode}-${flagConfig.name}`;

      for (let i = 0; i < config.iterations; i++) {
        currentRun++;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Running: ${scenarioName} (iteration ${i + 1}/${config.iterations})`);
        console.log(`Progress: ${currentRun}/${totalRuns}`);
        console.log(`${'='.repeat(60)}\n`);

        const scenario: BenchmarkScenario = {
          name: `${scenarioName}-iter${i + 1}`,
          topic: config.topic,
          mode,
          agents: agents.map((a) => a.id),
          rounds: config.rounds,
          flags: flagConfig.flags,
        };

        const result = await runSingleBenchmark(scenario, agents, registry);
        scenarioResults.push(result);

        // Brief pause between iterations
        if (i < config.iterations - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }

      results.set(scenarioName, scenarioResults);
    }
  }

  return results;
}

/**
 * Run benchmarks with parallel flag configuration execution
 * Each mode's flag configurations run in parallel for faster execution
 */
async function runBenchmarksParallel(config: BenchmarkConfig): Promise<Map<string, BenchmarkResult[]>> {
  const { agents, registry } = await setupAgentsForBenchmark();
  const results = new Map<string, BenchmarkResult[]>();
  const limit = config.parallelLimit ?? 4;

  const totalRuns = config.modes.length * FLAG_CONFIGURATIONS.length * config.iterations;
  let completedRuns = 0;

  for (const mode of config.modes) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Mode: ${mode} - Running ${FLAG_CONFIGURATIONS.length} configurations in parallel`);
    console.log(`${'='.repeat(60)}\n`);

    // Create all scenarios for this mode
    const modeScenarios: { name: string; scenario: BenchmarkScenario; iteration: number }[] = [];

    for (const flagConfig of FLAG_CONFIGURATIONS) {
      const scenarioName = `${mode}-${flagConfig.name}`;
      for (let i = 0; i < config.iterations; i++) {
        modeScenarios.push({
          name: scenarioName,
          scenario: {
            name: `${scenarioName}-iter${i + 1}`,
            topic: config.topic,
            mode,
            agents: agents.map((a) => a.id),
            rounds: config.rounds,
            flags: flagConfig.flags,
          },
          iteration: i,
        });
      }
    }

    // Run scenarios in batches with concurrency limit
    const scenarioResults = new Map<string, BenchmarkResult[]>();

    for (let i = 0; i < modeScenarios.length; i += limit) {
      const batch = modeScenarios.slice(i, i + limit);

      const batchResults = await Promise.allSettled(
        batch.map(async ({ name, scenario }) => {
          console.log(`  Starting: ${scenario.name}`);
          const result = await runSingleBenchmark(scenario, agents, registry);
          completedRuns++;
          console.log(`  Completed: ${scenario.name} (${completedRuns}/${totalRuns})`);
          return { name, result };
        })
      );

      // Collect results
      for (const settledResult of batchResults) {
        if (settledResult.status === 'fulfilled') {
          const { name, result } = settledResult.value;
          const existing = scenarioResults.get(name) ?? [];
          existing.push(result);
          scenarioResults.set(name, existing);
        } else {
          console.error(`  Failed: ${settledResult.reason}`);
        }
      }
    }

    // Add to final results
    for (const [name, resultList] of scenarioResults) {
      results.set(name, resultList);
    }
  }

  return results;
}

// ============================================
// Results Analysis
// ============================================

interface AggregatedMetrics {
  avgLatency: number;
  avgAgreement: number;
  avgConfidence: number;
  avgCrossReferences: number;
  avgCitations: number;
  avgToolCalls: number;
  successRate: number;
  groupthinkRate: number;
}

function aggregateResults(results: BenchmarkResult[]): AggregatedMetrics {
  const successful = results.filter((r) => r.success);
  const n = successful.length;

  if (n === 0) {
    return {
      avgLatency: 0,
      avgAgreement: 0,
      avgConfidence: 0,
      avgCrossReferences: 0,
      avgCitations: 0,
      avgToolCalls: 0,
      successRate: 0,
      groupthinkRate: 0,
    };
  }

  const avgLatency = successful.reduce((sum, r) => sum + r.metrics.latency.totalMs, 0) / n;
  const avgAgreement = successful.reduce((sum, r) => sum + r.metrics.consensus.agreementLevel, 0) / n;
  const avgConfidence = successful.reduce((sum, r) => sum + r.metrics.content.avgConfidence, 0) / n;
  const avgCrossReferences = successful.reduce((sum, r) => sum + r.metrics.interaction.crossReferenceCount, 0) / n;
  const avgCitations = successful.reduce((sum, r) => sum + r.metrics.content.citationCount, 0) / n;

  const totalToolCalls = successful.reduce((sum, r) => {
    const toolCalls = Object.values(r.metrics.content.toolCallsPerAgent);
    return sum + toolCalls.reduce((s, c) => s + c, 0);
  }, 0);
  const avgToolCalls = totalToolCalls / n;

  const groupthinkCount = successful.filter((r) => r.metrics.consensus.groupthinkWarning).length;

  return {
    avgLatency,
    avgAgreement,
    avgConfidence,
    avgCrossReferences,
    avgCitations,
    avgToolCalls,
    successRate: n / results.length,
    groupthinkRate: groupthinkCount / n,
  };
}

// ============================================
// Response Quality Analysis
// ============================================

interface QualityScore {
  structureScore: number;    // 0-100: Response structure compliance
  evidenceScore: number;     // 0-100: Evidence quality (citations, sources)
  reasoningScore: number;    // 0-100: Reasoning depth and coherence
  interactionScore: number;  // 0-100: Engagement with other responses
  stanceScore: number;       // 0-100: Clarity of position/stance
  overallScore: number;      // 0-100: Weighted average
}

interface ResponseQualityReport {
  agentId: string;
  agentName: string;
  round: number;
  scores: QualityScore;
  details: {
    hasPosition: boolean;
    hasReasoning: boolean;
    hasConfidence: boolean;
    citationCount: number;
    toolCallCount: number;
    referencesOthers: boolean;
    stanceClarity: 'clear' | 'partial' | 'unclear';
    reasoningLength: number;
  };
}

function analyzeResponseQuality(response: AgentResponse, context: {
  round: number;
  otherResponses: AgentResponse[];
}): ResponseQualityReport {
  const { round, otherResponses } = context;

  // Structure score: Does the response have required elements?
  const hasPosition = !!(response.position && response.position.length > 20);
  const hasReasoning = !!(response.reasoning && response.reasoning.length > 50);
  const hasConfidence = response.confidence > 0 && response.confidence <= 1;
  const structureScore = (
    (hasPosition ? 40 : 0) +
    (hasReasoning ? 40 : 0) +
    (hasConfidence ? 20 : 0)
  );

  // Evidence score: Citations and tool usage
  const citationCount = response.citations?.length || 0;
  const toolCallCount = response.toolCalls?.length || 0;
  const evidenceScore = Math.min(100, (
    citationCount * 20 +
    toolCallCount * 15
  ));

  // Reasoning score: Depth and length
  const reasoningLength = (response.reasoning || '').length;
  const hasNumbers = /\d+%?/.test(response.reasoning || '');
  const hasExamples = /for example|for instance|such as|e\.g\./i.test(response.reasoning || '');
  const hasContrast = /however|although|on the other hand|but|while/i.test(response.reasoning || '');

  const reasoningScore = Math.min(100, (
    (Math.min(reasoningLength, 500) / 500) * 40 +
    (hasNumbers ? 20 : 0) +
    (hasExamples ? 20 : 0) +
    (hasContrast ? 20 : 0)
  ));

  // Interaction score: References to other agents' responses
  const otherAgentNames = otherResponses.map(r => r.agentName.toLowerCase());
  const responseText = `${response.position} ${response.reasoning}`.toLowerCase();
  const referencesOthers = otherAgentNames.some(name => responseText.includes(name)) ||
    /previous|other|colleague|agent|as mentioned|building on|disagree with|agree with/i.test(responseText);

  const interactionScore = round === 1 ? 50 : (referencesOthers ? 100 : 20);

  // Stance score: Clarity of position
  const positionText = (response.position || '').toLowerCase();
  const hasStanceIndicator = /yes|no|support|oppose|agree|disagree|favor|against|believe|should|must|need/i.test(positionText);
  const hasNuance = /partially|somewhat|conditionally|depends|however|qualified/i.test(positionText);
  const stanceClarity: 'clear' | 'partial' | 'unclear' =
    hasStanceIndicator ? (hasNuance ? 'partial' : 'clear') : 'unclear';

  const stanceScore = stanceClarity === 'clear' ? 100 : stanceClarity === 'partial' ? 70 : 30;

  // Overall score (weighted)
  const overallScore = Math.round(
    structureScore * 0.25 +
    evidenceScore * 0.20 +
    reasoningScore * 0.25 +
    interactionScore * 0.15 +
    stanceScore * 0.15
  );

  return {
    agentId: response.agentId,
    agentName: response.agentName,
    round,
    scores: {
      structureScore,
      evidenceScore,
      reasoningScore,
      interactionScore,
      stanceScore,
      overallScore,
    },
    details: {
      hasPosition,
      hasReasoning,
      hasConfidence,
      citationCount,
      toolCallCount,
      referencesOthers,
      stanceClarity,
      reasoningLength,
    },
  };
}

function analyzeAllResponses(results: BenchmarkResult[]): Map<string, ResponseQualityReport[]> {
  const qualityReports = new Map<string, ResponseQualityReport[]>();

  for (const result of results) {
    if (!result.success) continue;

    const reports: ResponseQualityReport[] = [];
    const responses = result.responses;

    // Group responses by round
    const responsesByRound = new Map<number, AgentResponse[]>();
    for (const response of responses) {
      const round = Math.floor(responses.indexOf(response) / 3) + 1; // Approximate round
      if (!responsesByRound.has(round)) {
        responsesByRound.set(round, []);
      }
      responsesByRound.get(round)!.push(response);
    }

    for (const [round, roundResponses] of Array.from(responsesByRound.entries())) {
      for (const response of roundResponses) {
        const otherResponses = roundResponses.filter(r => r.agentId !== response.agentId);
        const report = analyzeResponseQuality(response, { round, otherResponses });
        reports.push(report);
      }
    }

    qualityReports.set(result.scenario.name, reports);
  }

  return qualityReports;
}

function printQualityReport(allResults: Map<string, BenchmarkResult[]>): void {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      RESPONSE QUALITY ANALYSIS                                ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Aggregate all results for quality analysis
  const allBenchmarks = Array.from(allResults.values()).flat();
  const qualityReports = analyzeAllResponses(allBenchmarks);

  // Group by agent
  const agentScores = new Map<string, { overall: number[]; structure: number[]; evidence: number[]; reasoning: number[]; interaction: number[]; stance: number[] }>();

  for (const reports of Array.from(qualityReports.values())) {
    for (const report of reports) {
      if (!agentScores.has(report.agentName)) {
        agentScores.set(report.agentName, { overall: [], structure: [], evidence: [], reasoning: [], interaction: [], stance: [] });
      }
      const scores = agentScores.get(report.agentName)!;
      scores.overall.push(report.scores.overallScore);
      scores.structure.push(report.scores.structureScore);
      scores.evidence.push(report.scores.evidenceScore);
      scores.reasoning.push(report.scores.reasoningScore);
      scores.interaction.push(report.scores.interactionScore);
      scores.stance.push(report.scores.stanceScore);
    }
  }

  console.log('\n  📊 Per-Agent Quality Scores (Average across all runs):');
  console.log('  ┌─────────────┬──────────┬───────────┬──────────┬───────────┬─────────────┬─────────┐');
  console.log('  │ Agent       │ Overall  │ Structure │ Evidence │ Reasoning │ Interaction │ Stance  │');
  console.log('  ├─────────────┼──────────┼───────────┼──────────┼───────────┼─────────────┼─────────┤');

  for (const [agentName, scores] of Array.from(agentScores.entries())) {
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    console.log(`  │ ${agentName.padEnd(11)} │ ${avg(scores.overall).toFixed(0).padStart(6)}%  │ ${avg(scores.structure).toFixed(0).padStart(7)}%  │ ${avg(scores.evidence).toFixed(0).padStart(6)}%  │ ${avg(scores.reasoning).toFixed(0).padStart(7)}%  │ ${avg(scores.interaction).toFixed(0).padStart(9)}%  │ ${avg(scores.stance).toFixed(0).padStart(5)}%  │`);
  }
  console.log('  └─────────────┴──────────┴───────────┴──────────┴───────────┴─────────────┴─────────┘');

  // Quality by mode
  console.log('\n  📊 Quality by Mode:');

  const modeScores = new Map<string, number[]>();
  for (const [scenarioName, reports] of Array.from(qualityReports.entries())) {
    const mode = scenarioName.split('-')[0];
    if (!mode) continue;
    if (!modeScores.has(mode)) {
      modeScores.set(mode, []);
    }
    for (const report of reports) {
      modeScores.get(mode)!.push(report.scores.overallScore);
    }
  }

  console.log('  ┌─────────────────────┬──────────────┬───────────┐');
  console.log('  │ Mode                │ Avg Quality  │ Rating    │');
  console.log('  ├─────────────────────┼──────────────┼───────────┤');

  for (const [mode, scores] of Array.from(modeScores.entries())) {
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const rating = avg >= 70 ? '⭐⭐⭐' : avg >= 50 ? '⭐⭐' : '⭐';
    console.log(`  │ ${mode.padEnd(19)} │ ${avg.toFixed(1).padStart(10)}%  │ ${rating.padEnd(9)} │`);
  }
  console.log('  └─────────────────────┴──────────────┴───────────┘');

  // Sample response analysis (show a few examples)
  console.log('\n  📝 Sample Response Details (from successful runs):');

  let sampleCount = 0;
  for (const [scenarioName, reports] of Array.from(qualityReports.entries())) {
    if (sampleCount >= 3) break;
    if (reports.length === 0) continue;

    console.log(`\n  Scenario: ${scenarioName}`);
    for (const report of reports.slice(0, 3)) {
      const { details, scores } = report;
      console.log(`    ${report.agentName} (Round ${report.round}): Overall ${scores.overallScore}%`);
      console.log(`      - Position: ${details.hasPosition ? '✅' : '❌'} | Reasoning: ${details.hasReasoning ? '✅' : '❌'} (${details.reasoningLength} chars)`);
      console.log(`      - Citations: ${details.citationCount} | Tool calls: ${details.toolCallCount}`);
      console.log(`      - Stance: ${details.stanceClarity} | References others: ${details.referencesOthers ? '✅' : '❌'}`);
    }
    sampleCount++;
  }

  // Quality recommendations
  console.log('\n  💡 Quality Recommendations:');

  const overallAvg = Array.from(agentScores.values())
    .flatMap(s => s.overall)
    .reduce((a, b, _, arr) => a + b / arr.length, 0);

  if (overallAvg < 50) {
    console.log('    ⚠️ Overall quality is below target. Consider:');
    console.log('       - Enabling strict prompt enforcement for clearer structure');
    console.log('       - Requiring minimum tool calls for evidence gathering');
  } else if (overallAvg < 70) {
    console.log('    📈 Moderate quality. To improve:');
    console.log('       - Encourage more cross-references between agents');
    console.log('       - Add verification requirements for claims');
  } else {
    console.log('    ✅ Good quality scores across agents');
  }

  // Check evidence scores
  const evidenceAvg = Array.from(agentScores.values())
    .flatMap(s => s.evidence)
    .reduce((a, b, _, arr) => a + b / arr.length, 0);

  if (evidenceAvg < 40) {
    console.log('    ⚠️ Low evidence scores - agents not using enough citations/tools');
  }
}

// ============================================
// Sample Conversation Output (For Quality Review)
// ============================================

function printSampleConversations(allResults: Map<string, BenchmarkResult[]>): void {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    SAMPLE CONVERSATIONS FOR REVIEW                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  // Get one sample from each mode for detailed review
  const modes = new Set<string>();
  for (const key of Array.from(allResults.keys())) {
    const mode = key.split('-')[0];
    if (mode) modes.add(mode);
  }

  for (const mode of Array.from(modes)) {
    // Get first successful result for this mode
    let sampleResult: BenchmarkResult | undefined;
    for (const [key, results] of Array.from(allResults.entries())) {
      if (key.startsWith(`${mode}-`) && !sampleResult) {
        sampleResult = results.find(r => r.success);
        if (sampleResult) break;
      }
    }

    if (!sampleResult) continue;

    console.log(`\n${'═'.repeat(78)}`);
    console.log(`  MODE: ${mode.toUpperCase()} | Scenario: ${sampleResult.scenario.name}`);
    console.log(`${'═'.repeat(78)}`);
    console.log(`  Topic: ${sampleResult.scenario.topic}`);
    console.log(`${'─'.repeat(78)}`);

    // Group responses by round (approximate)
    const agentCount = 3; // Assuming 3 agents
    const rounds = Math.ceil(sampleResult.responses.length / agentCount);

    for (let round = 1; round <= rounds; round++) {
      console.log(`\n  📌 ROUND ${round}`);
      console.log(`  ${'─'.repeat(74)}`);

      const startIdx = (round - 1) * agentCount;
      const roundResponses = sampleResult.responses.slice(startIdx, startIdx + agentCount);

      for (const response of roundResponses) {
        console.log(`\n  🤖 ${response.agentName} (Confidence: ${(response.confidence * 100).toFixed(0)}%)`);
        if (response.stance) {
          console.log(`     Stance: ${response.stance}`);
        }

        // Print position (truncated if too long)
        console.log(`\n     📍 POSITION:`);
        const position = response.position || '(No position provided)';
        const positionLines = wrapText(position, 70);
        for (const line of positionLines.slice(0, 5)) {
          console.log(`        ${line}`);
        }
        if (positionLines.length > 5) {
          console.log(`        ... (${positionLines.length - 5} more lines)`);
        }

        // Print reasoning excerpt
        console.log(`\n     💭 REASONING (excerpt):`);
        const reasoning = response.reasoning || '(No reasoning provided)';
        const reasoningLines = wrapText(reasoning, 70);
        for (const line of reasoningLines.slice(0, 8)) {
          console.log(`        ${line}`);
        }
        if (reasoningLines.length > 8) {
          console.log(`        ... (${reasoningLines.length - 8} more lines)`);
        }

        // Tool calls summary
        if (response.toolCalls && response.toolCalls.length > 0) {
          console.log(`\n     🔧 TOOL CALLS: ${response.toolCalls.length}`);
          for (const tc of response.toolCalls.slice(0, 3)) {
            console.log(`        - ${tc.toolName}: ${JSON.stringify(tc.input).substring(0, 60)}...`);
          }
          if (response.toolCalls.length > 3) {
            console.log(`        ... and ${response.toolCalls.length - 3} more calls`);
          }
        }

        // Citations
        if (response.citations && response.citations.length > 0) {
          console.log(`\n     📚 CITATIONS: ${response.citations.length}`);
          for (const citation of response.citations.slice(0, 2)) {
            console.log(`        - ${citation.title || citation.url}`);
          }
        }

        console.log(`  ${'─'.repeat(74)}`);
      }
    }
  }

  // Quality Review Checklist
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                      MANUAL QUALITY REVIEW CHECKLIST                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log(`
  Review each conversation above and check:

  ☐ Position Clarity
    - Is the position clearly stated?
    - Does it directly address the topic?

  ☐ Reasoning Quality
    - Are arguments logical and well-structured?
    - Are there specific examples or evidence?
    - Is there nuance (acknowledging counterarguments)?

  ☐ Agent Interaction (Round 2+)
    - Do agents reference each other's points?
    - Are counterarguments addressed?
    - Is there meaningful dialogue (not just repeating)?

  ☐ Tool Usage
    - Are web searches being used for evidence?
    - Are citations provided where appropriate?
    - Is the fact_check tool being used?

  ☐ Mode-Specific Behavior
    - Collaborative: Seeking common ground?
    - Adversarial: Challenging positions?
    - Socratic: Asking probing questions?
    - Expert-Panel: Domain expertise shown?
    - Devils-Advocate: Clear stance assignments?
    - Delphi: Anonymous/unbiased?
    - Red-Team-Blue-Team: Attack/Defense roles?

  ☐ Overall Coherence
    - Does the conversation flow naturally?
    - Is there progression across rounds?
    - Would a human find this valuable?
  `);
}

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  const words = text.replace(/\n/g, ' ').split(/\s+/);
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= width) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines;
}

function compareConfigurations(
  baseline: AggregatedMetrics,
  variant: AggregatedMetrics
): { metric: string; baseline: string; variant: string; change: string; better: boolean }[] {
  const comparisons = [
    {
      metric: 'Latency (ms)',
      baseline: baseline.avgLatency.toFixed(0),
      variant: variant.avgLatency.toFixed(0),
      change: `${(((baseline.avgLatency - variant.avgLatency) / baseline.avgLatency) * 100).toFixed(1)}%`,
      better: variant.avgLatency < baseline.avgLatency,
    },
    {
      metric: 'Agreement Level',
      baseline: baseline.avgAgreement.toFixed(2),
      variant: variant.avgAgreement.toFixed(2),
      change: `${((variant.avgAgreement - baseline.avgAgreement) * 100).toFixed(1)}%`,
      better: variant.avgAgreement >= baseline.avgAgreement,
    },
    {
      metric: 'Avg Confidence',
      baseline: baseline.avgConfidence.toFixed(2),
      variant: variant.avgConfidence.toFixed(2),
      change: `${((variant.avgConfidence - baseline.avgConfidence) * 100).toFixed(1)}%`,
      better: variant.avgConfidence >= baseline.avgConfidence,
    },
    {
      metric: 'Cross-References',
      baseline: baseline.avgCrossReferences.toFixed(1),
      variant: variant.avgCrossReferences.toFixed(1),
      change: `${variant.avgCrossReferences > 0 ? ((variant.avgCrossReferences - baseline.avgCrossReferences) / Math.max(1, baseline.avgCrossReferences) * 100).toFixed(1) : '0'}%`,
      better: variant.avgCrossReferences >= baseline.avgCrossReferences,
    },
    {
      metric: 'Citations',
      baseline: baseline.avgCitations.toFixed(1),
      variant: variant.avgCitations.toFixed(1),
      change: `${variant.avgCitations > 0 ? ((variant.avgCitations - baseline.avgCitations) / Math.max(1, baseline.avgCitations) * 100).toFixed(1) : '0'}%`,
      better: variant.avgCitations >= baseline.avgCitations,
    },
    {
      metric: 'Tool Calls',
      baseline: baseline.avgToolCalls.toFixed(1),
      variant: variant.avgToolCalls.toFixed(1),
      change: `${variant.avgToolCalls > 0 ? ((variant.avgToolCalls - baseline.avgToolCalls) / Math.max(1, baseline.avgToolCalls) * 100).toFixed(1) : '0'}%`,
      better: variant.avgToolCalls >= baseline.avgToolCalls,
    },
    {
      metric: 'Groupthink Rate',
      baseline: `${(baseline.groupthinkRate * 100).toFixed(0)}%`,
      variant: `${(variant.groupthinkRate * 100).toFixed(0)}%`,
      change: `${((baseline.groupthinkRate - variant.groupthinkRate) * 100).toFixed(1)}%`,
      better: variant.groupthinkRate <= baseline.groupthinkRate,
    },
  ];

  return comparisons;
}

function printReport(allResults: Map<string, BenchmarkResult[]>): void {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         BENCHMARK RESULTS REPORT                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('');

  // Group by mode
  const modes = new Set<string>();
  for (const key of Array.from(allResults.keys())) {
    const mode = key.split('-')[0];
    if (mode) modes.add(mode);
  }

  for (const mode of Array.from(modes)) {
    console.log(`\n${'─'.repeat(78)}`);
    console.log(`  MODE: ${mode.toUpperCase()}`);
    console.log(`${'─'.repeat(78)}`);

    // Get baseline for this mode
    const baselineKey = `${mode}-baseline`;
    const baselineResults = allResults.get(baselineKey);

    if (!baselineResults) {
      console.log('  No baseline results found');
      continue;
    }

    const baselineMetrics = aggregateResults(baselineResults);

    // Print baseline metrics
    console.log('\n  📊 Baseline Metrics:');
    console.log(`     Latency: ${baselineMetrics.avgLatency.toFixed(0)}ms`);
    console.log(`     Agreement: ${(baselineMetrics.avgAgreement * 100).toFixed(1)}%`);
    console.log(`     Confidence: ${(baselineMetrics.avgConfidence * 100).toFixed(1)}%`);
    console.log(`     Cross-refs: ${baselineMetrics.avgCrossReferences.toFixed(1)}`);
    console.log(`     Citations: ${baselineMetrics.avgCitations.toFixed(1)}`);
    console.log(`     Tool calls: ${baselineMetrics.avgToolCalls.toFixed(1)}`);
    console.log(`     Success rate: ${(baselineMetrics.successRate * 100).toFixed(0)}%`);

    // Compare with variants
    for (const config of FLAG_CONFIGURATIONS) {
      if (config.name === 'baseline') continue;

      const variantKey = `${mode}-${config.name}`;
      const variantResults = allResults.get(variantKey);

      if (!variantResults) continue;

      const variantMetrics = aggregateResults(variantResults);
      const comparisons = compareConfigurations(baselineMetrics, variantMetrics);

      console.log(`\n  🔄 vs ${config.name}:`);
      console.log('     ┌───────────────────┬──────────┬──────────┬──────────┬────────┐');
      console.log('     │ Metric            │ Baseline │ Variant  │ Change   │ Better │');
      console.log('     ├───────────────────┼──────────┼──────────┼──────────┼────────┤');

      for (const comp of comparisons) {
        const betterStr = comp.better ? '  ✅  ' : '  ❌  ';
        console.log(
          `     │ ${comp.metric.padEnd(17)} │ ${comp.baseline.padStart(8)} │ ${comp.variant.padStart(8)} │ ${comp.change.padStart(8)} │${betterStr}│`
        );
      }
      console.log('     └───────────────────┴──────────┴──────────┴──────────┴────────┘');

      // Calculate overall score
      const improvements = comparisons.filter((c) => c.better).length;
      const score = ((improvements / comparisons.length) * 100).toFixed(0);
      const recommendation =
        improvements >= 5 ? '✅ ADOPT' : improvements >= 3 ? '⚠️ CONDITIONAL' : '❌ REJECT';

      console.log(`\n     Overall Score: ${score}% improvements → ${recommendation}`);
    }
  }

  // Summary
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              SUMMARY                                          ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');

  const totalRuns = Array.from(allResults.values()).flat().length;
  const successfulRuns = Array.from(allResults.values())
    .flat()
    .filter((r) => r.success).length;

  console.log(`\n  Total benchmark runs: ${totalRuns}`);
  console.log(`  Successful runs: ${successfulRuns} (${((successfulRuns / totalRuns) * 100).toFixed(0)}%)`);
  console.log(`  Configurations tested: ${FLAG_CONFIGURATIONS.length}`);
  console.log(`  Modes tested: ${modes.size}`);
  console.log('');
}

// ============================================
// CLI Parsing
// ============================================

function parseArgs(): BenchmarkConfig {
  const args = process.argv.slice(2);
  const config = { ...DEFAULT_CONFIG };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    if (arg === '--iterations' && nextArg) {
      config.iterations = parseInt(nextArg, 10);
      i++;
    } else if (arg === '--modes' && nextArg) {
      config.modes = nextArg.split(',') as DebateMode[];
      i++;
    } else if (arg === '--rounds' && nextArg) {
      config.rounds = parseInt(nextArg, 10);
      i++;
    } else if (arg === '--topic' && nextArg) {
      config.topic = nextArg;
      i++;
    } else if (arg === '--output' && nextArg) {
      config.outputFile = nextArg;
      i++;
    } else if (arg === '--parallel') {
      config.parallel = true;
    } else if (arg === '--parallel-limit' && nextArg) {
      config.parallelLimit = parseInt(nextArg, 10);
      i++;
    } else if (arg === '--help') {
      console.log(`
Usage: npx tsx scripts/run-benchmarks.ts [options]

Options:
  --iterations <n>        Number of iterations per scenario (default: 2)
  --modes <modes>         Comma-separated list of modes (default: all 7 modes)
  --rounds <n>            Number of debate rounds (default: 2)
  --topic <topic>         Debate topic
  --output <file>         Output file for JSON results
  --parallel              Run flag configurations in parallel (faster)
  --parallel-limit <n>    Max concurrent scenarios when parallel (default: 4)
  --help                  Show this help message

Example:
  npx tsx scripts/run-benchmarks.ts --iterations 1 --modes collaborative,adversarial --parallel
  npx tsx scripts/run-benchmarks.ts --parallel --parallel-limit 2
      `);
      process.exit(0);
    }
  }

  return config;
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  console.log('\n🚀 Starting AI Roundtable Benchmark Suite\n');

  const config = parseArgs();

  console.log('Configuration:');
  console.log(`  Iterations: ${config.iterations}`);
  console.log(`  Modes: ${config.modes.join(', ')}`);
  console.log(`  Rounds per debate: ${config.rounds}`);
  console.log(`  Topic: ${config.topic.substring(0, 50)}...`);
  if (config.parallel) {
    console.log(`  Parallel: enabled (limit: ${config.parallelLimit ?? 4})`);
  }
  console.log('');

  const startTime = Date.now();

  try {
    const results = config.parallel
      ? await runBenchmarksParallel(config)
      : await runBenchmarks(config);
    printReport(results);
    printQualityReport(results);

    // Save JSON results if output file specified
    if (config.outputFile) {
      const jsonResults: Record<string, object[]> = {};
      for (const [key, value] of Array.from(results.entries())) {
        jsonResults[key] = value.map((r) => ({
          scenario: r.scenario.name,
          mode: r.scenario.mode,
          success: r.success,
          error: r.error,
          metrics: r.metrics,
          timestamp: r.timestamp,
          // Include actual response content for quality verification
          responses: r.responses.map(resp => ({
            agentId: resp.agentId,
            agentName: resp.agentName,
            position: resp.position,
            reasoning: resp.reasoning,
            confidence: resp.confidence,
            stance: resp.stance,
            citations: resp.citations,
            toolCalls: resp.toolCalls?.map(tc => ({
              toolName: tc.toolName,
              input: tc.input,
              // Truncate output for readability
              output: typeof tc.output === 'string'
                ? tc.output.substring(0, 500) + (tc.output.length > 500 ? '...' : '')
                : tc.output,
            })),
          })),
        }));
      }

      const fs = await import('fs');
      fs.writeFileSync(config.outputFile, JSON.stringify(jsonResults, null, 2));
      console.log(`\n📁 Results saved to: ${config.outputFile}`);
    }

    // Print sample conversations for quality review
    printSampleConversations(results);
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }

  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n⏱️ Total benchmark time: ${totalTime} minutes\n`);
}

main().catch(console.error);
