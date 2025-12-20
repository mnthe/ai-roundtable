import { describe, it, expect } from 'vitest';
import {
  checkExitCriteria,
  checkPositionConvergence,
  createDefaultExitCriteria,
  validateExitCriteria,
} from '../../../src/core/exit-criteria.js';
import type { AgentResponse, ConsensusResult, ExitCriteria } from '../../../src/types/index.js';

/**
 * Helper to create a mock agent response
 */
function createResponse(
  id: string,
  options: {
    position?: string;
    confidence?: number;
    reasoning?: string;
  } = {}
): AgentResponse {
  return {
    agentId: id,
    agentName: `Agent ${id}`,
    position: options.position ?? `Position from agent ${id}`,
    reasoning: options.reasoning ?? `Reasoning from agent ${id}`,
    confidence: options.confidence ?? 0.8,
    timestamp: new Date(),
  };
}

/**
 * Helper to create a mock consensus result
 */
function createConsensus(agreementLevel: number): ConsensusResult {
  return {
    agreementLevel,
    commonGround: ['Common point'],
    disagreementPoints: [],
    summary: `Agreement level: ${agreementLevel}`,
  };
}

describe('checkExitCriteria', () => {
  const defaultCriteria: ExitCriteria = {
    maxRounds: 5,
    consensusThreshold: 0.9,
    convergenceRounds: 2,
    confidenceThreshold: 0.85,
  };

  describe('edge cases', () => {
    it('should return no exit for empty responses', () => {
      const result = checkExitCriteria([], [], defaultCriteria, 1);

      expect(result.shouldExit).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.details).toContain('No responses');
    });

    it('should use default values when optional criteria not provided', () => {
      const minimalCriteria: ExitCriteria = { maxRounds: 3 };
      const responses = [createResponse('1', { confidence: 0.5 })];

      const result = checkExitCriteria(responses, [], minimalCriteria, 1);

      expect(result.shouldExit).toBe(false);
      expect(result.reason).toBeNull();
    });
  });

  describe('consensus threshold', () => {
    it('should exit when consensus threshold is met', () => {
      const responses = [
        createResponse('1', { confidence: 0.7 }),
        createResponse('2', { confidence: 0.8 }),
      ];
      const consensus = createConsensus(0.92);

      const result = checkExitCriteria(responses, [], defaultCriteria, 1, consensus);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('consensus');
      expect(result.details).toContain('92.0%');
      expect(result.details).toContain('90.0%');
    });

    it('should exit when consensus exactly meets threshold', () => {
      const responses = [createResponse('1')];
      const consensus = createConsensus(0.9);

      const result = checkExitCriteria(responses, [], defaultCriteria, 1, consensus);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('consensus');
    });

    it('should not exit when consensus is below threshold', () => {
      const responses = [createResponse('1')];
      const consensus = createConsensus(0.85);

      const result = checkExitCriteria(responses, [], defaultCriteria, 1, consensus);

      // Should not exit for consensus (may exit for other reasons)
      expect(result.reason).not.toBe('consensus');
    });

    it('should not check consensus when no consensus result provided', () => {
      const responses = [createResponse('1')];

      const result = checkExitCriteria(responses, [], defaultCriteria, 1);

      expect(result.reason).not.toBe('consensus');
    });
  });

  describe('convergence detection', () => {
    it('should exit when positions converge across required rounds', () => {
      const position = 'AI will transform software development';
      const round1 = [createResponse('1', { position, confidence: 0.7 })];
      const round2 = [createResponse('1', { position, confidence: 0.75 })];
      const round3 = [createResponse('1', { position, confidence: 0.78 })];

      const result = checkExitCriteria(
        round3,
        [round1, round2],
        defaultCriteria,
        3
      );

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('convergence');
      expect(result.details).toContain('stabilized');
    });

    it('should not exit when positions are still changing', () => {
      // Use completely different positions to avoid similarity matching
      const round1 = [createResponse('1', { position: 'Nuclear power is the best energy source for sustainable development', confidence: 0.5 })];
      const round2 = [createResponse('1', { position: 'Solar panels provide the most eco-friendly electricity generation', confidence: 0.6 })];
      const round3 = [createResponse('1', { position: 'Wind turbines offer efficient renewable power production', confidence: 0.7 })];

      const result = checkExitCriteria(
        round3,
        [round1, round2],
        defaultCriteria,
        3
      );

      // Should not exit for convergence
      expect(result.reason).not.toBe('convergence');
    });

    it('should not check convergence when not enough rounds', () => {
      const responses = [createResponse('1', { confidence: 0.5 })];

      const result = checkExitCriteria(responses, [], defaultCriteria, 1);

      expect(result.reason).not.toBe('convergence');
    });

    it('should handle multiple agents converging', () => {
      const position1 = 'Agent 1 stable position on AI development';
      const position2 = 'Agent 2 stable position on technology';

      const round1 = [
        createResponse('1', { position: position1 }),
        createResponse('2', { position: position2 }),
      ];
      const round2 = [
        createResponse('1', { position: position1 }),
        createResponse('2', { position: position2 }),
      ];
      const round3 = [
        createResponse('1', { position: position1 }),
        createResponse('2', { position: position2 }),
      ];

      const result = checkExitCriteria(
        round3,
        [round1, round2],
        defaultCriteria,
        3
      );

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('convergence');
    });

    it('should not exit when one agent still changing', () => {
      const stablePosition = 'Stable position on the topic';

      const round1 = [
        createResponse('1', { position: stablePosition }),
        createResponse('2', { position: 'First view', confidence: 0.5 }),
      ];
      const round2 = [
        createResponse('1', { position: stablePosition }),
        createResponse('2', { position: 'Second view', confidence: 0.5 }),
      ];
      const round3 = [
        createResponse('1', { position: stablePosition }),
        createResponse('2', { position: 'Third view', confidence: 0.5 }),
      ];

      const result = checkExitCriteria(
        round3,
        [round1, round2],
        defaultCriteria,
        3
      );

      // Should not converge because agent 2 keeps changing
      expect(result.reason).not.toBe('convergence');
    });
  });

  describe('confidence threshold', () => {
    it('should exit when all agents are confident', () => {
      const responses = [
        createResponse('1', { confidence: 0.90 }),
        createResponse('2', { confidence: 0.88 }),
        createResponse('3', { confidence: 0.92 }),
      ];

      const result = checkExitCriteria(responses, [], defaultCriteria, 1);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('confidence');
      expect(result.details).toContain('All 3 agents');
      expect(result.details).toContain('85.0%');
    });

    it('should exit when exactly at threshold', () => {
      const responses = [
        createResponse('1', { confidence: 0.85 }),
        createResponse('2', { confidence: 0.85 }),
      ];

      const result = checkExitCriteria(responses, [], defaultCriteria, 1);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('confidence');
    });

    it('should not exit when one agent below threshold', () => {
      const responses = [
        createResponse('1', { confidence: 0.90 }),
        createResponse('2', { confidence: 0.80 }), // Below 0.85
        createResponse('3', { confidence: 0.88 }),
      ];

      const result = checkExitCriteria(responses, [], defaultCriteria, 1);

      expect(result.reason).not.toBe('confidence');
    });

    it('should report average confidence in details', () => {
      const responses = [
        createResponse('1', { confidence: 0.90 }),
        createResponse('2', { confidence: 0.86 }),
      ];

      const result = checkExitCriteria(responses, [], defaultCriteria, 1);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('confidence');
      expect(result.details).toContain('88.0%'); // avg of 0.90 and 0.86
    });
  });

  describe('max rounds', () => {
    it('should exit when max rounds reached', () => {
      const responses = [createResponse('1', { confidence: 0.5 })];

      const result = checkExitCriteria(responses, [], defaultCriteria, 5);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('max_rounds');
      expect(result.details).toContain('5/5');
    });

    it('should exit when exceeding max rounds', () => {
      const responses = [createResponse('1', { confidence: 0.5 })];

      const result = checkExitCriteria(responses, [], defaultCriteria, 6);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('max_rounds');
    });

    it('should not exit before max rounds if no other criteria met', () => {
      const responses = [createResponse('1', { confidence: 0.5 })];

      const result = checkExitCriteria(responses, [], defaultCriteria, 4);

      expect(result.shouldExit).toBe(false);
      expect(result.reason).toBeNull();
      expect(result.details).toContain('round 4/5');
    });
  });

  describe('priority order', () => {
    it('should prioritize consensus over convergence', () => {
      const position = 'Stable position';
      const round1 = [createResponse('1', { position })];
      const round2 = [createResponse('1', { position })];
      const round3 = [createResponse('1', { position })];
      const consensus = createConsensus(0.95);

      const result = checkExitCriteria(
        round3,
        [round1, round2],
        defaultCriteria,
        3,
        consensus
      );

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('consensus');
    });

    it('should prioritize convergence over confidence', () => {
      const position = 'Stable position across all rounds';
      const round1 = [createResponse('1', { position, confidence: 0.90 })];
      const round2 = [createResponse('1', { position, confidence: 0.90 })];
      const round3 = [createResponse('1', { position, confidence: 0.90 })];

      const result = checkExitCriteria(
        round3,
        [round1, round2],
        defaultCriteria,
        3
      );

      // Both convergence and confidence would trigger, but convergence comes first
      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('convergence');
    });

    it('should prioritize confidence over max_rounds', () => {
      const responses = [createResponse('1', { confidence: 0.90 })];

      const result = checkExitCriteria(responses, [], defaultCriteria, 5);

      // Both confidence and max_rounds would trigger
      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('confidence');
    });
  });

  describe('custom thresholds', () => {
    it('should respect custom consensus threshold', () => {
      const customCriteria: ExitCriteria = {
        maxRounds: 5,
        consensusThreshold: 0.7, // Lower threshold
      };
      const responses = [createResponse('1')];
      const consensus = createConsensus(0.75);

      const result = checkExitCriteria(responses, [], customCriteria, 1, consensus);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('consensus');
    });

    it('should respect custom confidence threshold', () => {
      const customCriteria: ExitCriteria = {
        maxRounds: 5,
        confidenceThreshold: 0.6, // Lower threshold
      };
      const responses = [createResponse('1', { confidence: 0.65 })];

      const result = checkExitCriteria(responses, [], customCriteria, 1);

      expect(result.shouldExit).toBe(true);
      expect(result.reason).toBe('confidence');
    });

    it('should respect custom convergence rounds', () => {
      const customCriteria: ExitCriteria = {
        maxRounds: 10,
        convergenceRounds: 3, // Require 3 stable rounds instead of 2
      };
      const position = 'Stable position';

      // Only 2 stable rounds (need 3)
      const round1 = [createResponse('1', { position: 'Different', confidence: 0.5 })];
      const round2 = [createResponse('1', { position, confidence: 0.5 })];
      const round3 = [createResponse('1', { position, confidence: 0.5 })];
      const round4 = [createResponse('1', { position, confidence: 0.5 })];

      const result = checkExitCriteria(
        round4,
        [round1, round2, round3],
        customCriteria,
        4
      );

      // Should not converge with only 2 stable rounds (need 3)
      expect(result.reason).not.toBe('convergence');
    });
  });
});

