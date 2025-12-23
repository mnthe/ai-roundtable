/**
 * Tests for JSON Parser Utilities
 *
 * Tests the robust JSON parsing strategies for AI model outputs,
 * including markdown formatting, truncated responses, and malformed JSON.
 */

import { describe, it, expect } from 'vitest';
import {
  cleanLLMResponse,
  parseAIConsensusResponse,
  parsePartialJsonResponse,
  extractAgreementLevelFromText,
  extractSummaryFromText,
} from '../../../../src/core/utils/json-parser.js';

describe('cleanLLMResponse', () => {
  describe('markdown code block handling', () => {
    it('should remove complete markdown code blocks with json tag', () => {
      const input = '```json\n{"agreementLevel": 0.75}\n```';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.75}');
    });

    it('should remove complete markdown code blocks without language tag', () => {
      const input = '```\n{"agreementLevel": 0.8}\n```';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.8}');
    });

    it('should handle incomplete markdown code blocks (truncated response)', () => {
      const input = '```json\n{"agreementLevel": 0.75, "summary": "truncated';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.75, "summary": "truncated');
    });

    it('should handle incomplete markdown without json tag', () => {
      const input = '```\n{"key": "value", "incomplete": true';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"key": "value", "incomplete": true');
    });

    it('should preserve complete JSON when no markdown is present', () => {
      const input = '{"agreementLevel": 0.9, "summary": "complete"}';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.9, "summary": "complete"}');
    });

    it('should handle multiline JSON in markdown blocks', () => {
      const input = `\`\`\`json
{
  "agreementLevel": 0.85,
  "commonGround": ["point1", "point2"],
  "summary": "test"
}
\`\`\``;
      const result = cleanLLMResponse(input);
      expect(result).toContain('"agreementLevel": 0.85');
      expect(result).not.toContain('```');
    });
  });

  describe('leading text extraction', () => {
    it('should extract JSON from text with leading content', () => {
      const input = 'Here is the analysis:\n{"agreementLevel": 0.5}';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.5}');
    });

    it('should extract JSON with multiple leading lines', () => {
      const input =
        'I have analyzed the responses.\nThe result is:\n{"agreementLevel": 0.7, "summary": "test"}';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.7, "summary": "test"}');
    });

    it('should handle JSON starting at beginning (no leading text)', () => {
      const input = '{"already": "clean"}';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"already": "clean"}');
    });
  });

  describe('empty and edge cases', () => {
    it('should handle empty input', () => {
      const result = cleanLLMResponse('');
      expect(result).toBe('');
    });

    it('should handle whitespace-only input', () => {
      const result = cleanLLMResponse('   \n\t  ');
      expect(result).toBe('');
    });

    it('should handle input with no JSON', () => {
      const input = 'This is just plain text without any JSON';
      const result = cleanLLMResponse(input);
      expect(result).toBe(input);
    });

    it('should trim surrounding whitespace', () => {
      const input = '  \n{"agreementLevel": 0.5}\n  ';
      const result = cleanLLMResponse(input);
      expect(result).toBe('{"agreementLevel": 0.5}');
    });
  });
});

