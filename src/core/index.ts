/**
 * Core module exports
 */

export { SessionManager } from './session-manager.js';
export type { SessionManagerOptions } from './session-manager.js';

export { DebateEngine } from './debate-engine.js';
export type { DebateEngineOptions } from './debate-engine.js';

export { ConsensusAnalyzer } from './consensus-analyzer.js';

export { AIConsensusAnalyzer } from './ai-consensus-analyzer.js';
export type { AIConsensusAnalyzerConfig, AIAnalysisDiagnostics } from './ai-consensus-analyzer.js';

export { KeyPointsExtractor } from './key-points-extractor.js';
export type { KeyPointsExtractorConfig, KeyPointsResult } from './key-points-extractor.js';

export { detectGroupthink } from './groupthink-detector.js';

export {
  checkExitCriteria,
  checkPositionConvergence,
  createDefaultExitCriteria,
  validateExitCriteria,
} from './exit-criteria.js';
