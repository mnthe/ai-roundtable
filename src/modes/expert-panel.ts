/**
 * Expert Panel Debate Mode
 *
 * In expert-panel mode, each agent acts as an independent expert
 * providing their professional assessment without necessarily
 * engaging with other panelists' opinions.
 */

import type { DebateModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';

/**
 * Expert Panel mode strategy
 *
 * Characteristics:
 * - Each agent provides independent expert assessment
 * - Focus on professional analysis and evidence
 * - Less direct engagement between panelists
 * - Emphasis on domain expertise and citations
 */
export class ExpertPanelMode implements DebateModeStrategy {
  readonly name = 'expert-panel';

  /**
   * Execute an expert panel round
   *
   * All experts respond in parallel, providing their independent
   * professional assessments.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    if (agents.length === 0) {
      return [];
    }

    // Build context with mode-specific prompt
    const contextWithModePrompt: DebateContext = {
      ...context,
      modePrompt: this.buildAgentPrompt(context),
    };

    // Execute all experts in parallel for independent opinions
    const responsePromises = agents.map((agent) => {
      agent.setToolkit(toolkit);
      return agent.generateResponse(contextWithModePrompt);
    });

    const responses = await Promise.all(responsePromises);
    return responses;
  }

  /**
   * Build expert-panel-specific prompt
   *
   * Encourages agents to:
   * - Provide professional expert analysis
   * - Cite evidence and sources
   * - Stay within their domain expertise
   * - Be objective and measured
   */
  buildAgentPrompt(context: DebateContext): string {
    let prompt = `
Mode: Expert Panel

You are participating as an expert panelist. Your role is to:
- Provide professional, evidence-based analysis
- Draw on domain expertise and cite sources where possible
- Offer objective assessment of the topic
- Be measured and precise in your conclusions
- Acknowledge limitations and uncertainties in your assessment

`;

    if (context.previousResponses.length > 0) {
      prompt += `
Review the other experts' contributions:
- Note areas of consensus and divergence
- Add unique perspectives from your expertise
- Clarify or elaborate on technical points
- Maintain professional objectivity in any disagreements

`;
    } else {
      prompt += `
As an expert panelist, provide your initial assessment:
- Establish your analytical framework
- Present key findings from your domain expertise
- Use evidence and citations to support your analysis
- Be clear about confidence levels and uncertainties

`;
    }

    if (context.focusQuestion) {
      prompt += `
Focus Question: ${context.focusQuestion}

Provide your expert analysis specifically addressing this question.
`;
    }

    return prompt;
  }
}
