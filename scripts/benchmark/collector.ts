/**
 * Benchmark Data Collector
 *
 * Handles saving experiment results to the file system.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RunResult, RoundData, ConsensusData, RunMetadata, OutputOptions } from './types.js';

const RESULTS_DIR = 'results';

export class DataCollector {
  private baseDir: string;
  private outputOptions: OutputOptions;

  constructor(baseDir?: string, outputOptions?: Partial<OutputOptions>) {
    this.baseDir = baseDir ?? resolve(process.cwd(), RESULTS_DIR);
    this.outputOptions = {
      include_raw_responses: true,
      include_tool_calls: true,
      include_citations: true,
      ...outputOptions,
    };
  }

  /**
   * Save a complete run result to the file system
   */
  async save(result: RunResult): Promise<string> {
    const runDir = this.createRunDirectory(result);

    // Save metadata
    this.saveMetadata(runDir, result.metadata);

    // Save session data
    this.saveSession(runDir, result);

    // Save rounds
    this.saveRounds(runDir, result.roundsData);

    // Save consensus
    this.saveConsensus(runDir, result.consensus);

    return runDir;
  }

  /**
   * Create directory structure for a run
   * results/{date}/{experiment}/{mode}/{topic-slug}/
   */
  private createRunDirectory(result: RunResult): string {
    const date = this.formatDate(result.metadata.startedAt);
    const experimentName = result.metadata.experimentName || 'single-run';
    const mode = result.config.mode;
    const topicSlug = this.slugify(result.config.topic);

    const runDir = join(this.baseDir, date, experimentName, mode, topicSlug);

    // Handle duplicate runs by adding suffix
    let finalDir = runDir;
    let suffix = 1;
    while (existsSync(finalDir)) {
      finalDir = `${runDir}-${suffix}`;
      suffix++;
    }

    mkdirSync(finalDir, { recursive: true });
    mkdirSync(join(finalDir, 'rounds'), { recursive: true });

    return finalDir;
  }

  private saveMetadata(runDir: string, metadata: RunMetadata): void {
    const data = {
      experimentName: metadata.experimentName,
      runId: metadata.runId,
      startedAt: metadata.startedAt.toISOString(),
      completedAt: metadata.completedAt.toISOString(),
      durationMs: metadata.durationMs,
      agents: metadata.agents,
      ...(metadata.error && { error: metadata.error }),
    };

    writeFileSync(join(runDir, 'metadata.json'), JSON.stringify(data, null, 2));
  }

  private saveSession(runDir: string, result: RunResult): void {
    const data = {
      sessionId: result.session.sessionId,
      topic: result.session.topic,
      mode: result.session.mode,
      totalRounds: result.session.totalRounds,
      status: result.session.status,
      createdAt: result.session.createdAt.toISOString(),
      config: {
        mode: result.config.mode,
        topic: result.config.topic,
        rounds: result.config.rounds,
        agents: result.config.agents,
      },
    };

    writeFileSync(join(runDir, 'session.json'), JSON.stringify(data, null, 2));
  }

  private saveRounds(runDir: string, rounds: RoundData[]): void {
    for (const round of rounds) {
      const data = {
        roundNumber: round.roundNumber,
        durationMs: round.durationMs,
        responses: round.responses.map((r) => this.filterResponse(r)),
        ...(round.consensusSnapshot && { consensusSnapshot: round.consensusSnapshot }),
        ...(round.contextRequests &&
          round.contextRequests.length > 0 && { contextRequests: round.contextRequests }),
      };

      writeFileSync(
        join(runDir, 'rounds', `round-${round.roundNumber}.json`),
        JSON.stringify(data, null, 2)
      );
    }
  }

  private saveConsensus(runDir: string, consensus: ConsensusData): void {
    writeFileSync(join(runDir, 'consensus.json'), JSON.stringify(consensus, null, 2));
  }

  /**
   * Filter response based on output options
   */
  private filterResponse(response: Record<string, unknown>): Record<string, unknown> {
    const filtered: Record<string, unknown> = {
      agentId: response.agentId,
      agentName: response.agentName,
      stance: response.stance, // Role stance (YES/NO/NEUTRAL) for devils-advocate mode
      position: response.position,
      reasoning: this.outputOptions.include_raw_responses ? response.reasoning : undefined,
      confidence: response.confidence,
      timestamp: response.timestamp,
    };

    if (this.outputOptions.include_citations && response.citations) {
      filtered.citations = response.citations;
    }

    if (this.outputOptions.include_tool_calls && response.toolCalls) {
      filtered.toolCalls = response.toolCalls;
    }

    // Remove undefined values
    return Object.fromEntries(Object.entries(filtered).filter(([, v]) => v !== undefined));
  }

  /**
   * List all experiment results
   */
  listResults(options?: { date?: string; experiment?: string }): string[] {
    const results: string[] = [];

    if (!existsSync(this.baseDir)) {
      return results;
    }

    const dates = options?.date ? [options.date] : readdirSync(this.baseDir);

    for (const date of dates) {
      const datePath = join(this.baseDir, date);
      if (!existsSync(datePath)) continue;

      const experiments = options?.experiment ? [options.experiment] : readdirSync(datePath);

      for (const exp of experiments) {
        const expPath = join(datePath, exp);
        if (!existsSync(expPath)) continue;

        const modes = readdirSync(expPath);
        for (const mode of modes) {
          const modePath = join(expPath, mode);
          const topics = readdirSync(modePath);
          for (const topic of topics) {
            results.push(join(date, exp, mode, topic));
          }
        }
      }
    }

    return results;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Convert topic to URL-safe slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s가-힣-]/g, '') // Keep alphanumeric, spaces, Korean, hyphens
      .replace(/[\s_]+/g, '-') // Replace spaces/underscores with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .slice(0, 50); // Limit length
  }
}
