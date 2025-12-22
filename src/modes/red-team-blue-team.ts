/**
 * Red Team/Blue Team Debate Mode
 *
 * In red team/blue team mode, agents are divided into two opposing teams.
 * Red team takes a critical/attacking perspective (identifying risks and problems),
 * while blue team takes a constructive/defensive perspective (proposing solutions).
 *
 * Uses RoleBasedModeStrategy for:
 * - Role assignment via getRoleForIndex (even = red, odd = blue)
 * - Context transformation with role-specific prompts
 * - Parallel execution of both teams
 */

import { RoleBasedModeStrategy, type RoleConfig } from './role-based.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
import { TEAM_CONFIGS, type Team } from './configs/index.js';
import { PROMPT_SEPARATOR } from './utils/index.js';

/**
 * Red Team/Blue Team mode strategy
 *
 * Characteristics:
 * - Agents divided into two teams (even indices = Red, odd indices = Blue)
 * - Red Team: Critical analysis, risk identification, attack vectors
 * - Blue Team: Constructive solutions, defense strategies, mitigation
 * - Teams execute in parallel
 * - Focus on adversarial but productive tension
 */
export class RedTeamBlueTeamMode extends RoleBasedModeStrategy<Team> {
  readonly name = 'red-team-blue-team';
  readonly needsGroupthinkDetection = false;

  protected readonly executionMode = 'parallel' as const;

  /**
   * Role configurations for red and blue teams
   * Uses TEAM_CONFIGS from config file (compatible with RoleConfig interface)
   */
  protected readonly roleConfigs: Record<Team, RoleConfig> = TEAM_CONFIGS;

  /**
   * Determine team assignment based on agent index
   * Even indices (0, 2, 4, ...): red team
   * Odd indices (1, 3, 5, ...): blue team
   */
  protected getRoleForIndex(index: number, _totalAgents: number): Team {
    return index % 2 === 0 ? 'red' : 'blue';
  }

  /**
   * Build red team/blue team base prompt
   *
   * This provides the generic mode context. Team-specific content
   * (RED/BLUE) is added by transformContext via RoleBasedModeStrategy.
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
   * Build additional context for a team role
   *
   * Adds round-specific guidance based on what the opposing team has done,
   * and handles focus question if present.
   */
  protected override buildRoleContextAddition(context: DebateContext, role: Team): string {
    let addition = '';

    // Add round-specific context based on opposing team's responses
    if (context.previousResponses.length > 0) {
      const opposingTeam = role === 'red' ? 'blue' : 'red';
      const opposingResponses = this.filterResponsesByTeam(context.previousResponses, opposingTeam);

      if (opposingResponses.length > 0) {
        if (role === 'red') {
          addition += `

BLUE TEAM HAS PROPOSED SOLUTIONS. YOUR JOB: BREAK THEM.
- Find holes in their defenses
- Identify what they missed
- Show how their mitigations fail

`;
        } else {
          addition += `

RED TEAM HAS ATTACKED. YOUR JOB: DEFEND AND BUILD.
- Counter every attack with a defense
- Propose solutions for identified risks
- Show why their attacks fail or can be mitigated

`;
        }
      }
    }

    // Add focus question handling
    if (context.focusQuestion) {
      addition += `
${PROMPT_SEPARATOR}
FOCUS QUESTION: ${context.focusQuestion}
${PROMPT_SEPARATOR}

`;
      if (role === 'red') {
        addition += 'Attack this question. What are ALL the risks and problems?\n';
      } else {
        addition += 'Solve this. Propose robust solutions that withstand attacks.\n';
      }
    }

    return addition;
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
