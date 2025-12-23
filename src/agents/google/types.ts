/**
 * Google (Gemini) Agent Types
 */

import type { GoogleGenAI } from '@google/genai';
import type { BaseAgentOptions } from '../types/index.js';

/**
 * Google Search grounding configuration options
 */
export interface GoogleSearchConfig {
  /** Enable Google Search grounding (default: true) */
  enabled?: boolean;
}

/**
 * Configuration options for Gemini Agent
 */
export interface GeminiAgentOptions extends BaseAgentOptions<GoogleGenAI> {
  /** Google Search grounding configuration (default: enabled) */
  googleSearch?: GoogleSearchConfig;
  /** Use light model for Phase 1 web search (default: true for cost/speed optimization) */
  useLightModelForSearch?: boolean;
}
