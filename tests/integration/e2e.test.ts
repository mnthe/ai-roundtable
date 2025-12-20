/**
 * E2E Integration Tests
 *
 * Tests the full flow of the AI Roundtable MCP server
 * using mock agents (no API calls required)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { createServer, type ServerOptions } from '../../src/mcp/server.js';
import { AgentRegistry } from '../../src/agents/registry.js';
import { MockAgent } from '../../src/agents/base.js';
import { SessionManager } from '../../src/core/session-manager.js';
import { getGlobalModeRegistry, resetGlobalModeRegistry } from '../../src/modes/registry.js';

describe('AI Roundtable E2E Integration', () => {
  let server: Server;
  let agentRegistry: AgentRegistry;
  let sessionManager: SessionManager;

  beforeEach(() => {
    // Create fresh instances for each test
    agentRegistry = new AgentRegistry();
    sessionManager = new SessionManager();

    // Register mock agents
    agentRegistry.registerProvider('mock', (config) => new MockAgent(config), 'mock-model');
    agentRegistry.createAgent({
      id: 'claude-mock',
      name: 'Claude (Mock)',
      provider: 'mock',
      model: 'mock-model',
    });
    agentRegistry.createAgent({
      id: 'chatgpt-mock',
      name: 'ChatGPT (Mock)',
      provider: 'mock',
      model: 'mock-model',
    });

    // Reset global mode registry to ensure clean state
    resetGlobalModeRegistry();

    // Create server with mocked dependencies
    const options: ServerOptions = {
      name: 'ai-roundtable-test',
      version: '0.0.1-test',
      agentRegistry,
      sessionManager,
    };

    server = createServer(options);
  });

  describe('Server Creation', () => {
    it('should create a valid MCP server', () => {
      expect(server).toBeDefined();
    });
  });

  describe('Full Debate Flow', () => {
    it('should complete a full debate cycle with mock agents', async () => {
      // Step 1: Start a debate
      const startArgs = {
        topic: 'Is TypeScript better than JavaScript?',
        mode: 'collaborative',
        agents: ['claude-mock', 'chatgpt-mock'],
        rounds: 2,
      };

      const config = {
        topic: startArgs.topic,
        mode: startArgs.mode,
        agents: startArgs.agents,
        rounds: startArgs.rounds,
      };

      // Create session (async)
      const session = await sessionManager.createSession(config);
      expect(session.id).toBeDefined();
      expect(session.topic).toBe('Is TypeScript better than JavaScript?');
      expect(session.status).toBe('active');

      // Get agents and verify they exist
      const agents = agentRegistry.getAgents(['claude-mock', 'chatgpt-mock']);
      expect(agents).toHaveLength(2);

      // Step 2: Execute first round
      const firstRoundContext = {
        sessionId: session.id,
        topic: session.topic,
        mode: session.mode,
        currentRound: 1,
        totalRounds: session.totalRounds,
        previousResponses: [],
      };

      // Collect responses from each agent
      const responses = [];
      for (const agent of agents) {
        const response = await agent.generateResponse(firstRoundContext);
        responses.push(response);
        await sessionManager.addResponse(session.id, response, 1);
      }

      expect(responses).toHaveLength(2);
      expect(responses[0]!.position).toBeDefined();
      expect(responses[0]!.reasoning).toBeDefined();
      expect(responses[0]!.confidence).toBeGreaterThanOrEqual(0);
      expect(responses[0]!.confidence).toBeLessThanOrEqual(1);

      // Update session round (async)
      await sessionManager.updateSessionRound(session.id, 1);

      // Step 3: Execute second round
      const secondRoundContext = {
        ...firstRoundContext,
        currentRound: 2,
        previousResponses: responses,
      };

      const round2Responses = [];
      for (const agent of agents) {
        const response = await agent.generateResponse(secondRoundContext);
        round2Responses.push(response);
        await sessionManager.addResponse(session.id, response, 2);
      }

      expect(round2Responses).toHaveLength(2);
      await sessionManager.updateSessionRound(session.id, 2);

      // Step 4: Get final session state (async)
      const finalSession = await sessionManager.getSession(session.id);
      expect(finalSession).toBeDefined();
      expect(finalSession!.responses).toHaveLength(4); // 2 agents * 2 rounds
      expect(finalSession!.currentRound).toBe(2);

      // Step 5: Mark as completed (async)
      await sessionManager.updateSessionStatus(session.id, 'completed');
      const completedSession = await sessionManager.getSession(session.id);
      expect(completedSession!.status).toBe('completed');
    });

    it('should handle multi-round debates correctly', async () => {
      const config = {
        topic: 'Should AI be regulated?',
        mode: 'collaborative',
        agents: ['claude-mock', 'chatgpt-mock'],
        rounds: 3,
      };

      const session = await sessionManager.createSession(config);
      const agents = agentRegistry.getAgents(config.agents);

      // Execute 3 rounds
      for (let round = 1; round <= 3; round++) {
        const context = {
          sessionId: session.id,
          topic: session.topic,
          mode: session.mode,
          currentRound: round,
          totalRounds: 3,
          previousResponses: await sessionManager.getResponses(session.id),
        };

        for (const agent of agents) {
          const response = await agent.generateResponse(context);
          await sessionManager.addResponse(session.id, response, round);
        }
        await sessionManager.updateSessionRound(session.id, round);
      }

      const finalSession = await sessionManager.getSession(session.id);
      expect(finalSession!.responses).toHaveLength(6); // 2 agents * 3 rounds
      expect(finalSession!.currentRound).toBe(3);
    });
  });

  describe('Agent Management', () => {
    it('should list all registered agents', () => {
      const agentList = agentRegistry.getAgentInfoList();

      expect(agentList.length).toBeGreaterThanOrEqual(2);
      expect(agentList.map((a) => a.id)).toContain('claude-mock');
      expect(agentList.map((a) => a.id)).toContain('chatgpt-mock');
    });

    it('should retrieve agents by ID', () => {
      const agents = agentRegistry.getAgents(['claude-mock']);

      expect(agents).toHaveLength(1);
      expect(agents[0]!.name).toBe('Claude (Mock)');
    });

    it('should throw error for unknown agent ID', () => {
      expect(() => {
        agentRegistry.getAgents(['unknown-agent']);
      }).toThrow();
    });
  });

  describe('Session Management', () => {
    it('should list all sessions', async () => {
      // Create multiple sessions (async)
      await sessionManager.createSession({
        topic: 'Topic 1',
        mode: 'collaborative',
        agents: ['claude-mock'],
        rounds: 1,
      });

      await sessionManager.createSession({
        topic: 'Topic 2',
        mode: 'collaborative',
        agents: ['chatgpt-mock'],
        rounds: 2,
      });

      const sessions = await sessionManager.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.topic)).toContain('Topic 1');
      expect(sessions.map((s) => s.topic)).toContain('Topic 2');
    });

    it('should track session status correctly', async () => {
      const session = await sessionManager.createSession({
        topic: 'Test Topic',
        mode: 'collaborative',
        agents: ['claude-mock'],
        rounds: 1,
      });

      expect(session.status).toBe('active');

      await sessionManager.updateSessionStatus(session.id, 'completed');
      const updated = await sessionManager.getSession(session.id);
      expect(updated!.status).toBe('completed');
    });
  });

  describe('Response Collection', () => {
    it('should store and retrieve responses correctly', async () => {
      const session = await sessionManager.createSession({
        topic: 'Test',
        mode: 'collaborative',
        agents: ['claude-mock', 'chatgpt-mock'],
        rounds: 1,
      });

      const agents = agentRegistry.getAgents(['claude-mock', 'chatgpt-mock']);
      const context = {
        sessionId: session.id,
        topic: session.topic,
        mode: session.mode,
        currentRound: 1,
        totalRounds: 1,
        previousResponses: [],
      };

      for (const agent of agents) {
        const response = await agent.generateResponse(context);
        await sessionManager.addResponse(session.id, response, 1);
      }

      const responses = await sessionManager.getResponses(session.id);

      expect(responses).toHaveLength(2);
      expect(responses[0]!.agentId).toBe('claude-mock');
      expect(responses[1]!.agentId).toBe('chatgpt-mock');
    });
  });

  describe('Mode Registry', () => {
    it('should have default modes registered', () => {
      const modeRegistry = getGlobalModeRegistry();
      const modes = modeRegistry.getAvailableModes();

      expect(modes).toContain('collaborative');
    });

    it('should retrieve collaborative mode strategy', () => {
      const modeRegistry = getGlobalModeRegistry();
      const collaborative = modeRegistry.getMode('collaborative');

      expect(collaborative.name).toBe('collaborative');
    });
  });
});
