/**
 * Perspective Generator - Creates analysis perspectives for Expert Panel mode
 *
 * Handles auto-generation of perspectives using Light Models and normalization
 * of user-provided perspectives to the GeneratedPerspective format.
 */

import { jsonrepair } from 'jsonrepair';
import type { BaseAgent } from '../../agents/base.js';
import type { GeneratedPerspective, Perspective } from '../../types/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('PerspectiveGenerator');

/**
 * Build the prompt for Light Model perspective generation
 */
function buildGenerationPrompt(topic: string, agentCount: number): string {
  return `You are an expert at designing multi-perspective analysis frameworks.

Topic: "${topic}"
Number of perspectives needed: ${agentCount}

Generate ${agentCount} distinct analysis perspectives for this topic. Each perspective should:
- Be clearly different from others (no significant overlap)
- Be highly relevant to the specific topic
- Have depth potential for expert-level analysis

Return ONLY a valid JSON array with no additional text:
[
  {
    "name": "Perspective name (concise, 2-4 words)",
    "description": "What this perspective focuses on (1-2 sentences)",
    "focusAreas": ["specific area 1", "specific area 2", "specific area 3"],
    "evidenceTypes": ["evidence type 1", "evidence type 2"],
    "keyQuestions": ["key question this perspective should address"],
    "antiPatterns": ["what this perspective should NOT do"]
  }
]

Requirements:
- Each perspective must have ALL fields populated
- Focus areas should be specific to the topic, not generic
- Evidence types should match what an expert in this domain would use
- Key questions should be thought-provoking and specific
- Anti-patterns should prevent common mistakes in this domain`;
}

/**
 * Parse the Light Model response into GeneratedPerspective array
 */
