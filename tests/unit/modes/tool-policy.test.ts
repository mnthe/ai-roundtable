import { describe, it, expect } from 'vitest';
import {
  getToolPolicy,
  getExecutionPattern,
  isSequentialMode,
  isParallelMode,
  getToolGuidanceForMode,
  getParallelizationLevel,
  supportsLastOnlyParallelization,
  TOOL_USAGE_POLICIES,
  MODE_EXECUTION_PATTERN,
  MODE_PARALLELIZATION,
  SEQUENTIAL_MODE_TOOL_GUIDANCE,
  type ExecutionPattern,
  type ToolUsagePolicy,
  type ParallelizationLevel,
} from '../../../src/modes/tool-policy.js';
import type { DebateMode } from '../../../src/types/index.js';

// All debate modes for comprehensive testing
const ALL_MODES: DebateMode[] = [
  'collaborative',
  'adversarial',
  'socratic',
  'expert-panel',
  'devils-advocate',
  'delphi',
  'red-team-blue-team',
];

// Expected parallel modes
const PARALLEL_MODES: DebateMode[] = [
  'collaborative',
  'expert-panel',
  'delphi',
  'red-team-blue-team',
];

// Expected sequential modes
const SEQUENTIAL_MODES: DebateMode[] = ['adversarial', 'socratic', 'devils-advocate'];

describe('Tool Usage Policies', () => {
  describe('TOOL_USAGE_POLICIES', () => {
    it('should define parallel policy with higher maxCalls', () => {
      const policy = TOOL_USAGE_POLICIES.parallel;

      expect(policy.minCalls).toBe(1);
      expect(policy.maxCalls).toBe(6);
      expect(policy.guidance).toContain('freely');
      expect(policy.guidance).toContain('comprehensive');
    });

    it('should define sequential policy with limited maxCalls', () => {
      const policy = TOOL_USAGE_POLICIES.sequential;

      expect(policy.minCalls).toBe(1);
      expect(policy.maxCalls).toBe(2);
      expect(policy.guidance).toContain('previous responses');
      expect(policy.guidance).toContain('1-2');
    });

    it('should have sequential maxCalls less than parallel', () => {
      expect(TOOL_USAGE_POLICIES.sequential.maxCalls).toBeLessThan(
        TOOL_USAGE_POLICIES.parallel.maxCalls
      );
    });

    it('should have positive minCalls for both patterns', () => {
      expect(TOOL_USAGE_POLICIES.parallel.minCalls).toBeGreaterThan(0);
      expect(TOOL_USAGE_POLICIES.sequential.minCalls).toBeGreaterThan(0);
    });
  });

  describe('MODE_EXECUTION_PATTERN', () => {
    it('should map all debate modes', () => {
      for (const mode of ALL_MODES) {
        expect(MODE_EXECUTION_PATTERN[mode]).toBeDefined();
        expect(['parallel', 'sequential']).toContain(MODE_EXECUTION_PATTERN[mode]);
      }
    });

    it('should map collaborative to parallel', () => {
      expect(MODE_EXECUTION_PATTERN['collaborative']).toBe('parallel');
    });

    it('should map expert-panel to parallel', () => {
      expect(MODE_EXECUTION_PATTERN['expert-panel']).toBe('parallel');
    });

    it('should map delphi to parallel', () => {
      expect(MODE_EXECUTION_PATTERN['delphi']).toBe('parallel');
    });

    it('should map red-team-blue-team to parallel', () => {
      expect(MODE_EXECUTION_PATTERN['red-team-blue-team']).toBe('parallel');
    });

    it('should map adversarial to sequential', () => {
      expect(MODE_EXECUTION_PATTERN['adversarial']).toBe('sequential');
    });

    it('should map socratic to sequential', () => {
      expect(MODE_EXECUTION_PATTERN['socratic']).toBe('sequential');
    });

    it('should map devils-advocate to sequential', () => {
      expect(MODE_EXECUTION_PATTERN['devils-advocate']).toBe('sequential');
    });
  });

  describe('SEQUENTIAL_MODE_TOOL_GUIDANCE', () => {
    it('should contain guidance about previous responses', () => {
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('Previous participants');
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('already gathered evidence');
    });

    it('should contain MUST instructions', () => {
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('MUST:');
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('Review previous responses');
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('Limit tool calls');
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('Focus on NEW information');
    });

    it('should contain MUST NOT instructions', () => {
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('MUST NOT:');
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('Repeat searches');
      expect(SEQUENTIAL_MODE_TOOL_GUIDANCE).toContain('more than 2 tool calls');
    });
  });
});

