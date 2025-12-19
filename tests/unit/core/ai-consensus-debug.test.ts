/**
 * Debug test to find root cause of AI Consensus Analyzer fallback
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AIConsensusAnalyzer } from '../../../src/core/ai-consensus-analyzer.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import { setupAgents } from '../../../src/agents/setup.js';
import type { AgentResponse } from '../../../src/types/index.js';

describe('AIConsensusAnalyzer Root Cause Debug', () => {
  let registry: AgentRegistry;
  let analyzer: AIConsensusAnalyzer;

  const sampleResponses: AgentResponse[] = [
    {
      agentId: 'agent-1',
      agentName: 'Agent 1',
      position: 'Yes, 2+2 equals 4 in standard arithmetic.',
      reasoning: 'Basic math.',
      confidence: 1.0,
      timestamp: new Date(),
    },
    {
      agentId: 'agent-2',
      agentName: 'Agent 2',
      position: 'Yes, 2+2 = 4.',
      reasoning: 'Simple addition.',
      confidence: 1.0,
      timestamp: new Date(),
    },
  ];

  beforeAll(async () => {
    registry = new AgentRegistry();

    // Setup agents with real API keys
    const setupResult = await setupAgents(registry);
    console.error('\n=== DEBUG: Agent Setup Result ===');
    console.error('Active agents:', setupResult.registeredAgents);
    console.error('Warnings:', setupResult.warnings);
    console.error('Active agent count:', registry.getActiveAgents().length);

    analyzer = new AIConsensusAnalyzer({
      registry,
      fallbackToRuleBased: true,
    });
  });

  it('should trace why AI analysis fails', async () => {
    console.error('\n=== DEBUG: Starting AI Consensus Analysis ===');

    // Check active agents
    const activeAgents = registry.getActiveAgents();
    console.error('Active agents available:', activeAgents.map(a => ({
      id: a.getInfo().id,
      provider: a.getInfo().provider,
      model: a.getInfo().model,
    })));

    // Check provider factories
    const providers = ['anthropic', 'openai', 'google', 'perplexity'] as const;
    for (const provider of providers) {
      const factory = registry.getProviderFactory(provider);
      console.error(`Factory for ${provider}:`, factory ? 'EXISTS' : 'MISSING');
    }

    // Run analysis
    console.error('\n=== DEBUG: Calling analyzeConsensus ===');
    const result = await analyzer.analyzeConsensus(sampleResponses, '2+2=4?');

    console.error('\n=== DEBUG: Analysis Result ===');
    console.error('Agreement Level:', result.agreementLevel);
    console.error('Reasoning:', result.reasoning);
    console.error('Summary:', result.summary);
    console.error('AnalyzerId:', result.analyzerId);

    // Check if it used AI or fallback
    const usedFallback = result.reasoning?.includes('Fallback');
    console.error('Used Fallback:', usedFallback);

    if (usedFallback) {
      console.error('\n!!! FALLBACK WAS USED - AI ANALYSIS FAILED !!!');
      // This tells us the problem persists
    } else {
      console.error('\n✓ AI Analysis succeeded');
    }

    // The test always passes - we're just gathering debug info
    expect(result).toBeDefined();
  });
});
