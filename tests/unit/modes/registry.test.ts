import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModeRegistry,
  getGlobalModeRegistry,
  resetGlobalModeRegistry,
} from '../../../src/modes/registry.js';
import { CollaborativeMode } from '../../../src/modes/collaborative.js';
import { AdversarialMode } from '../../../src/modes/adversarial.js';
import { SocraticMode } from '../../../src/modes/socratic.js';
import { ExpertPanelMode } from '../../../src/modes/expert-panel.js';
import type { DebateModeStrategy } from '../../../src/modes/base.js';
import type { DebateMode } from '../../../src/types/index.js';

// All default modes
const DEFAULT_MODES: DebateMode[] = ['collaborative', 'adversarial', 'socratic', 'expert-panel'];

describe('ModeRegistry', () => {
  let registry: ModeRegistry;

  beforeEach(() => {
    registry = new ModeRegistry();
  });

  describe('constructor', () => {
    it('should register all default modes', () => {
      for (const modeName of DEFAULT_MODES) {
        expect(registry.hasMode(modeName)).toBe(true);
        expect(registry.getAvailableModes()).toContain(modeName);
      }
    });

    it('should initialize with correct mode instances', () => {
      expect(registry.getMode('collaborative')).toBeInstanceOf(CollaborativeMode);
      expect(registry.getMode('adversarial')).toBeInstanceOf(AdversarialMode);
      expect(registry.getMode('socratic')).toBeInstanceOf(SocraticMode);
      expect(registry.getMode('expert-panel')).toBeInstanceOf(ExpertPanelMode);
    });
  });

  describe('registerMode', () => {
    it('should register a new mode', () => {
      const mockMode: DebateModeStrategy = {
        name: 'test-mode',
        async executeRound() {
          return [];
        },
        buildAgentPrompt() {
          return 'test prompt';
        },
      };

      registry.registerMode('adversarial' as DebateMode, mockMode);

      expect(registry.hasMode('adversarial' as DebateMode)).toBe(true);
    });

    it('should allow overwriting existing modes', () => {
      const newCollaborativeMode: DebateModeStrategy = {
        name: 'new-collaborative',
        async executeRound() {
          return [];
        },
        buildAgentPrompt() {
          return 'new prompt';
        },
      };

      registry.registerMode('collaborative', newCollaborativeMode);

      const mode = registry.getMode('collaborative');
      expect(mode.name).toBe('new-collaborative');
    });
  });

  describe('getMode', () => {
    it('should get registered mode', () => {
      const mode = registry.getMode('collaborative');
      expect(mode).toBeInstanceOf(CollaborativeMode);
    });

    it('should throw error for unregistered mode', () => {
      // Remove a mode first to test error
      registry.clear();
      expect(() => registry.getMode('collaborative')).toThrow(
        'Debate mode "collaborative" is not registered'
      );
    });

    it('should include available modes in error message', () => {
      registry.clear();
      registry.registerMode('collaborative', new CollaborativeMode());
      expect(() => registry.getMode('invalid' as DebateMode)).toThrow(
        'Available modes: collaborative'
      );
    });
  });

  describe('hasMode', () => {
    it('should return true for registered modes', () => {
      for (const modeName of DEFAULT_MODES) {
        expect(registry.hasMode(modeName)).toBe(true);
      }
    });

    it('should return false for unregistered mode', () => {
      expect(registry.hasMode('invalid' as DebateMode)).toBe(false);
    });
  });

  describe('getAvailableModes', () => {
    it('should return array of all default modes', () => {
      const modes = registry.getAvailableModes();
      expect(modes).toHaveLength(4);
      for (const modeName of DEFAULT_MODES) {
        expect(modes).toContain(modeName);
      }
    });

    it('should include newly registered custom modes', () => {
      const mockMode: DebateModeStrategy = {
        name: 'test',
        async executeRound() {
          return [];
        },
        buildAgentPrompt() {
          return '';
        },
      };

      // Override adversarial with custom implementation
      registry.registerMode('adversarial', mockMode);

      const modes = registry.getAvailableModes();
      expect(modes).toContain('collaborative');
      expect(modes).toContain('adversarial');
      expect(modes).toContain('socratic');
      expect(modes).toContain('expert-panel');
      expect(modes).toHaveLength(4);
    });
  });

  describe('removeMode', () => {
    it('should remove a mode', () => {
      expect(registry.hasMode('collaborative')).toBe(true);

      const removed = registry.removeMode('collaborative');

      expect(removed).toBe(true);
      expect(registry.hasMode('collaborative')).toBe(false);
    });

    it('should return false when removing non-existent mode', () => {
      const removed = registry.removeMode('invalid' as DebateMode);
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all modes', () => {
      expect(registry.getAvailableModes()).toHaveLength(4);

      registry.clear();

      expect(registry.getAvailableModes()).toHaveLength(0);
      for (const modeName of DEFAULT_MODES) {
        expect(registry.hasMode(modeName)).toBe(false);
      }
    });
  });

  describe('reset', () => {
    it('should clear and re-register default modes', () => {
      // Clear all modes
      registry.clear();
      expect(registry.getAvailableModes()).toHaveLength(0);

      // Reset
      registry.reset();

      // Should have all default modes again
      expect(registry.getAvailableModes()).toHaveLength(4);
      for (const modeName of DEFAULT_MODES) {
        expect(registry.hasMode(modeName)).toBe(true);
      }
    });
  });
});

describe('Global Mode Registry', () => {
  beforeEach(() => {
    resetGlobalModeRegistry();
  });

  it('should return singleton instance', () => {
    const registry1 = getGlobalModeRegistry();
    const registry2 = getGlobalModeRegistry();

    expect(registry1).toBe(registry2);
  });

  it('should have all default modes registered', () => {
    const registry = getGlobalModeRegistry();

    for (const modeName of DEFAULT_MODES) {
      expect(registry.hasMode(modeName)).toBe(true);
      expect(registry.getAvailableModes()).toContain(modeName);
    }
  });

  it('should persist changes across calls', () => {
    const registry1 = getGlobalModeRegistry();

    // Remove a mode and verify it persists
    registry1.removeMode('collaborative');

    const registry2 = getGlobalModeRegistry();
    expect(registry2.hasMode('collaborative')).toBe(false);
    expect(registry2.hasMode('adversarial')).toBe(true);
  });

  it('should reset global instance to defaults', () => {
    const registry1 = getGlobalModeRegistry();

    // Remove a mode
    registry1.removeMode('collaborative');
    expect(registry1.hasMode('collaborative')).toBe(false);

    // Reset
    resetGlobalModeRegistry();

    // Should have all defaults again
    const registry2 = getGlobalModeRegistry();
    for (const modeName of DEFAULT_MODES) {
      expect(registry2.hasMode(modeName)).toBe(true);
    }
  });
});
