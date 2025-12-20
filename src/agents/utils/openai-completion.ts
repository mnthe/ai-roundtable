/**
 * OpenAI Completion Utilities
 *
 * Shared utilities for OpenAI SDK-based agents (ChatGPT and Perplexity).
 * These agents both use the OpenAI SDK with similar completion patterns.
 */

import type OpenAI from 'openai';
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions';
import { withRetry } from '../../utils/retry.js';
import { createLogger } from '../../utils/logger.js';
import type { ToolCallRecord, Citation } from '../../types/index.js';

const logger = createLogger('OpenAICompletion');

/**
 * Tool executor function type
 */
export type ToolExecutor = (name: string, input: unknown) => Promise<unknown>;

/**
 * Citation extractor function type
 */
export type CitationExtractor = (toolName: string, result: unknown) => Citation[];

/**
 * Parameters for OpenAI completion calls
 */
export interface OpenAICompletionParams {
  /** OpenAI client instance */
  client: OpenAI;
  /** Model to use */
  model: string;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Temperature for sampling */
  temperature: number;
  /** System prompt */
  systemPrompt: string;
  /** User message */
  userMessage: string;
  /** Optional tools for function calling */
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  /** Optional extra parameters (e.g., Perplexity search options) */
  extraParams?: Record<string, unknown>;
  /** Tool executor function */
  executeTool?: ToolExecutor;
  /** Citation extractor function */
  extractCitations?: CitationExtractor;
}

/**
 * Result from OpenAI completion with tool calls
 */
export interface OpenAICompletionResult {
  /** Raw text response */
  rawText: string;
  /** Tool calls made during the completion */
  toolCalls: ToolCallRecord[];
  /** Citations extracted from tool results */
  citations: Citation[];
}

/**
 * Execute an OpenAI-compatible completion with tool call handling
 *
 * This utility handles the common pattern of:
 * 1. Making initial API call
 * 2. Processing tool calls in a loop
 * 3. Returning final text response with collected tool calls and citations
 *
 * Used by both ChatGPTAgent and PerplexityAgent since they share the same SDK.
 *
 * @param params - Completion parameters
 * @returns Completion result with text, tool calls, and citations
 */
export async function executeOpenAICompletion(
  params: OpenAICompletionParams
): Promise<OpenAICompletionResult> {
  const {
    client,
    model,
    maxTokens,
    temperature,
    systemPrompt,
    userMessage,
    tools,
    extraParams = {},
    executeTool,
    extractCitations,
  } = params;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  const toolCalls: ToolCallRecord[] = [];
  const citations: Citation[] = [];

  // Make the API call with retry logic
  // Type assertion: We're not using streaming, so we always get ChatCompletion
  let response = (await withRetry(
    () =>
      client.chat.completions.create({
        model,
        max_completion_tokens: maxTokens,
        messages,
        tools,
        temperature,
        ...extraParams,
      } as Parameters<typeof client.chat.completions.create>[0]),
    { maxRetries: 3 }
  )) as ChatCompletion;

  let choice = response.choices[0];

  // Handle tool call loop
  while (choice?.finish_reason === 'tool_calls' && choice.message.tool_calls && executeTool) {
    const assistantMessage = choice.message;
    const currentToolCalls = choice.message.tool_calls;
    messages.push(assistantMessage);

    for (const toolCall of currentToolCalls ?? []) {
      // Skip non-function tool calls (e.g., custom tool calls in v6+)
      if (toolCall.type !== 'function') continue;

      const functionName = toolCall.function.name;
      const functionArgs = JSON.parse(toolCall.function.arguments);

      const result = await executeTool(functionName, functionArgs);

      toolCalls.push({
        toolName: functionName,
        input: functionArgs,
        output: result,
        timestamp: new Date(),
      });

      // Extract citations from search results
      if (extractCitations) {
        const extractedCitations = extractCitations(functionName, result);
        citations.push(...extractedCitations);
      }

      const toolResultMessage: ChatCompletionToolMessageParam = {
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      };
      messages.push(toolResultMessage);
    }

    // Continue the conversation with tool results
    response = (await withRetry(
      () =>
        client.chat.completions.create({
          model,
          max_completion_tokens: maxTokens,
          messages,
          tools,
          temperature,
          ...extraParams,
        } as Parameters<typeof client.chat.completions.create>[0]),
      { maxRetries: 3 }
    )) as ChatCompletion;

    choice = response.choices[0];
  }

  // Extract text from final response
  const rawText = choice?.message?.content ?? '';

  return { rawText, toolCalls, citations };
}

/**
 * Parameters for simple OpenAI completion (no tools)
 */
export interface SimpleOpenAICompletionParams {
  /** OpenAI client instance */
  client: OpenAI;
  /** Model to use */
  model: string;
  /** Maximum tokens for response */
  maxTokens: number;
  /** Temperature for sampling */
  temperature: number;
  /** System prompt */
  systemPrompt: string;
  /** User message/prompt */
  userMessage: string;
  /** Agent ID for logging */
  agentId: string;
  /** Error converter function */
  convertError: (error: unknown) => Error;
  /** Log level for debug message */
  debugMessage?: string;
}

/**
 * Execute a simple OpenAI-compatible completion without tool handling
 *
 * This utility handles the common pattern for generateRawCompletion
 * and generateSynthesisInternal where no tool calls are involved.
 *
 * @param params - Completion parameters
 * @returns Raw text response
 */
export async function executeSimpleOpenAICompletion(
  params: SimpleOpenAICompletionParams
): Promise<string> {
  const { client, model, maxTokens, temperature, systemPrompt, userMessage, agentId, convertError } =
    params;

  logger.debug({ agentId }, params.debugMessage ?? 'Executing simple completion');

  try {
    const response = await withRetry(
      () =>
        client.chat.completions.create({
          model,
          max_completion_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature,
        }),
      { maxRetries: 3 }
    );

    return response.choices[0]?.message?.content ?? '';
  } catch (error) {
    const convertedError = convertError(error);
    logger.error({ err: convertedError, agentId }, 'Failed to execute simple completion');
    throw convertedError;
  }
}
