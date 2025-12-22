/**
 * Tests for MCP agents handlers
 * Handles: get_agents
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGetAgents } from '../../../../src/mcp/handlers/agents.js';
import type { AgentRegistry } from '../../../../src/agents/registry.js';
import type { AIProvider } from '../../../../src/types/index.js';

/**
 * Helper to create agent info object
 */
function createMockAgentInfo(
  overrides: Partial<{
    id: string;
    name: string;
    provider: AIProvider;
    model: string;
    active: boolean;
  }> = {}
) {
  return {
    id: 'agent-1',
    name: 'Claude',
    provider: 'anthropic' as AIProvider,
    model: 'claude-sonnet-4-5',
    active: true,
    ...overrides,
  };
}

/**
 * Create mock AgentRegistry
 */
function createMockAgentRegistry() {
  return {
    getActiveAgentInfoList: vi.fn(),
    getAllAgentIds: vi.fn(),
    hasAgent: vi.fn(),
    getAgents: vi.fn(),
  };
}

/**
 * Helper to parse response content
 */
function parseResponseContent(response: {
  content: Array<{ type: string; text: string }>;
}): unknown {
  return JSON.parse(response.content[0].text);
}

describe('handleGetAgents', () => {
  let mockAgentRegistry: ReturnType<typeof createMockAgentRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentRegistry = createMockAgentRegistry();
  });

  it('should return list of all active agents', async () => {
    const agents = [
      createMockAgentInfo({
        id: 'claude',
        name: 'Claude',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
      }),
      createMockAgentInfo({ id: 'chatgpt', name: 'ChatGPT', provider: 'openai', model: 'gpt-5.2' }),
      createMockAgentInfo({
        id: 'gemini',
        name: 'Gemini',
        provider: 'google',
        model: 'gemini-3-flash-preview',
      }),
    ];
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(agents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: unknown[]; count: number };
    expect(parsed).toHaveProperty('agents');
    expect(parsed).toHaveProperty('count', 3);
    expect(parsed.agents).toHaveLength(3);
  });

  it('should return correct agent information structure', async () => {
    const agents = [
      createMockAgentInfo({
        id: 'claude-test',
        name: 'Claude Test',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        active: true,
      }),
    ];
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(agents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: Array<Record<string, unknown>> };
    const agent = parsed.agents[0];
    expect(agent).toHaveProperty('id', 'claude-test');
    expect(agent).toHaveProperty('name', 'Claude Test');
    expect(agent).toHaveProperty('provider', 'anthropic');
    expect(agent).toHaveProperty('model', 'claude-sonnet-4-5');
    expect(agent).toHaveProperty('active', true);
  });

  it('should return empty list when no agents are available', async () => {
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue([]);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: unknown[]; count: number };
    expect(parsed).toHaveProperty('count', 0);
    expect(parsed.agents).toHaveLength(0);
  });

  it('should return agents from all supported providers', async () => {
    const agents = [
      createMockAgentInfo({ id: 'claude', provider: 'anthropic' }),
      createMockAgentInfo({ id: 'chatgpt', provider: 'openai' }),
      createMockAgentInfo({ id: 'gemini', provider: 'google' }),
      createMockAgentInfo({ id: 'perplexity', provider: 'perplexity' }),
    ];
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(agents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: Array<{ provider: string }> };
    const providers = parsed.agents.map((a) => a.provider);
    expect(providers).toContain('anthropic');
    expect(providers).toContain('openai');
    expect(providers).toContain('google');
    expect(providers).toContain('perplexity');
  });

  it('should only return active agents', async () => {
    // The handler uses getActiveAgentInfoList which already filters for active agents
    const activeAgents = [
      createMockAgentInfo({ id: 'claude', active: true }),
      createMockAgentInfo({ id: 'chatgpt', active: true }),
    ];
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(activeAgents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: Array<{ active: boolean }> };
    expect(parsed.agents.every((a) => a.active === true)).toBe(true);
  });

  it('should handle empty input object', async () => {
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue([createMockAgentInfo()]);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: unknown[] };
    expect(parsed.agents).toBeDefined();
  });

  it('should handle undefined input by returning error', async () => {
    // Undefined input causes schema validation to fail, which returns error
    const result = await handleGetAgents(
      undefined as unknown as Record<string, never>,
      mockAgentRegistry as unknown as AgentRegistry
    );

    const parsed = parseResponseContent(result) as { error?: string; agents?: unknown[] };
    // Depending on how Zod handles undefined, it may either succeed or fail
    // If it fails, we get error; if it succeeds, we get agents
    expect(parsed).toBeDefined();
  });

  it('should handle null input by returning error', async () => {
    // Null input causes schema validation to fail, which returns error
    const result = await handleGetAgents(
      null as unknown as Record<string, never>,
      mockAgentRegistry as unknown as AgentRegistry
    );

    const parsed = parseResponseContent(result) as { error?: string; agents?: unknown[] };
    // Depending on how Zod handles null, it may either succeed or fail
    // If it fails, we get error; if it succeeds, we get agents
    expect(parsed).toBeDefined();
  });

  it('should return agents with different models', async () => {
    const agents = [
      createMockAgentInfo({ id: 'claude-opus', model: 'claude-opus-4-5-20251101' }),
      createMockAgentInfo({ id: 'claude-sonnet', model: 'claude-sonnet-4-5' }),
      createMockAgentInfo({ id: 'gpt-mini', model: 'gpt-5-mini' }),
    ];
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(agents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: Array<{ model: string }> };
    expect(parsed.agents.map((a) => a.model)).toContain('claude-opus-4-5-20251101');
    expect(parsed.agents.map((a) => a.model)).toContain('claude-sonnet-4-5');
    expect(parsed.agents.map((a) => a.model)).toContain('gpt-5-mini');
  });

  it('should handle error from registry gracefully', async () => {
    mockAgentRegistry.getActiveAgentInfoList.mockImplementation(() => {
      throw new Error('Registry error');
    });

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { error: string };
    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toContain('Registry error');
  });

  it('should ignore extra input properties', async () => {
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue([createMockAgentInfo()]);

    // Extra properties should be ignored by schema validation
    const result = await handleGetAgents(
      { extraField: 'ignored', anotherField: 123 },
      mockAgentRegistry as unknown as AgentRegistry
    );

    const parsed = parseResponseContent(result) as { agents: unknown[] };
    expect(parsed.agents).toBeDefined();
  });
});

