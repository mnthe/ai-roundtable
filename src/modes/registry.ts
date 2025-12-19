/**
 * Mode Registry - Manages available debate modes
 */

import type { DebateModeStrategy } from './base.js';
import type { DebateMode } from '../types/index.js';
import { CollaborativeMode } from './collaborative.js';
import { AdversarialMode } from './adversarial.js';
import { SocraticMode } from './socratic.js';
import { ExpertPanelMode } from './expert-panel.js';

/**
 * Registry for debate mode strategies
 *
 * Manages the registration and retrieval of debate modes.
 * Use this to:
 * - Register new debate mode strategies
 * - Get mode instances by name
 * - List available modes
 */
export class ModeRegistry {
  private modes: Map<DebateMode, DebateModeStrategy> = new Map();

  /**
   * Create a new mode registry with default modes
   */
  constructor() {
    this.registerDefaultModes();
  }

  /**
   * Register default debate modes
   */
  private registerDefaultModes(): void {
    this.registerMode('collaborative', new CollaborativeMode());
    this.registerMode('adversarial', new AdversarialMode());
    this.registerMode('socratic', new SocraticMode());
    this.registerMode('expert-panel', new ExpertPanelMode());
  }

  /**
   * Register a debate mode strategy
   *
   * @example
   * registry.registerMode('adversarial', new AdversarialMode());
   */
  registerMode(mode: DebateMode, strategy: DebateModeStrategy): void {
    this.modes.set(mode, strategy);
  }

  /**
   * Get a mode strategy by name
   *
   * @throws Error if mode is not registered
   */
  getMode(mode: DebateMode): DebateModeStrategy {
    const strategy = this.modes.get(mode);
    if (!strategy) {
      throw new Error(
        `Debate mode "${mode}" is not registered. ` +
          `Available modes: ${this.getAvailableModes().join(', ')}`
      );
    }
    return strategy;
  }

  /**
   * Check if a mode is registered
   */
  hasMode(mode: DebateMode): boolean {
    return this.modes.has(mode);
  }

  /**
   * Get list of available mode names
   */
  getAvailableModes(): DebateMode[] {
    return Array.from(this.modes.keys());
  }

  /**
   * Remove a mode (useful for testing or dynamic mode management)
   */
  removeMode(mode: DebateMode): boolean {
    return this.modes.delete(mode);
  }

  /**
   * Clear all modes (useful for testing)
   */
  clear(): void {
    this.modes.clear();
  }

  /**
   * Reset to default modes (useful for testing)
   */
  reset(): void {
    this.clear();
    this.registerDefaultModes();
  }
}

/**
 * Global singleton registry instance
 */
let globalModeRegistry: ModeRegistry | null = null;

/**
 * Get the global mode registry instance
 */
export function getGlobalModeRegistry(): ModeRegistry {
  if (!globalModeRegistry) {
    globalModeRegistry = new ModeRegistry();
  }
  return globalModeRegistry;
}

/**
 * Reset the global mode registry (for testing)
 */
export function resetGlobalModeRegistry(): void {
  globalModeRegistry = null;
}
