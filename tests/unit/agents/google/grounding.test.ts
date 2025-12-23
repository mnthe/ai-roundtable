/**
 * Tests for Google Search grounding utilities
 */

import { describe, it, expect } from 'vitest';
import {
  extractCitationsFromGrounding,
  processGroundingMetadata,
  buildPhase2Message,
} from '../../../../src/agents/google/grounding.js';
import type { GroundingMetadata, GroundingChunk } from '@google/genai';
import type { Citation } from '../../../../src/types/index.js';

describe('extractCitationsFromGrounding', () => {
  it('should extract citations from grounding chunks', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [
        {
          web: {
            uri: 'https://example.com/article',
            title: 'Example Article',
          },
        },
        {
          web: {
            uri: 'https://docs.example.com/guide',
            title: 'Documentation Guide',
          },
        },
      ],
    };

    const citations = extractCitationsFromGrounding(metadata);

    expect(citations).toHaveLength(2);
    expect(citations[0]).toEqual({
      title: 'Example Article',
      url: 'https://example.com/article',
      snippet: undefined,
    });
    expect(citations[1]).toEqual({
      title: 'Documentation Guide',
      url: 'https://docs.example.com/guide',
      snippet: undefined,
    });
  });

  it('should handle empty grounding chunks', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [],
    };

    const citations = extractCitationsFromGrounding(metadata);

    expect(citations).toEqual([]);
  });

  it('should handle undefined grounding chunks', () => {
    const metadata: GroundingMetadata = {};

    const citations = extractCitationsFromGrounding(metadata);

    expect(citations).toEqual([]);
  });

  it('should filter out chunks without web URI', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [
        {
          web: {
            uri: 'https://valid.com',
            title: 'Valid',
          },
        },
        {
          web: {
            title: 'No URI',
          },
        } as GroundingChunk,
        {
          web: {
            uri: '',
            title: 'Empty URI',
          },
        },
      ],
    };

    const citations = extractCitationsFromGrounding(metadata);

    // Only the first one has a valid URI
    // Empty string URI is falsy, so it should be filtered
    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toBe('https://valid.com');
  });

  it('should use "Untitled" for chunks without title', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [
        {
          web: {
            uri: 'https://notitle.com/page',
          },
        } as GroundingChunk,
      ],
    };

    const citations = extractCitationsFromGrounding(metadata);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.title).toBe('Untitled');
    expect(citations[0]?.url).toBe('https://notitle.com/page');
  });

  it('should handle null web property in chunk', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [
        {} as GroundingChunk, // No web property
        {
          web: {
            uri: 'https://valid.com',
            title: 'Valid',
          },
        },
      ],
    };

    const citations = extractCitationsFromGrounding(metadata);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.url).toBe('https://valid.com');
  });
});

describe('processGroundingMetadata', () => {
  it('should process metadata and return citations and tool calls', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [
        {
          web: {
            uri: 'https://example.com/1',
            title: 'Example 1',
          },
        },
        {
          web: {
            uri: 'https://example.com/2',
            title: 'Example 2',
          },
        },
      ],
      webSearchQueries: ['test query 1', 'test query 2'],
    };

    const { citations, toolCalls } = processGroundingMetadata(metadata);

    expect(citations).toHaveLength(2);
    expect(citations[0]?.title).toBe('Example 1');
    expect(citations[1]?.title).toBe('Example 2');

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.toolName).toBe('google_search');
    expect(toolCalls[0]?.input).toEqual({
      queries: ['test query 1', 'test query 2'],
    });
    expect(toolCalls[0]?.output).toEqual({
      success: true,
      data: {
        results: [
          { title: 'Example 1', url: 'https://example.com/1' },
          { title: 'Example 2', url: 'https://example.com/2' },
        ],
      },
    });
    expect(toolCalls[0]?.timestamp).toBeInstanceOf(Date);
  });

  it('should return empty results for undefined metadata', () => {
    const { citations, toolCalls } = processGroundingMetadata(undefined);

    expect(citations).toEqual([]);
    expect(toolCalls).toEqual([]);
  });

  it('should return empty tool calls when no grounding chunks', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [],
      webSearchQueries: ['some query'],
    };

    const { citations, toolCalls } = processGroundingMetadata(metadata);

    expect(citations).toEqual([]);
    expect(toolCalls).toEqual([]);
  });

  it('should handle missing webSearchQueries', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [
        {
          web: {
            uri: 'https://example.com',
            title: 'Example',
          },
        },
      ],
    };

    const { toolCalls } = processGroundingMetadata(metadata);

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]?.input).toEqual({ queries: [] });
  });

  it('should handle undefined groundingChunks', () => {
    const metadata: GroundingMetadata = {
      webSearchQueries: ['query'],
    };

    const { citations, toolCalls } = processGroundingMetadata(metadata);

    expect(citations).toEqual([]);
    expect(toolCalls).toEqual([]); // No tool call without grounding chunks
  });

  it('should handle chunks with missing title', () => {
    const metadata: GroundingMetadata = {
      groundingChunks: [
        {
          web: {
            uri: 'https://notitle.com',
          },
        } as GroundingChunk,
      ],
    };

    const { toolCalls } = processGroundingMetadata(metadata);

    expect(toolCalls[0]?.output.data.results[0]).toEqual({
      title: undefined,
      url: 'https://notitle.com',
    });
  });
});

