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
import { buildModePrompt } from './utils/index.js';
import {
  EXPERT_PANEL_CONFIG,
  PERSPECTIVE_ANCHORS,
  PERSPECTIVE_DESCRIPTIONS,
  PERSPECTIVE_ROLE_ANCHORS,
  type Perspective,
} from './configs/index.js';

// Re-export for backward compatibility
export { PERSPECTIVE_ANCHORS, PERSPECTIVE_DESCRIPTIONS, type Perspective };

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
