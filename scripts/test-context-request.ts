/**
 * Context Request Flow Verification Script
 *
 * Tests the full round-trip of the Context Request Pattern:
 * 1. Agent uses request_context tool
 * 2. System returns needs_context status with contextRequests
 * 3. Caller provides contextResults via continue_roundtable
 * 4. Agent receives context in next round
 */
import 'dotenv/config';
import { DebateEngine } from '../src/core/debate-engine.js';
import { SessionManager } from '../src/core/session-manager.js';
import { ModeRegistry } from '../src/modes/registry.js';
import { DefaultAgentToolkit } from '../src/tools/toolkit.js';
import { SQLiteStorage } from '../src/storage/sqlite.js';
import { MockAgent } from '../src/agents/base.js';
import type {
  DebateContext,
  ContextRequest,
  ContextResult,
  ConsensusResult,
  AgentResponse,
} from '../src/types/index.js';

// Mock AI Consensus Analyzer for testing
class MockAIConsensusAnalyzer {
  async analyzeConsensus(
    responses: AgentResponse[],
    _topic: string,
    _options?: { includeGroupthinkDetection?: boolean }
  ): Promise<ConsensusResult> {
    return {
      agreementLevel: 0.5,
      majorityPosition: responses[0]?.position ?? 'No position',
      commonPoints: ['Test common point'],
      disagreementPoints: [],
      summary: 'Mock consensus summary',
    };
  }
}

async function runContextRequestTest() {
  console.log('='.repeat(60));
  console.log('Context Request Flow Verification');
  console.log('='.repeat(60));

  // Initialize storage first
  const storage = new SQLiteStorage();
  await storage.initialize();

  // Create test components
  const sessionManager = new SessionManager(storage);
  const modeRegistry = new ModeRegistry();
  const toolkit = new DefaultAgentToolkit();

  const engine = new DebateEngine({
    sessionManager,
    modeRegistry,
    toolkit,
    enableAIConsensus: true,
    aiConsensusAnalyzer: new MockAIConsensusAnalyzer() as any,
  });

  // Create a mock agent that will use request_context tool
  let requestContextCalled = false;
  let receivedContextResults: ContextResult[] | undefined;

  const mockAgent = new MockAgent({
    id: 'test-agent',
    name: 'Context Request Test Agent',
    provider: 'anthropic',
    model: 'mock',
  });

  // Override generateResponse to simulate request_context usage
  const originalGenerateResponse = mockAgent.generateResponse.bind(mockAgent);
  mockAgent.generateResponse = async (context: DebateContext) => {
    // Check if this is the first round (should request context)
    if (context.currentRound === 1 && !requestContextCalled) {
      requestContextCalled = true;

      // Simulate calling request_context tool
      if (mockAgent.toolkit) {
        const result = await mockAgent.toolkit.executeTool('request_context', {
          query: 'What are the latest AI regulations in the EU?',
          reason: 'Need regulatory context for informed debate',
          priority: 'required',
        });
        console.log('  [Agent] Called request_context:', JSON.stringify(result));
      }
    }

    // Check if context was received
    if (context.contextResults && context.contextResults.length > 0) {
      receivedContextResults = context.contextResults;
      console.log(
        '  [Agent] Received contextResults:',
        JSON.stringify(context.contextResults, null, 2)
      );
    }

    return originalGenerateResponse(context);
  };

  // Create session
  const session = await sessionManager.createSession({
    topic: 'Should AI be regulated in the EU?',
    mode: 'collaborative',
    agents: ['test-agent'],
    rounds: 3,
  });

  console.log('\n[1] Starting debate session:', session.id);

  // Run first round
  const round1Results = await engine.executeRounds([mockAgent], session, 1);
  console.log('\n[2] Round 1 completed');
  console.log('  - Responses:', round1Results.length);

  // Check for pending context requests
  const pendingRequests = toolkit.getPendingContextRequests();
  console.log('\n[3] Checking pending context requests:');
  console.log('  - Count:', pendingRequests.length);

  if (pendingRequests.length > 0) {
    console.log('  - First request:', JSON.stringify(pendingRequests[0], null, 2));

    // Simulate providing context results
    const contextResults: ContextResult[] = pendingRequests.map((req: ContextRequest) => ({
      requestId: req.id,
      success: true,
      result:
        'The EU AI Act was passed in March 2024. It establishes a risk-based framework for AI regulation with requirements varying based on risk level.',
    }));

    console.log('\n[4] Providing context results for round 2...');

    // Update session round
    session.currentRound = 1;

    // Run second round with context results
    const round2Results = await engine.executeRounds(
      [mockAgent],
      session,
      1,
      undefined,
      contextResults
    );
    console.log('\n[5] Round 2 completed');
    console.log('  - Responses:', round2Results.length);

    // Verify context was received
    if (receivedContextResults) {
      console.log('\n[SUCCESS] Agent received context results!');
      console.log('  - Request ID:', receivedContextResults[0]?.requestId);
      console.log('  - Success:', receivedContextResults[0]?.success);
      console.log(
        '  - Result preview:',
        receivedContextResults[0]?.result?.substring(0, 100) + '...'
      );
    } else {
      console.log('\n[FAILURE] Agent did not receive context results');
    }
  } else {
    console.log(
      '\n[INFO] No pending context requests (agent may not have used request_context tool)'
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('Context Request Flow Verification Complete');
  console.log('='.repeat(60));

  // Summary
  console.log('\n📋 Summary:');
  console.log('  - request_context tool called:', requestContextCalled);
  console.log('  - Context requests generated:', pendingRequests.length);
  console.log('  - Context results received by agent:', !!receivedContextResults);

  const success = requestContextCalled && pendingRequests.length > 0 && !!receivedContextResults;
  console.log('\n' + (success ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'));

  return success;
}

runContextRequestTest()
  .then((success) => process.exit(success ? 0 : 1))
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
