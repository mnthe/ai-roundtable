/**
 * Agent Utilities - Shared utilities for AI agents
 */

export { convertSDKError, isRetryableError } from './error-converter.js';
export { buildOpenAITools, buildResponsesFunctionTools } from './tool-converters.js';
export {
  createLightModelAgent,
  type LightModelAgentOptions,
} from './light-model-factory.js';
export {
  executeResponsesCompletion,
  executeSimpleResponsesCompletion,
  buildResponsesTools,
  extractCitationsFromResponseOutput,
  extractTextFromResponse,
  recordWebSearchToolCall,
  type ResponsesCompletionParams,
  type ResponsesCompletionResult,
  type ResponsesWebSearchConfig,
  type SimpleResponsesCompletionParams,
} from './openai-responses.js';
export {
  PerplexityExtendedResponseSchema,
  parsePerplexityExtensions,
  isCitationString,
  type PerplexityCitationItem,
  type PerplexitySearchResult,
  type PerplexityExtendedResponse,
} from './perplexity-schemas.js';