describe('checkPositionConvergence', () => {
  it('should return converged=false for insufficient rounds', () => {
    const rounds = [[createResponse('1')]];

    const result = checkPositionConvergence(rounds, 2);

    expect(result.converged).toBe(false);
  });

  it('should detect convergence for identical positions', () => {
    const position = 'The exact same position text';
    const rounds = [
      [createResponse('1', { position })],
      [createResponse('1', { position })],
      [createResponse('1', { position })],
    ];

    const result = checkPositionConvergence(rounds, 2);

    expect(result.converged).toBe(true);
    expect(result.details).toContain('stable');
  });

  it('should detect convergence for similar positions', () => {
    const rounds = [
      [createResponse('1', { position: 'AI will transform the software industry significantly' })],
      [createResponse('1', { position: 'AI will transform the software industry dramatically' })],
      [createResponse('1', { position: 'AI will transform the software industry considerably' })],
    ];

    const result = checkPositionConvergence(rounds, 2);

    expect(result.converged).toBe(true);
  });

  it('should not detect convergence for changing positions', () => {
    const rounds = [
      [createResponse('1', { position: 'First completely different viewpoint on the topic' })],
      [createResponse('1', { position: 'Second entirely new perspective on matters' })],
      [createResponse('1', { position: 'Third totally changed opinion about things' })],
    ];

    const result = checkPositionConvergence(rounds, 2);

    expect(result.converged).toBe(false);
    expect(result.details).toContain('changing');
  });

  it('should handle multiple agents', () => {
    const rounds = [
      [
        createResponse('1', { position: 'Agent 1 position A' }),
        createResponse('2', { position: 'Agent 2 position B' }),
      ],
      [
        createResponse('1', { position: 'Agent 1 position A' }),
        createResponse('2', { position: 'Agent 2 position B' }),
      ],
      [
        createResponse('1', { position: 'Agent 1 position A' }),
        createResponse('2', { position: 'Agent 2 position B' }),
      ],
    ];

    const result = checkPositionConvergence(rounds, 2);

    expect(result.converged).toBe(true);
  });

  it('should not converge when agents have different stability', () => {
    const rounds = [
      [
        createResponse('1', { position: 'Stable position A' }),
        createResponse('2', { position: 'First view' }),
      ],
      [
        createResponse('1', { position: 'Stable position A' }),
        createResponse('2', { position: 'Second view' }),
      ],
      [
        createResponse('1', { position: 'Stable position A' }),
        createResponse('2', { position: 'Third view' }),
      ],
    ];

    const result = checkPositionConvergence(rounds, 2);

    expect(result.converged).toBe(false);
  });

  it('should handle agent not present in all rounds', () => {
    const rounds = [
      [createResponse('1', { position: 'Position' })],
      [
        createResponse('1', { position: 'Position' }),
        createResponse('2', { position: 'New agent' }),
      ],
      [
        createResponse('1', { position: 'Position' }),
        createResponse('2', { position: 'New agent' }),
      ],
    ];

    const result = checkPositionConvergence(rounds, 2);

    // Agent 2 doesn't have enough history, so should be skipped
    // Agent 1 is stable, so convergence should still be detected
    expect(result.converged).toBe(true);
  });
});

