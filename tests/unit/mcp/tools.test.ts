/**
 * Tests for MCP tools
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../../../src/core/session-manager.js';
import { AgentRegistry } from '../../../src/agents/registry.js';
import { DebateEngine } from '../../../src/core/DebateEngine.js';
import { DefaultAgentToolkit } from '../../../src/tools/toolkit.js';
import { MockAgent } from '../../../src/agents/base.js';
import { SQLiteStorage } from '../../../src/storage/sqlite.js';
import type { AgentConfig } from '../../../src/types/index.js';
import {
  tools,
  createSuccessResponse,
  createErrorResponse,
} from '../../../src/mcp/tools.js';
import {
  StartRoundtableInputSchema,
  ContinueRoundtableInputSchema,
  GetConsensusInputSchema,
} from '../../../src/types/schemas.js';

describe('MCP Tools', () => {
  describe('Tool Schema Validation', () => {
    it('should validate start_roundtable input', () => {
      const validInput = {
        topic: 'Should AI be regulated?',
        mode: 'collaborative' as const,
        rounds: 3,
      };

      const result = StartRoundtableInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject start_roundtable without topic', () => {
      const invalidInput = {
        mode: 'collaborative',
      };

      const result = StartRoundtableInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should apply defaults for start_roundtable', () => {
      const input = {
        topic: 'Test topic',
      };

      const result = StartRoundtableInputSchema.parse(input);
      expect(result.mode).toBe('collaborative');
      expect(result.rounds).toBe(3);
    });

    it('should validate continue_roundtable input', () => {
      const validInput = {
        sessionId: 'test-session-id',
        rounds: 2,
      };

      const result = ContinueRoundtableInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject continue_roundtable without sessionId', () => {
      const invalidInput = {
        rounds: 2,
      };

      const result = ContinueRoundtableInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate get_consensus input', () => {
      const validInput = {
        sessionId: 'test-session-id',
      };

      const result = GetConsensusInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject get_consensus without sessionId', () => {
      const invalidInput = {};

      const result = GetConsensusInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });
  });

  describe('Tool Definitions', () => {
    it('should expose all required tools', () => {
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain('start_roundtable');
      expect(toolNames).toContain('continue_roundtable');
      expect(toolNames).toContain('get_consensus');
      expect(toolNames).toContain('get_agents');
      expect(toolNames).toContain('list_sessions');
      expect(tools.length).toBe(5);
    });

    it('should have proper schemas for each tool', () => {
      const startTool = tools.find((t) => t.name === 'start_roundtable');
      expect(startTool).toBeDefined();
      expect(startTool?.inputSchema).toHaveProperty('properties');
      expect(startTool?.inputSchema.properties).toHaveProperty('topic');

      const continueTool = tools.find((t) => t.name === 'continue_roundtable');
      expect(continueTool).toBeDefined();
      expect(continueTool?.inputSchema).toHaveProperty('properties');
      expect(continueTool?.inputSchema.properties).toHaveProperty('sessionId');

      const consensusTool = tools.find((t) => t.name === 'get_consensus');
      expect(consensusTool).toBeDefined();
      expect(consensusTool?.inputSchema).toHaveProperty('properties');
      expect(consensusTool?.inputSchema.properties).toHaveProperty('sessionId');
    });

    it('should have required fields marked correctly', () => {
      const startTool = tools.find((t) => t.name === 'start_roundtable');
      expect(startTool?.inputSchema.required).toContain('topic');

      const continueTool = tools.find((t) => t.name === 'continue_roundtable');
      expect(continueTool?.inputSchema.required).toContain('sessionId');

      const consensusTool = tools.find((t) => t.name === 'get_consensus');
      expect(consensusTool?.inputSchema.required).toContain('sessionId');
    });
  });

  describe('Tool Response Helpers', () => {
    it('should create success response', () => {
      const data = { result: 'test' };
      const response = createSuccessResponse(data);

      expect(response).toHaveProperty('content');
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toEqual(data);
    });

    it('should create error response from string', () => {
      const errorMsg = 'Test error';
      const response = createErrorResponse(errorMsg);

      expect(response).toHaveProperty('content');
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toBe(errorMsg);
    });

    it('should create error response from Error object', () => {
      const error = new Error('Test error');
      const response = createErrorResponse(error);

      expect(response).toHaveProperty('content');
      expect(response.content).toHaveLength(1);

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('error');
      expect(parsed.error).toBe('Test error');
    });
  });

  describe('Integration with SessionManager and AgentRegistry', () => {
    let storage: SQLiteStorage;
    let sessionManager: SessionManager;
    let agentRegistry: AgentRegistry;
    let debateEngine: DebateEngine;

    beforeEach(() => {
      // Create in-memory storage
      storage = new SQLiteStorage({ filename: ':memory:' });
      sessionManager = new SessionManager({ storage });
      agentRegistry = new AgentRegistry();
      const toolkit = new DefaultAgentToolkit();
      debateEngine = new DebateEngine({ toolkit });

      // Register mock agents
      agentRegistry.registerProvider('anthropic', (config) => new MockAgent(config), 'claude-3-opus');
      agentRegistry.registerProvider('openai', (config) => new MockAgent(config), 'gpt-4');

      // Create test agents
      const agent1Config: AgentConfig = {
        id: 'agent-1',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-3-opus',
      };

      const agent2Config: AgentConfig = {
        id: 'agent-2',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4',
      };

      agentRegistry.createAgent(agent1Config);
      agentRegistry.createAgent(agent2Config);
      agentRegistry.setToolkit(toolkit);
    });

    it('should create a session and execute first round', async () => {
      const config = {
        topic: 'Should AI be regulated?',
        mode: 'collaborative' as const,
        agents: ['agent-1', 'agent-2'],
        rounds: 3,
      };

      const session = await sessionManager.createSession(config);
      expect(session).toHaveProperty('id');
      expect(session.topic).toBe('Should AI be regulated?');
      expect(session.mode).toBe('collaborative');
      expect(session.totalRounds).toBe(3);
      expect(session.currentRound).toBe(0);

      // Get agents and execute a round
      const agents = agentRegistry.getAgents(['agent-1', 'agent-2']);
      const results = await debateEngine.executeRounds(agents, session, 1);

      expect(results).toHaveLength(1);
      expect(results[0].responses).toHaveLength(2);
    });

    it('should list agents', () => {
      const agents = agentRegistry.getAgentInfoList();

      expect(agents).toHaveLength(2);
      expect(agents[0]).toHaveProperty('id');
      expect(agents[0]).toHaveProperty('name');
      expect(agents[0]).toHaveProperty('provider');
      expect(agents[0]).toHaveProperty('model');
    });

    it('should list sessions', async () => {
      const config = {
        topic: 'Test topic',
        mode: 'collaborative' as const,
        agents: ['agent-1'],
        rounds: 3,
      };

      await sessionManager.createSession(config);
      const sessions = await sessionManager.listSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].topic).toBe('Test topic');
    });

    it('should get consensus analysis', async () => {
      const config = {
        topic: 'Test topic',
        mode: 'collaborative' as const,
        agents: ['agent-1', 'agent-2'],
        rounds: 3,
      };

      const session = await sessionManager.createSession(config);
      const agents = agentRegistry.getAgents(['agent-1', 'agent-2']);
      const results = await debateEngine.executeRounds(agents, session, 1);

      // Analyze consensus
      const consensus = debateEngine.analyzeConsensus(results[0].responses);

      expect(consensus).toHaveProperty('agreementLevel');
      expect(consensus).toHaveProperty('commonPoints');
      expect(consensus).toHaveProperty('disagreementPoints');
      expect(consensus).toHaveProperty('summary');
      expect(consensus.agreementLevel).toBeGreaterThanOrEqual(0);
      expect(consensus.agreementLevel).toBeLessThanOrEqual(1);
    });

    it('should handle non-existent agent gracefully', () => {
      expect(() => {
        agentRegistry.getAgentOrThrow('non-existent-agent');
      }).toThrow('not found');
    });

    it('should handle non-existent session gracefully', async () => {
      const session = await sessionManager.getSession('non-existent-session');
      expect(session).toBeNull();
    });
  });
});
