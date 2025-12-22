import { TOOLS } from '../src/mcp/tools.js';

const startTool = TOOLS.find((t) => t.name === 'start_roundtable');
console.log('start_roundtable inputSchema:');
console.log(JSON.stringify(startTool?.inputSchema, null, 2));

const continueTool = TOOLS.find((t) => t.name === 'continue_roundtable');
console.log('\ncontinue_roundtable inputSchema:');
console.log(JSON.stringify(continueTool?.inputSchema, null, 2));

const synthTool = TOOLS.find((t) => t.name === 'synthesize_debate');
console.log('\nsynthesize_debate inputSchema:');
console.log(JSON.stringify(synthTool?.inputSchema, null, 2));
