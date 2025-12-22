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
  buildVerificationLoop,
  buildFocusQuestionSection,
  buildModePrompt,
  createOutputSections,
  type RoleAnchorConfig,
  type BehavioralContractConfig,
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

// Tool usage policy
export {
  getToolPolicy,
  getExecutionPattern,
  isSequentialMode,
  isParallelMode,
  getToolGuidanceForMode,
  TOOL_USAGE_POLICIES,
  MODE_EXECUTION_PATTERN,
  SEQUENTIAL_MODE_TOOL_GUIDANCE,
  type ExecutionPattern,
  type ToolUsagePolicy,
} from './tool-policy.js';

// Context processors
export {
  AnonymizationProcessor,
  StatisticsProcessor,
  ProcessorChain,
  createAnonymizationProcessor,
  createStatisticsProcessor,
  createProcessorChain,
  type ContextProcessor,
  type RoundStatistics,
} from './processors/index.js';
