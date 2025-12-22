/**
 * Mode Configurations - Barrel Export
 *
 * This module exports all mode-specific prompt configurations.
 */

// Collaborative mode
export { COLLABORATIVE_CONFIG } from './collaborative.config.js';

// Adversarial mode
export { ADVERSARIAL_CONFIG } from './adversarial.config.js';

// Socratic mode
export { SOCRATIC_CONFIG } from './socratic.config.js';

// Expert Panel mode
export {
  EXPERT_PANEL_CONFIG,
  PERSPECTIVE_ANCHORS,
  PERSPECTIVE_DESCRIPTIONS,
  PERSPECTIVE_ROLE_ANCHORS,
  type Perspective,
} from './expert-panel.config.js';

// Delphi mode
export {
  DELPHI_ROLE_ANCHOR,
  DELPHI_BEHAVIORAL_CONTRACT,
  DELPHI_VERIFICATION_LOOP,
  DELPHI_FOCUS_QUESTION,
  DELPHI_FIRST_ROUND_SECTIONS,
  DELPHI_SUBSEQUENT_ROUND_SECTIONS,
} from './delphi.config.js';

// Devils Advocate mode
export {
  PRIMARY_ROLE_ANCHOR,
  PRIMARY_BEHAVIORAL_CONTRACT,
  PRIMARY_VERIFICATION,
  OPPOSITION_ROLE_ANCHOR,
  OPPOSITION_BEHAVIORAL_CONTRACT,
  OPPOSITION_VERIFICATION,
  EVALUATOR_ROLE_ANCHOR,
  EVALUATOR_BEHAVIORAL_CONTRACT,
  EVALUATOR_VERIFICATION,
  DEVILS_ADVOCATE_ROLE_CONFIGS,
  ROLE_TO_STANCE,
  ROLE_DISPLAY_NAMES,
  type DevilsAdvocateRole,
  type DevilsAdvocateRoleConfig,
} from './devils-advocate.config.js';

// Red Team Blue Team mode
export {
  RED_TEAM_ROLE_ANCHOR,
  RED_TEAM_BEHAVIORAL_CONTRACT,
  RED_TEAM_VERIFICATION,
  RED_TEAM_OUTPUT_SECTIONS,
  BLUE_TEAM_ROLE_ANCHOR,
  BLUE_TEAM_BEHAVIORAL_CONTRACT,
  BLUE_TEAM_VERIFICATION,
  BLUE_TEAM_OUTPUT_SECTIONS,
  TEAM_CONFIGS,
  type Team,
  type TeamConfig,
} from './red-team-blue-team.config.js';
