/**
 * Tools module - Common tools for AI agents
 */

// Export core types from types.ts
export type { AgentTool, AgentToolkit, ToolExecutor, ToolDefinition } from './types.js';

// Export implementation and provider types from toolkit.ts
export {
  DefaultAgentToolkit,
  createDefaultToolkit,
  type SessionDataProvider,
} from './toolkit.js';

// Export validation schemas and utilities
export {
  validateToolInput,
  TOOL_INPUT_SCHEMAS,
  GetContextInputSchema,
  SubmitResponseInputSchema,
  FactCheckInputSchema,
  type GetContextInput,
  type SubmitResponseInput,
  type FactCheckInput,
} from './schemas.js';

// Export providers
export {
  SessionManagerAdapter,
  createSessionManagerAdapter,
} from './providers/index.js';
