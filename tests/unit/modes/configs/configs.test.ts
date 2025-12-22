/**
 * Mode Configurations Sanity Tests
 *
 * Verifies that all mode configurations are properly exported and have
 * the expected structure. These tests catch accidental breaking changes
 * to the config structure.
 */

import { describe, it, expect } from 'vitest';

// Import all exports from configs/index.ts
import {
  // Collaborative
  COLLABORATIVE_CONFIG,
  // Adversarial
  ADVERSARIAL_CONFIG,
  // Socratic
  SOCRATIC_CONFIG,
  // Expert Panel
  EXPERT_PANEL_CONFIG,
  PERSPECTIVE_ANCHORS,
  PERSPECTIVE_DESCRIPTIONS,
  PERSPECTIVE_ROLE_ANCHORS,
  // Delphi
  DELPHI_ROLE_ANCHOR,
  DELPHI_BEHAVIORAL_CONTRACT,
  DELPHI_VERIFICATION_LOOP,
  DELPHI_FOCUS_QUESTION,
  DELPHI_FIRST_ROUND_SECTIONS,
  DELPHI_SUBSEQUENT_ROUND_SECTIONS,
  // Devils Advocate
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
  // Red Team Blue Team
  RED_TEAM_ROLE_ANCHOR,
  RED_TEAM_BEHAVIORAL_CONTRACT,
  RED_TEAM_VERIFICATION,
  RED_TEAM_OUTPUT_SECTIONS,
  BLUE_TEAM_ROLE_ANCHOR,
  BLUE_TEAM_BEHAVIORAL_CONTRACT,
  BLUE_TEAM_VERIFICATION,
  BLUE_TEAM_OUTPUT_SECTIONS,
  TEAM_CONFIGS,
} from '../../../../src/modes/configs/index.js';

import type { Perspective, DevilsAdvocateRole, Team } from '../../../../src/modes/configs/index.js';

import type { ModePromptConfig } from '../../../../src/modes/utils/index.js';

