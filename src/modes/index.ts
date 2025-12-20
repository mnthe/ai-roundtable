/**
 * Debate Modes - Export all mode-related functionality
 */

export { BaseModeStrategy, type DebateModeStrategy } from './base.js';
export { CollaborativeMode } from './collaborative.js';
export { AdversarialMode } from './adversarial.js';
export { SocraticMode } from './socratic.js';
export { ExpertPanelMode } from './expert-panel.js';
export { DevilsAdvocateMode } from './devils-advocate.js';
export { DelphiMode } from './delphi.js';
export { RedTeamBlueTeamMode } from './red-team-blue-team.js';
export {
  ModeRegistry,
  getGlobalModeRegistry,
  resetGlobalModeRegistry,
} from './registry.js';

// Prompt builder utilities
export {
  buildRoleAnchor,
  buildBehavioralContract,
  buildStructuralEnforcement,
  buildVerificationLoop,
  buildFocusQuestionSection,
  buildModePrompt,
  formatPreviousResponses,
  buildRoundContext,
  createOutputSections,
  type RoleAnchorConfig,
  type BehavioralContractConfig,
  type StructuralEnforcementConfig,
  type VerificationLoopConfig,
  type FocusQuestionConfig,
  type ModePromptConfig,
  type OutputSection,
} from './utils/index.js';

// Response validators
export {
  StanceValidator,
  ConfidenceRangeValidator,
  RequiredFieldsValidator,
  ValidatorChain,
  createStanceValidator,
  createConfidenceRangeValidator,
  createRequiredFieldsValidator,
  createValidatorChain,
  type ResponseValidator,
} from './validators/index.js';
