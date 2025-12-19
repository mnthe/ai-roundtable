/**
 * Debate Engine - Orchestrates multi-round debates between AI agents
 */

import type {
  DebateConfig,
  DebateContext,
  Session,
  AgentResponse,
  RoundResult,
} from '../types/index.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { AgentRegistry } from '../agents/registry.js';
import type { ModeRegistry } from '../modes/registry.js';
import type { ConsensusAnalyzer } from './consensus-analyzer.js';

/**
 * Session Manager interface
 *
 * The DebateEngine uses this interface to interact with session storage.
 * This will be implemented in Step 11 (Session Management).
 */
export interface SessionManager {
  createSession(config: DebateConfig): Promise<Session>;
  getSession(sessionId: string): Promise<Session | null>;
  updateSession(session: Session): Promise<void>;
  addResponses(sessionId: string, responses: AgentResponse[]): Promise<void>;
  incrementRound(sessionId: string): Promise<void>;
}

/**
 * Debate Engine
 *
 * Orchestrates debates by:
 * - Creating and managing debate sessions
 * - Executing rounds with appropriate mode strategies
 * - Collecting and storing agent responses
 * - Analyzing consensus
 */
export class DebateEngine {
  constructor(
    private sessionManager: SessionManager,
    private agentRegistry: AgentRegistry,
    private modeRegistry: ModeRegistry,
    private consensusAnalyzer: ConsensusAnalyzer,
    private toolkit: AgentToolkit
  ) {}

  /**
   * Start a new debate
   *
   * Creates a session and runs the first round
   *
   * @param config - Debate configuration
   * @returns Session with first round results
   */
  async startDebate(config: DebateConfig): Promise<Session> {
    // Validate configuration
    this.validateConfig(config);

    // Create session
    const session = await this.sessionManager.createSession(config);

    // Execute first round
    await this.executeRound(session);

    // Return updated session
    return (await this.sessionManager.getSession(session.id))!;
  }

  /**
   * Continue an existing debate for additional rounds
   *
   * @param sessionId - ID of the session to continue
   * @param options - Optional parameters for continuation
   * @returns Updated session
   */
  async continueDebate(
    sessionId: string,
    options?: { rounds?: number; focusQuestion?: string }
  ): Promise<Session> {
    // Get existing session
    const session = await this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found`);
    }

    // Validate session can continue
    if (session.status === 'completed') {
      throw new Error('Cannot continue a completed debate');
    }
    if (session.status === 'error') {
      throw new Error('Cannot continue a debate in error state');
    }

    // Determine how many rounds to run
    const roundsToRun = options?.rounds ?? 1;

    // Execute rounds
    for (let i = 0; i < roundsToRun; i++) {
      // Check if we've reached total rounds
      if (session.currentRound >= session.totalRounds) {
        session.status = 'completed';
        await this.sessionManager.updateSession(session);
        break;
      }

      // Update focus question if provided
      if (options?.focusQuestion) {
        // Focus question will be included in context during executeRound
      }

      await this.executeRound(session, options?.focusQuestion);

      // Reload session to get updated state
      const updatedSession = await this.sessionManager.getSession(sessionId);
      if (!updatedSession) {
        throw new Error('Session lost during continuation');
      }
      Object.assign(session, updatedSession);
    }

    return session;
  }

  /**
   * Execute a single debate round
   *
   * @param session - Current session
   * @param focusQuestion - Optional focus question for this round
   */
  async executeRound(session: Session, focusQuestion?: string): Promise<void> {
    try {
      // Get agents
      const agents = this.agentRegistry.getAgents(session.agentIds);

      // Get mode strategy
      const mode = this.modeRegistry.getMode(session.mode);

      // Build debate context
      const context: DebateContext = {
        sessionId: session.id,
        topic: session.topic,
        mode: session.mode,
        currentRound: session.currentRound,
        totalRounds: session.totalRounds,
        previousResponses: this.getPreviousRoundResponses(session),
        focusQuestion,
      };

      // Execute round with mode strategy
      const responses = await mode.executeRound(agents, context, this.toolkit);

      // Store responses
      await this.sessionManager.addResponses(session.id, responses);

      // Analyze consensus
      const consensus = this.consensusAnalyzer.analyzeConsensus(responses);

      // Update session with consensus
      session.consensus = consensus;
      session.responses.push(...responses);

      // Increment round
      await this.sessionManager.incrementRound(session.id);
      session.currentRound += 1;

      // Check if debate is complete
      if (session.currentRound >= session.totalRounds) {
        session.status = 'completed';
      }

      // Update session
      await this.sessionManager.updateSession(session);
    } catch (error) {
      // Mark session as error
      session.status = 'error';
      await this.sessionManager.updateSession(session);
      throw error;
    }
  }

  /**
   * Get responses from previous rounds only (not current round)
   *
   * @param session - Current session
   * @returns Array of responses from completed rounds
   */
  private getPreviousRoundResponses(session: Session): AgentResponse[] {
    // Group responses by timestamp to identify rounds
    // Since we add all responses from a round at once, responses from the same
    // round will have very close timestamps

    if (session.responses.length === 0) {
      return [];
    }

    // Sort responses by timestamp
    const sorted = [...session.responses].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    // Group by rounds (assuming responses within 1 second are from same round)
    const rounds: AgentResponse[][] = [];
    const firstResponse = sorted[0];
    if (!firstResponse) {
      return [];
    }

    let currentRound: AgentResponse[] = [firstResponse];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = sorted[i - 1];
      if (!current || !previous) continue;

      const timeDiff = current.timestamp.getTime() - previous.timestamp.getTime();
      if (timeDiff < 1000) {
        // Same round
        currentRound.push(current);
      } else {
        // New round
        rounds.push(currentRound);
        currentRound = [current];
      }
    }
    rounds.push(currentRound);

    // Return all responses except the last round (which is the current round)
    // Actually, since we're called BEFORE executing the round, all responses
    // are from previous rounds
    return session.responses;
  }

  /**
   * Validate debate configuration
   *
   * @param config - Configuration to validate
   * @throws Error if configuration is invalid
   */
  private validateConfig(config: DebateConfig): void {
    if (!config.topic || config.topic.trim().length === 0) {
      throw new Error('Debate topic is required');
    }

    if (!config.agents || config.agents.length === 0) {
      throw new Error('At least one agent is required');
    }

    // Validate agents exist
    for (const agentId of config.agents) {
      if (!this.agentRegistry.hasAgent(agentId)) {
        throw new Error(`Agent "${agentId}" not found in registry`);
      }
    }

    // Validate mode exists
    if (!this.modeRegistry.hasMode(config.mode)) {
      throw new Error(
        `Debate mode "${config.mode}" not found. ` +
          `Available: ${this.modeRegistry.getAvailableModes().join(', ')}`
      );
    }

    // Validate rounds
    const rounds = config.rounds ?? 3;
    if (rounds < 1 || rounds > 10) {
      throw new Error('Debate rounds must be between 1 and 10');
    }
  }

  /**
   * Get the current session
   *
   * @param sessionId - Session ID
   * @returns Session or null if not found
   */
  async getSession(sessionId: string): Promise<Session | null> {
    return this.sessionManager.getSession(sessionId);
  }
}
