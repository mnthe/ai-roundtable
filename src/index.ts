#!/usr/bin/env node

/**
 * AI Roundtable - MCP Server Entry Point
 *
 * A Multi-AI debate platform that enables structured discussions
 * between different AI models (Claude, ChatGPT, etc.)
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './mcp/server.js';

// Re-export types for external use
export * from './types/index.js';

const SERVER_NAME = 'ai-roundtable';
const SERVER_VERSION = '0.1.0';

async function main() {
  // Create MCP server with all tools registered
  const server = await createServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