describe('getToolPolicy', () => {
  it('should return parallel policy for parallel modes', () => {
    for (const mode of PARALLEL_MODES) {
      const policy = getToolPolicy(mode);

      expect(policy.maxCalls).toBe(6);
      expect(policy.minCalls).toBe(1);
      expect(policy.guidance).toContain('freely');
    }
  });

  it('should return sequential policy for sequential modes', () => {
    for (const mode of SEQUENTIAL_MODES) {
      const policy = getToolPolicy(mode);

      expect(policy.maxCalls).toBe(2);
      expect(policy.minCalls).toBe(1);
      expect(policy.guidance).toContain('1-2');
    }
  });

  it('should return policy matching the execution pattern', () => {
    for (const mode of ALL_MODES) {
      const pattern = MODE_EXECUTION_PATTERN[mode];
      const policy = getToolPolicy(mode);

      expect(policy).toEqual(TOOL_USAGE_POLICIES[pattern]);
    }
  });
});

describe('getExecutionPattern', () => {
  it('should return parallel for parallel modes', () => {
    for (const mode of PARALLEL_MODES) {
      expect(getExecutionPattern(mode)).toBe('parallel');
    }
  });

  it('should return sequential for sequential modes', () => {
    for (const mode of SEQUENTIAL_MODES) {
      expect(getExecutionPattern(mode)).toBe('sequential');
    }
  });

  it('should match MODE_EXECUTION_PATTERN values', () => {
    for (const mode of ALL_MODES) {
      expect(getExecutionPattern(mode)).toBe(MODE_EXECUTION_PATTERN[mode]);
    }
  });
});

describe('isSequentialMode', () => {
  it('should return true for sequential modes', () => {
    for (const mode of SEQUENTIAL_MODES) {
      expect(isSequentialMode(mode)).toBe(true);
    }
  });

  it('should return false for parallel modes', () => {
    for (const mode of PARALLEL_MODES) {
      expect(isSequentialMode(mode)).toBe(false);
    }
  });

  it('should return true only for adversarial, socratic, and devils-advocate', () => {
    const sequentialResults = ALL_MODES.filter(isSequentialMode);
    expect(sequentialResults).toHaveLength(3);
    expect(sequentialResults).toContain('adversarial');
    expect(sequentialResults).toContain('socratic');
    expect(sequentialResults).toContain('devils-advocate');
  });
});

describe('isParallelMode', () => {
  it('should return true for parallel modes', () => {
    for (const mode of PARALLEL_MODES) {
      expect(isParallelMode(mode)).toBe(true);
    }
  });

  it('should return false for sequential modes', () => {
    for (const mode of SEQUENTIAL_MODES) {
      expect(isParallelMode(mode)).toBe(false);
    }
  });

  it('should return true for 4 modes', () => {
    const parallelResults = ALL_MODES.filter(isParallelMode);
    expect(parallelResults).toHaveLength(4);
    expect(parallelResults).toContain('collaborative');
    expect(parallelResults).toContain('expert-panel');
    expect(parallelResults).toContain('delphi');
    expect(parallelResults).toContain('red-team-blue-team');
  });

  it('should be inverse of isSequentialMode', () => {
    for (const mode of ALL_MODES) {
      expect(isParallelMode(mode)).toBe(!isSequentialMode(mode));
    }
  });
});

