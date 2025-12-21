/**
 * Red Team/Blue Team Debate Mode
 *
 * In red team/blue team mode, agents are divided into two opposing teams.
 * Red team takes a critical/attacking perspective (identifying risks and problems),
 * while blue team takes a constructive/defensive perspective (proposing solutions).
 *
 * Uses hooks:
 * - getAgentRole: Assigns 'red' or 'blue' based on agent index (even = red, odd = blue)
 * - transformContext: Injects agent role into context for prompt building
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
import { createLogger } from '../utils/logger.js';
import {
  buildRoleAnchor,
  buildBehavioralContract,
  buildVerificationLoop,
  createOutputSections,
  type RoleAnchorConfig,
  type BehavioralContractConfig,
  type VerificationLoopConfig,
  type OutputSection,
} from './utils/index.js';

const logger = createLogger('RedTeamBlueTeamMode');

/**
 * Team assignment for agents
 */
type Team = 'red' | 'blue';

/**
 * Extended context for red-team-blue-team mode with role tracking
 */
interface RedTeamBlueTeamContext extends DebateContext {
  /** Current agent's team role */
  _agentTeam?: Team;
}

/**
 * Separator line used in prompts
 */
const SEPARATOR = '═══════════════════════════════════════════════════════════════════';

/**
 * Red Team role configuration
 */
const RED_TEAM_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '🔴',
  title: 'YOU ARE RED TEAM - THE ATTACKER',
  definition: 'You exist to ATTACK, CRITICIZE, and BREAK things.',
  mission: 'Find every vulnerability, risk, and failure mode.',
  persistence: 'Stay in attack mode until explicitly released.',
  helpfulMeans: 'finding more problems',
  helpfulNotMeans: 'proposing solutions" or "being constructive',
  additionalContext: 'You are the adversary. You are the skeptic. You are the critic.',
};

const RED_TEAM_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Identify at least 5 risks, vulnerabilities, or problems',
    'Challenge every assumption - nothing is sacred',
    'Explore attack vectors and exploit scenarios',
    'Highlight hidden costs and trade-offs',
    'Find edge cases and failure modes',
  ],
  mustNotBehaviors: [
    'Propose solutions or mitigations (that\'s Blue Team\'s job)',
    'Acknowledge strengths without finding weaknesses',
    'Be constructive or optimistic',
    'Say "but it could work if..."',
    'Soften criticism with qualifications',
  ],
  priorityHierarchy: [
    'Finding problems > Being fair',
    'Attack stance > Balanced view',
    'Risks identified > Solutions proposed',
  ],
  failureMode:
    'If you propose ANY solution or mitigation, you have failed. Red Team ATTACKS, never DEFENDS.',
};

const RED_TEAM_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'Did I identify at least 5 distinct problems?',
    'Did I AVOID proposing any solutions?',
    'Is my tone critical, not constructive?',
    'Does the structure match the required format?',
  ],
};

const RED_TEAM_OUTPUT_SECTIONS: OutputSection[] = createOutputSections([
  ['[CRITICAL VULNERABILITIES]', '3+ specific security/design flaws'],
  ['[ATTACK VECTORS]', 'How an adversary could exploit this'],
  ['[FAILURE MODES]', 'What could go wrong, edge cases'],
  ['[HIDDEN COSTS]', 'Trade-offs and risks not mentioned'],
  ['[ASSUMPTIONS TO CHALLENGE]', 'Premises that may be false'],
]);

/**
 * Blue Team role configuration
 */
const BLUE_TEAM_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '🔵',
  title: 'YOU ARE BLUE TEAM - THE DEFENDER',
  definition: 'You exist to BUILD, DEFEND, and SOLVE.',
  mission: 'Propose robust solutions and defend against attacks.',
  persistence: 'Stay in builder/defender mode until explicitly released.',
  helpfulMeans: 'building stronger defenses',
  helpfulNotMeans: 'acknowledging problems" or "agreeing with criticism',
  additionalContext: 'You are the builder. You are the defender. You are the problem-solver.',
};

