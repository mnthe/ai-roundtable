import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModeRegistry,
  getGlobalModeRegistry,
  resetGlobalModeRegistry,
} from '../../../src/modes/registry.js';
import { CollaborativeMode } from '../../../src/modes/collaborative.js';
import type { DebateModeStrategy } from '../../../src/modes/base.js';
import type { DebateMode } from '../../../src/types/index.js';

describe('ModeRegistry', () => {
  let registry: ModeRegistry;

  beforeEach(() => {
    registry = new ModeRegistry();
  });

  describe('constructor', () => {
    it('should register default modes', () => {
      expect(registry.hasMode('collaborative')).toBe(true);
      expect(registry.getAvailableModes()).toContain('collaborative');
    });

    it('should initialize with collaborative mode', () => {
      const mode = registry.getMode('collaborative');
      expect(mode).toBeInstanceOf(CollaborativeMode);
      expect(mode.name).toBe('collaborative');
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
      expect(() => registry.getMode('adversarial' as DebateMode)).toThrow(
        'Debate mode "adversarial" is not registered'
      );
    });

    it('should include available modes in error message', () => {
      expect(() => registry.getMode('invalid' as DebateMode)).toThrow(
        'Available modes: collaborative'
      );
    });
  });

  describe('hasMode', () => {
    it('should return true for registered mode', () => {
      expect(registry.hasMode('collaborative')).toBe(true);
    });

    it('should return false for unregistered mode', () => {
      expect(registry.hasMode('adversarial' as DebateMode)).toBe(false);
    });
  });

  describe('getAvailableModes', () => {
    it('should return array of registered modes', () => {
      const modes = registry.getAvailableModes();
      expect(modes).toEqual(['collaborative']);
    });

    it('should include newly registered modes', () => {
      const mockMode: DebateModeStrategy = {
        name: 'test',
        async executeRound() {
          return [];
        },
        buildAgentPrompt() {
          return '';
        },
      };

      registry.registerMode('adversarial' as DebateMode, mockMode);
      registry.registerMode('socratic' as DebateMode, mockMode);

      const modes = registry.getAvailableModes();
      expect(modes).toContain('collaborative');
      expect(modes).toContain('adversarial');
      expect(modes).toContain('socratic');
      expect(modes).toHaveLength(3);
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
      const removed = registry.removeMode('adversarial' as DebateMode);
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all modes', () => {
      expect(registry.getAvailableModes()).toHaveLength(1);

      registry.clear();

      expect(registry.getAvailableModes()).toHaveLength(0);
      expect(registry.hasMode('collaborative')).toBe(false);
    });
  });

  describe('reset', () => {
    it('should clear and re-register default modes', () => {
      // Add custom mode
      const mockMode: DebateModeStrategy = {
        name: 'custom',
        async executeRound() {
          return [];
        },
        buildAgentPrompt() {
          return '';
        },
      };
      registry.registerMode('adversarial' as DebateMode, mockMode);

      expect(registry.getAvailableModes()).toHaveLength(2);

      // Reset
      registry.reset();

      // Should only have default modes
      expect(registry.getAvailableModes()).toEqual(['collaborative']);
      expect(registry.hasMode('adversarial' as DebateMode)).toBe(false);
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

  it('should have default modes registered', () => {
    const registry = getGlobalModeRegistry();

    expect(registry.hasMode('collaborative')).toBe(true);
    expect(registry.getAvailableModes()).toContain('collaborative');
  });

  it('should persist changes across calls', () => {
    const registry1 = getGlobalModeRegistry();

    const mockMode: DebateModeStrategy = {
      name: 'test',
      async executeRound() {
        return [];
      },
      buildAgentPrompt() {
        return '';
      },
    };

    registry1.registerMode('adversarial' as DebateMode, mockMode);

    const registry2 = getGlobalModeRegistry();
    expect(registry2.hasMode('adversarial' as DebateMode)).toBe(true);
  });

  it('should reset global instance', () => {
    const registry1 = getGlobalModeRegistry();
    const mockMode: DebateModeStrategy = {
      name: 'test',
      async executeRound() {
        return [];
      },
      buildAgentPrompt() {
        return '';
      },
    };
    registry1.registerMode('adversarial' as DebateMode, mockMode);

    resetGlobalModeRegistry();

    const registry2 = getGlobalModeRegistry();
    expect(registry2.hasMode('adversarial' as DebateMode)).toBe(false);
    expect(registry2.hasMode('collaborative')).toBe(true);
  });
});