describe('getToolGuidanceForMode', () => {
  it('should return sequential guidance for sequential modes', () => {
    for (const mode of SEQUENTIAL_MODES) {
      const guidance = getToolGuidanceForMode(mode);

      expect(guidance).toBe(SEQUENTIAL_MODE_TOOL_GUIDANCE);
      expect(guidance).toContain('Tool Usage in Sequential Discussion');
    }
  });

  it('should return empty string for parallel modes', () => {
    for (const mode of PARALLEL_MODES) {
      const guidance = getToolGuidanceForMode(mode);

      expect(guidance).toBe('');
    }
  });

  it('should return non-empty guidance only for sequential modes', () => {
    const modesWithGuidance = ALL_MODES.filter((mode) => getToolGuidanceForMode(mode) !== '');

    expect(modesWithGuidance).toHaveLength(SEQUENTIAL_MODES.length);
    for (const mode of modesWithGuidance) {
      expect(SEQUENTIAL_MODES).toContain(mode);
    }
  });
});

describe('Type Safety', () => {
  it('should have ExecutionPattern type with only parallel and sequential', () => {
    const validPatterns: ExecutionPattern[] = ['parallel', 'sequential'];

    expect(validPatterns).toHaveLength(2);
    expect(Object.keys(TOOL_USAGE_POLICIES)).toHaveLength(2);
    expect(Object.keys(TOOL_USAGE_POLICIES).sort()).toEqual(validPatterns.sort());
  });

  it('should have ToolUsagePolicy with required fields', () => {
    const policy: ToolUsagePolicy = TOOL_USAGE_POLICIES.parallel;

    expect(typeof policy.minCalls).toBe('number');
    expect(typeof policy.maxCalls).toBe('number');
    expect(typeof policy.guidance).toBe('string');
  });
});

describe('MODE_PARALLELIZATION', () => {
  it('should map all debate modes', () => {
    for (const mode of ALL_MODES) {
      expect(MODE_PARALLELIZATION[mode]).toBeDefined();
      expect(['none', 'last-only', 'full']).toContain(MODE_PARALLELIZATION[mode]);
    }
  });

  it('should map parallel modes to full', () => {
    for (const mode of PARALLEL_MODES) {
      expect(MODE_PARALLELIZATION[mode]).toBe('full');
    }
  });

  it('should map adversarial to none', () => {
    expect(MODE_PARALLELIZATION['adversarial']).toBe('none');
  });

  it('should map socratic to none', () => {
    expect(MODE_PARALLELIZATION['socratic']).toBe('none');
  });

  it('should map devils-advocate to last-only', () => {
    expect(MODE_PARALLELIZATION['devils-advocate']).toBe('last-only');
  });
});

describe('getParallelizationLevel', () => {
  it('should return full for parallel modes', () => {
    for (const mode of PARALLEL_MODES) {
      expect(getParallelizationLevel(mode)).toBe('full');
    }
  });

  it('should return none for adversarial and socratic', () => {
    expect(getParallelizationLevel('adversarial')).toBe('none');
    expect(getParallelizationLevel('socratic')).toBe('none');
  });

  it('should return last-only for devils-advocate', () => {
    expect(getParallelizationLevel('devils-advocate')).toBe('last-only');
  });

  it('should match MODE_PARALLELIZATION values', () => {
    for (const mode of ALL_MODES) {
      expect(getParallelizationLevel(mode)).toBe(MODE_PARALLELIZATION[mode]);
    }
  });
});

describe('supportsLastOnlyParallelization', () => {
  it('should return true only for devils-advocate', () => {
    for (const mode of ALL_MODES) {
      if (mode === 'devils-advocate') {
        expect(supportsLastOnlyParallelization(mode)).toBe(true);
      } else {
        expect(supportsLastOnlyParallelization(mode)).toBe(false);
      }
    }
  });

  it('should return false for all sequential modes except devils-advocate', () => {
    expect(supportsLastOnlyParallelization('adversarial')).toBe(false);
    expect(supportsLastOnlyParallelization('socratic')).toBe(false);
  });

  it('should return false for all parallel modes', () => {
    for (const mode of PARALLEL_MODES) {
      expect(supportsLastOnlyParallelization(mode)).toBe(false);
    }
  });
});

describe('ParallelizationLevel Type', () => {
  it('should have all valid levels in MODE_PARALLELIZATION values', () => {
    const validLevels: ParallelizationLevel[] = ['none', 'last-only', 'full'];
    const usedLevels = new Set(Object.values(MODE_PARALLELIZATION));

    for (const level of usedLevels) {
      expect(validLevels).toContain(level);
    }
  });
});
