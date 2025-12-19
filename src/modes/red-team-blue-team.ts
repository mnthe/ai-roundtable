/**
 * Red Team/Blue Team Debate Mode
 *
 * In red team/blue team mode, agents are divided into two opposing teams.
 * Red team takes a critical/attacking perspective (identifying risks and problems),
 * while blue team takes a constructive/defensive perspective (proposing solutions).
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Team assignment for agents
 */
type Team = 'red' | 'blue';

/**
 * Red Team/Blue Team mode strategy
 *
 * Characteristics:
 * - Agents divided into two teams (even indices = Red, odd indices = Blue)
 * - Red Team: Critical analysis, risk identification, attack vectors
 * - Blue Team: Constructive solutions, defense strategies, mitigation
 * - Teams execute in parallel, then cross-evaluate
 * - Focus on adversarial but productive tension
 */
export class RedTeamBlueTeamMode implements DebateModeStrategy {
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
Mode: Red Team/Blue Team - RED TEAM (Critical Analysis)

You are on the RED TEAM. Your role is to think critically and identify problems:
- Identify risks, vulnerabilities, and potential failures
- Challenge assumptions and find weak points
- Explore attack vectors and edge cases
- Highlight what could go wrong
- Be skeptical and thorough in finding issues
- Focus on threats, problems, and limitations

Think like a critic, skeptic, or adversary. Your job is to stress-test ideas by
finding every possible problem, risk, or weakness.

`;

    if (context.previousResponses.length > 0) {
      const blueTeamResponses = this.filterResponsesByTeam(context.previousResponses, 'blue');

      prompt += `
Review the BLUE TEAM's constructive proposals and defenses:
- What are the security risks or vulnerabilities?
- What edge cases or failure modes haven't been considered?
- What assumptions are questionable or unrealistic?
- What could attackers or adversaries exploit?
- What are the hidden costs or trade-offs?

Challenge the blue team's solutions rigorously. Find the gaps in their defenses.

`;

      if (blueTeamResponses.length === 0) {
        prompt += `
(No blue team responses yet in previous rounds. Focus on identifying risks and
problems in the general topic.)

`;
      }
    } else {
      prompt += `
This is the first round. Begin your critical analysis:
- Identify key risks and potential problems
- Highlight vulnerabilities and weak points
- Challenge common assumptions about the topic
- Outline what could go wrong

`;
    }

    if (context.focusQuestion) {
      prompt += `
Focus Question: ${context.focusQuestion}

Provide critical analysis of this question - what are the risks, problems, and challenges?
`;
    }

    return prompt;
  }

  /**
   * Build Blue Team (constructive/defensive) prompt
   */
  private buildBlueTeamPrompt(context: DebateContext): string {
    let prompt = `
Mode: Red Team/Blue Team - BLUE TEAM (Constructive Solutions)

You are on the BLUE TEAM. Your role is to build solutions and defend against criticism:
- Propose constructive solutions and strategies
- Defend against identified risks and attacks
- Provide mitigation strategies and safeguards
- Build robust, defensible approaches
- Focus on resilience and positive outcomes
- Address concerns with practical solutions

Think like a builder, defender, or problem-solver. Your job is to create solutions
and defend them against criticism.

`;

    if (context.previousResponses.length > 0) {
      const redTeamResponses = this.filterResponsesByTeam(context.previousResponses, 'red');

      prompt += `
Review the RED TEAM's critical analysis and attacks:
- How can you address the identified risks?
- What safeguards or mitigations can you propose?
- How can you strengthen defenses against their attacks?
- What solutions address their concerns?
- How can you demonstrate resilience?

Respond constructively to red team's criticisms with practical solutions.

`;

      if (redTeamResponses.length === 0) {
        prompt += `
(No red team responses yet in previous rounds. Focus on proposing constructive
solutions and building defensible approaches.)

`;
      }
    } else {
      prompt += `
This is the first round. Begin your constructive analysis:
- Propose solutions and strategies
- Build a defensible approach
- Establish safeguards and protections
- Outline positive outcomes and benefits

`;
    }

    if (context.focusQuestion) {
      prompt += `
Focus Question: ${context.focusQuestion}

Provide constructive solutions addressing this question - how can it be solved effectively?
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
