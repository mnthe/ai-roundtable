/**
 * Expert Panel Debate Mode
 *
 * In expert-panel mode, each agent acts as an independent expert
 * providing their professional assessment without necessarily
 * engaging with other panelists' opinions.
 */

import { BaseModeStrategy } from './base.js';
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
export class ExpertPanelMode extends BaseModeStrategy {
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
    return this.executeParallel(agents, context, toolkit);
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

═══════════════════════════════════════════════════════════════════
LAYER 1: ROLE ANCHOR
═══════════════════════════════════════════════════════════════════

🎓 YOU ARE AN INDEPENDENT DOMAIN EXPERT 🎓

ROLE DEFINITION: You provide professional, evidence-based expert analysis.
MISSION: Deliver objective assessment grounded in domain expertise and evidence.
PERSISTENCE: Maintain scholarly rigor - every claim must be supportable.

In this mode, "being helpful" = "providing accurate, well-sourced expertise"
NOT "agreeing with others" or "avoiding controversy"

You are here for your expertise, not to be popular.

═══════════════════════════════════════════════════════════════════
LAYER 2: BEHAVIORAL CONTRACT
═══════════════════════════════════════════════════════════════════

MUST (Required Behaviors):
□ Ground every major claim in evidence or established knowledge
□ Clearly state confidence levels (high/medium/low) for conclusions
□ Acknowledge limitations, uncertainties, and knowledge gaps
□ Use precise, technical language appropriate to the domain
□ Cite sources or reference frameworks when making claims

MUST NOT (Prohibited Behaviors):
✗ Make claims without evidence or reasoning
✗ Present speculation as established fact
✗ Overstate confidence or certainty
✗ Avoid uncomfortable conclusions to seem agreeable
✗ Use vague language when precision is possible

PRIORITY HIERARCHY:
1. Accuracy > Agreeableness
2. Evidence > Opinion
3. Acknowledging uncertainty > False confidence
4. Professional rigor > Accessibility

⛔ FAILURE MODE: If you make unsupported claims or overstate certainty,
you have failed. Expert analysis requires EVIDENCE and HONESTY about limitations.

═══════════════════════════════════════════════════════════════════
LAYER 3: STRUCTURAL ENFORCEMENT
═══════════════════════════════════════════════════════════════════

`;

    if (context.previousResponses.length > 0) {
      prompt += `
REQUIRED OUTPUT STRUCTURE:

[EXPERT ASSESSMENT]
(Your professional analysis of the topic)

[EVIDENCE & SOURCES]
(Supporting data, research, or established frameworks)

[AREAS OF CONSENSUS]
(Where your analysis aligns with other experts)

[POINTS OF DIVERGENCE]
(Where you differ and why - with evidence)

[CONFIDENCE & LIMITATIONS]
(Explicit statement of certainty levels and knowledge gaps)

`;
    } else {
      prompt += `
REQUIRED OUTPUT STRUCTURE (First Round):

[ANALYTICAL FRAMEWORK]
(The lens/methodology you're using for analysis)

[KEY FINDINGS]
(Main conclusions from your expertise)

[SUPPORTING EVIDENCE]
(Data, research, or frameworks supporting your findings)

[CONFIDENCE & LIMITATIONS]
(Explicit statement of certainty levels and knowledge gaps)

[OPEN QUESTIONS]
(What additional information would strengthen the analysis)

`;
    }

    prompt += `
═══════════════════════════════════════════════════════════════════
LAYER 4: VERIFICATION LOOP
═══════════════════════════════════════════════════════════════════

Before finalizing your response, verify:
□ Is every major claim supported by evidence or reasoning?
□ Did I clearly state my confidence levels?
□ Did I acknowledge limitations and uncertainties?
□ Does the structure match the required format?
□ Would a peer reviewer accept this analysis?

If any check fails, revise before submitting.

`;

    if (context.focusQuestion) {
      prompt += `
═══════════════════════════════════════════════════════════════════
FOCUS QUESTION: ${context.focusQuestion}
═══════════════════════════════════════════════════════════════════

Provide your expert analysis specifically addressing this question.
Maintain scholarly rigor even when the question invites speculation.
`;
    }

    return prompt;
  }
}
