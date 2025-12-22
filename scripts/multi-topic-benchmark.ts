import 'dotenv/config';
import { setupProviders, detectApiKeys, createDefaultAgents } from '../src/agents/setup.js';
import { AgentRegistry } from '../src/agents/registry.js';
import { DevilsAdvocateMode } from '../src/modes/devils-advocate.js';
import { DefaultAgentToolkit } from '../src/tools/toolkit.js';
import type { DebateContext } from '../src/types/index.js';

const TOPICS = [
  'Should AI systems be required to explain their decision-making process to users?',
  'Is remote work better for productivity than office work?',
  'Should social media platforms be held responsible for misinformation?',
];

async function runBenchmark() {
  const registry = new AgentRegistry();
  const keys = detectApiKeys();
  const { warnings } = setupProviders(registry, keys);
  console.log('Warnings:', warnings);
  createDefaultAgents(registry);
  const allAgents = registry.getActiveAgents();
  console.log(
    'Available agents:',
    allAgents.map((a) => a.getInfo().name)
  );
  const results: { topic: string; violationCount: number; total: number }[] = [];

  for (const topic of TOPICS) {
    console.log('\n' + '='.repeat(60));
    console.log('Topic:', topic.substring(0, 50) + '...');
    console.log('='.repeat(60));

    const mode = new DevilsAdvocateMode();

    const context: DebateContext = {
      sessionId: 'test-' + Date.now(),
      topic,
      mode: 'devils-advocate',
      currentRound: 1,
      totalRounds: 1,
      previousResponses: [],
    };

    const toolkit = new DefaultAgentToolkit();
    toolkit.setContext(context);

    try {
      const responses = await mode.executeRound(allAgents.slice(0, 3), context, toolkit);
      const violations = responses.filter((r) => r._roleViolation);
      results.push({
        topic: topic.substring(0, 50),
        violationCount: violations.length,
        total: responses.length,
      });
      console.log('Violations:', violations.length + '/' + responses.length);
      for (const r of responses) {
        const viol = r._roleViolation
          ? ' ⚠️ VIOLATION (expected ' + r._roleViolation.expected + ')'
          : '';
        console.log('  ' + r.agentName + ': stance=' + r.stance + viol);
      }
    } catch (err) {
      console.error('Error:', err);
    }
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const totalResponses = results.reduce((sum, r) => sum + r.total, 0);
  const totalViolations = results.reduce((sum, r) => sum + r.violationCount, 0);
  const rate = (((totalResponses - totalViolations) / totalResponses) * 100).toFixed(1);
  console.log(`Overall: ${rate}% compliance (${totalViolations}/${totalResponses} violations)`);
}

runBenchmark().catch(console.error);
