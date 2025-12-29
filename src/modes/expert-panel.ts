/**
 * Expert Panel Debate Mode
 *
 * In expert-panel mode, each agent acts as an independent expert
 * providing their professional assessment without necessarily
 * engaging with other panelists' opinions.
 *
 * Each agent is assigned a specific perspective (custom or generated)
 * using round-robin assignment to ensure comprehensive multi-viewpoint analysis.
 *
 * Features:
 * - Custom perspectives via API input
 * - Auto-generated perspectives via Light Model when not provided
 * - Enhanced prompts with perspective differentiation
 * - Round-based behavior evolution
 */

import { BaseModeStrategy } from './base.js';
import type { BaseAgent, AgentToolkit } from '../agents/base.js';
import type { DebateContext, AgentResponse, GeneratedPerspective } from '../types/index.js';
import { buildModePrompt, createOutputSections, type ModePromptConfig } from './utils/index.js';
import {
  EXPERT_PANEL_CONFIG,
  PERSPECTIVE_ANCHORS,
  PERSPECTIVE_DESCRIPTIONS,
  type Perspective as LegacyPerspective,
} from './configs/index.js';

// Re-export for backward compatibility
export { PERSPECTIVE_ANCHORS, PERSPECTIVE_DESCRIPTIONS, type LegacyPerspective as Perspective };

/**
 * Extended context for expert-panel mode with agent perspective tracking
 * and concurrency-safe round state
 */
interface ExpertPanelContext extends DebateContext {
  /** Current agent's assigned perspective */
  _agentPerspective?: GeneratedPerspective;
  /** Index of the current agent (for perspective assignment) */
  _agentIndex?: number;
  /** Concurrency-safe round state (bound to context, not instance) */
  _expertPanelState?: {
    /** Map of agent IDs to their assigned perspectives for this round */
    agentPerspectiveMap: Map<string, GeneratedPerspective>;
    /** Map of agent IDs to their index for round-based behavior */
    agentIndexMap: Map<string, number>;
  };
}

/**
 * Get default GeneratedPerspective from legacy fixed perspectives
 */
function getDefaultPerspectives(): GeneratedPerspective[] {
  return PERSPECTIVE_ANCHORS.map((anchor) => ({
    name: anchor.charAt(0).toUpperCase() + anchor.slice(1) + ' perspective',
    description: PERSPECTIVE_DESCRIPTIONS[anchor],
    focusAreas: [],
    evidenceTypes: [],
    keyQuestions: [],
    antiPatterns: [],
  }));
}

