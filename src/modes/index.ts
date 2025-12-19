/**
 * Debate Modes - Export all mode-related functionality
 */

export type { DebateModeStrategy } from './base.js';
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
