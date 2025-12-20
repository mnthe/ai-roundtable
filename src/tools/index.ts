/**
 * Tools module - Common tools for AI agents
 */

// Export core types from types.ts
export type { AgentTool, AgentToolkit, ToolExecutor, ToolDefinition } from './types.js';

// Export implementation and provider types from toolkit.ts
export {
  DefaultAgentToolkit,
  createDefaultToolkit,
  type WebSearchProvider,
  type SessionDataProvider,
  type PerplexitySearchProvider,
  type PerplexitySearchInput,
  type PerplexitySearchResult,
} from './toolkit.js';

// Export validation schemas and utilities
export {
  validateToolInput,
  TOOL_INPUT_SCHEMAS,
  GetContextInputSchema,
  SubmitResponseInputSchema,
  SearchWebInputSchema,
  FactCheckInputSchema,
  PerplexitySearchInputSchema,
  type GetContextInput,
  type SubmitResponseInput,
  type SearchWebInput,
  type FactCheckInput,
  type PerplexitySearchInput as PerplexitySearchInputValidated,
} from './schemas.js';
