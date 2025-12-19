/**
 * Collaborative Debate Mode
 *
 * In collaborative mode, agents work together to find common ground
 * and build upon each other's ideas. All agents respond in parallel,
 * seeing only previous rounds' responses.
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Collaborative mode strategy
 *
 * Characteristics:
 * - Agents run in parallel (Promise.all)
 * - Focus on finding agreement and synthesis
 * - Build upon others' ideas from previous rounds
 * - Encourage constructive dialogue
 */
export class CollaborativeMode implements DebateModeStrategy {
  readonly name = 'collaborative';

  /**
   * Execute a collaborative round
   *
   * All agents respond simultaneously, seeing only the previous rounds'
   * responses (not responses from the current round).
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    // Execute all agents in parallel
    // In collaborative mode, agents see the same context (previous rounds only)
    const responsePromises = agents.map((agent) => {
      // Ensure each agent has the toolkit
      agent.setToolkit(toolkit);
      return agent.generateResponse(context);
    });

    // Wait for all agents to respond
    const responses = await Promise.all(responsePromises);

    return responses;
  }

  /**
   * Build collaborative-specific prompt
   *
   * Encourages agents to:
   * - Find common ground
   * - Build on others' ideas
   * - Seek synthesis and agreement
   * - Be constructive and collaborative
   */
  buildAgentPrompt(context: DebateContext): string {
    let prompt = `
Mode: Collaborative Discussion

In this collaborative debate, your goal is to work with other participants to:
- Find areas of agreement and common ground
- Build upon and extend others' ideas
- Identify synthesis opportunities between different perspectives
- Contribute constructively to a shared understanding

`;

    if (context.previousResponses.length > 0) {
      prompt += `
Review the previous responses carefully. Look for:
- Points of agreement you can support and expand
- Complementary ideas you can connect
- Areas where synthesis is possible
- Constructive ways to address disagreements

`;
    } else {
      prompt += `
As the first round, establish your initial position thoughtfully:
- Present your perspective clearly
- Acknowledge potential areas for collaboration
- Stay open to building on others' ideas in future rounds

`;
    }

    if (context.focusQuestion) {
      prompt += `
Focus Question: ${context.focusQuestion}

Frame your response to specifically address this question while remaining collaborative.
`;
    }

    return prompt;
  }
}
