/**
 * Role-Based Mode Strategy
 *
 * Abstract base class for debate modes that assign roles to agents.
 * Provides common infrastructure for role assignment, context transformation,
 * and response validation.
 *
 * Used by:
 * - DevilsAdvocateMode (PRIMARY, OPPOSITION, EVALUATOR roles)
 * - RedTeamBlueTeamMode (red, blue teams)
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse, Stance } from '../types/index.js';
import {
  buildRoleAnchor,
  buildBehavioralContract,
  buildVerificationLoop,
  PROMPT_SEPARATOR,
  type RoleAnchorConfig,
  type BehavioralContractConfig,
  type VerificationLoopConfig,
  type OutputSection,
} from './utils/index.js';
import { StanceValidator } from './validators/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('RoleBasedModeStrategy');

/**
 * Role configuration for role-based modes
 */
export interface RoleConfig {
  /** Role anchor configuration (Layer 1) */
  roleAnchor: RoleAnchorConfig;
  /** Behavioral contract configuration (Layer 2) */
  behavioralContract: BehavioralContractConfig;
  /** Verification loop configuration (Layer 4) */
  verificationLoop: VerificationLoopConfig;
  /** Output sections for structural enforcement (Layer 3) */
  outputSections?: OutputSection[];
  /** Expected stance for this role (for validation) */
  expectedStance?: Stance;
  /** Display name for logging */
  displayName?: string;
}

/**
 * Round state for role-based modes (concurrency-safe)
 */
export interface RoleBasedRoundState {
  /** Map of agent IDs to their indices for this round */
  agentIndexMap: Map<string, number>;
  /** Total number of agents in this round */
  totalAgents: number;
}

/**
 * Extended context for role-based modes
 */
export interface RoleBasedContext<TRole extends string> extends DebateContext {
  /** Current agent's assigned role */
  _agentRole?: TRole;
  /** Concurrency-safe round state (bound to context, not instance) */
  _roleBasedState?: RoleBasedRoundState;
}

/**
 * Abstract base class for modes with role-based agent assignment
 *
 * Subclasses must implement:
 * - name: Mode identifier
 * - executionMode: 'parallel' or 'sequential'
 * - roleConfigs: Map of role to configuration
 * - getRoleForIndex: Determine role based on agent index
 *
 * Optional overrides:
 * - buildRoleContextAddition: Add round-specific content for a role
 * - buildAgentPrompt: Customize base mode prompt
 */
export abstract class RoleBasedModeStrategy<TRole extends string> extends BaseModeStrategy {
  /**
   * Execution pattern for this mode
   */
  protected abstract readonly executionMode: 'parallel' | 'sequential';

  /**
   * Map of role to configuration
   */
  protected abstract readonly roleConfigs: Record<TRole, RoleConfig>;

  /**
   * Determine role for an agent by index
   *
   * @param index - Agent's index in the round (0-based)
   * @param totalAgents - Total number of agents in the round
   * @returns Role identifier for this agent
   */
  protected abstract getRoleForIndex(index: number, totalAgents: number): TRole;

  /**
   * Build additional context for a specific role (optional)
   *
   * Override this to add round-specific or context-specific additions
   * to the role prompt (e.g., focus question handling, round context).
   *
   * @param context - Current debate context
   * @param role - Agent's assigned role
   * @returns Additional prompt text for this role
   */
  protected buildRoleContextAddition?(context: DebateContext, role: TRole): string;

  /**
   * Execute a role-based round
   *
   * Creates concurrency-safe round state and delegates to appropriate
   * execution method based on executionMode.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Build agent index map for this round (context-bound, not instance-bound)
    const agentIndexMap = new Map<string, number>();
    agents.forEach((agent, index) => {
      agentIndexMap.set(agent.id, index);
    });

    // Create context with round state bound to it (concurrency-safe)
    const contextWithState: RoleBasedContext<TRole> = {
      ...context,
      _roleBasedState: {
        agentIndexMap,
        totalAgents: agents.length,
      },
    };

    // Delegate to appropriate execution method
    return this.executionMode === 'parallel'
      ? this.executeParallel(agents, contextWithState, toolkit)
      : this.executeSequential(agents, contextWithState, toolkit);
  }

  /**
   * Get the role for an agent based on their index.
   * Hook implementation for BaseModeStrategy.
   */
  protected override getAgentRole(
    agent: BaseAgent,
    index: number,
    context: DebateContext
  ): TRole {
    const state = (context as RoleBasedContext<TRole>)._roleBasedState;
    const agentIndex = state?.agentIndexMap.get(agent.id) ?? index;
    const totalAgents = state?.totalAgents ?? 3;
    return this.getRoleForIndex(agentIndex, totalAgents);
  }

