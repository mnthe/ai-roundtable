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
import {
  buildRoleAnchor,
  buildBehavioralContract,
  buildVerificationLoop,
  createOutputSections,
  PROMPT_SEPARATOR,
  type RoleAnchorConfig,
  type BehavioralContractConfig,
  type VerificationLoopConfig,
  type OutputSection,
} from './utils/index.js';

/**
 * Team assignment for agents
 */
type Team = 'red' | 'blue';

/**
 * Extended context for red-team-blue-team mode with role tracking
 * and concurrency-safe round state
 */
interface RedTeamBlueTeamContext extends DebateContext {
  /** Current agent's team role */
  _agentTeam?: Team;
  /** Concurrency-safe round state (bound to context, not instance) */
  _redTeamBlueTeamState?: {
    /** Map of agent IDs to their indices for this round */
    agentIndexMap: Map<string, number>;
  };
}


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

  /**
   * Execute a red team/blue team round
   *
   * Agents are divided by index via getAgentRole hook:
   * - Even indices (0, 2, 4, ...): Red Team
   * - Odd indices (1, 3, 5, ...): Blue Team
   *
   * Both teams execute in parallel using the base class executeParallel method.
   * Team assignment is handled via the transformContext hook.
   *
   * Note: Round state is bound to context (not instance) for concurrency safety.
   * This allows the same mode instance to be safely reused across concurrent sessions.
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
    const contextWithState: RedTeamBlueTeamContext = {
      ...context,
      _redTeamBlueTeamState: {
        agentIndexMap,
      },
    };

    // Delegate to base class executeParallel
    // Team-specific prompts are handled via transformContext hook
    return this.executeParallel(agents, contextWithState, toolkit);
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
   *
   * This adds team-specific guidance to the existing modePrompt
   * (which was already set by the base class executeParallel).
   */
  protected override transformContext(
    context: DebateContext,
    agent: BaseAgent
  ): RedTeamBlueTeamContext {
    const state = (context as RedTeamBlueTeamContext)._redTeamBlueTeamState;
    const index = state?.agentIndexMap.get(agent.id) ?? 0;
    const team = this.getAgentRole(agent, index, context);

    // Only add team-specific additions to existing modePrompt
    const teamAddition = this.buildTeamAddition(context, team);

    const transformedContext: RedTeamBlueTeamContext = {
      ...context,
      _agentTeam: team,
      modePrompt: (context.modePrompt || '') + teamAddition,
    };
    return transformedContext;
  }

  /**
   * Build team-specific prompt addition.
   * This is appended to the base modePrompt, not a replacement.
   */
  private buildTeamAddition(context: DebateContext, team: Team): string {
    return team === 'red'
      ? this.buildRedTeamAddition(context)
      : this.buildBlueTeamAddition(context);
  }

  /**
   * Build Red Team (critical/attacking) addition
   */
  private buildRedTeamAddition(context: DebateContext): string {
    let addition = `

## Your Team: RED TEAM (Attacker)

${buildRoleAnchor(RED_TEAM_ROLE_ANCHOR)}
${buildBehavioralContract(RED_TEAM_BEHAVIORAL_CONTRACT, context.mode)}
${this.buildTeamStructuralEnforcement(RED_TEAM_OUTPUT_SECTIONS)}`;

    if (context.previousResponses.length > 0) {
      const blueTeamResponses = this.filterResponsesByTeam(context.previousResponses, 'blue');

      if (blueTeamResponses.length > 0) {
        addition += `

BLUE TEAM HAS PROPOSED SOLUTIONS. YOUR JOB: BREAK THEM.
- Find holes in their defenses
- Identify what they missed
- Show how their mitigations fail

`;
      }
    }

    addition += buildVerificationLoop(RED_TEAM_VERIFICATION, context.mode);

    if (context.focusQuestion) {
      addition += `
${PROMPT_SEPARATOR}
FOCUS QUESTION: ${context.focusQuestion}
${PROMPT_SEPARATOR}

Attack this question. What are ALL the risks and problems?
`;
    }

    return addition;
  }

  /**
   * Build Blue Team (constructive/defensive) addition
   */
  private buildBlueTeamAddition(context: DebateContext): string {
    let addition = `

## Your Team: BLUE TEAM (Defender)

${buildRoleAnchor(BLUE_TEAM_ROLE_ANCHOR)}
${buildBehavioralContract(BLUE_TEAM_BEHAVIORAL_CONTRACT, context.mode)}
${this.buildTeamStructuralEnforcement(BLUE_TEAM_OUTPUT_SECTIONS)}`;

    if (context.previousResponses.length > 0) {
      const redTeamResponses = this.filterResponsesByTeam(context.previousResponses, 'red');

      if (redTeamResponses.length > 0) {
        addition += `

RED TEAM HAS ATTACKED. YOUR JOB: DEFEND AND BUILD.
- Counter every attack with a defense
- Propose solutions for identified risks
- Show why their attacks fail or can be mitigated

`;
      }
    }

    addition += buildVerificationLoop(BLUE_TEAM_VERIFICATION, context.mode);

    if (context.focusQuestion) {
      addition += `
${PROMPT_SEPARATOR}
FOCUS QUESTION: ${context.focusQuestion}
${PROMPT_SEPARATOR}

Solve this. Propose robust solutions that withstand attacks.
`;
    }

    return addition;
  }

  /**
   * Build red team/blue team base prompt
   *
   * This provides the generic mode context. Team-specific content
   * (RED/BLUE) is added by transformContext.
   */
  buildAgentPrompt(_context: DebateContext): string {
    return `
Mode: Red Team/Blue Team

This is a security-focused analysis exercise with two teams:
- RED TEAM: Attack, criticize, find vulnerabilities and risks
- BLUE TEAM: Defend, build solutions, mitigate risks

Your specific team assignment will be provided below.
`;
  }

  /**
   * Build structural enforcement for a team
   */
  private buildTeamStructuralEnforcement(sections: OutputSection[]): string {
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
