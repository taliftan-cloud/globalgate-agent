import { ChatAnthropic } from '@langchain/anthropic';
import { costCalculatorTool } from '../tools/costCalculatorTool.js';
import { supplierAuditTool } from '../tools/supplierAuditTool.js';
import { config } from '../config/index.js';

/**
 * orchestratorAgent.js
 *
 * The single LLM-driven decision-maker for this system: given the running
 * conversation, it decides whether to call a tool (and with what
 * arguments), or reply directly. Kept separate from workflows/graph.js so
 * the agent's reasoning/prompt is independently readable and testable from
 * the graph plumbing that invokes it.
 *
 * Step 1 note: this is a single orchestrator rather than separate
 * "SupplierGuardAgent" / "CostAgent" classes, because with only two tools a
 * single well-prompted router is simpler and equally capable — LangChain's
 * tool-calling already handles the dispatch. If a third, more specialized
 * capability is added later (e.g. the RAG compliance-lookup in Step 2)
 * and it needs materially different reasoning (not just another tool call),
 * that's the natural point to split this into multiple agent modules.
 */

const SYSTEM_PROMPT = `You are the operations assistant for GlobalGate, a platform that helps e-commerce \
sellers import goods from China. You have two tools available:

1. audit_supplier — checks a Chinese supplier's risk level (Green/Yellow/Red)
2. calculate_landed_cost — resolves the correct Incoterm and computes the full landed cost of a shipment

Call a tool whenever the user's question requires supplier risk data or a cost calculation — don't guess or \
fabricate numbers. If the user's request is missing information a tool needs (e.g. cost figures for a \
calculation), ask a concise clarifying question instead of inventing values. Keep replies operational and \
concise — this is a working tool, not a general-purpose chatbot.`;

let cachedModel = null;

/**
 * Lazily constructs the bound model on first use rather than at import
 * time, so importing this module (e.g. from a test) never throws due to a
 * missing ANTHROPIC_API_KEY before config validation has had a chance to run.
 */
function getModel() {
  if (!cachedModel) {
    cachedModel = new ChatAnthropic({
      apiKey: config.anthropicApiKey,
      model: 'claude-sonnet-5',
      temperature: 0,
    }).bindTools([costCalculatorTool, supplierAuditTool]);
  }
  return cachedModel;
}

/**
 * @param {Array<{role: string, content: string} | import('@langchain/core/messages').BaseMessage>} messages
 * @returns {Promise<import('@langchain/core/messages').AIMessage>}
 */
export async function runOrchestrator(messages) {
  try {
    const model = getModel();
    const response = await model.invoke([{ role: 'system', content: SYSTEM_PROMPT }, ...messages]);
    return response;
  } catch (err) {
    throw new Error(`Orchestrator agent failed: ${err.message}`);
  }
}
