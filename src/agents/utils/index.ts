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
  executeOpenAICompletion,
  executeSimpleOpenAICompletion,
  type OpenAICompletionParams,
  type OpenAICompletionResult,
  type SimpleOpenAICompletionParams,
  type ToolExecutor,
  type CitationExtractor,
} from './openai-completion.js';
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
