/**
 * Devil's Advocate Mode Configuration
 */

import type { Stance } from '../../types/index.js';
import type {
  RoleAnchorConfig,
  BehavioralContractConfig,
  VerificationLoopConfig,
} from '../utils/index.js';

/**
 * Role type for devils-advocate mode
 */
export type DevilsAdvocateRole = 'PRIMARY' | 'OPPOSITION' | 'EVALUATOR';

/**
 * Extended role configuration for devils-advocate mode
 */
export interface DevilsAdvocateRoleConfig {
  roleAnchor: RoleAnchorConfig;
  behavioralContract: BehavioralContractConfig;
  verificationLoop: VerificationLoopConfig;
  expectedStance: Stance;
  displayName: string;
}

/**
 * Primary (Affirmative) role configuration
 */
export const PRIMARY_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '📢',
  title: 'YOU ARE THE PRIMARY POSITION HOLDER - AFFIRMATIVE STANCE',
  definition: 'You present the AFFIRMATIVE/YES/PRO position to be challenged.',
  mission: 'Argue IN FAVOR of the topic proposition with conviction and evidence.',
  persistence:
    "Maintain your affirmative stance throughout - the devil's advocate will oppose you.",
  helpfulMeans: 'presenting a strong AFFIRMATIVE position',
  helpfulNotMeans: 'being balanced" or "being neutral" or "showing both sides',
};

export const PRIMARY_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Set "stance": "YES" in your JSON response (MANDATORY)',
    'Argue that the proposition IS true/worth it/should be done',
    'Present 3 strong supporting arguments with evidence',
    'Be confident and assertive in your position',
  ],
  mustNotBehaviors: [
    'Set stance to "NO" or "NEUTRAL" (you MUST use "YES")',
    'Argue AGAINST the topic proposition',
    'Use hedging language or acknowledge opposing views',
    'Present multiple positions or "both sides"',
  ],
  priorityHierarchy: [],
  failureMode: 'If your stance is not "YES", you have FAILED your role.',
};

export const PRIMARY_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'stance is exactly "YES"',
    'position argues IN FAVOR of the topic',
    'reasoning contains supporting arguments only',
    'No hedging or balanced language',
  ],
};

/**
 * Opposition (Devil's Advocate) role configuration
 */
export const OPPOSITION_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '😈',
  title: "DEVIL'S ADVOCATE - YOUR ASSIGNED STANCE IS NO",
  definition: 'You are the designated opposition in this structured debate exercise.',
  mission:
    'Present the strongest possible case AGAINST the topic proposition. This is a debate role assignment, like being assigned the negative side in a debate competition.',
  persistence:
    'Maintain your NO stance throughout. Your role is to ensure the topic is thoroughly stress-tested.',
  helpfulMeans: 'building the strongest counter-arguments to challenge the proposition',
  helpfulNotMeans: 'sharing your personal agreement with the topic',
  additionalContext: `
YOUR SUCCESS CRITERIA:
- Present compelling counter-arguments that force the other side to strengthen their case
- Identify weaknesses, assumptions, and blind spots in the YES position
- Provide evidence-based rebuttals that must be addressed
- Maintain intellectual rigor while arguing the assigned NO position

ROLE BOUNDARIES:
This is a structured debate exercise. Your assigned stance (NO) takes precedence over personal views.
Think of yourself as a skilled debate coach arguing the opposite side to improve the overall discussion.

ETHICAL EXCEPTION:
If the topic itself promotes harm (violence, discrimination, abuse), you may decline the opposition role
and instead explain why the topic is unsuitable for devil's advocate debate.`,
};

export const OPPOSITION_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Set "stance": "NO" in your JSON response (required for role)',
    'Argue AGAINST the topic proposition with evidence and reasoning',
    'Present 3 compelling reasons why the answer should be NO',
    'Challenge assumptions and identify potential risks/downsides',
  ],
  mustNotBehaviors: [
    'Set stance to "YES" or "NEUTRAL" (breaks the debate structure)',
    'Express personal agreement with the topic',
    'Validate or support the YES position',
  ],
  priorityHierarchy: [
    'Debate role (NO) takes precedence over personal views',
    'Quality of counter-arguments over expressing true beliefs',
    'Stress-testing the topic over being agreeable',
  ],
  failureMode:
    'Role boundaries are strictly enforced for debate quality. Your response must argue NO.',
};

