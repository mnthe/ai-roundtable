/**
 * Debate Modes - Export all mode-related functionality
 */

export type { DebateModeStrategy } from './base.js';
export { CollaborativeMode } from './collaborative.js';
export { AdversarialMode } from './adversarial.js';
export { SocraticMode } from './socratic.js';
export { ExpertPanelMode } from './expert-panel.js';
export {
  ModeRegistry,
  getGlobalModeRegistry,
  resetGlobalModeRegistry,
} from './registry.js';
