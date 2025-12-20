/**
 * Prompt Builder Utilities
 *
 * Provides shared utilities for building mode-specific prompts.
 * Implements the 4-layer prompt structure used across all debate modes.
 */

import type { DebateContext, AgentResponse } from '../../types/index.js';

/**
 * Configuration for the Role Anchor layer (Layer 1)
 */
export interface RoleAnchorConfig {
  /** Emoji icon for the role (e.g., "🤝", "⚔️") */
  emoji: string;
  /** Title of the role in uppercase (e.g., "COLLABORATIVE SYNTHESIZER") */
  title: string;
  /** Definition of the role */
  definition: string;
  /** Mission statement */
  mission: string;
  /** Persistence instruction */
  persistence: string;
  /** What "being helpful" means in this mode */
  helpfulMeans: string;
  /** What "being helpful" does NOT mean */
  helpfulNotMeans: string;
  /** Optional additional context line */
  additionalContext?: string;
}

/**
 * Configuration for the Behavioral Contract layer (Layer 2)
 */
export interface BehavioralContractConfig {
  /** List of required behaviors (MUST) */
  mustBehaviors: string[];
  /** List of prohibited behaviors (MUST NOT) */
  mustNotBehaviors: string[];
  /** Priority hierarchy items (ordered by importance) */
  priorityHierarchy: string[];
  /** Failure mode description */
  failureMode: string;
}

/**
 * Configuration for a single output structure section
 */
export interface OutputSection {
  /** Section header (e.g., "[POINTS OF AGREEMENT]") */
  header: string;
  /** Description of what goes in this section */
  description: string;
}

/**
 * Configuration for the Structural Enforcement layer (Layer 3)
 */
export interface StructuralEnforcementConfig {
  /** Output sections for first round */
  firstRoundSections: OutputSection[];
  /** Output sections for subsequent rounds */
  subsequentRoundSections: OutputSection[];
  /** Optional prefix text before the output structure */
  prefix?: string;
  /** Optional suffix text after the output structure */
  suffix?: string;
}

/**
 * Configuration for the Verification Loop layer (Layer 4)
 */
export interface VerificationLoopConfig {
  /** Verification checklist items */
  checklistItems: string[];
}

/**
 * Configuration for the Focus Question section
 */
export interface FocusQuestionConfig {
  /** Instructions for addressing the focus question */
  instructions: string;
}

/**
 * Complete prompt configuration for a mode
 */
export interface ModePromptConfig {
  /** Mode display name (e.g., "Collaborative Discussion") */
  modeName: string;
  /** Role anchor configuration */
  roleAnchor: RoleAnchorConfig;
  /** Behavioral contract configuration */
  behavioralContract: BehavioralContractConfig;
  /** Structural enforcement configuration */
  structuralEnforcement: StructuralEnforcementConfig;
  /** Verification loop configuration */
  verificationLoop: VerificationLoopConfig;
  /** Focus question configuration */
  focusQuestion: FocusQuestionConfig;
}

/**
 * Separator line used in prompts
 */
const SEPARATOR = '═══════════════════════════════════════════════════════════════════';

/**
 * Build the Role Anchor layer (Layer 1)
 */
export function buildRoleAnchor(config: RoleAnchorConfig): string {
  let prompt = `
${SEPARATOR}
LAYER 1: ROLE ANCHOR
${SEPARATOR}

${config.emoji} ${config.title} ${config.emoji}

ROLE DEFINITION: ${config.definition}
MISSION: ${config.mission}
PERSISTENCE: ${config.persistence}

In this mode, "being helpful" = "${config.helpfulMeans}"
NOT "${config.helpfulNotMeans}"
`;

  if (config.additionalContext) {
    prompt += `
${config.additionalContext}
`;
  }

  return prompt;
}

/**
 * Build the Behavioral Contract layer (Layer 2)
 */
export function buildBehavioralContract(config: BehavioralContractConfig): string {
  const mustItems = config.mustBehaviors.map((b) => `□ ${b}`).join('\n');
  const mustNotItems = config.mustNotBehaviors.map((b) => `✗ ${b}`).join('\n');
  const priorities = config.priorityHierarchy
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n');

  return `
${SEPARATOR}
LAYER 2: BEHAVIORAL CONTRACT
${SEPARATOR}

MUST (Required Behaviors):
${mustItems}

MUST NOT (Prohibited Behaviors):
${mustNotItems}

PRIORITY HIERARCHY:
${priorities}

⛔ FAILURE MODE: ${config.failureMode}
`;
}

