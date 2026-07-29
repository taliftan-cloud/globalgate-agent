/**
 * toolSelectionEval.js
 *
 * A small manual evaluation harness for the orchestrator's tool-selection
 * behavior. Not part of `npm test` on purpose: it calls the real Claude API
 * and costs money per run, so it's a separate `npm run eval` command you
 * run deliberately, typically after changing a tool description or the
 * system prompt, to sanity-check that the model still picks the right tool
 * for each kind of question.
 *
 * This is the kind of check that matters a lot more once you have several
 * tools with overlapping-sounding descriptions — it catches "the agent
 * stopped calling audit_supplier for supplier questions" regressions that
 * unit tests on the tools themselves can't, since the tools work fine in
 * isolation even when the model routes to the wrong one.
 */
import { runOrchestrator } from '../src/agents/orchestratorAgent.js';

const CASES = [
  {
    prompt: 'Can you check if Shenzhen Test Co is a safe supplier to work with?',
    expectedTool: 'audit_supplier',
  },
  {
    prompt:
      'What would it cost me to import a shipment FOB from China, ex-factory price $1000, ' +
      'freight $200, insurance $30, port fees $40, duties $100, testing $60, delivery $80, VAT 17%?',
    expectedTool: 'calculate_landed_cost',
  },
  {
    prompt: 'What do I need to know about NNN agreements before working with a Chinese factory?',
    expectedTool: 'search_compliance_docs',
  },
  {
    prompt: 'Are there special rules for shipping products with lithium batteries by air?',
    expectedTool: 'search_compliance_docs',
  },
];

async function run() {
  let passed = 0;

  for (const testCase of CASES) {
    let calledTools = [];
    try {
      const response = await runOrchestrator([{ role: 'user', content: testCase.prompt }]);
      calledTools = (response.tool_calls ?? []).map((call) => call.name);
    } catch (err) {
      console.log(`ERROR: "${testCase.prompt}" -> ${err.message}`);
      continue;
    }

    const ok = calledTools.includes(testCase.expectedTool);
    console.log(
      `${ok ? 'PASS' : 'FAIL'}: "${testCase.prompt}"\n  expected ${testCase.expectedTool}, got [${calledTools.join(', ')}]`
    );
    if (ok) passed += 1;
  }

  console.log(`\n${passed}/${CASES.length} passed`);
  process.exitCode = passed === CASES.length ? 0 : 1;
}

run().catch((err) => {
  console.error('Eval run failed:', err);
  process.exitCode = 1;
});
