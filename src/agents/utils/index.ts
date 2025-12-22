/**
 * Agent Utilities - Shared utilities for AI agents
 */

export { convertSDKError, isRetryableError } from './error-converter.js';
export { buildOpenAITools, buildResponsesFunctionTools } from './tool-converters.js';
export {
  createLightModelAgent,
  type LightModelAgentOptions,
} from './light-model-factory.js';
// OpenAI Responses API utilities moved to ../openai/
// Re-export for backward compatibility
export {
  executeResponsesCompletion,
  executeSimpleResponsesCompletion,
  buildResponsesTools,
  extractCitationsFromResponseOutput,
  extractTextFromResponse,
  recordWebSearchToolCall,
} from '../openai/responses.js';
export type {
  ResponsesCompletionParams,
  ResponsesCompletionResult,
  ResponsesWebSearchConfig,
  SimpleResponsesCompletionParams,
} from '../openai/types.js';
