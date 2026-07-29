import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { GraphState } from './state.js';
import { runOrchestrator } from '../agents/orchestratorAgent.js';
import { costCalculatorTool } from '../tools/costCalculatorTool.js';
import { supplierAuditTool } from '../tools/supplierAuditTool.js';
import { complianceRagTool } from '../tools/complianceRagTool.js';
import { humanApprovalNode } from '../guardrails/humanApprovalNode.js';

/**
 * graph.js
 *
 * Wires the orchestrator agent and the two tools into an explicit
 * two-node ReAct loop:
 *
 *   START -> agent -> (has tool calls?) -> tools -> agent -> ... -> END
 *
 * Built by hand with StateGraph (rather than LangGraph's prebuilt
 * createReactAgent helper) so the control flow is fully visible here —
 * this is the seam Step 3's guardrail node will insert into: a
 * `shouldContinue`-style conditional edge is exactly where a
 * human-approval interrupt belongs, sitting between "tools" and "agent".
 */

const toolNode = new ToolNode([costCalculatorTool, supplierAuditTool, complianceRagTool]);

async function agentNode(state) {
  try {
    const response = await runOrchestrator(state.messages);
    return { messages: [response] };
  } catch (err) {
    // A failed agent call becomes a visible assistant message rather than
    // an unhandled rejection that crashes the graph — the caller (the
    // Express /chat route) always gets a readable response either way.
    return {
      messages: [
        {
          role: 'assistant',
          content: `I hit an internal error and could not complete this request: ${err.message}`,
        },
      ],
    };
  }
}

function shouldContinue(state) {
  const lastMessage = state.messages[state.messages.length - 1];
  const hasToolCalls = Array.isArray(lastMessage?.tool_calls) && lastMessage.tool_calls.length > 0;
  return hasToolCalls ? 'tools' : END;
}

/**
 * Routes after the guardrail node (Step 3): a rejected human-approval
 * decision ends the graph here rather than looping back to the agent,
 * since there's nothing more for the agent to reason about once a flagged
 * action has been explicitly declined.
 */
function afterGuardrail(state) {
  return state.route === 'rejected' ? END : 'agent';
}

export function buildGraph() {
  // A checkpointer is REQUIRED for interrupt()/resume to work — it's what
  // lets the graph durably pause mid-run and pick back up later against the
  // same thread_id. MemorySaver keeps checkpoints in-process (fine for a
  // single-server demo); swap for a persistent checkpointer (e.g. backed by
  // Postgres) before running multiple server instances in production.
  const checkpointer = new MemorySaver();

  const graph = new StateGraph(GraphState)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addNode('guardrail', humanApprovalNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, { tools: 'tools', [END]: END })
    .addEdge('tools', 'guardrail')
    .addConditionalEdges('guardrail', afterGuardrail, { agent: 'agent', [END]: END });

  return graph.compile({ checkpointer });
}
