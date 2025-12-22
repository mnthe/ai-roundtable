/**
 * Constants for MCP handlers
 */

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  // Existing
  AI_ANALYZER_NOT_AVAILABLE: 'AI consensus analyzer not available. Ensure API keys are configured.',

  // Session errors
  SESSION_NOT_FOUND: (sessionId: string) => `Session "${sessionId}" not found`,
  NO_AGENTS_AVAILABLE: 'No agents available. Please register agents first.',
  NO_ROUND_RESULTS: 'No round results available',
  AGENT_NOT_FOUND: (agentId: string) => `Agent "${agentId}" not found`,
  SESSION_NOT_ACTIVE: (sessionId: string, status: string) =>
    `Session "${sessionId}" is not active (status: ${status})`,
  CANNOT_PAUSE: (status: string) =>
    `Cannot pause session in status "${status}". Only active sessions can be paused.`,
  CANNOT_RESUME: (status: string) =>
    `Cannot resume session in status "${status}". Only paused sessions can be resumed.`,
  SESSION_ALREADY_COMPLETED: 'Session is already completed',
  UNKNOWN_ACTION: (action: string) => `Unknown action: ${action}`,

  // Query errors
  NO_ROUNDS_EXECUTED: 'No rounds have been executed yet',
  ROUND_NOT_EXIST: (round: number, current: number) =>
    `Round ${round} does not exist. Current round is ${current}`,
  ROUND_NOT_EXECUTED: (round: number, current: number) =>
    `Round ${round} has not been executed yet. Current round: ${current}`,
  NO_RESPONSES_FOR_ROUND: (round: number) => `No responses found for round ${round}`,
  AGENT_NOT_PARTICIPATE: (agentId: string, sessionId: string) =>
    `Agent "${agentId}" did not participate in session "${sessionId}"`,
  NO_AGENT_RESPONSES_IN_SESSION: (agentId: string) =>
    `No responses found for agent "${agentId}" in this session`,
  NO_AGENT_RESPONSES_IN_ROUND: (agentId: string, round: number) =>
    `No responses found for agent "${agentId}" in round ${round}`,

  // Export errors
  SESSION_NO_RESPONSES: 'No responses found in this session. Cannot synthesize an empty debate.',
  NO_ACTIVE_AGENTS: 'No active agents available for synthesis',
  SYNTHESIZER_NOT_FOUND: (synthesizerId: string) =>
    `Synthesizer agent "${synthesizerId}" not found`,
} as const;