/**
 * Build a single output section
 */
function buildOutputSection(section: OutputSection): string {
  return `${section.header}
(${section.description})
`;
}

/**
 * Build the Structural Enforcement layer (Layer 3)
 */
export function buildStructuralEnforcement(
  config: StructuralEnforcementConfig,
  context: DebateContext
): string {
  const isFirstRound = context.previousResponses.length === 0;
  const sections = isFirstRound
    ? config.firstRoundSections
    : config.subsequentRoundSections;

  const roundLabel = isFirstRound ? ' (First Round)' : '';

  let prompt = `
${SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${SEPARATOR}

`;

  if (config.prefix) {
    prompt += `${config.prefix}\n`;
  }

  prompt += `REQUIRED OUTPUT STRUCTURE${roundLabel}:

`;

  for (const section of sections) {
    prompt += buildOutputSection(section) + '\n';
  }

  if (config.suffix) {
    prompt += config.suffix;
  }

  return prompt;
}

/**
 * Build the Verification Loop layer (Layer 4)
 */
export function buildVerificationLoop(config: VerificationLoopConfig): string {
  const checkItems = config.checklistItems.map((item) => `□ ${item}`).join('\n');

  return `
${SEPARATOR}
LAYER 4: VERIFICATION LOOP
${SEPARATOR}

Before finalizing your response, verify:
${checkItems}

If any check fails, revise before submitting.
`;
}

/**
 * Build the Focus Question section
 */
export function buildFocusQuestionSection(
  context: DebateContext,
  config: FocusQuestionConfig
): string {
  if (!context.focusQuestion) {
    return '';
  }

  return `
${SEPARATOR}
FOCUS QUESTION: ${context.focusQuestion}
${SEPARATOR}

${config.instructions}
`;
}

/**
 * Build a complete mode prompt from configuration
 */
export function buildModePrompt(config: ModePromptConfig, context: DebateContext): string {
  let prompt = `
Mode: ${config.modeName}
`;

  prompt += buildRoleAnchor(config.roleAnchor);
  prompt += buildBehavioralContract(config.behavioralContract);
  prompt += buildStructuralEnforcement(config.structuralEnforcement, context);
  prompt += buildVerificationLoop(config.verificationLoop);
  prompt += buildFocusQuestionSection(context, config.focusQuestion);

  return prompt;
}

/**
 * Format previous responses for display in prompts
 *
 * Creates a structured summary of previous responses that can be
 * included in context for agents.
 */
export function formatPreviousResponses(responses: AgentResponse[]): string {
  if (responses.length === 0) {
    return '';
  }

  let formatted = 'Previous Responses:\n\n';

  for (const response of responses) {
    formatted += `--- ${response.agentName} ---\n`;
    formatted += `Position: ${response.position}\n`;
    formatted += `Confidence: ${(response.confidence * 100).toFixed(0)}%\n`;
    if (response.reasoning) {
      // Truncate long reasoning to first 500 chars
      const truncatedReasoning =
        response.reasoning.length > 500
          ? response.reasoning.substring(0, 500) + '...'
          : response.reasoning;
      formatted += `Reasoning: ${truncatedReasoning}\n`;
    }
    formatted += '\n';
  }

  return formatted;
}

/**
 * Build round-specific context information
 *
 * Provides context about the current round that can be appended
 * to prompts for non-first rounds.
 */
export function buildRoundContext(context: DebateContext): string {
  if (context.currentRound === 1) {
    return '';
  }

  return `
ROUND ${context.currentRound} OF ${context.totalRounds}:
Build upon the previous discussion. Reference and respond to points raised earlier.
`;
}

/**
 * Create output sections from simple string arrays
 *
 * Utility for creating OutputSection arrays from header/description pairs.
 */
export function createOutputSections(
  sections: Array<[header: string, description: string]>
): OutputSection[] {
  return sections.map(([header, description]) => ({ header, description }));
}
