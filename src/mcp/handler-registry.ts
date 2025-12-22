/**
 * Handler Registry for MCP Tools
 *
 * Provides a registry pattern to eliminate the large switch statement
 * in server.ts and enable modular handler registration.
 */

import type { DebateEngine } from '../core/debate-engine.js';
import type { SessionManager } from '../core/session-manager.js';
import type { AgentRegistry } from '../agents/registry.js';
import type { AIConsensusAnalyzer } from '../core/ai-consensus-analyzer.js';
import type { KeyPointsExtractor } from '../core/key-points-extractor.js';
import { createErrorResponse, type ToolResponse } from './tools.js';

/**
 * Context available to all handlers
 */
export interface HandlerContext {
  debateEngine: DebateEngine;
  sessionManager: SessionManager;
  agentRegistry: AgentRegistry;
  aiConsensusAnalyzer: AIConsensusAnalyzer | null;
  keyPointsExtractor: KeyPointsExtractor | null;
}

/**
 * Handler function type
 */
export type ToolHandler = (args: unknown, ctx: HandlerContext) => Promise<ToolResponse>;

/**
 * Registry for tool handlers
 *
 * Allows modular registration of handlers from different handler modules
 * and provides centralized execution with proper context.
 */
export class HandlerRegistry {
  private handlers = new Map<string, ToolHandler>();

  /**
   * Register a handler for a tool
   */
  register(toolName: string, handler: ToolHandler): void {
    this.handlers.set(toolName, handler);
  }

  /**
   * Check if a handler exists for a tool
   */
  has(toolName: string): boolean {
    return this.handlers.has(toolName);
  }

  /**
   * Get all registered tool names
   */
  getRegisteredTools(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Execute a handler for a tool
   */
  async execute(toolName: string, args: unknown, ctx: HandlerContext): Promise<ToolResponse> {
    const handler = this.handlers.get(toolName);
    if (!handler) {
      return createErrorResponse(`Unknown tool: ${toolName}`);
    }
    return handler(args, ctx);
  }
}