  /**
   * Transform context to inject role-specific prompt additions.
   * Hook implementation for BaseModeStrategy.
   */
  protected override transformContext(
    context: DebateContext,
    agent: BaseAgent
  ): RoleBasedContext<TRole> {
    const state = (context as RoleBasedContext<TRole>)._roleBasedState;
    const index = state?.agentIndexMap.get(agent.id) ?? 0;
    const totalAgents = state?.totalAgents ?? 3;
    const role = this.getRoleForIndex(index, totalAgents);

    // Build role-specific prompt addition
    const roleAddition = this.buildRolePromptAddition(context, role);

    return {
      ...context,
      _agentRole: role,
      _roleBasedState: state,
      modePrompt: (context.modePrompt || '') + roleAddition,
    };
  }

  /**
   * Validate response and enforce expected stance.
   * Hook implementation for BaseModeStrategy.
   */
  protected override validateResponse(
    response: AgentResponse,
    context: DebateContext
  ): AgentResponse {
    const state = (context as RoleBasedContext<TRole>)._roleBasedState;
    const agentIndex = state?.agentIndexMap.get(response.agentId) ?? 0;
    const totalAgents = state?.totalAgents ?? 3;
    const role = this.getRoleForIndex(agentIndex, totalAgents);
    const config = this.roleConfigs[role];

    // Validate stance if expected stance is defined
    if (config?.expectedStance) {
      const expectedStance = config.expectedStance;
      const displayName = config.displayName || role;

      // Log stance validation
      if (!response.stance || response.stance !== expectedStance) {
        logger.warn(
          {
            agentId: response.agentId,
            agentName: response.agentName,
            role: displayName,
            expectedStance,
            actualStance: response.stance ?? '(missing)',
          },
          response.stance
            ? 'Agent stance does not match assigned role, enforcing expected stance'
            : 'Agent did not provide stance, enforcing expected stance for role'
        );
      } else {
        logger.debug(
          {
            agentId: response.agentId,
            agentName: response.agentName,
            role: displayName,
            stance: response.stance,
          },
          'Agent stance matches assigned role'
        );
      }

      // Use StanceValidator to enforce stance
      const validator = new StanceValidator(expectedStance);
      return validator.validate(response, context);
    }

    return response;
  }

  /**
   * Build role-specific prompt addition
   */
  private buildRolePromptAddition(context: DebateContext, role: TRole): string {
    const config = this.roleConfigs[role];
    if (!config) {
      logger.warn({ role }, 'No configuration found for role');
      return '';
    }

    const displayName = config.displayName || role;

    let addition = `

## Your Role: ${displayName}

${buildRoleAnchor(config.roleAnchor)}
${buildBehavioralContract(config.behavioralContract, context.mode)}`;

    // Add structural enforcement if output sections are defined
    if (config.outputSections && config.outputSections.length > 0) {
      addition += this.buildRoleStructuralEnforcement(config.outputSections);
    }

    addition += buildVerificationLoop(config.verificationLoop, context.mode);

    // Add role-specific context additions if defined
    if (this.buildRoleContextAddition) {
      addition += this.buildRoleContextAddition(context, role);
    }

    return addition;
  }

  /**
   * Build structural enforcement for a role
   */
  private buildRoleStructuralEnforcement(sections: OutputSection[]): string {
    let prompt = `
${PROMPT_SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${PROMPT_SEPARATOR}

REQUIRED OUTPUT STRUCTURE:

`;

    for (const section of sections) {
      prompt += `${section.header}
(${section.description})

`;
    }

    return prompt;
  }
}