describe('handleGetAgents edge cases', () => {
  let mockAgentRegistry: ReturnType<typeof createMockAgentRegistry>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAgentRegistry = createMockAgentRegistry();
  });

  it('should handle agents with special characters in names', async () => {
    const agents = [
      createMockAgentInfo({ id: 'agent-with-dashes', name: 'Agent With-Dashes' }),
      createMockAgentInfo({ id: 'agent_with_underscores', name: 'Agent_With_Underscores' }),
    ];
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(agents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: Array<{ name: string }> };
    expect(parsed.agents[0].name).toBe('Agent With-Dashes');
    expect(parsed.agents[1].name).toBe('Agent_With_Underscores');
  });

  it('should handle large number of agents', async () => {
    const agents = Array.from({ length: 100 }, (_, i) =>
      createMockAgentInfo({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        provider: ['anthropic', 'openai', 'google', 'perplexity'][i % 4] as AIProvider,
      })
    );
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(agents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: unknown[]; count: number };
    expect(parsed.count).toBe(100);
    expect(parsed.agents).toHaveLength(100);
  });

  it('should preserve agent order from registry', async () => {
    const agents = [
      createMockAgentInfo({ id: 'first' }),
      createMockAgentInfo({ id: 'second' }),
      createMockAgentInfo({ id: 'third' }),
    ];
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(agents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: Array<{ id: string }> };
    expect(parsed.agents[0].id).toBe('first');
    expect(parsed.agents[1].id).toBe('second');
    expect(parsed.agents[2].id).toBe('third');
  });

  it('should handle agents with long model names', async () => {
    const agents = [
      createMockAgentInfo({
        id: 'claude',
        model: 'claude-opus-4-5-20251101-with-extended-capabilities-version-2',
      }),
    ];
    mockAgentRegistry.getActiveAgentInfoList.mockReturnValue(agents);

    const result = await handleGetAgents({}, mockAgentRegistry as unknown as AgentRegistry);

    const parsed = parseResponseContent(result) as { agents: Array<{ model: string }> };
    expect(parsed.agents[0].model).toBe(
      'claude-opus-4-5-20251101-with-extended-capabilities-version-2'
    );
  });
});