describe('createDefaultExitCriteria', () => {
  it('should create criteria with specified max rounds', () => {
    const criteria = createDefaultExitCriteria(5);

    expect(criteria.maxRounds).toBe(5);
    expect(criteria.consensusThreshold).toBe(0.9);
    expect(criteria.convergenceRounds).toBe(2);
    expect(criteria.confidenceThreshold).toBe(0.85);
  });

  it('should work with different max round values', () => {
    const criteria1 = createDefaultExitCriteria(1);
    const criteria10 = createDefaultExitCriteria(10);

    expect(criteria1.maxRounds).toBe(1);
    expect(criteria10.maxRounds).toBe(10);
  });
});

describe('validateExitCriteria', () => {
  it('should return no errors for valid criteria', () => {
    const criteria: ExitCriteria = {
      maxRounds: 5,
      consensusThreshold: 0.8,
      convergenceRounds: 2,
      confidenceThreshold: 0.7,
    };

    const errors = validateExitCriteria(criteria);

    expect(errors).toHaveLength(0);
  });

  it('should detect invalid maxRounds', () => {
    const criteria: ExitCriteria = { maxRounds: 0 };

    const errors = validateExitCriteria(criteria);

    expect(errors).toContain('maxRounds must be at least 1');
  });

  it('should detect negative maxRounds', () => {
    const criteria: ExitCriteria = { maxRounds: -1 };

    const errors = validateExitCriteria(criteria);

    expect(errors).toContain('maxRounds must be at least 1');
  });

  it('should detect invalid consensusThreshold (too high)', () => {
    const criteria: ExitCriteria = {
      maxRounds: 5,
      consensusThreshold: 1.5,
    };

    const errors = validateExitCriteria(criteria);

    expect(errors).toContain('consensusThreshold must be between 0 and 1');
  });

  it('should detect invalid consensusThreshold (negative)', () => {
    const criteria: ExitCriteria = {
      maxRounds: 5,
      consensusThreshold: -0.1,
    };

    const errors = validateExitCriteria(criteria);

    expect(errors).toContain('consensusThreshold must be between 0 and 1');
  });

  it('should detect invalid convergenceRounds', () => {
    const criteria: ExitCriteria = {
      maxRounds: 5,
      convergenceRounds: 0,
    };

    const errors = validateExitCriteria(criteria);

    expect(errors).toContain('convergenceRounds must be at least 1');
  });

  it('should detect invalid confidenceThreshold', () => {
    const criteria: ExitCriteria = {
      maxRounds: 5,
      confidenceThreshold: 2.0,
    };

    const errors = validateExitCriteria(criteria);

    expect(errors).toContain('confidenceThreshold must be between 0 and 1');
  });

  it('should collect multiple errors', () => {
    const criteria: ExitCriteria = {
      maxRounds: 0,
      consensusThreshold: 1.5,
      convergenceRounds: 0,
      confidenceThreshold: -0.5,
    };

    const errors = validateExitCriteria(criteria);

    expect(errors.length).toBe(4);
    expect(errors).toContain('maxRounds must be at least 1');
    expect(errors).toContain('consensusThreshold must be between 0 and 1');
    expect(errors).toContain('convergenceRounds must be at least 1');
    expect(errors).toContain('confidenceThreshold must be between 0 and 1');
  });

  it('should accept boundary values', () => {
    const criteria: ExitCriteria = {
      maxRounds: 1,
      consensusThreshold: 0,
      convergenceRounds: 1,
      confidenceThreshold: 1,
    };

    const errors = validateExitCriteria(criteria);

    expect(errors).toHaveLength(0);
  });

  it('should not validate undefined optional fields', () => {
    const criteria: ExitCriteria = { maxRounds: 5 };

    const errors = validateExitCriteria(criteria);

    expect(errors).toHaveLength(0);
  });
});