/**
 * Expert Panel mode strategy
 *
 * Characteristics:
 * - Each agent provides independent expert assessment
 * - Each agent is assigned a specific perspective (custom, generated, or default)
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
    // Get perspectives from context or use defaults
    const perspectives = context.perspectives ?? getDefaultPerspectives();

    // Build perspective map for this round (context-bound, not instance-bound)
    const agentPerspectiveMap = new Map<string, GeneratedPerspective>();
    const agentIndexMap = new Map<string, number>();

    agents.forEach((agent, index) => {
      // Round-robin perspective assignment using index
      const perspective = perspectives[index % perspectives.length]!;
      agentPerspectiveMap.set(agent.id, perspective);
      agentIndexMap.set(agent.id, index);
    });

    // Create context with round state bound to it (concurrency-safe)
    const contextWithState: ExpertPanelContext = {
      ...context,
      _expertPanelState: {
        agentPerspectiveMap,
        agentIndexMap,
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
    const agentIndex = state?.agentIndexMap.get(agent.id) ?? 0;

    // Get all perspectives for differentiation prompt
    const allPerspectives = context.perspectives ?? getDefaultPerspectives();

    // Build perspective-specific additions to existing modePrompt
    const perspectiveAddition = perspective
      ? this.buildPerspectiveAddition(perspective, allPerspectives, context.currentRound)
      : '';

    const transformedContext: ExpertPanelContext = {
      ...context,
      _agentPerspective: perspective,
      _agentIndex: agentIndex,
      modePrompt: (context.modePrompt || '') + perspectiveAddition,
    };
    return transformedContext;
  }

  /**
   * Build perspective-specific prompt addition with differentiation.
   * This is appended to the base modePrompt, not a replacement.
   */
  private buildPerspectiveAddition(
    perspective: GeneratedPerspective,
    allPerspectives: GeneratedPerspective[],
    currentRound: number
  ): string {
    const otherPerspectives = allPerspectives
      .filter((p) => p.name !== perspective.name)
      .map((p) => p.name);

    // Round-based role description
    const roundContext = this.buildRoundContext(perspective, currentRound);

    // Evidence standards (only if we have evidence types)
    const evidenceSection = this.buildEvidenceSection(perspective);

    return `

---
## Your Perspective Assignment

You are analyzing from: **${perspective.name}**
${perspective.description ? `\n${perspective.description}\n` : ''}
Other panelists cover: ${otherPerspectives.join(', ')}

**Critical Rules:**
- DO NOT analyze areas belonging to other perspectives
- If referencing another domain, state "This is outside my expertise, but..."
- Your value = DEPTH in your perspective, not BREADTH across all

${roundContext}
${evidenceSection}
**Perspective-Specific Verification:**
- Did I analyze primarily from the ${perspective.name}?
- Did I provide expertise specific to this perspective?
- Does my UNIQUE INSIGHT offer something others genuinely cannot?
- Did I honestly acknowledge my BLIND SPOTS?
- Am I providing depth in MY area, not shallow coverage of all?
`;
  }

  /**
   * Build round-specific context for the perspective
   */
  private buildRoundContext(perspective: GeneratedPerspective, currentRound: number): string {
    if (currentRound === 1) {
      const focusAreasText =
        perspective.focusAreas.length > 0
          ? `Focus areas: ${perspective.focusAreas.join(', ')}`
          : '';
      const keyQuestionsText =
        perspective.keyQuestions.length > 0
          ? `Key questions to address: ${perspective.keyQuestions.join('; ')}`
          : '';

      return `
### Round 1: Establishing Position

Other experts have NOT yet spoken.
Your job: Establish what ${perspective.name} uniquely reveals.
Do NOT hedge or anticipate others - state your perspective clearly.
${focusAreasText}
${keyQuestionsText}
`;
    } else {
      const focusAreasText =
        perspective.focusAreas.length > 0
          ? `Maintain focus on: ${perspective.focusAreas.join(', ')}`
          : '';

      return `
### Round ${currentRound}: Synthesis Mode

You have seen other perspectives.
Your job:
1. Acknowledge valid points from other perspectives
2. Defend/refine what makes YOUR perspective essential
3. Identify where perspectives complement or conflict
4. Propose synthesis where possible
${focusAreasText}
`;
    }
  }

  /**
   * Build evidence standards section for generated perspectives
   */
  private buildEvidenceSection(perspective: GeneratedPerspective): string {
    if (perspective.evidenceTypes.length === 0 && perspective.antiPatterns.length === 0) {
      return '';
    }

    let section = `
### Evidence Standards for ${perspective.name}
`;

    if (perspective.evidenceTypes.length > 0) {
      section += `
Acceptable evidence types:
${perspective.evidenceTypes.map((e) => `- ${e}`).join('\n')}
`;
    }

    if (perspective.antiPatterns.length > 0) {
      section += `
What NOT to do:
${perspective.antiPatterns.map((a) => `- ${a}`).join('\n')}
`;
    }

    return section;
  }

  /**
   * Build expert-panel base prompt
   *
   * This provides the generic expert panel context. Perspective-specific
   * content is added by transformContext based on assigned/generated perspectives.
   *
   * Encourages agents to:
   * - Provide professional expert analysis
   * - Cite evidence and sources
   * - Stay within their domain expertise
   * - Be objective and measured
   */
  buildAgentPrompt(context: DebateContext): string {
    // Use enhanced config for generated perspectives
    const hasGeneratedPerspectives =
      context.perspectives &&
      context.perspectives.length > 0 &&
      context.perspectives.some((p) => p.focusAreas.length > 0);

    if (hasGeneratedPerspectives) {
      return buildModePrompt(this.getEnhancedConfig(context.currentRound), context);
    }

    return buildModePrompt(EXPERT_PANEL_CONFIG, context);
  }

  /**
   * Get enhanced config with updated sections and verification for generated perspectives
   */
  private getEnhancedConfig(_currentRound: number): ModePromptConfig {
    return {
      ...EXPERT_PANEL_CONFIG,
      structuralEnforcement: {
        firstRoundSections: createOutputSections([
          ['[ANALYTICAL FRAMEWORK]', "The lens/methodology you're using"],
          ['[UNIQUE INSIGHT]', 'What ONLY this perspective can reveal (others cannot see this)'],
          ['[KEY FINDINGS]', 'Main conclusions from your expertise'],
          ['[BLIND SPOTS]', 'What this perspective CANNOT adequately address (be honest)'],
          ['[CONFIDENCE & LIMITATIONS]', 'Certainty levels and knowledge gaps'],
        ]),
        subsequentRoundSections: createOutputSections([
          ['[PERSPECTIVE UPDATE]', 'How other perspectives informed/challenged your view'],
          ['[UNIQUE INSIGHT]', 'New insights only YOUR perspective provides'],
          ['[REVISED FINDINGS]', 'Updated conclusions incorporating other views'],
          ['[REMAINING BLIND SPOTS]', 'What your perspective still cannot address'],
          ['[CROSS-PERSPECTIVE SYNTHESIS]', 'How your view connects with others'],
        ]),
      },
      verificationLoop: {
        checklistItems: [
          // Existing checks
          'Is every major claim supported by evidence or reasoning?',
          'Did I clearly state my confidence levels?',
          'Did I acknowledge limitations and uncertainties?',
          // New checks for perspective differentiation
          'Does my UNIQUE INSIGHT offer something others genuinely cannot?',
          'Did I honestly acknowledge my BLIND SPOTS?',
          'Am I providing depth in MY area, not shallow coverage of all?',
          'Did I stay focused on my assigned perspective?',
        ],
      },
    };
  }
}
