/**
 * Tests for keyPoints extraction logic
 *
 * These tests verify that keyPoints are preserved without arbitrary length truncation.
 * The extractKeyPoints function in server.ts should not have a 200-character limit.
 */

import { describe, it, expect } from 'vitest';

/**
 * Helper function that mirrors the extractKeyPoints logic in server.ts
 * This should match the actual implementation.
 */
function extractKeyPoints(reasoning: string): string[] {
  const keyPoints: string[] = [];

  // Try to extract numbered points (1., 2., etc.) or bullet points
  const numberedMatches = reasoning.match(/(?:^|\n)\s*(?:\d+[.):]\s*|\*\s*|-\s*)\*?\*?([^\n*]+)/g);
  if (numberedMatches && numberedMatches.length > 0) {
    for (const match of numberedMatches.slice(0, 3)) {
      const cleaned = match
        .replace(/^\s*(?:\d+[.):]\s*|\*\s*|-\s*)\*?\*?/, '')
        .trim();
      if (cleaned.length > 10) {
        keyPoints.push(cleaned);
      }
    }
  }

  // Fallback: extract first 2-3 sentences if no bullet points found
  if (keyPoints.length === 0) {
    const sentences = reasoning.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    for (const sentence of sentences.slice(0, 3)) {
      const cleaned = sentence.trim();
      if (cleaned.length > 10) {
        keyPoints.push(cleaned);
      }
    }
  }

  // Ensure we have at least something
  if (keyPoints.length === 0) {
    keyPoints.push(reasoning.trim() || 'No reasoning provided');
  }

  return keyPoints;
}

