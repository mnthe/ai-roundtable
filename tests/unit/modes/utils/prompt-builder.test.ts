import { describe, it, expect } from 'vitest';
import {
  buildBehavioralContract,
  buildVerificationLoop,
  buildModePrompt,
  TOOL_USAGE_MUST_BEHAVIORS,
  TOOL_USAGE_MUST_NOT_BEHAVIORS,
  COMMON_TOOL_VERIFICATION_CHECKS,
  MODE_SPECIFIC_VERIFICATION_CHECKS,
} from '../../../../src/modes/utils/prompt-builder.js';
import type {
  BehavioralContractConfig,
  VerificationLoopConfig,
  ModePromptConfig,
} from '../../../../src/modes/utils/prompt-builder.js';
import type { DebateContext } from '../../../../src/types/index.js';

describe('prompt-builder', () => {
  describe('buildBehavioralContract', () => {
    const baseConfig: BehavioralContractConfig = {
      mustBehaviors: ['Be respectful', 'Cite sources'],
      mustNotBehaviors: ['Be dismissive', 'Make personal attacks'],
      priorityHierarchy: ['Accuracy > Speed', 'Evidence > Opinion'],
      failureMode: 'Responses without evidence will be rejected.',
    };

    it('should include tool usage requirements by default', () => {
      const result = buildBehavioralContract(baseConfig);

      // Check that tool usage MUST behaviors are included
      for (const behavior of TOOL_USAGE_MUST_BEHAVIORS) {
        expect(result).toContain(behavior);
      }

      // Check that tool usage MUST NOT behaviors are included
      for (const behavior of TOOL_USAGE_MUST_NOT_BEHAVIORS) {
        expect(result).toContain(behavior);
      }
    });

    it('should include mode-specific behaviors', () => {
      const result = buildBehavioralContract(baseConfig);

      expect(result).toContain('Be respectful');
      expect(result).toContain('Cite sources');
      expect(result).toContain('Be dismissive');
      expect(result).toContain('Make personal attacks');
    });

    it('should not include tool usage requirements when explicitly disabled', () => {
      const configWithDisabledToolUsage: BehavioralContractConfig = {
        ...baseConfig,
        includeToolUsageRequirements: false,
      };

      const result = buildBehavioralContract(configWithDisabledToolUsage);

      // Should NOT contain tool usage requirements
      expect(result).not.toContain('Use search_web or fact_check tool');
      expect(result).not.toContain('Make factual claims without tool-based verification');
    });

    it('should include priority hierarchy when provided', () => {
      const result = buildBehavioralContract(baseConfig);

      expect(result).toContain('PRIORITY HIERARCHY');
      expect(result).toContain('1. Accuracy > Speed');
      expect(result).toContain('2. Evidence > Opinion');
    });

    it('should not include priority hierarchy section when empty', () => {
      const configWithoutPriorities: BehavioralContractConfig = {
        ...baseConfig,
        priorityHierarchy: [],
      };

      const result = buildBehavioralContract(configWithoutPriorities);

      expect(result).not.toContain('PRIORITY HIERARCHY');
    });

    it('should include failure mode', () => {
      const result = buildBehavioralContract(baseConfig);

      expect(result).toContain('FAILURE MODE');
      expect(result).toContain('Responses without evidence will be rejected.');
    });

    it('should include sequential mode tool guidance for sequential modes', () => {
      const result = buildBehavioralContract(baseConfig, 'adversarial');

      expect(result).toContain('Tool Usage in Sequential Discussion');
      expect(result).toContain('Previous participants have already gathered evidence');
      expect(result).toContain('Limit tool calls to 1-2 essential searches only');
    });

    it('should include sequential mode tool guidance for socratic mode', () => {
      const result = buildBehavioralContract(baseConfig, 'socratic');

      expect(result).toContain('Tool Usage in Sequential Discussion');
    });

    it('should include sequential mode tool guidance for devils-advocate mode', () => {
      const result = buildBehavioralContract(baseConfig, 'devils-advocate');

      expect(result).toContain('Tool Usage in Sequential Discussion');
    });

    it('should NOT include sequential mode guidance for parallel modes', () => {
      const result = buildBehavioralContract(baseConfig, 'collaborative');

      expect(result).not.toContain('Tool Usage in Sequential Discussion');
    });

    it('should NOT include sequential mode guidance for expert-panel', () => {
      const result = buildBehavioralContract(baseConfig, 'expert-panel');

      expect(result).not.toContain('Tool Usage in Sequential Discussion');
    });

    it('should include Layer 2 header', () => {
      const result = buildBehavioralContract(baseConfig);

      expect(result).toContain('LAYER 2: BEHAVIORAL CONTRACT');
      expect(result).toContain('MUST (Required Behaviors)');
      expect(result).toContain('MUST NOT (Prohibited Behaviors)');
    });
  });

  describe('buildVerificationLoop', () => {
    const baseConfig: VerificationLoopConfig = {
      checklistItems: ['Check A', 'Check B'],
    };

    it('should include common tool verification checks by default', () => {
      const result = buildVerificationLoop(baseConfig);

      // Check that common tool verification checks are included
      for (const check of COMMON_TOOL_VERIFICATION_CHECKS) {
        expect(result).toContain(check);
      }
    });

    it('should include provided checklist items', () => {
      const result = buildVerificationLoop(baseConfig);

      expect(result).toContain('Check A');
      expect(result).toContain('Check B');
    });

    it('should not include tool verification checks when explicitly disabled', () => {
      const configWithDisabledToolChecks: VerificationLoopConfig = {
        ...baseConfig,
        includeToolUsageChecks: false,
      };

      const result = buildVerificationLoop(configWithDisabledToolChecks);

      // Should NOT contain tool verification checks
      expect(result).not.toContain('Did I use tools (search_web, fact_check)');
      expect(result).not.toContain('Did I cite sources from tool results');
    });

    it('should include mode-specific verification checks for devils-advocate', () => {
      const result = buildVerificationLoop(baseConfig, 'devils-advocate');

      expect(result).toContain('Did I explicitly include my stance (YES/NO/NEUTRAL)');
      expect(result).toContain('Does my reasoning support my assigned stance');
    });

    it('should include mode-specific verification checks for expert-panel', () => {
      const result = buildVerificationLoop(baseConfig, 'expert-panel');

      expect(result).toContain('Did I analyze from my assigned perspective');
      expect(result).toContain('Did I acknowledge limitations and knowledge gaps');
    });

    it('should include mode-specific verification checks for collaborative', () => {
      const result = buildVerificationLoop(baseConfig, 'collaborative');

      expect(result).toContain('Did I identify specific points of agreement');
      expect(result).toContain('Did I build on others\' ideas constructively');
    });

    it('should include mode-specific verification checks for adversarial', () => {
      const result = buildVerificationLoop(baseConfig, 'adversarial');

      expect(result).toContain('Did I directly address and counter the previous arguments');
    });

    it('should include mode-specific verification checks for socratic', () => {
      const result = buildVerificationLoop(baseConfig, 'socratic');

      expect(result).toContain('Did I pose meaningful questions');
    });

    it('should include mode-specific verification checks for delphi', () => {
      const result = buildVerificationLoop(baseConfig, 'delphi');

      expect(result).toContain('Did I provide my independent assessment');
    });

    it('should include mode-specific verification checks for red-team-blue-team', () => {
      const result = buildVerificationLoop(baseConfig, 'red-team-blue-team');

      expect(result).toContain('Did I stay true to my assigned team role');
    });

    it('should include Layer 4 header', () => {
      const result = buildVerificationLoop(baseConfig);

      expect(result).toContain('LAYER 4: VERIFICATION LOOP');
      expect(result).toContain('Before finalizing your response, verify');
      expect(result).toContain('If any check fails, revise before submitting');
    });
  });

  describe('buildModePrompt (integration)', () => {
    const defaultContext: DebateContext = {
      sessionId: 'test-session',
      topic: 'Test topic',
      mode: 'collaborative',
      currentRound: 1,
      totalRounds: 3,
      previousResponses: [],
    };

    const baseModeConfig: ModePromptConfig = {
      modeName: 'Test Mode',
      roleAnchor: {
        emoji: '🧪',
        title: 'TEST ROLE',
        definition: 'You are a test participant.',
        mission: 'Test the prompt builder.',
        persistence: 'Maintain test role.',
        helpfulMeans: 'providing test data',
        helpfulNotMeans: 'providing invalid data',
      },
      behavioralContract: {
        mustBehaviors: ['Be consistent'],
        mustNotBehaviors: ['Be inconsistent'],
        priorityHierarchy: ['Consistency > Speed'],
        failureMode: 'Inconsistent responses will be rejected.',
      },
      structuralEnforcement: {
        firstRoundSections: [{ header: '[TEST SECTION]', description: 'Test content' }],
        subsequentRoundSections: [{ header: '[UPDATED TEST]', description: 'Updated content' }],
      },
      verificationLoop: {
        checklistItems: ['Is the test passing?'],
      },
      focusQuestion: {
        instructions: 'Focus on the test.',
      },
    };

    it('should include all 4 layers', () => {
      const result = buildModePrompt(baseModeConfig, defaultContext);

      expect(result).toContain('LAYER 1: ROLE ANCHOR');
      expect(result).toContain('LAYER 2: BEHAVIORAL CONTRACT');
      expect(result).toContain('LAYER 3: STRUCTURAL ENFORCEMENT');
      expect(result).toContain('LAYER 4: VERIFICATION LOOP');
    });

    it('should include tool usage requirements in Layer 2 for collaborative mode', () => {
      const result = buildModePrompt(baseModeConfig, defaultContext);

      expect(result).toContain('Use search_web or fact_check tool');
      expect(result).toContain('Make factual claims without tool-based verification');
    });

    it('should include mode-specific verification checks in Layer 4', () => {
      const result = buildModePrompt(baseModeConfig, defaultContext);

      // Should include collaborative mode-specific checks
      expect(result).toContain('Did I identify specific points of agreement');
    });

    it('should include sequential mode tool guidance for sequential modes', () => {
      const sequentialContext: DebateContext = {
        ...defaultContext,
        mode: 'adversarial',
      };

      const result = buildModePrompt(baseModeConfig, sequentialContext);

      expect(result).toContain('Tool Usage in Sequential Discussion');
      expect(result).toContain('Limit tool calls to 1-2 essential searches');
    });

    it('should NOT include sequential mode tool guidance for parallel modes', () => {
      const result = buildModePrompt(baseModeConfig, defaultContext);

      expect(result).not.toContain('Tool Usage in Sequential Discussion');
    });

    it('should include devils-advocate specific checks for devils-advocate mode', () => {
      const devilsAdvocateContext: DebateContext = {
        ...defaultContext,
        mode: 'devils-advocate',
      };

      const result = buildModePrompt(baseModeConfig, devilsAdvocateContext);

      expect(result).toContain('Did I explicitly include my stance (YES/NO/NEUTRAL)');
      expect(result).toContain('Does my reasoning support my assigned stance');
    });
  });

  describe('exported constants', () => {
    it('should have TOOL_USAGE_MUST_BEHAVIORS defined', () => {
      expect(TOOL_USAGE_MUST_BEHAVIORS).toBeDefined();
      expect(TOOL_USAGE_MUST_BEHAVIORS.length).toBeGreaterThan(0);
    });

    it('should have TOOL_USAGE_MUST_NOT_BEHAVIORS defined', () => {
      expect(TOOL_USAGE_MUST_NOT_BEHAVIORS).toBeDefined();
      expect(TOOL_USAGE_MUST_NOT_BEHAVIORS.length).toBeGreaterThan(0);
    });

    it('should have COMMON_TOOL_VERIFICATION_CHECKS defined', () => {
      expect(COMMON_TOOL_VERIFICATION_CHECKS).toBeDefined();
      expect(COMMON_TOOL_VERIFICATION_CHECKS.length).toBeGreaterThan(0);
    });

    it('should have MODE_SPECIFIC_VERIFICATION_CHECKS for all key modes', () => {
      expect(MODE_SPECIFIC_VERIFICATION_CHECKS).toBeDefined();
      expect(MODE_SPECIFIC_VERIFICATION_CHECKS['devils-advocate']).toBeDefined();
      expect(MODE_SPECIFIC_VERIFICATION_CHECKS['expert-panel']).toBeDefined();
      expect(MODE_SPECIFIC_VERIFICATION_CHECKS['collaborative']).toBeDefined();
      expect(MODE_SPECIFIC_VERIFICATION_CHECKS['adversarial']).toBeDefined();
      expect(MODE_SPECIFIC_VERIFICATION_CHECKS['socratic']).toBeDefined();
      expect(MODE_SPECIFIC_VERIFICATION_CHECKS['delphi']).toBeDefined();
      expect(MODE_SPECIFIC_VERIFICATION_CHECKS['red-team-blue-team']).toBeDefined();
    });
  });
});