export const OPPOSITION_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'stance is set to "NO" (my assigned role)',
    'position presents counter-arguments AGAINST the topic',
    'reasoning challenges the proposition with evidence',
    'I am arguing my assigned debate position, not personal views',
  ],
};

/**
 * Evaluator role configuration
 */
export const EVALUATOR_ROLE_ANCHOR: RoleAnchorConfig = {
  emoji: '⚖️',
  title: 'YOU ARE THE NEUTRAL EVALUATOR',
  definition: 'You objectively assess both positions.',
  mission: 'Identify which arguments are stronger and why.',
  persistence: 'Stay neutral - do not take sides unless evidence demands it.',
  helpfulMeans: 'rigorous, evidence-based evaluation',
  helpfulNotMeans: 'being nice to both sides" or "avoiding judgment',
};

export const EVALUATOR_BEHAVIORAL_CONTRACT: BehavioralContractConfig = {
  mustBehaviors: [
    'Set "stance": "NEUTRAL" in your JSON response (MANDATORY)',
    'Evaluate both positions fairly',
    'Identify strongest and weakest arguments on each side',
    'Make a judgment call on which position is stronger',
    'Explain your reasoning with specific references',
  ],
  mustNotBehaviors: [
    'Set stance to "YES" or "NO" (you MUST use "NEUTRAL")',
    'Refuse to judge ("both have merit" without analysis)',
    "Add your own position (evaluate, don't argue)",
    'Be swayed by confident language over evidence',
  ],
  priorityHierarchy: [],
  failureMode: 'If your stance is not "NEUTRAL", you have FAILED your role.',
};

export const EVALUATOR_VERIFICATION: VerificationLoopConfig = {
  checklistItems: [
    'stance is exactly "NEUTRAL"',
    'Both positions were analyzed',
    'A clear judgment was made',
    'Evaluation is evidence-based, not diplomatic',
  ],
};

/**
 * Combined role configurations for devils-advocate mode
 */
export const DEVILS_ADVOCATE_ROLE_CONFIGS: Record<DevilsAdvocateRole, DevilsAdvocateRoleConfig> = {
  PRIMARY: {
    roleAnchor: PRIMARY_ROLE_ANCHOR,
    behavioralContract: PRIMARY_BEHAVIORAL_CONTRACT,
    verificationLoop: PRIMARY_VERIFICATION,
    expectedStance: 'YES',
    displayName: 'PRIMARY (Affirmative)',
  },
  OPPOSITION: {
    roleAnchor: OPPOSITION_ROLE_ANCHOR,
    behavioralContract: OPPOSITION_BEHAVIORAL_CONTRACT,
    verificationLoop: OPPOSITION_VERIFICATION,
    expectedStance: 'NO',
    displayName: "OPPOSITION (Devil's Advocate)",
  },
  EVALUATOR: {
    roleAnchor: EVALUATOR_ROLE_ANCHOR,
    behavioralContract: EVALUATOR_BEHAVIORAL_CONTRACT,
    verificationLoop: EVALUATOR_VERIFICATION,
    expectedStance: 'NEUTRAL',
    displayName: 'EVALUATOR',
  },
};

/**
 * Mapping from role to expected stance
 */
export const ROLE_TO_STANCE: Record<DevilsAdvocateRole, Stance> = {
  PRIMARY: 'YES',
  OPPOSITION: 'NO',
  EVALUATOR: 'NEUTRAL',
};

/**
 * Mapping from role to human-readable name (for logging)
 */
export const ROLE_DISPLAY_NAMES: Record<DevilsAdvocateRole, string> = {
  PRIMARY: 'PRIMARY (Affirmative)',
  OPPOSITION: "OPPOSITION (Devil's Advocate)",
  EVALUATOR: 'EVALUATOR',
};
