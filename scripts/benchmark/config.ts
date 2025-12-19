/**
 * Benchmark Configuration Loader
 *
 * Loads and validates experiment configuration from YAML files.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { DebateMode } from '../../src/types/index.js';
import type {
  ExperimentConfig,
  ExperimentVariables,
  ExecutionOptions,
  OutputOptions,
} from './types.js';

const VALID_MODES: DebateMode[] = [
  'collaborative',
  'adversarial',
  'socratic',
  'expert-panel',
  'devils-advocate',
  'delphi',
  'red-team-blue-team',
];

const DEFAULT_OPTIONS: ExecutionOptions = {
  parallel: false,
  delay_between: 5000,
  retry_on_failure: 2,
};

const DEFAULT_OUTPUT: OutputOptions = {
  include_raw_responses: true,
  include_tool_calls: true,
  include_citations: true,
};

export class ConfigLoader {
  /**
   * Load configuration from a YAML file
   */
  load(configPath: string): ExperimentConfig {
    const absolutePath = resolve(process.cwd(), configPath);

    if (!existsSync(absolutePath)) {
      throw new Error(`Config file not found: ${absolutePath}`);
    }

    const content = readFileSync(absolutePath, 'utf-8');
    const raw = parseYaml(content);

    return this.validate(raw);
  }

  /**
   * Validate and normalize configuration
   */
  private validate(raw: unknown): ExperimentConfig {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid config: must be an object');
    }

    const config = raw as Record<string, unknown>;

    // Validate name
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Invalid config: "name" is required and must be a string');
    }

    // Validate variables
    const variables = this.validateVariables(config.variables);

    // Merge options with defaults
    const options = this.mergeOptions(config.options);

    // Merge output with defaults
    const output = this.mergeOutput(config.output);

    return {
      name: config.name,
      description: typeof config.description === 'string' ? config.description : undefined,
      variables,
      options,
      output,
    };
  }

  private validateVariables(raw: unknown): ExperimentVariables {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Invalid config: "variables" is required');
    }

    const vars = raw as Record<string, unknown>;

    // Validate modes
    if (!Array.isArray(vars.modes) || vars.modes.length === 0) {
      throw new Error('Invalid config: "variables.modes" must be a non-empty array');
    }

    for (const mode of vars.modes) {
      if (!VALID_MODES.includes(mode as DebateMode)) {
        throw new Error(`Invalid mode: "${mode}". Valid modes: ${VALID_MODES.join(', ')}`);
      }
    }

    // Validate rounds
    if (!Array.isArray(vars.rounds) || vars.rounds.length === 0) {
      throw new Error('Invalid config: "variables.rounds" must be a non-empty array');
    }

    for (const round of vars.rounds) {
      if (typeof round !== 'number' || round < 1 || round > 10) {
        throw new Error(`Invalid round: "${round}". Must be a number between 1 and 10`);
      }
    }

    // Validate topics
    if (!Array.isArray(vars.topics) || vars.topics.length === 0) {
      throw new Error('Invalid config: "variables.topics" must be a non-empty array');
    }

    for (const topic of vars.topics) {
      if (typeof topic !== 'string' || topic.trim().length === 0) {
        throw new Error('Invalid topic: must be a non-empty string');
      }
    }

    // Validate agents
    const agents = Array.isArray(vars.agents) ? vars.agents : ['default'];
    for (const agent of agents) {
      if (typeof agent !== 'string') {
        throw new Error('Invalid agent: must be a string');
      }
    }

    return {
      modes: vars.modes as DebateMode[],
      rounds: vars.rounds as number[],
      topics: vars.topics as string[],
      agents: agents as string[],
    };
  }

  private mergeOptions(raw: unknown): ExecutionOptions {
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_OPTIONS };
    }

    const opts = raw as Record<string, unknown>;

    return {
      parallel: typeof opts.parallel === 'boolean' ? opts.parallel : DEFAULT_OPTIONS.parallel,
      delay_between:
        typeof opts.delay_between === 'number' ? opts.delay_between : DEFAULT_OPTIONS.delay_between,
      retry_on_failure:
        typeof opts.retry_on_failure === 'number'
          ? opts.retry_on_failure
          : DEFAULT_OPTIONS.retry_on_failure,
    };
  }

  private mergeOutput(raw: unknown): OutputOptions {
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_OUTPUT };
    }

    const out = raw as Record<string, unknown>;

    return {
      include_raw_responses:
        typeof out.include_raw_responses === 'boolean'
          ? out.include_raw_responses
          : DEFAULT_OUTPUT.include_raw_responses,
      include_tool_calls:
        typeof out.include_tool_calls === 'boolean'
          ? out.include_tool_calls
          : DEFAULT_OUTPUT.include_tool_calls,
      include_citations:
        typeof out.include_citations === 'boolean'
          ? out.include_citations
          : DEFAULT_OUTPUT.include_citations,
    };
  }
}

/**
 * Generate experiment matrix from variables
 */
export function generateMatrix(
  variables: ExperimentVariables
): Array<{ mode: DebateMode; topic: string; rounds: number; agents: string[] }> {
  const runs: Array<{ mode: DebateMode; topic: string; rounds: number; agents: string[] }> = [];

  for (const mode of variables.modes) {
    for (const rounds of variables.rounds) {
      for (const topic of variables.topics) {
        runs.push({
          mode,
          topic,
          rounds,
          agents: variables.agents,
        });
      }
    }
  }

  return runs;
}
