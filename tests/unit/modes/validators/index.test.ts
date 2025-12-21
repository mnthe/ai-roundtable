import { describe, it, expect, beforeEach } from 'vitest';
import {
  StanceValidator,
  ConfidenceRangeValidator,
  RequiredFieldsValidator,
  ValidatorChain,
  createStanceValidator,
  createConfidenceRangeValidator,
  createRequiredFieldsValidator,
  createValidatorChain,
  type ResponseValidator,
} from '../../../../src/modes/validators/index.js';
import type { AgentResponse, DebateContext } from '../../../../src/types/index.js';

describe('Response Validators', () => {
  const createMockResponse = (overrides: Partial<AgentResponse> = {}): AgentResponse => ({
    agentId: 'test-agent',
    agentName: 'Test Agent',
    position: 'Test position',
    reasoning: 'Test reasoning',
    confidence: 0.8,
    timestamp: new Date(),
    ...overrides,
  });

  const createMockContext = (overrides: Partial<DebateContext> = {}): DebateContext => ({
    sessionId: 'test-session',
    topic: 'Test topic',
    mode: 'collaborative',
    currentRound: 1,
    totalRounds: 3,
    previousResponses: [],
    ...overrides,
  });

  describe('StanceValidator', () => {
    it('should mark role violation when stance differs (does NOT force-correct)', () => {
      const validator = new StanceValidator('YES');
      const response = createMockResponse({ stance: 'NO' });
      const context = createMockContext();

      const result = validator.validate(response, context);

      // Stance is preserved (not force-corrected)
      expect(result.stance).toBe('NO');
      // Role violation is marked
      expect(result._roleViolation).toEqual({
        expected: 'YES',
        actual: 'NO',
      });
      expect(result).not.toBe(response); // Should be a new object
    });

    it('should preserve correct stance without marking violation', () => {
      const validator = new StanceValidator('NO');
      const response = createMockResponse({ stance: 'NO' });
      const context = createMockContext();

      const result = validator.validate(response, context);

      expect(result.stance).toBe('NO');
      expect(result._roleViolation).toBeUndefined();
      expect(result).toBe(response); // Should return same object
    });

    it('should mark role violation when stance is undefined', () => {
      const validator = new StanceValidator('NEUTRAL');
      const response = createMockResponse({ stance: undefined });
      const context = createMockContext();

      const result = validator.validate(response, context);

      // Stance is preserved (undefined)
      expect(result.stance).toBeUndefined();
      // Role violation is marked
      expect(result._roleViolation).toEqual({
        expected: 'NEUTRAL',
        actual: null,
      });
    });

    it('should have correct name', () => {
      const validator = new StanceValidator('YES');
      expect(validator.name).toBe('stance');
    });
  });

  describe('ConfidenceRangeValidator', () => {
    let validator: ConfidenceRangeValidator;
    let context: DebateContext;

    beforeEach(() => {
      validator = new ConfidenceRangeValidator();
      context = createMockContext();
    });

    it('should clamp confidence above 1', () => {
      const response = createMockResponse({ confidence: 1.5 });

      const result = validator.validate(response, context);

      expect(result.confidence).toBe(1);
      expect(result).not.toBe(response);
    });

    it('should clamp confidence below 0', () => {
      const response = createMockResponse({ confidence: -0.5 });

      const result = validator.validate(response, context);

      expect(result.confidence).toBe(0);
      expect(result).not.toBe(response);
    });

    it('should preserve valid confidence at 0', () => {
      const response = createMockResponse({ confidence: 0 });

      const result = validator.validate(response, context);

      expect(result.confidence).toBe(0);
      expect(result).toBe(response);
    });

    it('should preserve valid confidence at 1', () => {
      const response = createMockResponse({ confidence: 1 });

      const result = validator.validate(response, context);

      expect(result.confidence).toBe(1);
      expect(result).toBe(response);
    });

    it('should preserve valid confidence in middle of range', () => {
      const response = createMockResponse({ confidence: 0.5 });

      const result = validator.validate(response, context);

      expect(result.confidence).toBe(0.5);
      expect(result).toBe(response);
    });

    it('should have correct name', () => {
      expect(validator.name).toBe('confidence-range');
    });
  });

  describe('RequiredFieldsValidator', () => {
    let validator: RequiredFieldsValidator;
    let context: DebateContext;

    beforeEach(() => {
      validator = new RequiredFieldsValidator();
      context = createMockContext();
    });

    it('should handle empty position', () => {
      const response = createMockResponse({ position: '' });

      const result = validator.validate(response, context);

      expect(result.position).toBe('No position provided');
      expect(result).not.toBe(response);
    });

    it('should handle whitespace-only position', () => {
      const response = createMockResponse({ position: '   ' });

      const result = validator.validate(response, context);

      expect(result.position).toBe('No position provided');
    });

    it('should handle empty reasoning', () => {
      const response = createMockResponse({ reasoning: '' });

      const result = validator.validate(response, context);

      expect(result.reasoning).toBe('No reasoning provided');
      expect(result).not.toBe(response);
    });

    it('should handle whitespace-only reasoning', () => {
      const response = createMockResponse({ reasoning: '\t\n' });

      const result = validator.validate(response, context);

      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should handle both empty position and reasoning', () => {
      const response = createMockResponse({ position: '', reasoning: '' });

      const result = validator.validate(response, context);

      expect(result.position).toBe('No position provided');
      expect(result.reasoning).toBe('No reasoning provided');
    });

    it('should preserve valid position and reasoning', () => {
      const response = createMockResponse({
        position: 'Valid position',
        reasoning: 'Valid reasoning',
      });

      const result = validator.validate(response, context);

      expect(result.position).toBe('Valid position');
      expect(result.reasoning).toBe('Valid reasoning');
      expect(result).toBe(response);
    });

    it('should have correct name', () => {
      expect(validator.name).toBe('required-fields');
    });
  });

  describe('ValidatorChain', () => {
    it('should apply validators in order', () => {
      const executionOrder: string[] = [];

      const validator1: ResponseValidator = {
        name: 'first',
        validate: (response, _context) => {
          executionOrder.push('first');
          return { ...response, position: response.position + ' - first' };
        },
      };

      const validator2: ResponseValidator = {
        name: 'second',
        validate: (response, _context) => {
          executionOrder.push('second');
          return { ...response, position: response.position + ' - second' };
        },
      };

      const chain = new ValidatorChain([validator1, validator2]);
      const response = createMockResponse({ position: 'Initial' });
      const context = createMockContext();

      const result = chain.validate(response, context);

      expect(executionOrder).toEqual(['first', 'second']);
      expect(result.position).toBe('Initial - first - second');
    });

    it('should pass context to all validators', () => {
      const receivedContexts: DebateContext[] = [];

      const validator1: ResponseValidator = {
        name: 'ctx-checker-1',
        validate: (response, context) => {
          receivedContexts.push(context);
          return response;
        },
      };

      const validator2: ResponseValidator = {
        name: 'ctx-checker-2',
        validate: (response, context) => {
          receivedContexts.push(context);
          return response;
        },
      };

      const chain = new ValidatorChain([validator1, validator2]);
      const response = createMockResponse();
      const context = createMockContext({ topic: 'Unique topic' });

      chain.validate(response, context);

      expect(receivedContexts).toHaveLength(2);
      expect(receivedContexts[0].topic).toBe('Unique topic');
      expect(receivedContexts[1].topic).toBe('Unique topic');
    });

    it('should work with empty validator array', () => {
      const chain = new ValidatorChain([]);
      const response = createMockResponse();
      const context = createMockContext();

      const result = chain.validate(response, context);

      expect(result).toBe(response);
    });

    it('should chain built-in validators correctly', () => {
      const chain = new ValidatorChain([
        new RequiredFieldsValidator(),
        new ConfidenceRangeValidator(),
        new StanceValidator('YES'),
      ]);

      const response = createMockResponse({
        position: '',
        confidence: 1.5,
        stance: 'NO',
      });
      const context = createMockContext();

      const result = chain.validate(response, context);

      expect(result.position).toBe('No position provided');
      expect(result.confidence).toBe(1);
      // StanceValidator no longer force-corrects, just marks violation
      expect(result.stance).toBe('NO');
      expect(result._roleViolation).toEqual({ expected: 'YES', actual: 'NO' });
    });

    it('should have correct name', () => {
      const chain = new ValidatorChain([]);
      expect(chain.name).toBe('chain');
    });
  });

  describe('Factory Functions', () => {
    it('createStanceValidator should create StanceValidator', () => {
      const validator = createStanceValidator('YES');

      expect(validator).toBeInstanceOf(StanceValidator);
      expect(validator.name).toBe('stance');

      const response = createMockResponse({ stance: 'NO' });
      const result = validator.validate(response, createMockContext());
      // StanceValidator marks violation, doesn't force-correct
      expect(result.stance).toBe('NO');
      expect(result._roleViolation).toEqual({ expected: 'YES', actual: 'NO' });
    });

    it('createConfidenceRangeValidator should create ConfidenceRangeValidator', () => {
      const validator = createConfidenceRangeValidator();

      expect(validator).toBeInstanceOf(ConfidenceRangeValidator);
      expect(validator.name).toBe('confidence-range');

      const response = createMockResponse({ confidence: 2.0 });
      const result = validator.validate(response, createMockContext());
      expect(result.confidence).toBe(1);
    });

    it('createRequiredFieldsValidator should create RequiredFieldsValidator', () => {
      const validator = createRequiredFieldsValidator();

      expect(validator).toBeInstanceOf(RequiredFieldsValidator);
      expect(validator.name).toBe('required-fields');

      const response = createMockResponse({ position: '' });
      const result = validator.validate(response, createMockContext());
      expect(result.position).toBe('No position provided');
    });

    it('createValidatorChain should create ValidatorChain', () => {
      const stanceValidator = createStanceValidator('NEUTRAL');
      const confidenceValidator = createConfidenceRangeValidator();
      const chain = createValidatorChain([stanceValidator, confidenceValidator]);

      expect(chain).toBeInstanceOf(ValidatorChain);
      expect(chain.name).toBe('chain');

      const response = createMockResponse({ stance: 'YES', confidence: 5 });
      const result = chain.validate(response, createMockContext());
      // StanceValidator marks violation, doesn't force-correct
      expect(result.stance).toBe('YES');
      expect(result._roleViolation).toEqual({ expected: 'NEUTRAL', actual: 'YES' });
      expect(result.confidence).toBe(1);
    });
  });
});