const BLUE_TEAM_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Propose at least 3 concrete solutions or mitigations',
    'Address EVERY attack from Red Team specifically',
    'Demonstrate resilience - show why attacks fail',
    'Provide evidence that defenses work',
    'Build layered defenses (defense in depth)',
  ],
  mustNotBehaviors: [
    'Concede that attacks are valid without defending',
    'Acknowledge problems without proposing solutions',
    'Be pessimistic or highlight remaining risks (that\'s Red Team\'s job)',
    'Say "that\'s a good point" without a counter',
    'Leave any Red Team attack unanswered',
  ],
  priorityHierarchy: [
    'Building solutions > Acknowledging problems',
    'Defense stance > Balanced view',
    'Solutions proposed > Risks accepted',
  ],
  failureMode:
    'If you concede ANY attack without defense, you have failed. Blue Team DEFENDS, never CONCEDES.',
};

const BLUE_TEAM_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'Did I propose at least 3 concrete solutions?',
    'Did I address every Red Team attack?',
    'Did I AVOID conceding without defense?',
    'Does the structure match the required format?',
  ],
};

const BLUE_TEAM_OUTPUT_SECTIONS: OutputSection[] = createOutputSections([
  ['[PROPOSED SOLUTIONS]', '3+ concrete approaches to the problem'],
  ['[DEFENSE AGAINST ATTACKS]', 'Specific rebuttals to each Red Team criticism'],
  ['[SAFEGUARDS & MITIGATIONS]', 'How risks are addressed and managed'],
  ['[RESILIENCE DEMONSTRATION]', 'Why this approach survives attacks'],
  ['[POSITIVE OUTCOMES]', 'Benefits and success criteria'],
]);

/**
 * Red Team/Blue Team mode strategy
 *
 * Characteristics:
 * - Agents divided into two teams (even indices = Red, odd indices = Blue)
 * - Red Team: Critical analysis, risk identification, attack vectors
 * - Blue Team: Constructive solutions, defense strategies, mitigation
 * - Teams execute in parallel, then cross-evaluate
 * - Focus on adversarial but productive tension
 *
 * Uses hooks:
 * - getAgentRole: Assigns 'red' or 'blue' based on agent index
 * - transformContext: Injects team role into context for prompt building
 */
export class RedTeamBlueTeamMode extends BaseModeStrategy {
  readonly name = 'red-team-blue-team';
  readonly needsGroupthinkDetection = false;
  override readonly executionPattern = 'parallel' as const;

  /**
   * Stores agent indices for the current round execution.
   * Used by transformContext to determine team assignment.
   */
  private agentIndices: Map<string, number> = new Map();

  /**
   * Execute a red team/blue team round
   *
   * Agents are divided by index via getAgentRole hook:
   * - Even indices (0, 2, 4, ...): Red Team
   * - Odd indices (1, 3, 5, ...): Blue Team
   *
   * Both teams execute in parallel using Promise.allSettled for error handling.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    // Store agent indices for hook access
    this.agentIndices.clear();
    agents.forEach((agent, index) => {
      this.agentIndices.set(agent.id, index);
    });

    // Execute all agents in parallel with team-specific prompts via hooks
    const responsePromises = agents.map((agent, index) => {
      agent.setToolkit(toolkit);

      // Get team role via hook
      const team = this.getAgentRole(agent, index, context) as Team;
      logger.debug({ agentId: agent.id, team, index }, 'Agent team assigned');

      // Build context with team-specific prompt via transformContext
      const agentContext = this.transformContext(
        {
          ...context,
          modePrompt: this.buildAgentPrompt(context),
        },
        agent
      );

      return agent.generateResponse(agentContext);
    });

    // Use allSettled to handle individual failures gracefully
    const results = await Promise.allSettled(responsePromises);

    const responses: AgentResponse[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const agent = agents[i];
      if (!result || !agent) continue;

      if (result.status === 'fulfilled') {
        responses.push(result.value);
      } else {
        // Log error but continue with other agents
        logger.error({ err: result.reason, agentId: agent.id }, 'Error from agent');
      }
    }

    return responses;
  }

  /**
   * Get the team role for an agent based on their index.
   * Hook implementation for BaseModeStrategy.
   *
   * Team assignment:
   * - Even indices (0, 2, 4, ...): red team
   * - Odd indices (1, 3, 5, ...): blue team
   */
  protected override getAgentRole(
    _agent: BaseAgent,
    index: number,
    _context: DebateContext
  ): Team {
    return index % 2 === 0 ? 'red' : 'blue';
  }

