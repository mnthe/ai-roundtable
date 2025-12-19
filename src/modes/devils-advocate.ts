/**
 * Devil's Advocate Debate Mode
 *
 * In devil's advocate mode, one agent intentionally takes an opposing
 * stance to stress-test ideas. The first agent presents a normal position,
 * the second agent is forced to argue against it, and remaining agents
 * evaluate both perspectives.
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Devil's Advocate mode strategy
 *
 * Characteristics:
 * - First agent: Normal position on the topic
 * - Second agent: Forced to take opposing stance (devil's advocate)
 * - Remaining agents: Evaluate and judge both perspectives
 * - Sequential execution to maintain role clarity
 */
export class DevilsAdvocateMode implements DebateModeStrategy {
  readonly name = 'devils-advocate';

  /**
   * Execute a devil's advocate round
   *
   * Agents respond sequentially with different roles:
   * - Agent 0: Normal position
   * - Agent 1: Devil's advocate (must oppose)
   * - Agents 2+: Evaluators
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

    // Execute agents sequentially to maintain role clarity
    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i];
      if (!agent) continue;

      // Build context with responses from current round and mode-specific prompt
      // Pass explicit agent index to ensure correct role assignment
      const currentContext: DebateContext = {
        ...context,
        previousResponses: [
          ...context.previousResponses,
          ...responses,
        ],
        // Add mode-specific prompt based on agent role (index i in current round)
        modePrompt: this.buildAgentPromptForIndex(context, i),
      };

      agent.setToolkit(toolkit);
      const response = await agent.generateResponse(currentContext);
      responses.push(response);
    }

    return responses;
  }

  /**
   * Build devil's advocate-specific prompt
   *
   * Role assignment:
   * - First agent: Present normal position
   * - Second agent: Take opposing stance (devil's advocate)
   * - Remaining agents: Evaluate both perspectives
   *
   * Note: This method uses previousResponses.length to infer agent index.
   * For accurate role assignment during sequential execution, use
   * buildAgentPromptForIndex() with explicit index instead.
   */
  buildAgentPrompt(context: DebateContext): string {
    // Use previousResponses length as agent index (works when called with accumulated responses)
    const agentIndex = context.previousResponses.length;
    return this.buildAgentPromptForIndex(context, agentIndex);
  }

  /**
   * Build devil's advocate-specific prompt with explicit agent index
   *
   * This method is used internally by executeRound to ensure correct
   * role assignment when agents execute sequentially.
   */
  private buildAgentPromptForIndex(context: DebateContext, agentIndex: number): string {
    const isFirstRound = context.currentRound === 1;

    if (agentIndex === 0) {
      // First agent: Normal position
      let prompt = `
Mode: Devil's Advocate (Primary Position)

You are the first participant presenting a position on this topic.
Your role is to:
- Present a clear, well-reasoned position on the topic
- Provide strong justification and evidence
- Establish a thoughtful stance that can be challenged
- Be prepared for rigorous opposition from the devil's advocate

`;

      if (!isFirstRound) {
        prompt += `
This is round ${context.currentRound}. Consider:
- How previous rounds have developed the discussion
- What new angles or refinements to present
- How to strengthen your position based on prior exchanges

`;
      }

      if (context.focusQuestion) {
        prompt += `
Focus Question: ${context.focusQuestion}

Present your position on this specific question clearly and convincingly.
`;
      }

      return prompt;
    } else if (agentIndex === 1) {
      // Second agent: Devil's advocate (must oppose)
      let prompt = `
Mode: Devil's Advocate (Opposition Role)

You are the devil's advocate. Your explicit role is to OPPOSE the previous position.
You MUST:
- Take the opposing stance, even if you partially agree
- Find the strongest counter-arguments and objections
- Challenge assumptions and identify weaknesses
- Present alternative perspectives or interpretations
- Stress-test the previous position rigorously

IMPORTANT: You are playing devil's advocate - your job is to argue the other side,
regardless of your actual agreement. This is essential for robust idea testing.

`;

      if (!isFirstRound) {
        prompt += `
This is round ${context.currentRound}. Consider:
- How your opposition has evolved across rounds
- New counter-arguments to introduce
- Weaknesses that have emerged in the primary position

`;
      }

      if (context.focusQuestion) {
        prompt += `
Focus Question: ${context.focusQuestion}

Argue against the previous position on this question with strong counter-arguments.
`;
      }

      return prompt;
    } else {
      // Remaining agents: Evaluators
      let prompt = `
Mode: Devil's Advocate (Evaluator Role)

You are an evaluator examining two opposing perspectives.
Your role is to:
- Objectively assess the strengths and weaknesses of both positions
- Identify which arguments are most compelling and why
- Point out logical fallacies or weak reasoning on either side
- Consider which position has better evidence and justification
- Offer synthesis or middle-ground perspectives if appropriate

Review both the primary position and the devil's advocate's opposition carefully.

`;

      if (!isFirstRound) {
        prompt += `
This is round ${context.currentRound}. Consider:
- How the debate has evolved across rounds
- Which position has adapted better to challenges
- New insights from previous evaluations

`;
      }

      if (context.focusQuestion) {
        prompt += `
Focus Question: ${context.focusQuestion}

Evaluate both positions in terms of how well they address this specific question.
`;
      }

      return prompt;
    }
  }
}
