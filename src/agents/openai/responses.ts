/**
 * OpenAI Responses API Utilities
 *
 * Utilities for the OpenAI Responses API which provides native web search
 * capabilities with built-in URL citations.
 *
 * The Responses API is the recommended approach for ChatGPT agents that need
 * web search functionality, as it provides:
 * - Native web search tool with automatic citation extraction
 * - Cleaner response format with output_text accessor
 * - Built-in URL citations with position information
 */

import type {
  Response,
  ResponseOutputText,
  WebSearchTool,
  FunctionTool,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import { withRetry } from '../../utils/retry.js';
import { createLogger } from '../../utils/logger.js';
import type { Citation, ToolCallRecord } from '../../types/index.js';
import type {
  ResponsesWebSearchConfig,
  ResponsesCompletionParams,
  ResponsesCompletionResult,
  SimpleResponsesCompletionParams,
} from './types.js';

/** Maximum number of function call iterations to prevent infinite loops */
const MAX_FUNCTION_CALL_ITERATIONS = 10;

const logger = createLogger('OpenAIResponses');

/**
 * Build tools array for Responses API including web search
 *
 * @param functionTools - Optional custom function tools
 * @param webSearchConfig - Web search configuration
 * @returns Array of tools for Responses API
 */
export function buildResponsesTools(
  functionTools?: FunctionTool[],
  webSearchConfig?: ResponsesWebSearchConfig
): Array<WebSearchTool | FunctionTool> {
  const tools: Array<WebSearchTool | FunctionTool> = [];

  // Add web search tool if enabled (default: enabled)
  if (webSearchConfig?.enabled !== false) {
    const webSearchTool: WebSearchTool = {
      type: 'web_search',
      search_context_size: webSearchConfig?.searchContextSize ?? 'medium',
    };
    tools.push(webSearchTool);
  }

  // Add custom function tools
  if (functionTools && functionTools.length > 0) {
    tools.push(...functionTools);
  }

  return tools;
}

/**
 * Extract URL citations from Responses API output
 *
 * Processes ResponseOutputText items to extract url_citation annotations
 * which are automatically added by the web search tool.
 *
 * @param output - Response output items
 * @returns Array of citations
 */
export function extractCitationsFromResponseOutput(output: Response['output']): Citation[] {
  const citations: Citation[] = [];

  for (const item of output) {
    // Only process message items with content
    if (item.type !== 'message' || !('content' in item)) continue;

    for (const content of item.content) {
      // Only process text content with annotations
      if (content.type !== 'output_text') continue;

      const textContent = content as ResponseOutputText;
      if (!textContent.annotations) continue;

      for (const annotation of textContent.annotations) {
        if (annotation.type === 'url_citation') {
          citations.push({
            title: annotation.title ?? 'Untitled',
            url: annotation.url,
            snippet: undefined,
          });
        }
      }
    }
  }

  // Deduplicate citations by URL
  const uniqueCitations = new Map<string, Citation>();
  for (const citation of citations) {
    if (!uniqueCitations.has(citation.url)) {
      uniqueCitations.set(citation.url, citation);
    }
  }

  return Array.from(uniqueCitations.values());
}

/**
 * Extract text from Responses API output
 *
 * Uses the convenient output_text accessor which concatenates all text content.
 *
 * @param response - Responses API response
 * @returns Extracted text content
 */
export function extractTextFromResponse(response: Response): string {
  // The Responses API provides a convenient output_text accessor
  return response.output_text ?? '';
}

/**
 * Record web search tool call from Responses API
 *
 * Inspects the response output to record web search tool usage for
 * consistency with the ToolCallRecord pattern used by other agents.
 *
 * @param output - Response output items
 * @param citations - Citations extracted from the response
 * @returns ToolCallRecord for web search if used
 */
export function recordWebSearchToolCall(
  output: Response['output'],
  citations: Citation[]
): ToolCallRecord | undefined {
  // Check if web search was used by looking for web_search_call items
  const webSearchCall = output.find((item) => item.type === 'web_search_call');

  if (!webSearchCall || citations.length === 0) {
    return undefined;
  }

  return {
    toolName: 'web_search',
    input: { query: 'auto' }, // Responses API handles query internally
    output: {
      success: true,
      data: {
        results: citations.map((c) => ({
          title: c.title,
          url: c.url,
        })),
      },
    },
    timestamp: new Date(),
  };
}

/**
 * Check if response contains function calls that need handling
 */
function hasFunctionCalls(response: Response): boolean {
  return response.output.some((item) => item.type === 'function_call');
}

/**
 * Execute a Responses API completion with web search support
 *
 * This utility handles the Responses API pattern:
 * 1. Building tools array with web search
 * 2. Making API call via responses.create()
 * 3. Handling function call loop (execute functions, send results back)
 * 4. Extracting text and citations from final response
 *
 * @param params - Completion parameters
 * @returns Completion result with text, tool calls, and citations
 */
export async function executeResponsesCompletion(
  params: ResponsesCompletionParams
): Promise<ResponsesCompletionResult> {
  const {
    client,
    model,
    maxTokens,
    temperature,
    instructions,
    input,
    functionTools,
    webSearch,
    executeTool,
    extractToolCitations,
  } = params;

  const toolCalls: ToolCallRecord[] = [];
  const citations: Citation[] = [];

  // Build tools array
  const tools = buildResponsesTools(functionTools, webSearch);

  logger.debug(
    { model, hasWebSearch: webSearch?.enabled !== false },
    'Executing Responses API call'
  );

  // Make the initial API call with retry logic
  let response = await withRetry(
    () =>
      client.responses.create({
        model,
        instructions,
        input,
        max_output_tokens: maxTokens,
        temperature,
        tools: tools.length > 0 ? tools : undefined,
      }),
    { maxRetries: 3 }
  );

  // Function call loop: handle tool calls and continue conversation
  let iterations = 0;
  while (hasFunctionCalls(response) && iterations < MAX_FUNCTION_CALL_ITERATIONS) {
    iterations++;
    logger.debug({ iteration: iterations }, 'Processing function calls');

    // Collect function call outputs
    const functionOutputs: ResponseInputItem[] = [];

    for (const item of response.output) {
      if (item.type !== 'function_call') continue;

      // Execute custom tool
      if (executeTool && 'name' in item && 'arguments' in item && 'call_id' in item) {
        const functionName = item.name;
        const functionArgs = JSON.parse(item.arguments as string);
        const callId = item.call_id as string;

        const result = await executeTool(functionName, functionArgs);

        toolCalls.push({
          toolName: functionName,
          input: functionArgs,
          output: result,
          timestamp: new Date(),
        });

        // Extract citations from custom tool results
        if (extractToolCitations) {
          const extractedCitations = extractToolCitations(functionName, result);
          citations.push(...extractedCitations);
        }

        // Add function output to send back to API
        functionOutputs.push({
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(result),
        } as ResponseInputItem);
      }
    }

    // If we have function outputs, continue the conversation
    if (functionOutputs.length > 0) {
      logger.debug(
        { functionOutputCount: functionOutputs.length },
        'Sending function outputs back to API'
      );

      response = await withRetry(
        () =>
          client.responses.create({
            model,
            instructions,
            input: functionOutputs,
            max_output_tokens: maxTokens,
            temperature,
            tools: tools.length > 0 ? tools : undefined,
            // Include previous response to maintain context
            previous_response_id: response.id,
          }),
        { maxRetries: 3 }
      );
    } else {
      break;
    }
  }

  if (iterations >= MAX_FUNCTION_CALL_ITERATIONS) {
    logger.warn('Max function call iterations reached');
  }

  // Extract text from final response
  const rawText = extractTextFromResponse(response);

  // Debug: Log final response output structure
  logger.debug(
    {
      outputLength: response.output.length,
      outputTypes: response.output.map((item) => item.type),
      outputSample: JSON.stringify(response.output.slice(0, 2), null, 2).slice(0, 1000),
    },
    'Final response output structure'
  );

  // Extract citations from web search annotations
  const webCitations = extractCitationsFromResponseOutput(response.output);
  logger.debug({ citationCount: webCitations.length }, 'Extracted citations from web search');
  citations.push(...webCitations);

  // Record web search tool call if used
  const webSearchToolCall = recordWebSearchToolCall(response.output, webCitations);
  if (webSearchToolCall) {
    toolCalls.push(webSearchToolCall);
  }

  return { rawText, toolCalls, citations };
}

/**
 * Execute a simple Responses API completion without tool handling
 *
 * This utility handles the common pattern for generateRawCompletion
 * and synthesis where no tool calls are involved.
 *
 * @param params - Completion parameters
 * @returns Raw text response
 */
export async function executeSimpleResponsesCompletion(
  params: SimpleResponsesCompletionParams
): Promise<string> {
  const { client, model, maxTokens, temperature, instructions, input, agentId, convertError } =
    params;

  logger.debug({ agentId }, params.debugMessage ?? 'Executing simple Responses API completion');

  try {
    const response = await withRetry(
      () =>
        client.responses.create({
          model,
          instructions,
          input,
          max_output_tokens: maxTokens,
          temperature,
        }),
      { maxRetries: 3 }
    );

    return extractTextFromResponse(response);
  } catch (error) {
    const convertedError = convertError(error);
    logger.error(
      { err: convertedError, agentId },
      'Failed to execute simple Responses API completion'
    );
    throw convertedError;
  }
}
