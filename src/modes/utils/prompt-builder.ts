/**
 * Prompt Builder Utilities
 *
 * Provides shared utilities for building mode-specific prompts.
 * Implements the 4-layer prompt structure used across all debate modes.
 */

import type { DebateContext, DebateMode } from '../../types/index.js';
import { getToolGuidanceForMode, getToolPolicy, isSequentialMode } from '../tool-policy.js';
import { PROMPT_SEPARATOR } from './constants.js';

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
  /** Whether to include tool usage requirements (default: true) */
  includeToolUsageRequirements?: boolean;
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
  /** Whether to include common tool usage verification checks (default: true) */
  includeToolUsageChecks?: boolean;
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
 * Tool usage requirements for Layer 2 Behavioral Contract
 * These are added automatically unless explicitly disabled.
 */
export const TOOL_USAGE_MUST_BEHAVIORS = [
  'Use search_web or fact_check tool for ANY factual claim',
  'Cite sources from tool results in your response',
  'Verify statistics and recent events with tools before stating',
] as const;

export const TOOL_USAGE_MUST_NOT_BEHAVIORS = [
  'Make factual claims without tool-based verification',
  'State statistics or data without source citation',
] as const;

/**
 * Common verification checks for Layer 4
 * These include tool usage verification.
 */
export const COMMON_TOOL_VERIFICATION_CHECKS = [
  'Did I use tools (search_web, fact_check) to verify factual claims?',
  'Did I cite sources from tool results?',
] as const;

/**
 * Mode-specific verification checks for Layer 4
 */
export const MODE_SPECIFIC_VERIFICATION_CHECKS: Partial<Record<DebateMode, readonly string[]>> = {
  'devils-advocate': [
    'Did I explicitly include my stance (YES/NO/NEUTRAL) in the response?',
    'Does my reasoning support my assigned stance?',
  ],
  'expert-panel': [
    'Did I analyze from my assigned perspective?',
    'Did I acknowledge limitations and knowledge gaps?',
  ],
  collaborative: [
    'Did I identify specific points of agreement with others?',
    "Did I build on others' ideas constructively?",
  ],
  adversarial: [
    'Did I directly address and counter the previous arguments?',
    'Did I avoid simply restating my position without engagement?',
  ],
  socratic: [
    'Did I pose meaningful questions that deepen understanding?',
    'Did I respond substantively to questions asked?',
  ],
  delphi: [
    'Did I provide my independent assessment without bias from others?',
    'Did I clearly state my confidence level?',
  ],
  'red-team-blue-team': [
    'Did I stay true to my assigned team role (attack/defense)?',
    'Did I provide concrete evidence for my position?',
  ],
} as const;

/**
 * Build the Role Anchor layer (Layer 1)
 */
export function buildRoleAnchor(config: RoleAnchorConfig): string {
  let prompt = `
${PROMPT_SEPARATOR}
LAYER 1: ROLE ANCHOR
${PROMPT_SEPARATOR}

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
 *
 * @param config - Behavioral contract configuration
 * @param mode - Optional debate mode for mode-aware tool guidance
 */
export function buildBehavioralContract(
  config: BehavioralContractConfig,
  mode?: DebateMode
): string {
  // Combine mode-specific behaviors with tool usage requirements (unless disabled)
  const includeToolUsage = config.includeToolUsageRequirements !== false;

  const allMustBehaviors = includeToolUsage
    ? [...config.mustBehaviors, ...TOOL_USAGE_MUST_BEHAVIORS]
    : config.mustBehaviors;

  const allMustNotBehaviors = includeToolUsage
    ? [...config.mustNotBehaviors, ...TOOL_USAGE_MUST_NOT_BEHAVIORS]
    : config.mustNotBehaviors;

  const mustItems = allMustBehaviors.map((b) => `□ ${b}`).join('\n');
  const mustNotItems = allMustNotBehaviors.map((b) => `✗ ${b}`).join('\n');
  const priorities = config.priorityHierarchy.map((p, i) => `${i + 1}. ${p}`).join('\n');

  let prompt = `
${PROMPT_SEPARATOR}
LAYER 2: BEHAVIORAL CONTRACT
${PROMPT_SEPARATOR}

MUST (Required Behaviors):
${mustItems}

MUST NOT (Prohibited Behaviors):
${mustNotItems}
`;

  // Add priority hierarchy if provided
  if (config.priorityHierarchy.length > 0) {
    prompt += `
PRIORITY HIERARCHY:
${priorities}
`;
  }

  prompt += `
⛔ FAILURE MODE: ${config.failureMode}
`;

  // Add tool usage limits based on mode execution pattern
  if (mode) {
    const toolPolicy = getToolPolicy(mode);
    prompt += `
📊 TOOL USAGE LIMITS:
- Minimum tool calls: ${toolPolicy.minCalls}
- Maximum tool calls: ${toolPolicy.maxCalls}
- ${toolPolicy.guidance}
`;
  }

  // Add sequential mode tool guidance if applicable
  if (mode && isSequentialMode(mode)) {
    const toolGuidance = getToolGuidanceForMode(mode);
    if (toolGuidance) {
      prompt += toolGuidance;
    }
  }

  return prompt;
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
function buildStructuralEnforcement(
  config: StructuralEnforcementConfig,
  context: DebateContext
): string {
  const isFirstRound = context.previousResponses.length === 0;
  const sections = isFirstRound ? config.firstRoundSections : config.subsequentRoundSections;

  const roundLabel = isFirstRound ? ' (First Round)' : '';

  let prompt = `
${PROMPT_SEPARATOR}
LAYER 3: STRUCTURAL ENFORCEMENT
${PROMPT_SEPARATOR}

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
 *
 * @param config - Verification loop configuration
 * @param mode - Optional debate mode for mode-specific verification checks
 */
export function buildVerificationLoop(config: VerificationLoopConfig, mode?: DebateMode): string {
  // Combine mode-specific checks with tool usage checks (unless disabled)
  const includeToolChecks = config.includeToolUsageChecks !== false;

  // Start with provided checklist items
  let allChecks = [...config.checklistItems];

  // Add common tool usage verification checks
  if (includeToolChecks) {
    allChecks = [...allChecks, ...COMMON_TOOL_VERIFICATION_CHECKS];
  }

  // Add mode-specific verification checks
  if (mode && MODE_SPECIFIC_VERIFICATION_CHECKS[mode]) {
    allChecks = [...allChecks, ...MODE_SPECIFIC_VERIFICATION_CHECKS[mode]!];
  }

  const checkItems = allChecks.map((item) => `□ ${item}`).join('\n');

  return `
${PROMPT_SEPARATOR}
LAYER 4: VERIFICATION LOOP
${PROMPT_SEPARATOR}

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
${PROMPT_SEPARATOR}
FOCUS QUESTION: ${context.focusQuestion}
${PROMPT_SEPARATOR}

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
  prompt += buildBehavioralContract(config.behavioralContract, context.mode);
  prompt += buildStructuralEnforcement(config.structuralEnforcement, context);
  prompt += buildVerificationLoop(config.verificationLoop, context.mode);
  prompt += buildFocusQuestionSection(context, config.focusQuestion);

  return prompt;
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
