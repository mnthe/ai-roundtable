#!/usr/bin/env node
/**
 * Benchmark CLI
 *
 * Command-line interface for running benchmark experiments.
 */

import { Command } from 'commander';
import { BenchmarkRunner } from './runner.js';
import type { DebateMode } from '../../src/types/index.js';

const VALID_MODES: DebateMode[] = [
  'collaborative',
  'adversarial',
  'socratic',
  'expert-panel',
  'devils-advocate',
  'delphi',
  'red-team-blue-team',
];

const program = new Command();

program
  .name('benchmark')
  .description('AI Roundtable Benchmark Tool - Run experiments and collect data')
  .version('0.1.0');

// Run command - batch execution with config file
program
  .command('run <config>')
  .description('Run experiment batch with config file')
  .option('--dry-run', 'Print matrix without execution')
  .option('--filter-mode <mode>', 'Run specific mode only')
  .option('-o, --output <dir>', 'Output directory for results')
  .action(async (configPath: string, options) => {
    try {
      // Validate filter mode if provided
      if (options.filterMode && !VALID_MODES.includes(options.filterMode)) {
        console.error(`Invalid mode: ${options.filterMode}`);
        console.error(`Valid modes: ${VALID_MODES.join(', ')}`);
        process.exit(1);
      }

      const runner = new BenchmarkRunner(options.output);
      await runner.runExperiment(configPath, {
        dryRun: options.dryRun,
        filterMode: options.filterMode,
      });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Single command - single experiment
program
  .command('single')
  .description('Run a single experiment')
  .requiredOption('-t, --topic <topic>', 'Debate topic')
  .requiredOption('-m, --mode <mode>', `Debate mode (${VALID_MODES.join(', ')})`)
  .option('-r, --rounds <n>', 'Number of rounds', '3')
  .option('-o, --output <dir>', 'Output directory for results')
  .action(async (options) => {
    try {
      // Validate mode
      if (!VALID_MODES.includes(options.mode)) {
        console.error(`Invalid mode: ${options.mode}`);
        console.error(`Valid modes: ${VALID_MODES.join(', ')}`);
        process.exit(1);
      }

      // Validate rounds
      const rounds = parseInt(options.rounds, 10);
      if (isNaN(rounds) || rounds < 1 || rounds > 10) {
        console.error('Rounds must be a number between 1 and 10');
        process.exit(1);
      }

      const runner = new BenchmarkRunner(options.output);
      await runner.runSingle({
        topic: options.topic,
        mode: options.mode as DebateMode,
        rounds: options.rounds,
        output: options.output,
      });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// List command - list results
program
  .command('list')
  .description('List experiment results')
  .option('--date <date>', 'Filter by date (YYYY-MM-DD)')
  .option('--experiment <name>', 'Filter by experiment name')
  .action(async (options) => {
    try {
      const runner = new BenchmarkRunner();
      const results = runner.listResults({
        date: options.date,
        experiment: options.experiment,
      });

      if (results.length === 0) {
        console.log('No results found.');
        return;
      }

      console.log('\n=== Experiment Results ===\n');
      for (const result of results) {
        console.log(`  ${result}`);
      }
      console.log(`\nTotal: ${results.length} results`);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Matrix command - show experiment matrix from config
program
  .command('matrix <config>')
  .description('Show experiment matrix from config file (alias for run --dry-run)')
  .action(async (configPath: string) => {
    try {
      const runner = new BenchmarkRunner();
      await runner.runExperiment(configPath, { dryRun: true });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
