/**
 * MCP Handler Modules - Barrel Export
 */

import type { HandlerRegistry } from '../handler-registry.js';
import { registerSessionHandlers } from './session.js';
import { registerQueryHandlers } from './query.js';
import { registerExportHandlers } from './export.js';
import { registerAgentHandlers } from './agents.js';

/**
 * Register all handlers with the registry
 */
export function registerAllHandlers(registry: HandlerRegistry): void {
  registerSessionHandlers(registry);
  registerQueryHandlers(registry);
  registerExportHandlers(registry);
  registerAgentHandlers(registry);
}

// Session handlers
export {
  handleStartRoundtable,
  handleContinueRoundtable,
  handleControlSession,
  handleListSessions,
  registerSessionHandlers,
} from './session.js';

// Query handlers
export {
  handleGetConsensus,
  handleGetRoundDetails,
  handleGetResponseDetail,
  handleGetCitations,
  handleGetThoughts,
  registerQueryHandlers,
} from './query.js';

// Export handlers
export { handleExportSession, handleSynthesizeDebate, registerExportHandlers } from './export.js';

// Agent handlers
export { handleGetAgents, registerAgentHandlers } from './agents.js';