function parsePerspectives(response: string): GeneratedPerspective[] {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Handle cases where the model wraps JSON in markdown code blocks
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch && jsonMatch[1]) {
    jsonStr = jsonMatch[1].trim();
  }

  // Try to find the JSON array directly
  const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    jsonStr = arrayMatch[0];
  }

  try {
    // Attempt to repair malformed JSON (common with AI responses)
    const repairedJson = jsonrepair(jsonStr);
    const parsed = JSON.parse(repairedJson);

    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }

    // Validate and normalize each perspective
    return parsed.map((p, index) => ({
      name: String(p.name || `Perspective ${index + 1}`),
      description: String(p.description || ''),
      focusAreas: Array.isArray(p.focusAreas) ? p.focusAreas.map(String) : [],
      evidenceTypes: Array.isArray(p.evidenceTypes) ? p.evidenceTypes.map(String) : [],
      keyQuestions: Array.isArray(p.keyQuestions) ? p.keyQuestions.map(String) : [],
      antiPatterns: Array.isArray(p.antiPatterns) ? p.antiPatterns.map(String) : [],
    }));
  } catch (error) {
    logger.error({ error, response: jsonStr.slice(0, 500) }, 'Failed to parse perspectives JSON');
    throw new Error(
      `Failed to parse perspectives: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Generate default fallback perspectives when Light Model fails
 */
function getDefaultPerspectives(agentCount: number): GeneratedPerspective[] {
  const defaults: GeneratedPerspective[] = [
    {
      name: 'Technical perspective',
      description: 'Analyze from a technical and implementation standpoint',
      focusAreas: ['Implementation feasibility', 'Technical constraints', 'System requirements'],
      evidenceTypes: ['Technical documentation', 'Case studies', 'Expert analysis'],
      keyQuestions: ['Is this technically feasible?', 'What are the technical challenges?'],
      antiPatterns: ['Ignoring practical limitations', 'Overly theoretical analysis'],
    },
    {
      name: 'Economic perspective',
      description: 'Analyze from an economic and resource allocation standpoint',
      focusAreas: ['Cost-benefit analysis', 'Market dynamics', 'Resource allocation'],
      evidenceTypes: ['Economic data', 'Market research', 'Financial analysis'],
      keyQuestions: ['What are the economic implications?', 'Is this economically viable?'],
      antiPatterns: ['Ignoring non-monetary factors', 'Short-term thinking only'],
    },
    {
      name: 'Ethical perspective',
      description: 'Analyze from an ethical and moral standpoint',
      focusAreas: ['Moral implications', 'Stakeholder impact', 'Long-term consequences'],
      evidenceTypes: ['Ethical frameworks', 'Philosophical arguments', 'Case precedents'],
      keyQuestions: ['Is this ethically sound?', 'Who benefits and who is harmed?'],
      antiPatterns: ['Moral absolutism', 'Ignoring cultural context'],
    },
    {
      name: 'Social perspective',
      description: 'Analyze from a social and human impact standpoint',
      focusAreas: ['Community impact', 'Social dynamics', 'Human behavior'],
      evidenceTypes: ['Social research', 'Survey data', 'Behavioral studies'],
      keyQuestions: ['How does this affect society?', 'What are the social implications?'],
      antiPatterns: ['Ignoring diverse viewpoints', 'Assuming homogeneous society'],
    },
  ];

  // Return the required number of perspectives, cycling through defaults if needed
  // Non-null assertion is safe: defaults has 4 elements and modulo ensures valid index
  return Array.from({ length: agentCount }, (_, i) => defaults[i % defaults.length]!);
}

/**
 * Generate perspectives for a topic using a Light Model
 *
 * @param topic - The debate topic
 * @param agentCount - Number of perspectives needed (matches agent count)
 * @param lightAgent - Light Model agent for generation
 * @returns Generated perspectives array
 */
export async function generatePerspectives(
  topic: string,
  agentCount: number,
  lightAgent: BaseAgent
): Promise<GeneratedPerspective[]> {
  logger.info({ topic, agentCount }, 'Generating perspectives using Light Model');

  const prompt = buildGenerationPrompt(topic, agentCount);

  try {
    const response = await lightAgent.generateRawCompletion(prompt);
    const perspectives = parsePerspectives(response);

    // Ensure we have the right number of perspectives
    if (perspectives.length !== agentCount) {
      logger.warn(
        { expected: agentCount, got: perspectives.length },
        'Generated perspective count mismatch, adjusting'
      );

      if (perspectives.length < agentCount) {
        // Pad with default perspectives
        const defaults = getDefaultPerspectives(agentCount - perspectives.length);
        return [...perspectives, ...defaults].slice(0, agentCount);
      }

      // Trim to required count
      return perspectives.slice(0, agentCount);
    }

    logger.info(
      { perspectives: perspectives.map((p) => p.name) },
      'Perspectives generated successfully'
    );
    return perspectives;
  } catch (error) {
    logger.error({ error, topic }, 'Failed to generate perspectives, using defaults');
    return getDefaultPerspectives(agentCount);
  }
}

/**
 * Normalize user-provided perspectives to GeneratedPerspective format
 *
 * Handles three input types:
 * - string: Just the perspective name
 * - Perspective: Name with optional description
 * - GeneratedPerspective: Full perspective (passed through)
 *
 * @param input - User-provided perspectives (can be empty/undefined)
 * @param generated - Pre-generated perspectives to use if input is empty
 * @returns Normalized GeneratedPerspective array
 */
export function normalizePerspectives(
  input: Array<string | Perspective> | undefined,
  generated: GeneratedPerspective[]
): GeneratedPerspective[] {
  // Use generated perspectives if input is empty or undefined
  if (!input || input.length === 0) {
    return generated;
  }

  return input.map((p) => {
    if (typeof p === 'string') {
      return {
        name: p,
        description: '',
        focusAreas: [],
        evidenceTypes: [],
        keyQuestions: [],
        antiPatterns: [],
      };
    }

    // Check if it's already a GeneratedPerspective (has focusAreas)
    const maybeGenerated = p as Partial<GeneratedPerspective>;
    if (maybeGenerated.focusAreas !== undefined) {
      return {
        name: maybeGenerated.name || '',
        description: maybeGenerated.description || '',
        focusAreas: maybeGenerated.focusAreas || [],
        evidenceTypes: maybeGenerated.evidenceTypes || [],
        keyQuestions: maybeGenerated.keyQuestions || [],
        antiPatterns: maybeGenerated.antiPatterns || [],
      };
    }

    // It's a basic Perspective object
    return {
      name: p.name,
      description: p.description || '',
      focusAreas: [],
      evidenceTypes: [],
      keyQuestions: [],
      antiPatterns: [],
    };
  });
}

/**
 * Check if perspectives need to be generated
 *
 * @param mode - Debate mode
 * @param perspectives - User-provided perspectives
 * @returns True if perspectives should be generated
 */
export function needsPerspectiveGeneration(
  mode: string,
  perspectives: Array<string | Perspective> | undefined
): boolean {
  // Only expert-panel mode uses perspectives
  if (mode !== 'expert-panel') {
    return false;
  }

  // Generate if no perspectives provided or empty array
  return !perspectives || perspectives.length === 0;
}
