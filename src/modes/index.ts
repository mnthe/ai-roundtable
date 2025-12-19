/**
 * Debate Modes - Export all mode-related functionality
 */

export type { DebateModeStrategy } from './base.js';
export { CollaborativeMode } from './collaborative.js';
export {
  ModeRegistry,
  getGlobalModeRegistry,
  resetGlobalModeRegistry,
} from './registry.js';