describe('real-world scenarios', () => {
  it('should handle typical debate progression to consensus', () => {
    const criteria: ExitCriteria = {
      maxRounds: 5,
      consensusThreshold: 0.85,
    };

    // Round 1: Low consensus
    const round1Responses = [
      createResponse('claude', { position: 'AI will help developers', confidence: 0.7 }),
      createResponse('gpt', { position: 'AI might replace some tasks', confidence: 0.6 }),
    ];
    const round1Consensus = createConsensus(0.5);

    let result = checkExitCriteria(round1Responses, [], criteria, 1, round1Consensus);
    expect(result.shouldExit).toBe(false);

    // Round 2: Building consensus
    const round2Responses = [
      createResponse('claude', { position: 'AI will augment developers', confidence: 0.75 }),
      createResponse('gpt', { position: 'AI will augment human capabilities', confidence: 0.72 }),
    ];
    const round2Consensus = createConsensus(0.7);

    result = checkExitCriteria(
      round2Responses,
      [round1Responses],
      criteria,
      2,
      round2Consensus
    );
    expect(result.shouldExit).toBe(false);

    // Round 3: High consensus reached
    const round3Responses = [
      createResponse('claude', { position: 'AI augments developer productivity', confidence: 0.85 }),
      createResponse('gpt', { position: 'AI augments developer capabilities', confidence: 0.87 }),
    ];
    const round3Consensus = createConsensus(0.9);

    result = checkExitCriteria(
      round3Responses,
      [round1Responses, round2Responses],
      criteria,
      3,
      round3Consensus
    );
    expect(result.shouldExit).toBe(true);
    expect(result.reason).toBe('consensus');
  });

  it('should exit early on strong confidence without consensus', () => {
    const criteria: ExitCriteria = {
      maxRounds: 5,
      confidenceThreshold: 0.9,
    };

    // All agents are very confident from the start
    const responses = [
      createResponse('claude', { confidence: 0.95 }),
      createResponse('gpt', { confidence: 0.92 }),
      createResponse('gemini', { confidence: 0.91 }),
    ];

    const result = checkExitCriteria(responses, [], criteria, 1);

    expect(result.shouldExit).toBe(true);
    expect(result.reason).toBe('confidence');
  });

  it('should reach max rounds for contentious topics', () => {
    const criteria: ExitCriteria = {
      maxRounds: 3,
      consensusThreshold: 0.95,
      confidenceThreshold: 0.95,
    };

    // Agents maintain different positions
    const round1 = [
      createResponse('claude', { position: 'Position A', confidence: 0.7 }),
      createResponse('gpt', { position: 'Position B', confidence: 0.7 }),
    ];
    const round2 = [
      createResponse('claude', { position: 'Refined A', confidence: 0.75 }),
      createResponse('gpt', { position: 'Refined B', confidence: 0.75 }),
    ];
    const round3 = [
      createResponse('claude', { position: 'Final A', confidence: 0.8 }),
      createResponse('gpt', { position: 'Final B', confidence: 0.8 }),
    ];
    const consensus = createConsensus(0.5);

    const result = checkExitCriteria(
      round3,
      [round1, round2],
      criteria,
      3,
      consensus
    );

    expect(result.shouldExit).toBe(true);
    expect(result.reason).toBe('max_rounds');
  });
});