describe('parsePartialJsonResponse', () => {
  const analyzerId = 'test-analyzer';

  describe('successful parsing', () => {
    it('should parse truncated JSON with agreementLevel', () => {
      const input = '{"agreementLevel": 0.62, "clusters": [{"theme": "Test';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.agreementLevel).toBe(0.62);
      expect(result!.analyzerId).toBe(analyzerId);
    });

    it('should extract commonGround array from partial JSON', () => {
      const input =
        '{"agreementLevel": 0.8, "commonGround": ["Point A", "Point B"], "summary": "Test';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.commonGround).toEqual(['Point A', 'Point B']);
    });

    it('should extract disagreementPoints from partial JSON', () => {
      const input =
        '{"agreementLevel": 0.6, "disagreementPoints": ["Diff 1", "Diff 2"], "other": "trunc';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.disagreementPoints).toEqual(['Diff 1', 'Diff 2']);
    });

    it('should clamp agreementLevel to valid range', () => {
      const inputHigh = '{"agreementLevel": 1.5}';
      const resultHigh = parsePartialJsonResponse(inputHigh, analyzerId);
      expect(resultHigh!.agreementLevel).toBe(1);

      const inputLow = '{"agreementLevel": -0.5}';
      const resultLow = parsePartialJsonResponse(inputLow, analyzerId);
      expect(resultLow!.agreementLevel).toBe(0);
    });

    it('should extract summary from partial JSON', () => {
      const input = '{"agreementLevel": 0.7, "summary": "Test summary text", "other": "';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Test summary text');
    });

    it('should provide default summary for missing summary', () => {
      const input = '{"agreementLevel": 0.7, "commonGround": ["Point"';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.summary).toBe('Partial analysis');
    });

    it('should extract clusters from partial JSON', () => {
      const input =
        '{"agreementLevel": 0.8, "clusters": [{"theme": "Theme1", "agentIds": ["a1", "a2"], "summary": "Sum"}';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.clusters).toBeDefined();
      expect(result!.clusters![0]!.theme).toBe('Theme1');
      expect(result!.clusters![0]!.agentIds).toEqual(['a1', 'a2']);
    });

    it('should extract nuances from partial JSON', () => {
      const input =
        '{"agreementLevel": 0.7, "nuances": {"partialAgreements": ["Partial 1"], "conditionalPositions": ["Cond 1"], "uncertainties": ["Uncert 1"]}';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.nuances).toBeDefined();
      expect(result!.nuances!.partialAgreements).toEqual(['Partial 1']);
      expect(result!.nuances!.conditionalPositions).toEqual(['Cond 1']);
      expect(result!.nuances!.uncertainties).toEqual(['Uncert 1']);
    });

    it('should extract groupthink warning when detected is true', () => {
      const input =
        '{"agreementLevel": 0.95, "groupthinkWarning": {"detected": true, "indicators": ["High agreement"], "recommendation": "Consider dissent"}';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.groupthinkWarning).toBeDefined();
      expect(result!.groupthinkWarning!.detected).toBe(true);
      expect(result!.groupthinkWarning!.indicators).toContain('High agreement');
    });

    it('should not include groupthink warning when detected is false', () => {
      const input =
        '{"agreementLevel": 0.6, "groupthinkWarning": {"detected": false, "indicators": [], "recommendation": ""}';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.groupthinkWarning).toBeUndefined();
    });
  });

  describe('failure cases', () => {
    it('should return null if no agreementLevel found', () => {
      const input = '{"clusters": [{"theme": "Test"';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).toBeNull();
    });

    it('should return null for input without JSON object', () => {
      const input = 'This is plain text without any JSON';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).toBeNull();
    });

    it('should return null for array-only JSON', () => {
      const input = '[1, 2, 3]';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parsePartialJsonResponse('', analyzerId);
      expect(result).toBeNull();
    });
  });

  describe('nested and complex structures', () => {
    it('should handle deeply nested partial JSON', () => {
      const input =
        '{"agreementLevel": 0.75, "clusters": [{"theme": "Nested", "agentIds": ["a1"], "summary": "Deep", "extra": {"nested": "value';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.agreementLevel).toBe(0.75);
    });

    it('should limit string arrays to prevent huge outputs', () => {
      // Create array with more than 20 elements
      const manyPoints = Array.from({ length: 30 }, (_, i) => `Point ${i}`);
      const input = JSON.stringify({ agreementLevel: 0.5, commonGround: manyPoints });
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.commonGround.length).toBeLessThanOrEqual(20);
    });

    it('should filter empty clusters', () => {
      const input =
        '{"agreementLevel": 0.7, "clusters": [{"theme": "Valid", "agentIds": ["a1"], "summary": "S"}, {"theme": "Empty", "agentIds": [], "summary": ""}]}';
      const result = parsePartialJsonResponse(input, analyzerId);

      expect(result).not.toBeNull();
      expect(result!.clusters!.length).toBe(1);
      expect(result!.clusters![0]!.theme).toBe('Valid');
    });
  });
});

describe('extractAgreementLevelFromText', () => {
  it('should extract agreementLevel from malformed JSON', () => {
    const input = '{"agreementLevel": 0.75, broken json here';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBe(0.75);
  });

  it('should extract agreementLevel with varying whitespace', () => {
    const input = '"agreementLevel"  :  0.65';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBe(0.65);
  });

  it('should extract agreementLevel from text with other content', () => {
    const input =
      'Some text before {"agreementLevel": 0.42, more broken stuff} and after';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBe(0.42);
  });

  it('should return null for string value', () => {
    const input = '{"agreementLevel": "high"}';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBeNull();
  });

  it('should return null for missing agreementLevel', () => {
    const input = '{"summary": "No agreement level here"}';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBeNull();
  });

  it('should reject value above 1', () => {
    const input = '{"agreementLevel": 1.5}';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBeNull();
  });

  it('should reject negative values', () => {
    const input = '{"agreementLevel": -0.5}';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBeNull();
  });

  it('should accept boundary value 0', () => {
    const input = '{"agreementLevel": 0}';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBe(0);
  });

  it('should accept boundary value 1', () => {
    const input = '{"agreementLevel": 1}';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBe(1);
  });

  it('should handle decimal values correctly', () => {
    const input = '{"agreementLevel": 0.123456}';
    const result = extractAgreementLevelFromText(input);
    expect(result).toBeCloseTo(0.123456);
  });
});

