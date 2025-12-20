/**
 * Red Team/Blue Team Debate Mode
 *
 * In red team/blue team mode, agents are divided into two opposing teams.
 * Red team takes a critical/attacking perspective (identifying risks and problems),
 * while blue team takes a constructive/defensive perspective (proposing solutions).
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
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

/**
 * Team assignment for agents
 */
type Team = 'red' | 'blue';

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
 * Note: Uses custom executeRound with team-based execution and interleaving
 */
export class RedTeamBlueTeamMode extends BaseModeStrategy {
  readonly name = 'red-team-blue-team';

  /**
   * Execute a red team/blue team round
   *
   * Agents are divided by index:
   * - Even indices (0, 2, 4, ...): Red Team
   * - Odd indices (1, 3, 5, ...): Blue Team
   *
   * Both teams execute in parallel.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    // Divide agents into red and blue teams
    const redTeam: BaseAgent[] = [];
    const blueTeam: BaseAgent[] = [];

    agents.forEach((agent, index) => {
      if (index % 2 === 0) {
        redTeam.push(agent);
      } else {
        blueTeam.push(agent);
      }
    });

    // Execute both teams in parallel
    const [redResponses, blueResponses] = await Promise.all([
      this.executeTeam(redTeam, 'red', context, toolkit),
      this.executeTeam(blueTeam, 'blue', context, toolkit),
    ]);

    // Interleave responses to maintain original agent order
    const responses: AgentResponse[] = [];
    const maxLength = Math.max(redResponses.length, blueResponses.length);

    for (let i = 0; i < maxLength; i++) {
      const redResponse = redResponses[i];
      const blueResponse = blueResponses[i];

      if (redResponse) {
        responses.push(redResponse);
      }
      if (blueResponse) {
        responses.push(blueResponse);
      }
    }

    return responses;
  }

  /**
   * Execute a single team's responses in parallel
   */
  private async executeTeam(
    teamAgents: BaseAgent[],
    team: Team,
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (teamAgents.length === 0) {
      return [];
    }

    // Build team-specific prompt
    const teamPrompt =
      team === 'red' ? this.buildRedTeamPrompt(context) : this.buildBlueTeamPrompt(context);

    // Build context with team-specific mode prompt
    const teamContext: DebateContext = {
      ...context,
      modePrompt: teamPrompt,
    };

    // All team members see the same context and respond in parallel
    const responsePromises = teamAgents.map((agent) => {
      agent.setToolkit(toolkit);
      return agent.generateResponse(teamContext);
    });

    return Promise.all(responsePromises);
  }

  /**
   * Build team-specific prompt
   *
   * Different prompts for red team (critical/attacking) and blue team (constructive/defensive)
   */
  buildAgentPrompt(context: DebateContext): string {
    // Determine team based on response count in current round
    const currentRoundResponses = this.getCurrentRoundResponses(context);
    const agentIndex = currentRoundResponses.length;
    const team: Team = agentIndex % 2 === 0 ? 'red' : 'blue';

    if (team === 'red') {
      return this.buildRedTeamPrompt(context);
    } else {
      return this.buildBlueTeamPrompt(context);
    }
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
   * Get responses from current round only
   */
  private getCurrentRoundResponses(context: DebateContext): AgentResponse[] {
    if (context.previousResponses.length === 0) {
      return [];
    }

    // Find responses from the most recent round
    const allResponses = context.previousResponses;
    const lastResponse = allResponses[allResponses.length - 1];
    if (!lastResponse) {
      return [];
    }

    const latestTimestamp = lastResponse.timestamp.getTime();
    return allResponses.filter((r) => r.timestamp.getTime() === latestTimestamp);
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
