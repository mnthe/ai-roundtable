/**
 * Adversarial Debate Mode
 *
 * In adversarial mode, agents take opposing stances and challenge
 * each other's arguments. This mode is designed to stress-test ideas
 * and expose weaknesses in reasoning.
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Adversarial mode strategy
 *
 * Characteristics:
 * - Agents take opposing or critical stances
 * - Focus on challenging and testing arguments
 * - Look for weaknesses and counter-arguments
 * - Encourage rigorous debate and steel-manning
 */
export class AdversarialMode implements DebateModeStrategy {
  readonly name = 'adversarial';

  /**
   * Execute an adversarial round
   *
   * Agents respond sequentially, with each agent seeing and
   * challenging previous responses from the current round.
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

    // Execute agents sequentially so each can challenge the previous
    for (const agent of agents) {
      // Build context with responses from current round and mode-specific prompt
      const currentContext: DebateContext = {
        ...context,
        previousResponses: [
          ...context.previousResponses,
          ...responses, // Include current round responses
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
   * Build adversarial-specific prompt
   *
   * Encourages agents to:
   * - Challenge and critique other positions
   * - Find weaknesses in arguments
   * - Steel-man opposing views before attacking
   * - Provide strong counter-arguments
   */
  buildAgentPrompt(context: DebateContext): string {
    let prompt = `
Mode: Adversarial Debate

In this adversarial debate, your goal is to rigorously test ideas by:
- Challenging the assumptions and logic of other positions
- Identifying weaknesses, gaps, and inconsistencies in arguments
- Providing strong counter-arguments with evidence
- Steel-manning opposing views before critiquing them (represent them fairly)

`;

    if (context.previousResponses.length > 0) {
      prompt += `
Critically analyze the previous responses:
- What are the strongest points you need to address?
- What assumptions might be flawed?
- What evidence contradicts their positions?
- Where is the reasoning incomplete or fallacious?

Even if you partially agree, find the strongest counter-arguments.

`;
    } else {
      prompt += `
As the first participant, establish a clear position:
- Present your stance with strong justification
- Anticipate counter-arguments and address them preemptively
- Be prepared for rigorous challenges to your position

`;
    }

    if (context.focusQuestion) {
      prompt += `
Focus Question: ${context.focusQuestion}

Take a strong position on this question and be prepared to defend it vigorously.
`;
    }

    return prompt;
  }
}
