/**
 * Socratic Debate Mode
 *
 * In Socratic mode, agents engage through questioning rather than
 * asserting positions. The focus is on exploring ideas through
 * dialogue and collaborative inquiry.
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Socratic mode strategy
 *
 * Characteristics:
 * - Heavy use of probing questions
 * - Focus on uncovering assumptions
 * - Explore ideas through dialogue
 * - Seek deeper understanding rather than winning
 */
export class SocraticMode implements DebateModeStrategy {
  readonly name = 'socratic';

  /**
   * Execute a Socratic round
   *
   * Agents respond sequentially, with each building on
   * previous questions and insights.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    const responses: AgentResponse[] = [];

    // Execute agents sequentially for dialogic questioning
    for (const agent of agents) {
      // Build context with current round responses and mode-specific prompt
      const currentContext: DebateContext = {
        ...context,
        previousResponses: [
          ...context.previousResponses,
          ...responses,
        ],
        // Add mode-specific prompt
        modePrompt: this.buildAgentPrompt({
          ...context,
          previousResponses: [...context.previousResponses, ...responses],
        }),
      };

      agent.setToolkit(toolkit);
      const response = await agent.generateResponse(currentContext);
      responses.push(response);
    }

    return responses;
  }

  /**
   * Build Socratic-specific prompt
   *
   * Encourages agents to:
   * - Ask probing questions
   * - Uncover hidden assumptions
   * - Explore implications
   * - Seek clarity and precision
   */
  buildAgentPrompt(context: DebateContext): string {
    let prompt = `
Mode: Socratic Dialogue

In this Socratic dialogue, engage through questioning and exploration:
- Ask probing questions that uncover assumptions
- Seek clarification on unclear or ambiguous points
- Explore the implications of positions
- Guide the discussion through thoughtful inquiry
- Pursue deeper understanding, not victory

`;

    if (context.previousResponses.length > 0) {
      prompt += `
Engage with previous responses through questions:
- What assumptions underlie their positions?
- What clarifications would strengthen or challenge their reasoning?
- What implications haven't been explored?
- What follow-up questions would advance the discussion?

Frame your response with at least 2-3 probing questions for other participants.

`;
    } else {
      prompt += `
Begin the Socratic dialogue:
- Present an initial perspective on the topic
- Raise foundational questions that frame the discussion
- Identify key assumptions that should be examined
- Invite others to explore the topic through questioning

`;
    }

    if (context.focusQuestion) {
      prompt += `
Focus Question: ${context.focusQuestion}

Use Socratic questioning to explore this question from multiple angles.
`;
    }

    return prompt;
  }
}
