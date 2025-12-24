import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generatePerspectives,
  normalizePerspectives,
  needsPerspectiveGeneration,
} from '../../../../src/modes/utils/perspective-generator.js';
import type { GeneratedPerspective, Perspective } from '../../../../src/types/index.js';
import type { BaseAgent } from '../../../../src/agents/base.js';

describe('perspective-generator', () => {
  describe('needsPerspectiveGeneration', () => {
    it('should return true for expert-panel mode with no perspectives', () => {
      expect(needsPerspectiveGeneration('expert-panel', undefined)).toBe(true);
      expect(needsPerspectiveGeneration('expert-panel', [])).toBe(true);
    });

    it('should return false for expert-panel mode with perspectives', () => {
      expect(needsPerspectiveGeneration('expert-panel', ['Technical'])).toBe(false);
      expect(
        needsPerspectiveGeneration('expert-panel', [
          { name: 'Technical', description: 'Tech view' },
        ])
      ).toBe(false);
    });

    it('should return false for non-expert-panel modes', () => {
      expect(needsPerspectiveGeneration('collaborative', undefined)).toBe(false);
      expect(needsPerspectiveGeneration('adversarial', [])).toBe(false);
      expect(needsPerspectiveGeneration('delphi', undefined)).toBe(false);
    });
  });

  describe('normalizePerspectives', () => {
    const generatedPerspectives: GeneratedPerspective[] = [
      {
        name: 'Generated 1',
        description: 'Auto-generated perspective',
        focusAreas: ['Area 1'],
        evidenceTypes: ['Type 1'],
        keyQuestions: ['Question 1?'],
        antiPatterns: ['Anti 1'],
      },
    ];

    it('should return generated perspectives when input is undefined', () => {
      const result = normalizePerspectives(undefined, generatedPerspectives);
      expect(result).toEqual(generatedPerspectives);
    });

    it('should return generated perspectives when input is empty array', () => {
      const result = normalizePerspectives([], generatedPerspectives);
      expect(result).toEqual(generatedPerspectives);
    });

    it('should normalize string perspectives', () => {
      const input = ['Technical', 'Economic'];
      const result = normalizePerspectives(input, generatedPerspectives);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Technical',
        description: '',
        focusAreas: [],
        evidenceTypes: [],
        keyQuestions: [],
        antiPatterns: [],
      });
      expect(result[1]).toEqual({
        name: 'Economic',
        description: '',
        focusAreas: [],
        evidenceTypes: [],
        keyQuestions: [],
        antiPatterns: [],
      });
    });

    it('should normalize Perspective objects with description', () => {
      const input: Perspective[] = [
        { name: 'Technical', description: 'Tech analysis' },
        { name: 'Economic' },
      ];
      const result = normalizePerspectives(input, generatedPerspectives);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'Technical',
        description: 'Tech analysis',
        focusAreas: [],
        evidenceTypes: [],
        keyQuestions: [],
        antiPatterns: [],
      });
      expect(result[1]).toEqual({
        name: 'Economic',
        description: '',
        focusAreas: [],
        evidenceTypes: [],
        keyQuestions: [],
        antiPatterns: [],
      });
    });

    it('should pass through already-generated perspectives', () => {
      const input = [
        {
          name: 'Custom',
          description: 'Full custom perspective',
          focusAreas: ['Focus 1', 'Focus 2'],
          evidenceTypes: ['Evidence 1'],
          keyQuestions: ['Key question?'],
          antiPatterns: ['Anti 1'],
        },
      ] as Array<string | Perspective>;

      const result = normalizePerspectives(input, generatedPerspectives);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'Custom',
        description: 'Full custom perspective',
        focusAreas: ['Focus 1', 'Focus 2'],
        evidenceTypes: ['Evidence 1'],
        keyQuestions: ['Key question?'],
        antiPatterns: ['Anti 1'],
      });
    });

    it('should handle mixed input types', () => {
      const input: Array<string | Perspective> = [
        'Simple string',
        { name: 'With description', description: 'A description' },
        {
          name: 'Full perspective',
          description: 'Complete',
          focusAreas: ['Focus'],
        } as unknown as Perspective, // Cast to Perspective to simulate GeneratedPerspective
      ];

      const result = normalizePerspectives(input, generatedPerspectives);

      expect(result).toHaveLength(3);
      expect(result[0]!.name).toBe('Simple string');
      expect(result[1]!.name).toBe('With description');
      expect(result[2]!.name).toBe('Full perspective');
    });
  });

  describe('generatePerspectives', () => {
    const createMockAgent = (response: string): BaseAgent =>
      ({
        generateRawCompletion: vi.fn().mockResolvedValue(response),
      }) as unknown as BaseAgent;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should parse valid JSON response', async () => {
      const mockResponse = JSON.stringify([
        {
          name: 'Technical Analysis',
          description: 'Focus on technical aspects',
          focusAreas: ['Implementation', 'Architecture'],
          evidenceTypes: ['Code examples', 'Documentation'],
          keyQuestions: ['Is it scalable?'],
          antiPatterns: ['Ignoring performance'],
        },
        {
          name: 'Business Analysis',
          description: 'Focus on business value',
          focusAreas: ['ROI', 'Market fit'],
          evidenceTypes: ['Market data', 'Case studies'],
          keyQuestions: ['What is the business impact?'],
          antiPatterns: ['Ignoring costs'],
        },
      ]);

      const mockAgent = createMockAgent(mockResponse);
      const result = await generatePerspectives('Test topic', 2, mockAgent);

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('Technical Analysis');
      expect(result[0]!.focusAreas).toEqual(['Implementation', 'Architecture']);
      expect(result[1]!.name).toBe('Business Analysis');
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      const mockResponse = `Here are the perspectives:
\`\`\`json
[
  {
    "name": "Technical",
    "description": "Tech view",
    "focusAreas": ["Code"],
    "evidenceTypes": ["Tests"],
    "keyQuestions": ["Does it work?"],
    "antiPatterns": ["Bugs"]
  }
]
\`\`\``;

      const mockAgent = createMockAgent(mockResponse);
      const result = await generatePerspectives('Test topic', 1, mockAgent);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Technical');
    });

    it('should handle malformed JSON with jsonrepair', async () => {
      // Missing closing bracket - jsonrepair should fix this
      const mockResponse = `[
        {
          "name": "Technical",
          "description": "Tech view",
          "focusAreas": ["Code"],
          "evidenceTypes": ["Tests"],
          "keyQuestions": ["Does it work?"],
          "antiPatterns": ["Bugs"]
        }
      `;

      const mockAgent = createMockAgent(mockResponse);
      const result = await generatePerspectives('Test topic', 1, mockAgent);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Technical');
    });

    it('should pad with defaults if fewer perspectives generated', async () => {
      const mockResponse = JSON.stringify([
        {
          name: 'Only One',
          description: 'Single perspective',
          focusAreas: [],
          evidenceTypes: [],
          keyQuestions: [],
          antiPatterns: [],
        },
      ]);

      const mockAgent = createMockAgent(mockResponse);
      const result = await generatePerspectives('Test topic', 3, mockAgent);

      expect(result).toHaveLength(3);
      expect(result[0]!.name).toBe('Only One');
      // Second and third should be defaults
      expect(result[1]!.name).toContain('perspective');
      expect(result[2]!.name).toContain('perspective');
    });

    it('should trim if more perspectives generated than needed', async () => {
      const mockResponse = JSON.stringify([
        {
          name: 'P1',
          description: 'D1',
          focusAreas: [],
          evidenceTypes: [],
          keyQuestions: [],
          antiPatterns: [],
        },
        {
          name: 'P2',
          description: 'D2',
          focusAreas: [],
          evidenceTypes: [],
          keyQuestions: [],
          antiPatterns: [],
        },
        {
          name: 'P3',
          description: 'D3',
          focusAreas: [],
          evidenceTypes: [],
          keyQuestions: [],
          antiPatterns: [],
        },
      ]);

      const mockAgent = createMockAgent(mockResponse);
      const result = await generatePerspectives('Test topic', 2, mockAgent);

      expect(result).toHaveLength(2);
      expect(result[0]!.name).toBe('P1');
      expect(result[1]!.name).toBe('P2');
    });

    it('should fall back to defaults on API error', async () => {
      const mockAgent = {
        generateRawCompletion: vi.fn().mockRejectedValue(new Error('API Error')),
      } as unknown as BaseAgent;

      const result = await generatePerspectives('Test topic', 2, mockAgent);

      expect(result).toHaveLength(2);
      // Should have default perspectives
      expect(result[0]!.name).toContain('perspective');
      expect(result[1]!.name).toContain('perspective');
    });

    it('should fall back to defaults on invalid JSON', async () => {
      const mockAgent = createMockAgent('This is not JSON at all');
      const result = await generatePerspectives('Test topic', 2, mockAgent);

      expect(result).toHaveLength(2);
      // Should have default perspectives
      expect(result[0]!.name).toContain('perspective');
    });

    it('should normalize missing fields in parsed perspectives', async () => {
      const mockResponse = JSON.stringify([
        {
          name: 'Minimal',
          // Missing all optional fields
        },
      ]);

      const mockAgent = createMockAgent(mockResponse);
      const result = await generatePerspectives('Test topic', 1, mockAgent);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'Minimal',
        description: '',
        focusAreas: [],
        evidenceTypes: [],
        keyQuestions: [],
        antiPatterns: [],
      });
    });

    it('should provide default name for perspectives without name', async () => {
      const mockResponse = JSON.stringify([
        {
          description: 'No name provided',
          focusAreas: ['Focus'],
        },
      ]);

      const mockAgent = createMockAgent(mockResponse);
      const result = await generatePerspectives('Test topic', 1, mockAgent);

      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Perspective 1');
    });
  });
});
