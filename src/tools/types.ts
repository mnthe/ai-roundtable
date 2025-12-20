/**
 * Tool type definitions for AI agents
 *
 * This module contains the core type definitions for the agent toolkit system.
 * These types are used by both the agents module and the tools module.
 */

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
  executeTool(name: string, input: unknown): Promise<unknown>;
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
