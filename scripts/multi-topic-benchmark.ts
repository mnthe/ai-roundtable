import 'dotenv/config';
import { setupProviders, detectApiKeys, createDefaultAgents } from '../src/agents/setup.js';
import { AgentRegistry } from '../src/agents/registry.js';
import { DevilsAdvocateMode } from '../src/modes/devils-advocate.js';
import { DefaultAgentToolkit } from '../src/tools/toolkit.js';
import type { DebateContext, FeatureFlags } from '../src/types/index.js';

const TOPICS = [
  "Should AI systems be required to explain their decision-making process to users?",
  "Is remote work better for productivity than office work?",
  "Should social media platforms be held responsible for misinformation?",
];

const CONFIGS = [
  { name: 'sequential', flags: { sequentialParallelization: { enabled: false, level: 'none' } } },
  { name: 'last-only', flags: { sequentialParallelization: { enabled: true, level: 'last-only' } } },
];

async function runBenchmark() {
  const registry = new AgentRegistry();
  const keys = detectApiKeys();
  const { warnings } = setupProviders(registry, keys);
  console.log('Warnings:', warnings);
  createDefaultAgents(registry);
  const allAgents = registry.getActiveAgents();
  console.log('Available agents:', allAgents.map(a => a.getInfo().name));
  const results: any[] = [];

  for (const topic of TOPICS) {
    for (const config of CONFIGS) {
      console.log('\n' + '='.repeat(60));
      console.log('Topic:', topic.substring(0, 50) + '...');
      console.log('Config:', config.name);
      console.log('='.repeat(60));

      const mode = new DevilsAdvocateMode({
        enabled: config.flags.sequentialParallelization.enabled,
        level: config.flags.sequentialParallelization.level as any
      });

      const context: DebateContext = {
        sessionId: 'test-' + Date.now(),
        topic,
        mode: 'devils-advocate',
        currentRound: 1,
        totalRounds: 1,
        previousResponses: [],
        flags: config.flags as Partial<FeatureFlags>,
      };

      const toolkit = new DefaultAgentToolkit();
      toolkit.setContext(context);

      try {
        const responses = await mode.executeRound(allAgents.slice(0, 3), context, toolkit);
        const violations = responses.filter(r => r._roleViolation);
        results.push({
          topic: topic.substring(0, 50),
          config: config.name,
          violationCount: violations.length,
          total: responses.length,
        });
        console.log('Violations:', violations.length + '/' + responses.length);
        for (const r of responses) {
          const viol = r._roleViolation ? ' ⚠️ VIOLATION (expected ' + r._roleViolation.expected + ')' : '';
          console.log('  ' + r.agentName + ': stance=' + r.stance + viol);
        }
      } catch (err) {
        console.error('Error:', err);
      }
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY (FIRM TONE)');
  console.log('='.repeat(60));

  const byConfig: Record<string, { total: number; violations: number }> = {};
  for (const r of results) {
    if (!byConfig[r.config]) byConfig[r.config] = { total: 0, violations: 0 };
    byConfig[r.config].total += r.total;
    byConfig[r.config].violations += r.violationCount;
  }

  for (const [config, data] of Object.entries(byConfig)) {
    const rate = ((data.total - data.violations) / data.total * 100).toFixed(1);
    console.log(config + ': ' + rate + '% compliance (' + data.violations + '/' + data.total + ' violations)');
  }
}

runBenchmark().catch(console.error);
