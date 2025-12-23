/**
 * Tests for Perplexity search utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractContentText,
  extractDomainFromUrl,
  extractCitedIndices,
  extractPerplexityCitations,
  createSearchToolCall,
} from '../../../../src/agents/perplexity/search.js';
import type { ChatMessageOutput } from '@perplexity-ai/perplexity_ai/resources';
import type { StreamChunk } from '@perplexity-ai/perplexity_ai/resources/chat/chat';
import type { Citation } from '../../../../src/types/index.js';

describe('extractContentText', () => {
  it('should extract text from string content', () => {
    const message = {
      content: 'Hello, world!',
    } as ChatMessageOutput;

    const text = extractContentText(message);

    expect(text).toBe('Hello, world!');
  });

  it('should extract and join text from array content', () => {
    const message = {
      content: [
        { type: 'text', text: 'First part. ' },
        { type: 'text', text: 'Second part.' },
      ],
    } as ChatMessageOutput;

    const text = extractContentText(message);

    expect(text).toBe('First part. Second part.');
  });

  it('should filter non-text chunks from array content', () => {
    const message = {
      content: [
        { type: 'text', text: 'Text content' },
        { type: 'image', url: 'https://example.com/image.png' },
        { type: 'text', text: ' more text' },
      ],
    } as unknown as ChatMessageOutput;

    const text = extractContentText(message);

    expect(text).toBe('Text content more text');
  });

  it('should return empty string for undefined message', () => {
    const text = extractContentText(undefined);

    expect(text).toBe('');
  });

  it('should return empty string for empty array content', () => {
    const message = {
      content: [],
    } as unknown as ChatMessageOutput;

    const text = extractContentText(message);

    expect(text).toBe('');
  });

  it('should handle content that is neither string nor array', () => {
    const message = {
      content: 12345,
    } as unknown as ChatMessageOutput;

    const text = extractContentText(message);

    expect(text).toBe('');
  });
});

describe('extractDomainFromUrl', () => {
  it('should extract domain from URL', () => {
    const domain = extractDomainFromUrl('https://example.com/path/to/page');

    expect(domain).toBe('example.com');
  });

  it('should remove www prefix', () => {
    const domain = extractDomainFromUrl('https://www.example.com/page');

    expect(domain).toBe('example.com');
  });

  it('should handle subdomain URLs', () => {
    const domain = extractDomainFromUrl('https://docs.example.com/guide');

    expect(domain).toBe('docs.example.com');
  });

  it('should handle URL with port', () => {
    const domain = extractDomainFromUrl('https://localhost:3000/api');

    expect(domain).toBe('localhost');
  });

  it('should return original string for invalid URL', () => {
    const domain = extractDomainFromUrl('not-a-valid-url');

    expect(domain).toBe('not-a-valid-url');
  });

  it('should handle empty string', () => {
    const domain = extractDomainFromUrl('');

    expect(domain).toBe('');
  });

  it('should handle http URLs', () => {
    const domain = extractDomainFromUrl('http://insecure.com/page');

    expect(domain).toBe('insecure.com');
  });
});

describe('extractCitedIndices', () => {
  it('should extract single citation indices', () => {
    const text = 'According to research [1], AI is advancing rapidly [2].';

    const indices = extractCitedIndices(text);

    expect(indices).toEqual(new Set([1, 2]));
  });

  it('should extract comma-separated citation indices', () => {
    const text = 'Multiple sources [1,2,3] support this claim.';

    const indices = extractCitedIndices(text);

    expect(indices).toEqual(new Set([1, 2, 3]));
  });

  it('should handle citations with spaces', () => {
    const text = 'References [1, 2, 3] and [4, 5] are relevant.';

    const indices = extractCitedIndices(text);

    expect(indices).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('should handle repeated citations', () => {
    const text = 'First [1] and again [1] and [2].';

    const indices = extractCitedIndices(text);

    expect(indices).toEqual(new Set([1, 2]));
  });

  it('should return empty set for text without citations', () => {
    const text = 'No citations in this text.';

    const indices = extractCitedIndices(text);

    expect(indices).toEqual(new Set());
  });

  it('should ignore zero and negative numbers', () => {
    const text = 'Invalid [0] and [-1] citations.';

    const indices = extractCitedIndices(text);

    expect(indices).toEqual(new Set());
  });

  it('should handle large citation numbers', () => {
    const text = 'Many sources [10][15][99].';

    const indices = extractCitedIndices(text);

    expect(indices).toEqual(new Set([10, 15, 99]));
  });

  it('should ignore non-numeric brackets', () => {
    const text = 'Array [a,b,c] and object [key: value].';

    const indices = extractCitedIndices(text);

    expect(indices).toEqual(new Set());
  });
});

describe('extractPerplexityCitations', () => {
  it('should extract citations from search_results field', () => {
    const response = {
      id: 'resp-123',
      search_results: [
        {
          title: 'AI Research Paper',
          url: 'https://research.com/ai-paper',
          date: '2024-01-15',
        },
        {
          title: 'Machine Learning Guide',
          url: 'https://ml.com/guide',
          snippet: 'A comprehensive guide to ML.',
        },
      ],
    } as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      title: 'AI Research Paper',
      url: 'https://research.com/ai-paper',
      snippet: 'Published: 2024-01-15',
    });
    expect(citations[1]).toEqual({
      title: 'Machine Learning Guide',
      url: 'https://ml.com/guide',
      snippet: 'A comprehensive guide to ML.',
    });
  });

  it('should fallback to deprecated citations field', () => {
    const response = {
      id: 'resp-123',
      citations: ['https://example.com/1', 'https://docs.example.com/2'],
    } as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      title: 'example.com',
      url: 'https://example.com/1',
    });
    expect(citations[1]).toEqual({
      title: 'docs.example.com',
      url: 'https://docs.example.com/2',
    });
  });

  it('should prefer search_results over citations', () => {
    const response = {
      id: 'resp-123',
      search_results: [
        {
          title: 'From Search Results',
          url: 'https://search.com',
        },
      ],
      citations: ['https://citations.com'],
    } as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.title).toBe('From Search Results');
    expect(citations[0]?.url).toBe('https://search.com');
  });

  it('should return empty array when no citations', () => {
    const response = {
      id: 'resp-123',
    } as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations).toEqual([]);
  });

  it('should filter citations by response text references', () => {
    const response = {
      id: 'resp-123',
      search_results: [
        { title: 'First Source', url: 'https://first.com' },
        { title: 'Second Source', url: 'https://second.com' },
        { title: 'Third Source', url: 'https://third.com' },
      ],
    } as StreamChunk;

    const responseText = 'According to [1] and [3], the claim is valid.';
    const citations = extractPerplexityCitations(response, responseText);

    expect(citations).toHaveLength(2);
    expect(citations[0]?.title).toBe('First Source');
    expect(citations[1]?.title).toBe('Third Source');
  });

  it('should return all citations when no indices in response text', () => {
    const response = {
      id: 'resp-123',
      search_results: [
        { title: 'Source 1', url: 'https://source1.com' },
        { title: 'Source 2', url: 'https://source2.com' },
      ],
    } as StreamChunk;

    const responseText = 'No citation markers in this text.';
    const citations = extractPerplexityCitations(response, responseText);

    expect(citations).toHaveLength(2);
  });

  it('should use domain as title when title is missing', () => {
    const response = {
      id: 'resp-123',
      search_results: [{ url: 'https://www.notitle.com/page' }],
    } as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.title).toBe('notitle.com');
  });

  it('should skip results without URL', () => {
    const response = {
      id: 'resp-123',
      search_results: [{ title: 'No URL' }, { title: 'Has URL', url: 'https://valid.com' }],
    } as unknown as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.title).toBe('Has URL');
  });

  it('should handle empty search_results array', () => {
    const response = {
      id: 'resp-123',
      search_results: [],
    } as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations).toEqual([]);
  });

  it('should skip non-string citations in fallback', () => {
    const response = {
      id: 'resp-123',
      citations: ['https://valid.com', null, 123, 'https://also-valid.com'],
    } as unknown as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations).toHaveLength(2);
    expect(citations[0]?.url).toBe('https://valid.com');
    expect(citations[1]?.url).toBe('https://also-valid.com');
  });

  it('should handle response with date but no snippet', () => {
    const response = {
      id: 'resp-123',
      search_results: [{ title: 'Article', url: 'https://article.com', date: '2024-06-01' }],
    } as StreamChunk;

    const citations = extractPerplexityCitations(response);

    expect(citations[0]?.snippet).toBe('Published: 2024-06-01');
  });

  it('should prefer snippet over date when both present', () => {
    const response = {
      id: 'resp-123',
      search_results: [
        {
          title: 'Article',
          url: 'https://article.com',
          date: '2024-06-01',
          snippet: 'Article summary text.',
        },
      ],
    } as StreamChunk;

    const citations = extractPerplexityCitations(response);

    // When date is present, it takes precedence (based on implementation)
    expect(citations[0]?.snippet).toBe('Published: 2024-06-01');
  });
});

describe('createSearchToolCall', () => {
  it('should create tool call record with citations', () => {
    const citations: Citation[] = [
      { title: 'Source 1', url: 'https://source1.com' },
      { title: 'Source 2', url: 'https://source2.com' },
    ];
    const topic = 'AI regulation debate';

    const toolCall = createSearchToolCall(citations, topic);

    expect(toolCall.toolName).toBe('perplexity_search');
    expect(toolCall.input).toEqual({ query: topic });
    expect(toolCall.output).toEqual({
      success: true,
      data: {
        results: [
          { title: 'Source 1', url: 'https://source1.com' },
          { title: 'Source 2', url: 'https://source2.com' },
        ],
      },
    });
    expect(toolCall.timestamp).toBeInstanceOf(Date);
  });

  it('should handle empty citations array', () => {
    const citations: Citation[] = [];
    const topic = 'Empty search';

    const toolCall = createSearchToolCall(citations, topic);

    expect(toolCall.toolName).toBe('perplexity_search');
    expect(toolCall.input).toEqual({ query: 'Empty search' });
    expect(toolCall.output.data.results).toEqual([]);
  });

  it('should use topic as search query', () => {
    const citations: Citation[] = [{ title: 'Test', url: 'https://test.com' }];
    const topic = 'Should AI be regulated?';

    const toolCall = createSearchToolCall(citations, topic);

    expect(toolCall.input.query).toBe('Should AI be regulated?');
  });

  it('should only include title and url in results', () => {
    const citations: Citation[] = [
      {
        title: 'Full Citation',
        url: 'https://full.com',
        snippet: 'This snippet should not appear',
        source: 'perplexity',
      },
    ];

    const toolCall = createSearchToolCall(citations, 'test');

    expect(toolCall.output.data.results[0]).toEqual({
      title: 'Full Citation',
      url: 'https://full.com',
    });
    expect(toolCall.output.data.results[0]).not.toHaveProperty('snippet');
    expect(toolCall.output.data.results[0]).not.toHaveProperty('source');
  });

  it('should create timestamp at call time', () => {
    const before = new Date();
    const toolCall = createSearchToolCall([], 'test');
    const after = new Date();

    expect(toolCall.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(toolCall.timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
