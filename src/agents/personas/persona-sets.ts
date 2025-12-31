/**
 * Mode-Specific Persona Sets
 *
 * Defines the default personas for each debate mode.
 */

import type { DebateMode } from '../../types/index.js';
import type { PersonaTemplate } from './types.js';

/**
 * Collaborative mode personas - focus on building consensus
 */
const COLLABORATIVE_PERSONAS: PersonaTemplate[] = [
  { name: 'Synthesizer', trait: 'finding common ground and building consensus' },
  { name: 'Analyst', trait: 'analytical and evidence-based reasoning' },
  { name: 'Creative', trait: 'innovative thinking and exploring alternatives' },
  { name: 'Pragmatist', trait: 'practical implementation and feasibility focus' },
];

/**
 * Adversarial mode personas - opposing viewpoints
 */
const ADVERSARIAL_PERSONAS: PersonaTemplate[] = [
  { name: 'Proponent', trait: 'strongly advocating FOR the proposition' },
  { name: 'Opponent', trait: 'strongly advocating AGAINST the proposition' },
];

/**
 * Socratic mode personas - inquiry-based dialogue
 */
const SOCRATIC_PERSONAS: PersonaTemplate[] = [
  { name: 'Questioner', trait: 'asking probing questions to deepen understanding' },
  { name: 'Respondent', trait: 'providing thoughtful answers and explanations' },
];

/**
 * Expert panel mode personas - independent expert perspectives
 * Note: When perspectives are provided, those override these defaults
 */
const EXPERT_PANEL_PERSONAS: PersonaTemplate[] = [
  { name: 'Domain Expert', trait: 'deep domain knowledge and technical expertise' },
  { name: 'Generalist', trait: 'broad perspective and cross-domain connections' },
  { name: 'Skeptic', trait: 'critical evaluation and identifying weaknesses' },
  { name: 'Innovator', trait: 'forward-thinking and emerging trends focus' },
];

/**
 * Devils advocate mode personas - structured opposition
 */
const DEVILS_ADVOCATE_PERSONAS: PersonaTemplate[] = [
  { name: 'Advocate', trait: 'presenting and defending the main position' },
  { name: 'Challenger', trait: 'systematically challenging and finding flaws' },
  { name: 'Evaluator', trait: 'neutral evaluation and judgment' },
];

/**
 * Delphi mode personas - anonymized participants
 * Generated dynamically as "Participant N"
 */
const DELPHI_PERSONA_TEMPLATE: PersonaTemplate = {
  name: 'Participant',
  trait: 'providing independent, unbiased analysis',
};

/**
 * Red Team / Blue Team mode personas - security analysis
 */
const RED_TEAM_BLUE_TEAM_PERSONAS: PersonaTemplate[] = [
  { name: 'Red Team', trait: 'attacking, finding vulnerabilities and exploits' },
  { name: 'Blue Team', trait: 'defending, securing and patching vulnerabilities' },
];

/**
 * Map of debate modes to their persona sets
 */
const MODE_PERSONA_SETS: Record<DebateMode, PersonaTemplate[]> = {
  collaborative: COLLABORATIVE_PERSONAS,
  adversarial: ADVERSARIAL_PERSONAS,
  socratic: SOCRATIC_PERSONAS,
  'expert-panel': EXPERT_PANEL_PERSONAS,
  'devils-advocate': DEVILS_ADVOCATE_PERSONAS,
  delphi: [], // Special case: generated dynamically
  'red-team-blue-team': RED_TEAM_BLUE_TEAM_PERSONAS,
};

/**
 * Get personas for a specific mode and count
 *
 * @param mode - The debate mode
 * @param count - Number of personas needed
 * @returns Array of PersonaTemplates
 */
export function getPersonasForMode(mode: DebateMode, count: number): PersonaTemplate[] {
  // Special case: Delphi mode generates numbered participants
  if (mode === 'delphi') {
    return Array.from({ length: count }, (_, i) => ({
      name: `Participant ${i + 1}`,
      trait: DELPHI_PERSONA_TEMPLATE.trait,
    }));
  }

  const personas = MODE_PERSONA_SETS[mode];

  // Should never happen - all modes have personas defined
  if (personas.length === 0) {
    throw new Error(`No personas defined for mode: ${mode}`);
  }

  const result: PersonaTemplate[] = [];

  // Cycle through personas if count exceeds available
  for (let i = 0; i < count; i++) {
    // Safe to use non-null assertion since we checked personas.length > 0
    result.push(personas[i % personas.length]!);
  }

  return result;
}