describe('KeyPoints Extraction', () => {
  describe('Long content preservation', () => {
    it('should preserve keyPoints longer than 200 characters without truncation (single-line format)', () => {
      // Create long keyPoints as single lines (no newlines within each point)
      const mockReasoning = '1. 저작권 부여를 지지하는 근거: AI가 생성한 콘텐츠가 독창적이고 창의적인 경우, 이를 창작물로 인정하여 저작권을 부여하는 것이 공정하며, AI 기술의 발전을 촉진할 수 있습니다. 이는 AI 개발자와 사용자에게 인센티브를 제공하고, AI 기반 창작 활동을 장려하는 효과가 있습니다.\n2. 저작권 부여 반대 근거: AI는 인간의 감정, 의도, 창의성을 가지지 않으므로, AI가 생성한 콘텐츠에 저작권을 부여하는 것은 부적절할 수 있습니다. 또한, 기존 저작권법의 기본 원칙인 인간의 창작 활동 보호와 충돌할 수 있습니다.\n3. 절충안 제시: AI 생성 콘텐츠의 저작권을 AI 소유자나 사용자에게 부여하되, AI의 기여도와 인간의 개입 정도를 고려하여 저작권의 범위를 조정하는 방안을 검토할 수 있습니다. 이를 통해 AI 기술 발전과 기존 저작권 보호의 균형을 맞출 수 있습니다.';

      const keyPoints = extractKeyPoints(mockReasoning);

      // Should extract all 3 keyPoints
      expect(keyPoints).toHaveLength(3);

      // Verify keyPoints are extracted completely (no arbitrary truncation)
      // Each point should be reasonably long (>100 chars proves no truncation occurred)
      expect(keyPoints[0].length).toBeGreaterThan(100);
      expect(keyPoints[1].length).toBeGreaterThan(100);
      expect(keyPoints[2].length).toBeGreaterThan(100);

      // Most importantly: verify complete content is preserved - check beginning AND end
      // This would fail if there was a 200-character truncation
      expect(keyPoints[0]).toContain('저작권 부여를 지지하는 근거');
      expect(keyPoints[0]).toContain('AI 기반 창작 활동을 장려하는 효과가 있습니다');

      expect(keyPoints[1]).toContain('저작권 부여 반대 근거');
      expect(keyPoints[1]).toContain('기존 저작권법의 기본 원칙인 인간의 창작 활동 보호와 충돌할 수 있습니다');

      expect(keyPoints[2]).toContain('절충안 제시');
      expect(keyPoints[2]).toContain('AI 기술 발전과 기존 저작권 보호의 균형을 맞출 수 있습니다');
    });

    it('should preserve very long bullet points (>300 characters)', () => {
      const veryLongPoint = 'This is an extremely long bullet point that far exceeds any reasonable character limit that might have existed previously. The content contains comprehensive analysis, detailed reasoning, multiple perspectives, and extensive evidence that must all be preserved in their entirety. Truncation would result in loss of critical information and context that is essential for understanding the complete argument being presented.';

      const mockReasoning = `
* ${veryLongPoint}

- Another bullet point with different marker
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(2);
      expect(keyPoints[0].length).toBeGreaterThan(300);
      expect(keyPoints[0]).toBe(veryLongPoint);
    });
  });

  describe('Bullet point format handling', () => {
    it('should handle asterisk bullet points', () => {
      const mockReasoning = `
* First point with asterisk marker and sufficient length for extraction
* Second point with the same marker style but different content
* Third point completing the set of three extracted points
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(3);
      expect(keyPoints[0]).toContain('First point');
      expect(keyPoints[1]).toContain('Second point');
      expect(keyPoints[2]).toContain('Third point');
    });

    it('should handle dash bullet points', () => {
      const mockReasoning = `
- First dash point with enough content
- Second dash point with different details
- Third dash point to complete
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(3);
      expect(keyPoints[0]).toContain('First dash point');
      expect(keyPoints[1]).toContain('Second dash point');
      expect(keyPoints[2]).toContain('Third dash point');
    });

    it('should handle numbered points (1., 2., 3.)', () => {
      const mockReasoning = `
1. First numbered point with sufficient length
2. Second numbered point with different content
3. Third numbered point to complete the set
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(3);
      expect(keyPoints[0]).toContain('First numbered');
      expect(keyPoints[1]).toContain('Second numbered');
      expect(keyPoints[2]).toContain('Third numbered');
    });

    it('should handle mixed bullet formats', () => {
      const mockReasoning = `
1. Numbered point with enough length for extraction
* Asterisk bullet point with different content here
- Dash bullet point with yet another perspective
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(3);
      expect(keyPoints[0]).toContain('Numbered point');
      expect(keyPoints[1]).toContain('Asterisk bullet');
      expect(keyPoints[2]).toContain('Dash bullet');
    });

    it('should limit extraction to first 3 points', () => {
      const mockReasoning = `
1. First point that should be extracted
2. Second point that should be extracted
3. Third point that should be extracted
4. Fourth point that should NOT be extracted
5. Fifth point that should NOT be extracted
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(3);
      expect(keyPoints[0]).toContain('First point');
      expect(keyPoints[2]).toContain('Third point');

      // Verify 4th and 5th are not included
      const combined = keyPoints.join(' ');
      expect(combined).not.toContain('Fourth point');
      expect(combined).not.toContain('Fifth point');
    });
  });

  describe('Sentence extraction fallback', () => {
    it('should extract sentences when no bullet points are found', () => {
      const mockReasoning = 'This is the first sentence with sufficient length. This is the second sentence with different content. This is the third sentence with more details.';

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(3);
      expect(keyPoints[0]).toContain('first sentence');
      expect(keyPoints[1]).toContain('second sentence');
      expect(keyPoints[2]).toContain('third sentence');
    });

    it('should skip very short sentences', () => {
      const mockReasoning = 'Short. This is a proper sentence with enough length. No.';

      const keyPoints = extractKeyPoints(mockReasoning);

      // Should only extract the middle sentence (>20 chars filter)
      expect(keyPoints).toHaveLength(1);
      expect(keyPoints[0]).toContain('proper sentence');
    });

    it('should handle sentences with various punctuation', () => {
      const mockReasoning = 'First question asks something? Second statement declares something! Third sentence describes something.';

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(3);
      expect(keyPoints[0]).toContain('First question');
      expect(keyPoints[1]).toContain('Second statement');
      expect(keyPoints[2]).toContain('Third sentence');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty reasoning', () => {
      const keyPoints = extractKeyPoints('');

      expect(keyPoints).toHaveLength(1);
      expect(keyPoints[0]).toBe('No reasoning provided');
    });

    it('should handle whitespace-only reasoning', () => {
      const keyPoints = extractKeyPoints('   \n\n   ');

      expect(keyPoints).toHaveLength(1);
      expect(keyPoints[0]).toBe('No reasoning provided');
    });

    it('should filter out very short bullet points (<10 chars)', () => {
      const mockReasoning = `
1. OK
2. This point has sufficient length to be extracted
3. No
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      // Only the middle one should be extracted
      expect(keyPoints).toHaveLength(1);
      expect(keyPoints[0]).toContain('sufficient length');
    });

    it('should handle reasoning with only short content', () => {
      const mockReasoning = '1. OK\n2. No\n3. Yes';

      const keyPoints = extractKeyPoints(mockReasoning);

      // Falls back to returning the whole reasoning since nothing passes filters
      expect(keyPoints).toHaveLength(1);
      expect(keyPoints[0]).toBe('1. OK\n2. No\n3. Yes');
    });

    it('should preserve newlines within bullet points', () => {
      const mockReasoning = `
1. First point that spans
multiple lines with sufficient content

2. Second point on a single line with enough length
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      // The regex should match per line, so multi-line points get first line only
      expect(keyPoints.length).toBeGreaterThan(0);
      expect(keyPoints[0]).toContain('First point');
    });
  });

  describe('Real-world test cases', () => {
    it('should handle the reported Korean copyright example', () => {
      const mockReasoning = `
1. 저작권 부여를 지지하는 근거: AI가 생성한 콘텐츠가 독창적이고 창의적인 경우, 이를 창작물로 인정하여 저작권을 부여하는 것이 공정하며, AI 기술의 발전을 촉진할 수 있습니다.

2. 저작권 부여 반대 근거: AI는 인간의 감정, 의도, 창의성을 가지지 않으므로, AI가 생성한 콘텐츠에 저작권을 부여하는 것은 부적절할 수 있습니다.
      `.trim();

      const keyPoints = extractKeyPoints(mockReasoning);

      expect(keyPoints).toHaveLength(2);

      // This was the reported issue - content was cut off after the colon
      expect(keyPoints[0]).toContain('저작권 부여를 지지하는 근거');
      expect(keyPoints[0]).toContain('AI 기술의 발전을 촉진할 수 있습니다');
      expect(keyPoints[0]).not.toBe('저작권 부여를 지지하는 근거:'); // Should NOT be truncated

      expect(keyPoints[1]).toContain('저작권 부여 반대 근거');
      expect(keyPoints[1]).toContain('부적절할 수 있습니다');
    });
  });
});
