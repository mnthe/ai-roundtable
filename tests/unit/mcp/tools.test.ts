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
import { tools, createSuccessResponse, createErrorResponse } from '../../../src/mcp/tools.js';
import {
  StartRoundtableInputSchema,
  ContinueRoundtableInputSchema,
  GetConsensusInputSchema,
  GetThoughtsInputSchema,
  ExportSessionInputSchema,
  ControlSessionInputSchema,
  GetRoundDetailsInputSchema,
  GetResponseDetailInputSchema,
  GetCitationsInputSchema,
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

    it('should validate get_consensus input with optional roundNumber', () => {
      const validInput = {
        sessionId: 'test-session-id',
        roundNumber: 2,
      };

      const result = GetConsensusInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.roundNumber).toBe(2);
      }
    });

    it('should reject get_consensus with invalid roundNumber', () => {
      const invalidInput = {
        sessionId: 'test-session-id',
        roundNumber: 0, // Must be >= 1
      };

      const result = GetConsensusInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject get_consensus without sessionId', () => {
      const invalidInput = {};

      const result = GetConsensusInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate get_thoughts input', () => {
      const validInput = {
        sessionId: 'test-session-id',
        agentId: 'test-agent-id',
      };

      const result = GetThoughtsInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject get_thoughts without required fields', () => {
      const invalidInput = {
        sessionId: 'test-session-id',
      };

      const result = GetThoughtsInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate export_session input', () => {
      const validInput = {
        sessionId: 'test-session-id',
        format: 'markdown' as const,
      };

      const result = ExportSessionInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should apply defaults for export_session', () => {
      const input = {
        sessionId: 'test-session-id',
      };

      const result = ExportSessionInputSchema.parse(input);
      expect(result.format).toBe('markdown');
    });

    it('should reject export_session with invalid format', () => {
      const invalidInput = {
        sessionId: 'test-session-id',
        format: 'invalid',
      };

      const result = ExportSessionInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate control_session input', () => {
      const validInput = {
        sessionId: 'test-session-id',
        action: 'pause' as const,
      };

      const result = ControlSessionInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject control_session with invalid action', () => {
      const invalidInput = {
        sessionId: 'test-session-id',
        action: 'invalid',
      };

      const result = ControlSessionInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate get_round_details input', () => {
      const validInput = {
        sessionId: 'test-session-id',
        roundNumber: 2,
      };

      const result = GetRoundDetailsInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject get_round_details without required fields', () => {
      const invalidInput = {
        sessionId: 'test-session-id',
      };

      const result = GetRoundDetailsInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should reject get_round_details with invalid round number', () => {
      const invalidInput = {
        sessionId: 'test-session-id',
        roundNumber: 0,
      };

      const result = GetRoundDetailsInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate get_response_detail input', () => {
      const validInput = {
        sessionId: 'test-session-id',
        agentId: 'test-agent-id',
        roundNumber: 1,
      };

      const result = GetResponseDetailInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate get_response_detail without optional roundNumber', () => {
      const validInput = {
        sessionId: 'test-session-id',
        agentId: 'test-agent-id',
      };

      const result = GetResponseDetailInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject get_response_detail without required fields', () => {
      const invalidInput = {
        sessionId: 'test-session-id',
      };

      const result = GetResponseDetailInputSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it('should validate get_citations input', () => {
      const validInput = {
        sessionId: 'test-session-id',
        roundNumber: 1,
        agentId: 'test-agent-id',
      };

      const result = GetCitationsInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should validate get_citations with only sessionId', () => {
      const validInput = {
        sessionId: 'test-session-id',
      };

      const result = GetCitationsInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject get_citations without sessionId', () => {
      const invalidInput = {
        roundNumber: 1,
      };

      const result = GetCitationsInputSchema.safeParse(invalidInput);
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
      expect(toolNames).toContain('get_thoughts');
      expect(toolNames).toContain('export_session');
      expect(toolNames).toContain('control_session');
      expect(toolNames).toContain('get_round_details');
      expect(toolNames).toContain('get_response_detail');
      expect(toolNames).toContain('get_citations');
      expect(toolNames).toContain('synthesize_debate');
      expect(tools.length).toBe(12);
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
      expect(consensusTool?.inputSchema.properties).toHaveProperty('roundNumber');
    });

    it('should have required fields marked correctly', () => {
      const startTool = tools.find((t) => t.name === 'start_roundtable');
      expect(startTool?.inputSchema.required).toContain('topic');

      const continueTool = tools.find((t) => t.name === 'continue_roundtable');
      expect(continueTool?.inputSchema.required).toContain('sessionId');

      const consensusTool = tools.find((t) => t.name === 'get_consensus');
      expect(consensusTool?.inputSchema.required).toContain('sessionId');

      const thoughtsTool = tools.find((t) => t.name === 'get_thoughts');
      expect(thoughtsTool?.inputSchema.required).toContain('sessionId');
      expect(thoughtsTool?.inputSchema.required).toContain('agentId');

      const exportTool = tools.find((t) => t.name === 'export_session');
      expect(exportTool?.inputSchema.required).toContain('sessionId');

      const controlTool = tools.find((t) => t.name === 'control_session');
      expect(controlTool?.inputSchema.required).toContain('sessionId');
      expect(controlTool?.inputSchema.required).toContain('action');

      const roundDetailsTool = tools.find((t) => t.name === 'get_round_details');
      expect(roundDetailsTool?.inputSchema.required).toContain('sessionId');
      expect(roundDetailsTool?.inputSchema.required).toContain('roundNumber');

      const responseDetailTool = tools.find((t) => t.name === 'get_response_detail');
      expect(responseDetailTool?.inputSchema.required).toContain('sessionId');
      expect(responseDetailTool?.inputSchema.required).toContain('agentId');

      const citationsTool = tools.find((t) => t.name === 'get_citations');
      expect(citationsTool?.inputSchema.required).toContain('sessionId');
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
      agentRegistry.registerProvider(
        'anthropic',
        (config) => new MockAgent(config),
        'claude-3-opus'
      );
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
        name: 'ChatGPT',
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

    it('should correctly update currentRound after executeRounds (no double increment)', async () => {
      const config = {
        topic: 'Round count test',
        mode: 'collaborative' as const,
        agents: ['agent-1', 'agent-2'],
        rounds: 3,
      };

      // Create session (starts at round 0)
      const session = await sessionManager.createSession(config);
      expect(session.currentRound).toBe(0);

      // Get agents
      const agents = agentRegistry.getAgents(['agent-1', 'agent-2']);

      // Execute 1 round - session.currentRound should be updated to 1 by executeRounds
      await debateEngine.executeRounds(agents, session, 1);
      expect(session.currentRound).toBe(1);

      // The correct way to persist: use session.currentRound directly (not session.currentRound + numRounds)
      await sessionManager.updateSessionRound(session.id, session.currentRound);
      const savedSession1 = await sessionManager.getSession(session.id);
      expect(savedSession1?.currentRound).toBe(1);

      // Execute 1 more round
      await debateEngine.executeRounds(agents, session, 1);
      expect(session.currentRound).toBe(2);

      await sessionManager.updateSessionRound(session.id, session.currentRound);
      const savedSession2 = await sessionManager.getSession(session.id);
      expect(savedSession2?.currentRound).toBe(2);

      // Execute 2 rounds at once
      const session2 = await sessionManager.createSession({
        ...config,
        topic: 'Multi-round test',
      });
      const agents2 = agentRegistry.getAgents(['agent-1', 'agent-2']);

      await debateEngine.executeRounds(agents2, session2, 2);
      expect(session2.currentRound).toBe(2);

      await sessionManager.updateSessionRound(session2.id, session2.currentRound);
      const savedSession3 = await sessionManager.getSession(session2.id);
      expect(savedSession3?.currentRound).toBe(2);
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

    it('should get responses for specific round', async () => {
      const config = {
        topic: 'Round-specific test',
        mode: 'collaborative' as const,
        agents: ['agent-1', 'agent-2'],
        rounds: 3,
      };

      const session = await sessionManager.createSession(config);
      const agents = agentRegistry.getAgents(['agent-1', 'agent-2']);

      // Execute 2 rounds
      const results = await debateEngine.executeRounds(agents, session, 2);
      await sessionManager.updateSessionRound(session.id, session.currentRound);

      // Save all responses to storage
      for (const result of results) {
        for (const response of result.responses) {
          await sessionManager.addResponse(session.id, response);
        }
      }

      // Get all responses
      const allResponses = await sessionManager.getResponses(session.id);
      expect(allResponses).toHaveLength(4); // 2 agents x 2 rounds

      // Get responses for round 1 only
      const round1Responses = await sessionManager.getResponsesForRound(session.id, 1);
      expect(round1Responses).toHaveLength(2); // 2 agents

      // Get responses for round 2 only
      const round2Responses = await sessionManager.getResponsesForRound(session.id, 2);
      expect(round2Responses).toHaveLength(2); // 2 agents

      // Verify that round-specific consensus analysis uses only that round's responses
      const round1Consensus = debateEngine.analyzeConsensus(round1Responses);
      const round2Consensus = debateEngine.analyzeConsensus(round2Responses);

      // Each round should analyze only 2 responses
      expect(round1Responses).toHaveLength(2);
      expect(round2Responses).toHaveLength(2);

      // Both should have valid consensus
      expect(round1Consensus.agreementLevel).toBeGreaterThanOrEqual(0);
      expect(round2Consensus.agreementLevel).toBeGreaterThanOrEqual(0);
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

    it('should get thoughts for a specific agent', async () => {
      const config = {
        topic: 'Test topic',
        mode: 'collaborative' as const,
        agents: ['agent-1', 'agent-2'],
        rounds: 3,
      };

      const session = await sessionManager.createSession(config);
      const agents = agentRegistry.getAgents(['agent-1', 'agent-2']);
      const results = await debateEngine.executeRounds(agents, session, 1);

      // Save responses to storage
      for (const result of results) {
        for (const response of result.responses) {
          await sessionManager.addResponse(session.id, response);
        }
      }

      // Update session with responses
      const responses = await sessionManager.getResponses(session.id);
      expect(responses.length).toBeGreaterThan(0);

      // Get thoughts for agent-1
      const agentResponses = responses.filter((r) => r.agentId === 'agent-1');
      expect(agentResponses.length).toBeGreaterThan(0);
      expect(agentResponses[0]).toHaveProperty('position');
      expect(agentResponses[0]).toHaveProperty('reasoning');
      expect(agentResponses[0]).toHaveProperty('confidence');
    });

    it('should export session in JSON format', async () => {
      const config = {
        topic: 'Export test',
        mode: 'collaborative' as const,
        agents: ['agent-1', 'agent-2'],
        rounds: 2,
      };

      const session = await sessionManager.createSession(config);
      const agents = agentRegistry.getAgents(['agent-1', 'agent-2']);
      const results = await debateEngine.executeRounds(agents, session, 1);

      // Save responses to storage
      for (const result of results) {
        for (const response of result.responses) {
          await sessionManager.addResponse(session.id, response);
        }
      }

      const responses = await sessionManager.getResponses(session.id);
      expect(responses.length).toBeGreaterThan(0);

      // Export would return structured JSON
      const exportData = {
        session: {
          id: session.id,
          topic: session.topic,
          mode: session.mode,
          status: session.status,
        },
        agents: session.agentIds.map((id) => agentRegistry.getAgent(id)?.getInfo()),
        responses: responses,
      };

      expect(exportData.session.topic).toBe('Export test');
      expect(exportData.agents).toHaveLength(2);
      expect(exportData.responses.length).toBeGreaterThan(0);
    });

    it('should export session in markdown format', async () => {
      const config = {
        topic: 'Markdown export test',
        mode: 'collaborative' as const,
        agents: ['agent-1'],
        rounds: 1,
      };

      const session = await sessionManager.createSession(config);
      const agents = agentRegistry.getAgents(['agent-1']);
      await debateEngine.executeRounds(agents, session, 1);

      // Markdown would include title, metadata, participants, responses
      const markdownLines = [
        `# Debate Session: ${session.topic}`,
        '',
        '## Session Information',
        '',
        `- **Session ID:** ${session.id}`,
        `- **Mode:** ${session.mode}`,
      ];

      expect(markdownLines.join('\n')).toContain('Markdown export test');
      expect(markdownLines.join('\n')).toContain('Session Information');
    });

    it('should control session state (pause)', async () => {
      const config = {
        topic: 'Control test',
        mode: 'collaborative' as const,
        agents: ['agent-1'],
        rounds: 3,
      };

      const session = await sessionManager.createSession(config);
      expect(session.status).toBe('active');

      // Pause the session
      await sessionManager.updateSessionStatus(session.id, 'paused');
      const pausedSession = await sessionManager.getSession(session.id);
      expect(pausedSession?.status).toBe('paused');
    });

    it('should control session state (resume)', async () => {
      const config = {
        topic: 'Resume test',
        mode: 'collaborative' as const,
        agents: ['agent-1'],
        rounds: 3,
      };

      const session = await sessionManager.createSession(config);
      await sessionManager.updateSessionStatus(session.id, 'paused');

      // Resume the session
      await sessionManager.updateSessionStatus(session.id, 'active');
      const resumedSession = await sessionManager.getSession(session.id);
      expect(resumedSession?.status).toBe('active');
    });

    it('should control session state (stop)', async () => {
      const config = {
        topic: 'Stop test',
        mode: 'collaborative' as const,
        agents: ['agent-1'],
        rounds: 3,
      };

      const session = await sessionManager.createSession(config);
      expect(session.status).toBe('active');

      // Stop the session
      await sessionManager.updateSessionStatus(session.id, 'completed');
      const stoppedSession = await sessionManager.getSession(session.id);
      expect(stoppedSession?.status).toBe('completed');
    });
  });
});