describe('buildPhase2Message', () => {
  it('should return original message when no search results', () => {
    const originalMessage = 'What is AI?';
    const phase1Response = '';
    const citations: Citation[] = [];

    const result = buildPhase2Message(originalMessage, phase1Response, citations);

    expect(result).toBe(originalMessage);
  });

  it('should include web search results summary', () => {
    const originalMessage = 'What is AI?';
    const phase1Response = '';
    const citations: Citation[] = [
      { title: 'AI Overview', url: 'https://ai.com/overview' },
      { title: 'Machine Learning Guide', url: 'https://ml.com/guide' },
    ];

    const result = buildPhase2Message(originalMessage, phase1Response, citations);

    expect(result).toContain('What is AI?');
    expect(result).toContain('Web Search Results (from Phase 1)');
    expect(result).toContain('[1] AI Overview: https://ai.com/overview');
    expect(result).toContain('[2] Machine Learning Guide: https://ml.com/guide');
    expect(result).toContain('Please provide your final response');
  });

  it('should include previous analysis', () => {
    const originalMessage = 'What is AI?';
    const phase1Response = 'AI is artificial intelligence that simulates human intelligence.';
    const citations: Citation[] = [];

    const result = buildPhase2Message(originalMessage, phase1Response, citations);

    expect(result).toContain('What is AI?');
    expect(result).toContain('Previous Analysis (with web search)');
    expect(result).toContain('AI is artificial intelligence that simulates human intelligence.');
    expect(result).toContain('Please provide your final response');
  });

  it('should include both citations and previous analysis', () => {
    const originalMessage = 'What is AI?';
    const phase1Response = 'Initial analysis of AI concepts.';
    const citations: Citation[] = [{ title: 'AI Basics', url: 'https://ai-basics.com' }];

    const result = buildPhase2Message(originalMessage, phase1Response, citations);

    expect(result).toContain('What is AI?');
    expect(result).toContain('Web Search Results (from Phase 1)');
    expect(result).toContain('[1] AI Basics: https://ai-basics.com');
    expect(result).toContain('Previous Analysis (with web search)');
    expect(result).toContain('Initial analysis of AI concepts.');
    expect(result).toContain('request_context');
    expect(result).toContain('fact_check');
  });

  it('should number citations correctly', () => {
    const originalMessage = 'Test';
    const phase1Response = '';
    const citations: Citation[] = [
      { title: 'First', url: 'https://first.com' },
      { title: 'Second', url: 'https://second.com' },
      { title: 'Third', url: 'https://third.com' },
    ];

    const result = buildPhase2Message(originalMessage, phase1Response, citations);

    expect(result).toContain('[1] First: https://first.com');
    expect(result).toContain('[2] Second: https://second.com');
    expect(result).toContain('[3] Third: https://third.com');
  });

  it('should mention available tools in final instruction', () => {
    const originalMessage = 'Test query';
    const phase1Response = 'Some analysis';
    const citations: Citation[] = [];

    const result = buildPhase2Message(originalMessage, phase1Response, citations);

    expect(result).toContain('request_context');
    expect(result).toContain('fact_check');
    expect(result).toContain('additional tools');
  });
});