describe('Mode Configurations', () => {
  describe('Export Verification', () => {
    it('should export all collaborative config', () => {
      expect(COLLABORATIVE_CONFIG).toBeDefined();
    });

    it('should export all adversarial config', () => {
      expect(ADVERSARIAL_CONFIG).toBeDefined();
    });

    it('should export all socratic config', () => {
      expect(SOCRATIC_CONFIG).toBeDefined();
    });

    it('should export all expert panel configs', () => {
      expect(EXPERT_PANEL_CONFIG).toBeDefined();
      expect(PERSPECTIVE_ANCHORS).toBeDefined();
      expect(PERSPECTIVE_DESCRIPTIONS).toBeDefined();
      expect(PERSPECTIVE_ROLE_ANCHORS).toBeDefined();
    });

    it('should export all delphi configs', () => {
      expect(DELPHI_ROLE_ANCHOR).toBeDefined();
      expect(DELPHI_BEHAVIORAL_CONTRACT).toBeDefined();
      expect(DELPHI_VERIFICATION_LOOP).toBeDefined();
      expect(DELPHI_FOCUS_QUESTION).toBeDefined();
      expect(DELPHI_FIRST_ROUND_SECTIONS).toBeDefined();
      expect(DELPHI_SUBSEQUENT_ROUND_SECTIONS).toBeDefined();
    });

    it('should export all devils advocate configs', () => {
      expect(PRIMARY_ROLE_ANCHOR).toBeDefined();
      expect(PRIMARY_BEHAVIORAL_CONTRACT).toBeDefined();
      expect(PRIMARY_VERIFICATION).toBeDefined();
      expect(OPPOSITION_ROLE_ANCHOR).toBeDefined();
      expect(OPPOSITION_BEHAVIORAL_CONTRACT).toBeDefined();
      expect(OPPOSITION_VERIFICATION).toBeDefined();
      expect(EVALUATOR_ROLE_ANCHOR).toBeDefined();
      expect(EVALUATOR_BEHAVIORAL_CONTRACT).toBeDefined();
      expect(EVALUATOR_VERIFICATION).toBeDefined();
      expect(DEVILS_ADVOCATE_ROLE_CONFIGS).toBeDefined();
      expect(ROLE_TO_STANCE).toBeDefined();
      expect(ROLE_DISPLAY_NAMES).toBeDefined();
    });

    it('should export all red team blue team configs', () => {
      expect(RED_TEAM_ROLE_ANCHOR).toBeDefined();
      expect(RED_TEAM_BEHAVIORAL_CONTRACT).toBeDefined();
      expect(RED_TEAM_VERIFICATION).toBeDefined();
      expect(RED_TEAM_OUTPUT_SECTIONS).toBeDefined();
      expect(BLUE_TEAM_ROLE_ANCHOR).toBeDefined();
      expect(BLUE_TEAM_BEHAVIORAL_CONTRACT).toBeDefined();
      expect(BLUE_TEAM_VERIFICATION).toBeDefined();
      expect(BLUE_TEAM_OUTPUT_SECTIONS).toBeDefined();
      expect(TEAM_CONFIGS).toBeDefined();
    });
  });

  describe('Type Conformance - ModePromptConfig', () => {
    const validateModePromptConfig = (config: ModePromptConfig, name: string) => {
      // Check required top-level fields
      expect(config.modeName).toBeTypeOf('string');
      expect(config.modeName.length).toBeGreaterThan(0);

      // Check roleAnchor
      expect(config.roleAnchor).toBeDefined();
      expect(config.roleAnchor.emoji).toBeTypeOf('string');
      expect(config.roleAnchor.title).toBeTypeOf('string');
      expect(config.roleAnchor.definition).toBeTypeOf('string');
      expect(config.roleAnchor.mission).toBeTypeOf('string');
      expect(config.roleAnchor.persistence).toBeTypeOf('string');
      expect(config.roleAnchor.helpfulMeans).toBeTypeOf('string');
      expect(config.roleAnchor.helpfulNotMeans).toBeTypeOf('string');

      // Check behavioralContract
      expect(config.behavioralContract).toBeDefined();
      expect(Array.isArray(config.behavioralContract.mustBehaviors)).toBe(true);
      expect(config.behavioralContract.mustBehaviors.length).toBeGreaterThan(0);
      expect(Array.isArray(config.behavioralContract.mustNotBehaviors)).toBe(true);
      expect(config.behavioralContract.mustNotBehaviors.length).toBeGreaterThan(0);
      expect(Array.isArray(config.behavioralContract.priorityHierarchy)).toBe(true);
      expect(config.behavioralContract.failureMode).toBeTypeOf('string');

      // Check structuralEnforcement
      expect(config.structuralEnforcement).toBeDefined();
      expect(Array.isArray(config.structuralEnforcement.firstRoundSections)).toBe(true);
      expect(config.structuralEnforcement.firstRoundSections.length).toBeGreaterThan(0);
      expect(Array.isArray(config.structuralEnforcement.subsequentRoundSections)).toBe(true);
      expect(config.structuralEnforcement.subsequentRoundSections.length).toBeGreaterThan(0);

      // Check each section has header and description
      for (const section of config.structuralEnforcement.firstRoundSections) {
        expect(section.header).toBeTypeOf('string');
        expect(section.description).toBeTypeOf('string');
      }
      for (const section of config.structuralEnforcement.subsequentRoundSections) {
        expect(section.header).toBeTypeOf('string');
        expect(section.description).toBeTypeOf('string');
      }

      // Check verificationLoop
      expect(config.verificationLoop).toBeDefined();
      expect(Array.isArray(config.verificationLoop.checklistItems)).toBe(true);
      expect(config.verificationLoop.checklistItems.length).toBeGreaterThan(0);

      // Check focusQuestion
      expect(config.focusQuestion).toBeDefined();
      expect(config.focusQuestion.instructions).toBeTypeOf('string');
    };

    it('COLLABORATIVE_CONFIG conforms to ModePromptConfig', () => {
      validateModePromptConfig(COLLABORATIVE_CONFIG, 'COLLABORATIVE_CONFIG');
    });

    it('ADVERSARIAL_CONFIG conforms to ModePromptConfig', () => {
      validateModePromptConfig(ADVERSARIAL_CONFIG, 'ADVERSARIAL_CONFIG');
    });

    it('SOCRATIC_CONFIG conforms to ModePromptConfig', () => {
      validateModePromptConfig(SOCRATIC_CONFIG, 'SOCRATIC_CONFIG');
    });

    it('EXPERT_PANEL_CONFIG conforms to ModePromptConfig', () => {
      validateModePromptConfig(EXPERT_PANEL_CONFIG, 'EXPERT_PANEL_CONFIG');
    });
  });

  describe('Devils Advocate Role Configs', () => {
    it('should have all three roles', () => {
      const roles: DevilsAdvocateRole[] = ['PRIMARY', 'OPPOSITION', 'EVALUATOR'];
      for (const role of roles) {
        expect(DEVILS_ADVOCATE_ROLE_CONFIGS[role]).toBeDefined();
      }
    });

    it('each role should have expectedStance and displayName', () => {
      const roles: DevilsAdvocateRole[] = ['PRIMARY', 'OPPOSITION', 'EVALUATOR'];
      for (const role of roles) {
        const config = DEVILS_ADVOCATE_ROLE_CONFIGS[role];
        expect(config.expectedStance).toBeDefined();
        expect(['YES', 'NO', 'NEUTRAL']).toContain(config.expectedStance);
        expect(config.displayName).toBeTypeOf('string');
        expect(config.displayName.length).toBeGreaterThan(0);
      }
    });

    it('each role should have roleAnchor, behavioralContract, and verificationLoop', () => {
      const roles: DevilsAdvocateRole[] = ['PRIMARY', 'OPPOSITION', 'EVALUATOR'];
      for (const role of roles) {
        const config = DEVILS_ADVOCATE_ROLE_CONFIGS[role];

        // roleAnchor
        expect(config.roleAnchor).toBeDefined();
        expect(config.roleAnchor.emoji).toBeTypeOf('string');
        expect(config.roleAnchor.title).toBeTypeOf('string');
        expect(config.roleAnchor.definition).toBeTypeOf('string');
        expect(config.roleAnchor.mission).toBeTypeOf('string');

        // behavioralContract
        expect(config.behavioralContract).toBeDefined();
        expect(Array.isArray(config.behavioralContract.mustBehaviors)).toBe(true);
        expect(Array.isArray(config.behavioralContract.mustNotBehaviors)).toBe(true);

        // verificationLoop
        expect(config.verificationLoop).toBeDefined();
        expect(Array.isArray(config.verificationLoop.checklistItems)).toBe(true);
      }
    });

    it('PRIMARY should have YES stance', () => {
      expect(DEVILS_ADVOCATE_ROLE_CONFIGS.PRIMARY.expectedStance).toBe('YES');
    });

    it('OPPOSITION should have NO stance', () => {
      expect(DEVILS_ADVOCATE_ROLE_CONFIGS.OPPOSITION.expectedStance).toBe('NO');
    });

    it('EVALUATOR should have NEUTRAL stance', () => {
      expect(DEVILS_ADVOCATE_ROLE_CONFIGS.EVALUATOR.expectedStance).toBe('NEUTRAL');
    });
  });

  describe('Stance Mappings', () => {
    it('ROLE_TO_STANCE should have correct mappings', () => {
      expect(ROLE_TO_STANCE.PRIMARY).toBe('YES');
      expect(ROLE_TO_STANCE.OPPOSITION).toBe('NO');
      expect(ROLE_TO_STANCE.EVALUATOR).toBe('NEUTRAL');
    });

    it('ROLE_DISPLAY_NAMES should have all roles', () => {
      const roles: DevilsAdvocateRole[] = ['PRIMARY', 'OPPOSITION', 'EVALUATOR'];
      for (const role of roles) {
        expect(ROLE_DISPLAY_NAMES[role]).toBeTypeOf('string');
        expect(ROLE_DISPLAY_NAMES[role].length).toBeGreaterThan(0);
      }
    });

    it('ROLE_DISPLAY_NAMES should match DEVILS_ADVOCATE_ROLE_CONFIGS displayName', () => {
      const roles: DevilsAdvocateRole[] = ['PRIMARY', 'OPPOSITION', 'EVALUATOR'];
      for (const role of roles) {
        expect(ROLE_DISPLAY_NAMES[role]).toBe(DEVILS_ADVOCATE_ROLE_CONFIGS[role].displayName);
      }
    });
  });

  describe('Red Team Blue Team Configs', () => {
    it('TEAM_CONFIGS should have both teams', () => {
      const teams: Team[] = ['red', 'blue'];
      for (const team of teams) {
        expect(TEAM_CONFIGS[team]).toBeDefined();
      }
    });

    it('each team should have outputSections and displayName', () => {
      const teams: Team[] = ['red', 'blue'];
      for (const team of teams) {
        const config = TEAM_CONFIGS[team];
        expect(Array.isArray(config.outputSections)).toBe(true);
        expect(config.outputSections.length).toBeGreaterThan(0);
        expect(config.displayName).toBeTypeOf('string');
        expect(config.displayName.length).toBeGreaterThan(0);
      }
    });

    it('each team should have roleAnchor, behavioralContract, and verificationLoop', () => {
      const teams: Team[] = ['red', 'blue'];
      for (const team of teams) {
        const config = TEAM_CONFIGS[team];

        // roleAnchor
        expect(config.roleAnchor).toBeDefined();
        expect(config.roleAnchor.emoji).toBeTypeOf('string');
        expect(config.roleAnchor.title).toBeTypeOf('string');
        expect(config.roleAnchor.definition).toBeTypeOf('string');
        expect(config.roleAnchor.mission).toBeTypeOf('string');

        // behavioralContract
        expect(config.behavioralContract).toBeDefined();
        expect(Array.isArray(config.behavioralContract.mustBehaviors)).toBe(true);
        expect(Array.isArray(config.behavioralContract.mustNotBehaviors)).toBe(true);

        // verificationLoop
        expect(config.verificationLoop).toBeDefined();
        expect(Array.isArray(config.verificationLoop.checklistItems)).toBe(true);
      }
    });

    it('outputSections should have header and description', () => {
      const teams: Team[] = ['red', 'blue'];
      for (const team of teams) {
        for (const section of TEAM_CONFIGS[team].outputSections) {
          expect(section.header).toBeTypeOf('string');
          expect(section.description).toBeTypeOf('string');
        }
      }
    });
  });

  describe('Expert Panel Perspective Configs', () => {
    it('PERSPECTIVE_ANCHORS should have all four perspectives', () => {
      expect(PERSPECTIVE_ANCHORS).toContain('technical');
      expect(PERSPECTIVE_ANCHORS).toContain('economic');
      expect(PERSPECTIVE_ANCHORS).toContain('ethical');
      expect(PERSPECTIVE_ANCHORS).toContain('social');
      expect(PERSPECTIVE_ANCHORS).toHaveLength(4);
    });

    it('PERSPECTIVE_DESCRIPTIONS should have all perspectives', () => {
      const perspectives: Perspective[] = ['technical', 'economic', 'ethical', 'social'];
      for (const perspective of perspectives) {
        expect(PERSPECTIVE_DESCRIPTIONS[perspective]).toBeTypeOf('string');
        expect(PERSPECTIVE_DESCRIPTIONS[perspective].length).toBeGreaterThan(0);
      }
    });

    it('PERSPECTIVE_ROLE_ANCHORS should have all perspectives', () => {
      const perspectives: Perspective[] = ['technical', 'economic', 'ethical', 'social'];
      for (const perspective of perspectives) {
        const anchor = PERSPECTIVE_ROLE_ANCHORS[perspective];
        expect(anchor).toBeDefined();
        expect(anchor.emoji).toBeTypeOf('string');
        expect(anchor.title).toBeTypeOf('string');
        expect(anchor.definition).toBeTypeOf('string');
        expect(anchor.mission).toBeTypeOf('string');
      }
    });

    it('PERSPECTIVE_ROLE_ANCHORS should have distinct emojis', () => {
      const perspectives: Perspective[] = ['technical', 'economic', 'ethical', 'social'];
      const emojis = perspectives.map((p) => PERSPECTIVE_ROLE_ANCHORS[p].emoji);
      const uniqueEmojis = new Set(emojis);
      expect(uniqueEmojis.size).toBe(perspectives.length);
    });
  });

  describe('Delphi Configs', () => {
    it('DELPHI_ROLE_ANCHOR should have required fields', () => {
      expect(DELPHI_ROLE_ANCHOR.emoji).toBeTypeOf('string');
      expect(DELPHI_ROLE_ANCHOR.title).toBeTypeOf('string');
      expect(DELPHI_ROLE_ANCHOR.definition).toBeTypeOf('string');
      expect(DELPHI_ROLE_ANCHOR.mission).toBeTypeOf('string');
      expect(DELPHI_ROLE_ANCHOR.persistence).toBeTypeOf('string');
      expect(DELPHI_ROLE_ANCHOR.helpfulMeans).toBeTypeOf('string');
      expect(DELPHI_ROLE_ANCHOR.helpfulNotMeans).toBeTypeOf('string');
    });

    it('DELPHI_BEHAVIORAL_CONTRACT should have required fields', () => {
      expect(Array.isArray(DELPHI_BEHAVIORAL_CONTRACT.mustBehaviors)).toBe(true);
      expect(DELPHI_BEHAVIORAL_CONTRACT.mustBehaviors.length).toBeGreaterThan(0);
      expect(Array.isArray(DELPHI_BEHAVIORAL_CONTRACT.mustNotBehaviors)).toBe(true);
      expect(DELPHI_BEHAVIORAL_CONTRACT.mustNotBehaviors.length).toBeGreaterThan(0);
      expect(Array.isArray(DELPHI_BEHAVIORAL_CONTRACT.priorityHierarchy)).toBe(true);
      expect(DELPHI_BEHAVIORAL_CONTRACT.failureMode).toBeTypeOf('string');
    });

    it('DELPHI_VERIFICATION_LOOP should have checklist items', () => {
      expect(Array.isArray(DELPHI_VERIFICATION_LOOP.checklistItems)).toBe(true);
      expect(DELPHI_VERIFICATION_LOOP.checklistItems.length).toBeGreaterThan(0);
    });

    it('DELPHI_FOCUS_QUESTION should have instructions', () => {
      expect(DELPHI_FOCUS_QUESTION.instructions).toBeTypeOf('string');
      expect(DELPHI_FOCUS_QUESTION.instructions.length).toBeGreaterThan(0);
    });

    it('DELPHI_FIRST_ROUND_SECTIONS should be valid output sections', () => {
      expect(Array.isArray(DELPHI_FIRST_ROUND_SECTIONS)).toBe(true);
      expect(DELPHI_FIRST_ROUND_SECTIONS.length).toBeGreaterThan(0);
      for (const section of DELPHI_FIRST_ROUND_SECTIONS) {
        expect(section.header).toBeTypeOf('string');
        expect(section.description).toBeTypeOf('string');
      }
    });

    it('DELPHI_SUBSEQUENT_ROUND_SECTIONS should be valid output sections', () => {
      expect(Array.isArray(DELPHI_SUBSEQUENT_ROUND_SECTIONS)).toBe(true);
      expect(DELPHI_SUBSEQUENT_ROUND_SECTIONS.length).toBeGreaterThan(0);
      for (const section of DELPHI_SUBSEQUENT_ROUND_SECTIONS) {
        expect(section.header).toBeTypeOf('string');
        expect(section.description).toBeTypeOf('string');
      }
    });
  });

  describe('Individual Role Anchor Exports', () => {
    it('PRIMARY_ROLE_ANCHOR should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(PRIMARY_ROLE_ANCHOR).toBe(DEVILS_ADVOCATE_ROLE_CONFIGS.PRIMARY.roleAnchor);
    });

    it('OPPOSITION_ROLE_ANCHOR should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(OPPOSITION_ROLE_ANCHOR).toBe(DEVILS_ADVOCATE_ROLE_CONFIGS.OPPOSITION.roleAnchor);
    });

    it('EVALUATOR_ROLE_ANCHOR should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(EVALUATOR_ROLE_ANCHOR).toBe(DEVILS_ADVOCATE_ROLE_CONFIGS.EVALUATOR.roleAnchor);
    });

    it('RED_TEAM_ROLE_ANCHOR should be same as in TEAM_CONFIGS', () => {
      expect(RED_TEAM_ROLE_ANCHOR).toBe(TEAM_CONFIGS.red.roleAnchor);
    });

    it('BLUE_TEAM_ROLE_ANCHOR should be same as in TEAM_CONFIGS', () => {
      expect(BLUE_TEAM_ROLE_ANCHOR).toBe(TEAM_CONFIGS.blue.roleAnchor);
    });
  });

  describe('Individual Behavioral Contract Exports', () => {
    it('PRIMARY_BEHAVIORAL_CONTRACT should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(PRIMARY_BEHAVIORAL_CONTRACT).toBe(
        DEVILS_ADVOCATE_ROLE_CONFIGS.PRIMARY.behavioralContract
      );
    });

    it('OPPOSITION_BEHAVIORAL_CONTRACT should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(OPPOSITION_BEHAVIORAL_CONTRACT).toBe(
        DEVILS_ADVOCATE_ROLE_CONFIGS.OPPOSITION.behavioralContract
      );
    });

    it('EVALUATOR_BEHAVIORAL_CONTRACT should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(EVALUATOR_BEHAVIORAL_CONTRACT).toBe(
        DEVILS_ADVOCATE_ROLE_CONFIGS.EVALUATOR.behavioralContract
      );
    });

    it('RED_TEAM_BEHAVIORAL_CONTRACT should be same as in TEAM_CONFIGS', () => {
      expect(RED_TEAM_BEHAVIORAL_CONTRACT).toBe(TEAM_CONFIGS.red.behavioralContract);
    });

    it('BLUE_TEAM_BEHAVIORAL_CONTRACT should be same as in TEAM_CONFIGS', () => {
      expect(BLUE_TEAM_BEHAVIORAL_CONTRACT).toBe(TEAM_CONFIGS.blue.behavioralContract);
    });
  });

  describe('Individual Verification Exports', () => {
    it('PRIMARY_VERIFICATION should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(PRIMARY_VERIFICATION).toBe(DEVILS_ADVOCATE_ROLE_CONFIGS.PRIMARY.verificationLoop);
    });

    it('OPPOSITION_VERIFICATION should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(OPPOSITION_VERIFICATION).toBe(
        DEVILS_ADVOCATE_ROLE_CONFIGS.OPPOSITION.verificationLoop
      );
    });

    it('EVALUATOR_VERIFICATION should be same as in DEVILS_ADVOCATE_ROLE_CONFIGS', () => {
      expect(EVALUATOR_VERIFICATION).toBe(DEVILS_ADVOCATE_ROLE_CONFIGS.EVALUATOR.verificationLoop);
    });

    it('RED_TEAM_VERIFICATION should be same as in TEAM_CONFIGS', () => {
      expect(RED_TEAM_VERIFICATION).toBe(TEAM_CONFIGS.red.verificationLoop);
    });

    it('BLUE_TEAM_VERIFICATION should be same as in TEAM_CONFIGS', () => {
      expect(BLUE_TEAM_VERIFICATION).toBe(TEAM_CONFIGS.blue.verificationLoop);
    });
  });

  describe('Individual Output Sections Exports', () => {
    it('RED_TEAM_OUTPUT_SECTIONS should be same as in TEAM_CONFIGS', () => {
      expect(RED_TEAM_OUTPUT_SECTIONS).toBe(TEAM_CONFIGS.red.outputSections);
    });

    it('BLUE_TEAM_OUTPUT_SECTIONS should be same as in TEAM_CONFIGS', () => {
      expect(BLUE_TEAM_OUTPUT_SECTIONS).toBe(TEAM_CONFIGS.blue.outputSections);
    });
  });
});
