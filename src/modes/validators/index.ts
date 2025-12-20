/**
 * Response Validators - Standardized validation for AI agent responses
 *
 * Validators ensure response quality and enforce mode-specific requirements.
 * They can modify responses to fix issues (e.g., clamping confidence values)
 * or enforce constraints (e.g., expected stance in devils-advocate mode).
 */

import type { AgentResponse, DebateContext, Stance } from '../../types/index.js';

// ============================================
// Interfaces
// ============================================

/**
 * Interface for response validators.
 * Validators transform AgentResponse to ensure quality and consistency.
 */
export interface ResponseValidator {
  /** Unique name for the validator */
  readonly name: string;

  /**
   * Validate and potentially modify a response.
   * @param response - The agent response to validate
   * @param context - The debate context for mode-specific validation
   * @returns The validated (possibly modified) response
   */
  validate(response: AgentResponse, context: DebateContext): AgentResponse;
}

// ============================================
// Validators
// ============================================

/**
 * Enforces a specific stance on the response.
 * Used in devils-advocate mode to ensure agents maintain their assigned roles.
 */
export class StanceValidator implements ResponseValidator {
  readonly name = 'stance';

  constructor(private expectedStance: Stance) {}

  validate(response: AgentResponse, _context: DebateContext): AgentResponse {
    if (response.stance !== this.expectedStance) {
      return { ...response, stance: this.expectedStance };
    }
    return response;
  }
}

/**
 * Clamps confidence values to the valid range [0, 1].
 * Ensures confidence is always a valid probability.
 */
export class ConfidenceRangeValidator implements ResponseValidator {
  readonly name = 'confidence-range';

  validate(response: AgentResponse, _context: DebateContext): AgentResponse {
    const clamped = Math.max(0, Math.min(1, response.confidence));
    if (clamped !== response.confidence) {
      return { ...response, confidence: clamped };
    }
    return response;
  }
}

/**
 * Ensures required fields (position and reasoning) are non-empty.
 * Provides default values for missing content.
 */
export class RequiredFieldsValidator implements ResponseValidator {
  readonly name = 'required-fields';

  validate(response: AgentResponse, _context: DebateContext): AgentResponse {
    let modified = false;
    let position = response.position;
    let reasoning = response.reasoning;

    if (!position || position.trim() === '') {
      position = 'No position provided';
      modified = true;
    }

    if (!reasoning || reasoning.trim() === '') {
      reasoning = 'No reasoning provided';
      modified = true;
    }

    if (modified) {
      return { ...response, position, reasoning };
    }
    return response;
  }
}

/**
 * Composes multiple validators into a single chain.
 * Validators are applied in order, with each receiving the output of the previous.
 */
export class ValidatorChain implements ResponseValidator {
  readonly name = 'chain';

  constructor(private validators: ResponseValidator[]) {}

  validate(response: AgentResponse, context: DebateContext): AgentResponse {
    let result = response;
    for (const validator of this.validators) {
      result = validator.validate(result, context);
    }
    return result;
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Creates a StanceValidator that enforces the specified stance.
 * @param stance - The expected stance (YES, NO, or NEUTRAL)
 */
export function createStanceValidator(stance: Stance): StanceValidator {
  return new StanceValidator(stance);
}

/**
 * Creates a ConfidenceRangeValidator that clamps confidence to [0, 1].
 */
export function createConfidenceRangeValidator(): ConfidenceRangeValidator {
  return new ConfidenceRangeValidator();
}

/**
 * Creates a RequiredFieldsValidator that ensures position and reasoning are non-empty.
 */
export function createRequiredFieldsValidator(): RequiredFieldsValidator {
  return new RequiredFieldsValidator();
}

/**
 * Creates a ValidatorChain that applies multiple validators in sequence.
 * @param validators - Array of validators to chain together
 */
export function createValidatorChain(validators: ResponseValidator[]): ValidatorChain {
  return new ValidatorChain(validators);
}
