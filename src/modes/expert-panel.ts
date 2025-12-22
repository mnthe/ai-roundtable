/**
 * Expert Panel Debate Mode
 *
 * In expert-panel mode, each agent acts as an independent expert
 * providing their professional assessment without necessarily
 * engaging with other panelists' opinions.
 *
 * Each agent is assigned a specific perspective (technical, economic,
 * ethical, social) using round-robin assignment to ensure comprehensive
 * multi-viewpoint analysis.
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse } from '../types/index.js';
import {
  buildModePrompt,
  createOutputSections,
  type ModePromptConfig,
  type RoleAnchorConfig,
} from './utils/index.js';

/**
 * Perspective anchors for expert panel analysis
 */
export const PERSPECTIVE_ANCHORS = [
  'technical', // Technical feasibility, implementation challenges
  'economic', // Cost, ROI, market impact
  'ethical', // Moral implications, fairness, bias
  'social', // User impact, accessibility, societal effects
] as const;

export type Perspective = (typeof PERSPECTIVE_ANCHORS)[number];

/**
 * Perspective descriptions for prompt building
 */
export const PERSPECTIVE_DESCRIPTIONS: Record<Perspective, string> = {
  technical:
    'Focus on technical feasibility, implementation complexity, and engineering trade-offs.',
  economic: 'Focus on costs, return on investment, market dynamics, and financial implications.',
  ethical: 'Focus on moral implications, fairness, potential biases, and ethical considerations.',
  social: 'Focus on user impact, accessibility, societal effects, and human factors.',
};

/**
 * Perspective-specific role anchor configurations
 */
const PERSPECTIVE_ROLE_ANCHORS: Record<Perspective, Partial<RoleAnchorConfig>> = {
  technical: {
    emoji: '🔧',
    title: 'YOU ARE A TECHNICAL DOMAIN EXPERT',
    definition:
      'You provide professional analysis focused on technical feasibility and implementation.',
    mission:
      'Deliver objective assessment of technical aspects including feasibility, complexity, risks, and engineering trade-offs.',
    additionalContext:
      'Your expertise lies in understanding HOW things work and CAN be built. Prioritize technical accuracy and implementation realism.',
  },
  economic: {
    emoji: '💰',
    title: 'YOU ARE AN ECONOMIC DOMAIN EXPERT',
    definition:
      'You provide professional analysis focused on economic viability and financial impact.',
    mission:
      'Deliver objective assessment of economic aspects including costs, ROI, market dynamics, and financial sustainability.',
    additionalContext:
      'Your expertise lies in understanding COSTS, VALUE, and MARKET FORCES. Prioritize financial accuracy and economic realism.',
  },
  ethical: {
    emoji: '⚖️',
    title: 'YOU ARE AN ETHICS DOMAIN EXPERT',
    definition:
      'You provide professional analysis focused on moral implications and ethical considerations.',
    mission:
      'Deliver objective assessment of ethical aspects including fairness, potential biases, moral implications, and societal responsibilities.',
    additionalContext:
      'Your expertise lies in understanding RIGHT vs WRONG and FAIR vs UNFAIR. Prioritize ethical rigor and moral clarity.',
  },
  social: {
    emoji: '👥',
    title: 'YOU ARE A SOCIAL IMPACT DOMAIN EXPERT',
    definition: 'You provide professional analysis focused on user impact and societal effects.',
    mission:
      'Deliver objective assessment of social aspects including user impact, accessibility, community effects, and human factors.',
    additionalContext:
      'Your expertise lies in understanding HUMAN NEEDS and SOCIETAL IMPACT. Prioritize user-centered analysis and social responsibility.',
  },
};

/**
 * Extended context for expert-panel mode with agent perspective tracking
 * and concurrency-safe round state
 */
interface ExpertPanelContext extends DebateContext {
  /** Current agent's assigned perspective */
  _agentPerspective?: Perspective;
  /** Concurrency-safe round state (bound to context, not instance) */
  _expertPanelState?: {
    /** Map of agent IDs to their assigned perspectives for this round */
    agentPerspectiveMap: Map<string, Perspective>;
  };
}

/**
 * Expert Panel mode prompt configuration
 */