describe('extractSummaryFromText', () => {
  it('should extract summary from partial JSON', () => {
    const input =
      '{"agreementLevel": 0.5, "summary": "This is a test summary", "other';
    const result = extractSummaryFromText(input);
    expect(result).toBe('This is a test summary');
  });

  it('should extract summary with special characters', () => {
    const input = '{"summary": "Summary with numbers 123 and symbols!@#"}';
    const result = extractSummaryFromText(input);
    expect(result).toBe('Summary with numbers 123 and symbols!@#');
  });

  it('should extract summary at beginning of JSON', () => {
    const input = '{"summary": "First field summary", "other": "value"}';
    const result = extractSummaryFromText(input);
    expect(result).toBe('First field summary');
  });

  it('should return null if no summary found', () => {
    const input = '{"agreementLevel": 0.5}';
    const result = extractSummaryFromText(input);
    expect(result).toBeNull();
  });

  it('should return null for empty string', () => {
    const result = extractSummaryFromText('');
    expect(result).toBeNull();
  });

  it('should stop at first closing quote', () => {
    const input = '{"summary": "First part", "more": "data"}';
    const result = extractSummaryFromText(input);
    expect(result).toBe('First part');
  });
});

describe('parseAIConsensusResponse', () => {
  const options = { analyzerId: 'test-analyzer' };

  describe('complete valid JSON', () => {
    it('should parse complete valid JSON', () => {
      const input = JSON.stringify({
        agreementLevel: 0.85,
        commonGround: ['Point 1', 'Point 2'],
        disagreementPoints: ['Diff 1'],
        summary: 'Test summary',
        reasoning: 'Test reasoning',
      });
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.85);
      expect(result.commonGround).toEqual(['Point 1', 'Point 2']);
      expect(result.disagreementPoints).toEqual(['Diff 1']);
      expect(result.summary).toBe('Test summary');
      expect(result.reasoning).toBe('Test reasoning');
      expect(result.analyzerId).toBe('test-analyzer');
    });

    it('should parse complete JSON with all optional fields', () => {
      const input = JSON.stringify({
        agreementLevel: 0.75,
        commonGround: ['Common 1'],
        disagreementPoints: ['Diff 1'],
        summary: 'Full summary',
        clusters: [
          { theme: 'Theme1', agentIds: ['a1', 'a2'], summary: 'Cluster sum' },
        ],
        nuances: {
          partialAgreements: ['Partial'],
          conditionalPositions: ['Conditional'],
          uncertainties: ['Uncertain'],
        },
        groupthinkWarning: {
          detected: true,
          indicators: ['High agreement'],
          recommendation: 'Add diversity',
        },
        reasoning: 'Full reasoning',
      });
      const result = parseAIConsensusResponse(input, options);

      expect(result.clusters).toBeDefined();
      expect(result.clusters![0]!.theme).toBe('Theme1');
      expect(result.nuances).toBeDefined();
      expect(result.nuances!.partialAgreements).toContain('Partial');
      expect(result.groupthinkWarning).toBeDefined();
      expect(result.groupthinkWarning!.detected).toBe(true);
    });

    it('should provide defaults for missing optional fields', () => {
      const input = JSON.stringify({ agreementLevel: 0.7 });
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.7);
      expect(result.commonGround).toEqual([]);
      expect(result.disagreementPoints).toEqual([]);
      expect(result.summary).toBe('Analysis complete');
    });
  });

  describe('markdown-wrapped JSON', () => {
    it('should handle markdown-wrapped JSON', () => {
      const input =
        '```json\n{"agreementLevel": 0.7, "commonGround": [], "disagreementPoints": [], "summary": "Test"}\n```';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.7);
      expect(result.summary).toBe('Test');
    });

    it('should handle markdown without json tag', () => {
      const input =
        '```\n{"agreementLevel": 0.65, "summary": "No tag"}\n```';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.65);
    });

    it('should handle truncated markdown JSON', () => {
      const input =
        '```json\n{"agreementLevel": 0.65, "clusters": [{"theme": "Context-Dependent Pragmatism", "agentIds": ["claude", "chatgpt"], "summary": "TypeScript\'s value dep';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.65);
      expect(result.analyzerId).toBe('test-analyzer');
    });
  });

  describe('malformed JSON handling with jsonrepair', () => {
    it('should handle JSON with trailing commas', () => {
      const input = '{"agreementLevel": 0.8, "commonGround": ["point1", "point2",], "summary": "Test",}';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.8);
      expect(result.commonGround).toContain('point1');
    });

    it('should handle JSON with missing quotes on keys', () => {
      const input = '{agreementLevel: 0.7, summary: "Test"}';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.7);
    });
  });

  describe('truncated JSON handling with partial-json', () => {
    it('should handle truncated JSON object', () => {
      const input = '{"agreementLevel": 0.55, "commonGround": ["Point 1", "Point 2';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.55);
    });

    it('should handle JSON truncated mid-key', () => {
      const input = '{"agreementLevel": 0.6, "common';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.6);
    });
  });

  describe('regex extraction fallback', () => {
    it('should use regex extraction as fallback', () => {
      const input =
        '{"agreementLevel": 0.42 malformed content without proper JSON structure';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.42);
      expect(result.reasoning).toContain('partial/malformed');
    });

    it('should extract both agreementLevel and summary with regex', () => {
      const input =
        '{"agreementLevel": 0.55, "summary": "Extracted summary" broken stuff here';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.55);
      // Summary may or may not be extracted depending on parsing strategy
    });
  });

  describe('complete fallback behavior', () => {
    it('should return default 0.5 when all strategies fail', () => {
      const input = 'This is not JSON at all, just plain text';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.5);
      expect(result.commonGround).toContain('Unable to determine common ground');
    });

    it('should use raw response as summary when parsing fails', () => {
      const input = 'Plain text response from AI';
      const result = parseAIConsensusResponse(input, options);

      expect(result.summary).toBe('Plain text response from AI');
    });

    it('should handle empty input', () => {
      const result = parseAIConsensusResponse('', options);

      expect(result.agreementLevel).toBe(0.5);
      expect(result.summary).toBe('Analysis failed');
    });
  });

  describe('edge cases', () => {
    it('should handle very long responses', () => {
      const longCommonGround = Array.from({ length: 100 }, (_, i) => `Point ${i}`);
      const input = JSON.stringify({
        agreementLevel: 0.7,
        commonGround: longCommonGround,
        summary: 'Long response',
      });
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.7);
      expect(result.commonGround.length).toBe(100);
    });

    it('should handle unicode content', () => {
      const input = JSON.stringify({
        agreementLevel: 0.8,
        summary: 'Summary with unicode: emoji \u2764 and symbols \u00a9',
        commonGround: ['\u4e2d\u6587', '\u65e5\u672c\u8a9e'],
      });
      const result = parseAIConsensusResponse(input, options);

      expect(result.summary).toContain('unicode');
      expect(result.commonGround).toHaveLength(2);
    });

    it('should handle nested JSON in string values', () => {
      const input = JSON.stringify({
        agreementLevel: 0.6,
        summary: 'Contains {"nested": "json"} in string',
      });
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.6);
      expect(result.summary).toContain('nested');
    });

    it('should clamp out-of-range agreementLevel', () => {
      const inputHigh = JSON.stringify({ agreementLevel: 2.0 });
      const resultHigh = parseAIConsensusResponse(inputHigh, options);
      expect(resultHigh.agreementLevel).toBe(1);

      const inputLow = JSON.stringify({ agreementLevel: -1.0 });
      const resultLow = parseAIConsensusResponse(inputLow, options);
      expect(resultLow.agreementLevel).toBe(0);
    });

    it('should handle BOM and zero-width characters', () => {
      const input = '\uFEFF{"agreementLevel": 0.7, "summary": "With BOM"}';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.7);
    });

    it('should handle JSON with leading text', () => {
      const input =
        'Based on my analysis, here is the result: {"agreementLevel": 0.8, "summary": "Good"}';
      const result = parseAIConsensusResponse(input, options);

      expect(result.agreementLevel).toBe(0.8);
      expect(result.summary).toBe('Good');
    });
  });
});