  /**
   * Transform context to inject the team role for prompt building.
   * Hook implementation for BaseModeStrategy.
   */
  protected override transformContext(
    context: DebateContext,
    agent: BaseAgent
  ): RedTeamBlueTeamContext {
    const index = this.agentIndices.get(agent.id) ?? 0;
    const team = this.getAgentRole(agent, index, context);

    const transformedContext: RedTeamBlueTeamContext = {
      ...context,
      _agentTeam: team,
      // Rebuild modePrompt with the correct team role
      modePrompt: team === 'red' ? this.buildRedTeamPrompt(context) : this.buildBlueTeamPrompt(context),
    };
    return transformedContext;
  }

  /**
   * Build team-specific prompt
   *
   * Different prompts for red team (critical/attacking) and blue team (constructive/defensive)
   *
   * Note: When called from executeRound, the context will have been transformed
   * by transformContext to include _agentTeam. Fallback to red team for direct calls.
   */
  buildAgentPrompt(context: DebateContext): string {
    // Use _agentTeam if available (set by transformContext),
    // otherwise fallback to red team as default
    const rtbtContext = context as RedTeamBlueTeamContext;
    const team: Team = rtbtContext._agentTeam ?? 'red';

    return team === 'red' ? this.buildRedTeamPrompt(context) : this.buildBlueTeamPrompt(context);
  }

  /**
   * Build Red Team (critical/attacking) prompt
   */
  private buildRedTeamPrompt(context: DebateContext): string {
    let prompt = `
Mode: Red Team/Blue Team - RED TEAM
`;

    prompt += buildRoleAnchor(RED_TEAM_ROLE_ANCHOR);
    prompt += buildBehavioralContract(RED_TEAM_BEHAVIORAL_CONTRACT);
    prompt += this.buildTeamStructuralEnforcement(RED_TEAM_OUTPUT_SECTIONS);

    if (context.previousResponses.length > 0) {
      const blueTeamResponses = this.filterResponsesByTeam(context.previousResponses, 'blue');

      if (blueTeamResponses.length > 0) {
        prompt += `
BLUE TEAM HAS PROPOSED SOLUTIONS. YOUR JOB: BREAK THEM.
- Find holes in their defenses
- Identify what they missed
- Show how their mitigations fail

`;
      }
    }

    prompt += buildVerificationLoop(RED_TEAM_VERIFICATION);

    if (context.focusQuestion) {
      prompt += `
${SEPARATOR}
FOCUS QUESTION: ${context.focusQuestion}
${SEPARATOR}

Attack this question. What are ALL the risks and problems?
`;
    }

    return prompt;
  }

  /**
   * Build Blue Team (constructive/defensive) prompt
   */
  private buildBlueTeamPrompt(context: DebateContext): string {
    let prompt = `
Mode: Red Team/Blue Team - BLUE TEAM
`;

    prompt += buildRoleAnchor(BLUE_TEAM_ROLE_ANCHOR);
    prompt += buildBehavioralContract(BLUE_TEAM_BEHAVIORAL_CONTRACT);
    prompt += this.buildTeamStructuralEnforcement(BLUE_TEAM_OUTPUT_SECTIONS);

    if (context.previousResponses.length > 0) {
      const redTeamResponses = this.filterResponsesByTeam(context.previousResponses, 'red');

      if (redTeamResponses.length > 0) {
        prompt += `
RED TEAM HAS ATTACKED. YOUR JOB: DEFEND AND BUILD.
- Counter every attack with a defense
- Propose solutions for identified risks
- Show why their attacks fail or can be mitigated

`;
      }
    }

    prompt += buildVerificationLoop(BLUE_TEAM_VERIFICATION);

    if (context.focusQuestion) {
      prompt += `
${SEPARATOR}
FOCUS QUESTION: ${context.focusQuestion}
${SEPARATOR}

Solve this. Propose robust solutions that withstand attacks.
`;
    }

    return prompt;
  }

  /**
   * Build structural enforcement for a team
   */
  private buildTeamStructuralEnforcement(sections: OutputSection[]): string {
    let prompt = `
${SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${SEPARATOR}

REQUIRED OUTPUT STRUCTURE:

`;

    for (const section of sections) {
      prompt += `${section.header}
(${section.description})

`;
    }

    return prompt;
  }

  /**
   * Filter responses by team (even indices = red, odd indices = blue)
   */
  private filterResponsesByTeam(responses: AgentResponse[], team: Team): AgentResponse[] {
    return responses.filter((_, index) => {
      const isRedTeam = index % 2 === 0;
      return team === 'red' ? isRedTeam : !isRedTeam;
    });
  }
}