const EXPERT_PANEL_CONFIG: ModePromptConfig = {
  modeName: 'Expert Panel',
  roleAnchor: {
    emoji: '🎓',
    title: 'YOU ARE AN INDEPENDENT DOMAIN EXPERT',
    definition: 'You provide professional, evidence-based expert analysis.',
    mission: 'Deliver objective assessment grounded in domain expertise and evidence.',
    persistence: 'Maintain scholarly rigor - every claim must be supportable.',
    helpfulMeans: 'providing accurate, well-sourced expertise',
    helpfulNotMeans: 'agreeing with others" or "avoiding controversy',
    additionalContext: 'You are here for your expertise, not to be popular.',
  },
  behavioralContract: {
    mustBehaviors: [
      'Ground every major claim in evidence or established knowledge',
      'Clearly state confidence levels (high/medium/low) for conclusions',
      'Acknowledge limitations, uncertainties, and knowledge gaps',
      'Use precise, technical language appropriate to the domain',
      'Cite sources or reference frameworks when making claims',
    ],
    mustNotBehaviors: [
      'Make claims without evidence or reasoning',
      'Present speculation as established fact',
      'Overstate confidence or certainty',
      'Avoid uncomfortable conclusions to seem agreeable',
      'Use vague language when precision is possible',
    ],
    priorityHierarchy: [
      'Accuracy > Agreeableness',
      'Evidence > Opinion',
      'Acknowledging uncertainty > False confidence',
      'Professional rigor > Accessibility',
    ],
    failureMode:
      'If you make unsupported claims or overstate certainty, you have failed. Expert analysis requires EVIDENCE and HONESTY about limitations.',
  },
  structuralEnforcement: {
    firstRoundSections: createOutputSections([
      ['[ANALYTICAL FRAMEWORK]', "The lens/methodology you're using for analysis"],
      ['[KEY FINDINGS]', 'Main conclusions from your expertise'],
      ['[SUPPORTING EVIDENCE]', 'Data, research, or frameworks supporting your findings'],
      ['[CONFIDENCE & LIMITATIONS]', 'Explicit statement of certainty levels and knowledge gaps'],
      ['[OPEN QUESTIONS]', 'What additional information would strengthen the analysis'],
    ]),
    subsequentRoundSections: createOutputSections([
      ['[EXPERT ASSESSMENT]', 'Your professional analysis of the topic'],
      ['[EVIDENCE & SOURCES]', 'Supporting data, research, or established frameworks'],
      ['[AREAS OF CONSENSUS]', 'Where your analysis aligns with other experts'],
      ['[POINTS OF DIVERGENCE]', 'Where you differ and why - with evidence'],
      ['[CONFIDENCE & LIMITATIONS]', 'Explicit statement of certainty levels and knowledge gaps'],
    ]),
  },
  verificationLoop: {
    checklistItems: [
      'Is every major claim supported by evidence or reasoning?',
      'Did I clearly state my confidence levels?',
      'Did I acknowledge limitations and uncertainties?',
      'Does the structure match the required format?',
      'Would a peer reviewer accept this analysis?',
    ],
  },
  focusQuestion: {
    instructions:
      'Provide your expert analysis specifically addressing this question.\nMaintain scholarly rigor even when the question invites speculation.',
  },
};

/**
 * Expert Panel mode strategy
 *
 * Characteristics:
 * - Each agent provides independent expert assessment
 * - Each agent is assigned a specific perspective (technical, economic, ethical, social)
 * - Focus on professional analysis and evidence from their assigned perspective
 * - Less direct engagement between panelists
 * - Emphasis on domain expertise and citations
 *
 * Uses hooks:
 * - transformContext: Injects agent perspective into context for prompt building
 */
export class ExpertPanelMode extends BaseModeStrategy {
  readonly name = 'expert-panel';
  readonly needsGroupthinkDetection = true;

  /**
   * Execute an expert panel round
   *
   * All experts respond in parallel, providing their independent
   * professional assessments from their assigned perspectives.
   *
   * Note: Round state is bound to context (not instance) for concurrency safety.
   * This allows the same mode instance to be safely reused across concurrent sessions.
   */
  async executeRound(
    agents: BaseAgent[],
    context: DebateContext,
    toolkit: AgentToolkit
  ): Promise<AgentResponse[]> {
    // Build perspective map for this round (context-bound, not instance-bound)
    const agentPerspectiveMap = new Map<string, Perspective>();
    agents.forEach((agent, index) => {
      // Round-robin perspective assignment using index
      const perspective = PERSPECTIVE_ANCHORS[index % PERSPECTIVE_ANCHORS.length]!;
      agentPerspectiveMap.set(agent.id, perspective);
    });

    // Create context with round state bound to it (concurrency-safe)
    const contextWithState: ExpertPanelContext = {
      ...context,
      _expertPanelState: {
        agentPerspectiveMap,
      },
    };

    return this.executeParallel(agents, contextWithState, toolkit);
  }

  /**
   * Transform context to inject the agent's assigned perspective.
   * Hook implementation for BaseModeStrategy.
   *
   * This adds perspective-specific guidance to the existing modePrompt
   * (which was already set by the base class executeParallel).
   */
  protected override transformContext(
    context: DebateContext,
    agent: BaseAgent
  ): ExpertPanelContext {
    const state = (context as ExpertPanelContext)._expertPanelState;
    const perspective = state?.agentPerspectiveMap.get(agent.id);

    // Only add perspective-specific additions to existing modePrompt
    const perspectiveAddition = perspective
      ? this.buildPerspectiveAddition(perspective)
      : '';

    const transformedContext: ExpertPanelContext = {
      ...context,
      _agentPerspective: perspective,
      modePrompt: (context.modePrompt || '') + perspectiveAddition,
    };
    return transformedContext;
  }

  /**
   * Build perspective-specific prompt addition.
   * This is appended to the base modePrompt, not a replacement.
   */
  private buildPerspectiveAddition(perspective: Perspective): string {
    const perspectiveOverrides = PERSPECTIVE_ROLE_ANCHORS[perspective];
    const perspectiveDescription = PERSPECTIVE_DESCRIPTIONS[perspective];
    const capitalizedPerspective = perspective.charAt(0).toUpperCase() + perspective.slice(1);

    return `

---
## Expert Panel (${capitalizedPerspective} Perspective)

${perspectiveOverrides.emoji || '🎓'} ${perspectiveOverrides.title || 'DOMAIN EXPERT'}

${perspectiveOverrides.definition || ''}

${perspectiveDescription}

${perspectiveOverrides.additionalContext || ''}

**Perspective-Specific Requirements:**
- MUST analyze from the ${perspective.toUpperCase()} perspective

**Perspective-Specific Verification:**
- Did I analyze primarily from the ${perspective} perspective?
- Did I provide expertise specific to ${perspective} considerations?
`;
  }

  /**
   * Build expert-panel base prompt
   *
   * This provides the generic expert panel context. Perspective-specific
   * content (technical/economic/ethical/social) is added by transformContext.
   *
   * Encourages agents to:
   * - Provide professional expert analysis
   * - Cite evidence and sources
   * - Stay within their domain expertise
   * - Be objective and measured
   */
  buildAgentPrompt(context: DebateContext): string {
    return buildModePrompt(EXPERT_PANEL_CONFIG, context);
  }
}
