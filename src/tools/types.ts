/**
 * Tool type definitions for AI agents
 *
 * This module contains the core type definitions for the agent toolkit system.
 * These types are used by both the agents module and the tools module.
 */

import type { ContextRequest, DebateContext } from '../types/index.js';

/**
 * Tool definition that agents can use during debates
 */
export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Toolkit interface that provides common tools to agents
 */
export interface AgentToolkit {
  getTools(): AgentTool[];

  /**
   * Execute a tool by name
   *
   * @param name - Tool name
   * @param input - Tool input
   * @param agentId - ID of the agent making the call (for request_context tracking)
   */
  executeTool(name: string, input: unknown, agentId?: string): Promise<unknown>;

  // Context management
  setContext(context: DebateContext): void;

  /**
   * @deprecated Use agentId parameter in executeTool instead.
   * This method has race conditions in parallel execution.
   */
  setCurrentAgentId(agentId: string): void;

  // Context request management
  getPendingContextRequests(): ContextRequest[];
  clearPendingRequests(): void;
  hasPendingRequests(): boolean;
}

/**
 * Tool executor function type
 */
export type ToolExecutor = (input: unknown) => Promise<unknown>;

/**
 * Tool definition with executor
 */
export interface ToolDefinition {
  tool: AgentTool;
  executor: ToolExecutor;
}
