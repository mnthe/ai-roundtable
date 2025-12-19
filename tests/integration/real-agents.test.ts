/**
 * Real Agent Integration Tests
 *
 * Tests AI agents with actual API calls.
 * These tests are skipped if the corresponding API keys are not configured.
 *
 * Run with: pnpm test:integration
 */

import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { getTestConfig, isProviderAvailable, getAvailableProviders } from './setup.js';
import { AgentRegistry } from '../../src/agents/registry.js';
import { ClaudeAgent } from '../../src/agents/claude.js';
import { ChatGPTAgent } from '../../src/agents/chatgpt.js';
import { GeminiAgent } from '../../src/agents/gemini.js';
import { PerplexityAgent } from '../../src/agents/perplexity.js';
import { SessionManager } from '../../src/core/session-manager.js';
import { DebateEngine } from '../../src/core/debate-engine.js';
import { ConsensusAnalyzer } from '../../src/core/consensus-analyzer.js';
import { getGlobalModeRegistry, resetGlobalModeRegistry } from '../../src/modes/registry.js';
import { DefaultAgentToolkit } from '../../src/tools/toolkit.js';
import type { DebateContext, AgentResponse } from '../../src/types/index.js';

describe('Real Agent Integration Tests', () => {
  let agentRegistry: AgentRegistry;
  let sessionManager: SessionManager;
  const config = getTestConfig();

  beforeEach(() => {
    agentRegistry = new AgentRegistry();
    sessionManager = new SessionManager();
    resetGlobalModeRegistry();
  });

  describe('Individual Agent Tests', () => {
    describe.skipIf(!isProviderAvailable('anthropic'))('Claude Agent', () => {
      beforeAll(() => {
        if (!config.anthropicApiKey) {
          console.log('Skipping Claude tests: ANTHROPIC_API_KEY not set');
        }
      });

      it('should generate a response from Claude', async () => {
        const agent = new ClaudeAgent({
          id: 'claude-test',
          name: 'Claude Test',
          model: 'claude-sonnet-4-5',
          apiKey: config.anthropicApiKey!,
        });

        const context: DebateContext = {
          sessionId: 'test-session',
          topic: 'Should TypeScript be preferred over JavaScript for large projects?',
          mode: 'collaborative',
          currentRound: 1,
          totalRounds: 1,
          previousResponses: [],
        };

        const response = await agent.generateResponse(context);

        expect(response.agentId).toBe('claude-test');
        expect(response.agentName).toBe('Claude Test');
        expect(response.position).toBeTruthy();
        expect(response.reasoning).toBeTruthy();
        expect(response.confidence).toBeGreaterThanOrEqual(0);
        expect(response.confidence).toBeLessThanOrEqual(1);
        expect(response.timestamp).toBeInstanceOf(Date);
      }, 60000);
    });

    describe.skipIf(!isProviderAvailable('openai'))('ChatGPT Agent', () => {
      beforeAll(() => {
        if (!config.openaiApiKey) {
          console.log('Skipping ChatGPT tests: OPENAI_API_KEY not set');
        }
      });

      it('should generate a response from ChatGPT', async () => {
        const agent = new ChatGPTAgent({
          id: 'chatgpt-test',
          name: 'ChatGPT Test',
          model: 'gpt-5.2',
          apiKey: config.openaiApiKey!,
        });

        const context: DebateContext = {
          sessionId: 'test-session',
          topic: 'Is remote work better than office work for software developers?',
          mode: 'collaborative',
          currentRound: 1,
          totalRounds: 1,
          previousResponses: [],
        };

        const response = await agent.generateResponse(context);

        expect(response.agentId).toBe('chatgpt-test');
        expect(response.agentName).toBe('ChatGPT Test');
        expect(response.position).toBeTruthy();
        expect(response.reasoning).toBeTruthy();
        expect(response.confidence).toBeGreaterThanOrEqual(0);
        expect(response.confidence).toBeLessThanOrEqual(1);
      }, 60000);
    });

    describe.skipIf(!isProviderAvailable('google'))('Gemini Agent', () => {
      beforeAll(() => {
        if (!config.googleApiKey) {
          console.log('Skipping Gemini tests: GOOGLE_API_KEY not set');
        }
      });

      it('should generate a response from Gemini', async () => {
        const agent = new GeminiAgent({
          id: 'gemini-test',
          name: 'Gemini Test',
          model: 'gemini-2.5-flash',
          apiKey: config.googleApiKey!,
        });

        const context: DebateContext = {
          sessionId: 'test-session',
          topic: 'Should AI be regulated by governments?',
          mode: 'collaborative',
          currentRound: 1,
          totalRounds: 1,
          previousResponses: [],
        };

        const response = await agent.generateResponse(context);

        expect(response.agentId).toBe('gemini-test');
        expect(response.agentName).toBe('Gemini Test');
        expect(response.position).toBeTruthy();
        expect(response.reasoning).toBeTruthy();
      }, 60000);
    });

    describe.skipIf(!isProviderAvailable('perplexity'))('Perplexity Agent', () => {
      beforeAll(() => {
        if (!config.perplexityApiKey) {
          console.log('Skipping Perplexity tests: PERPLEXITY_API_KEY not set');
        }
      });

      it('should generate a response from Perplexity', async () => {
        const agent = new PerplexityAgent({
          id: 'perplexity-test',
          name: 'Perplexity Test',
          model: 'sonar-pro',
          apiKey: config.perplexityApiKey!,
        });

        const context: DebateContext = {
          sessionId: 'test-session',
          topic: 'What are the latest trends in software architecture?',
          mode: 'collaborative',
          currentRound: 1,
          totalRounds: 1,
          previousResponses: [],
        };

        const response = await agent.generateResponse(context);

        expect(response.agentId).toBe('perplexity-test');
        expect(response.agentName).toBe('Perplexity Test');
        expect(response.position).toBeTruthy();
        expect(response.reasoning).toBeTruthy();
      }, 60000);
    });
  });

  describe.skipIf(getAvailableProviders().length < 2)('Multi-Agent Debate Tests', () => {
    it('should conduct a debate between available agents', async () => {
      const availableProviders = getAvailableProviders();
      console.log(`Running multi-agent test with providers: ${availableProviders.join(', ')}`);

      // Register available agents
      if (isProviderAvailable('anthropic')) {
        const claude = new ClaudeAgent({
          id: 'claude-debate',
          name: 'Claude',
          model: 'claude-sonnet-4-5',
          apiKey: config.anthropicApiKey!,
        });
        agentRegistry.register(claude);
      }

      if (isProviderAvailable('openai')) {
        const chatgpt = new ChatGPTAgent({
          id: 'chatgpt-debate',
          name: 'ChatGPT',
          model: 'gpt-5.2',
          apiKey: config.openaiApiKey!,
        });
        agentRegistry.register(chatgpt);
      }

      // Create debate context
      const context: DebateContext = {
        sessionId: 'multi-agent-test',
        topic: 'What programming paradigm is best for building maintainable software?',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 1,
        previousResponses: [],
      };

      // Get registered agents and generate responses
      const agentIds = agentRegistry.getAgentInfoList().map((a) => a.id);
      const agents = agentRegistry.getAgents(agentIds);

      const responses: AgentResponse[] = [];
      for (const agent of agents) {
        const response = await agent.generateResponse(context);
        responses.push(response);
      }

      // Verify responses
      expect(responses.length).toBeGreaterThanOrEqual(2);
      for (const response of responses) {
        expect(response.position).toBeTruthy();
        expect(response.reasoning).toBeTruthy();
        expect(response.confidence).toBeGreaterThanOrEqual(0);
        expect(response.confidence).toBeLessThanOrEqual(1);
      }

      // Analyze consensus
      const consensusAnalyzer = new ConsensusAnalyzer();
      const consensus = consensusAnalyzer.analyzeConsensus(responses);

      expect(consensus.agreementLevel).toBeDefined();
      expect(consensus.keyPoints).toBeDefined();
    }, 180000); // 3 minutes for multi-agent test
  });

  describe.skipIf(getAvailableProviders().length === 0)('Agent with Tools Tests', () => {
    it('should use toolkit when available', async () => {
      const availableProviders = getAvailableProviders();
      const provider = availableProviders[0];

      let agent;
      switch (provider) {
        case 'anthropic':
          agent = new ClaudeAgent({
            id: 'claude-tools',
            name: 'Claude with Tools',
            model: 'claude-sonnet-4-5',
            apiKey: config.anthropicApiKey!,
          });
          break;
        case 'openai':
          agent = new ChatGPTAgent({
            id: 'chatgpt-tools',
            name: 'ChatGPT with Tools',
            model: 'gpt-5.2',
            apiKey: config.openaiApiKey!,
          });
          break;
        case 'google':
          agent = new GeminiAgent({
            id: 'gemini-tools',
            name: 'Gemini with Tools',
            model: 'gemini-2.5-flash',
            apiKey: config.googleApiKey!,
          });
          break;
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }

      // Create toolkit
      const toolkit = new DefaultAgentToolkit();
      agent.setToolkit(toolkit);

      const context: DebateContext = {
        sessionId: 'tools-test',
        topic: 'Should software developers learn multiple programming languages?',
        mode: 'collaborative',
        currentRound: 1,
        totalRounds: 1,
        previousResponses: [],
      };

      const response = await agent.generateResponse(context);

      expect(response.position).toBeTruthy();
      expect(response.reasoning).toBeTruthy();
    }, 90000);
  });
});
