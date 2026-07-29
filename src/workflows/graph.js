import { StateGraph, END, START } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { GraphState } from './state.js';
import { runOrchestrator } from '../agents/orchestratorAgent.js';
import { costCalculatorTool } from '../tools/costCalculatorTool.js';
import { supplierAuditTool } from '../tools/supplierAuditTool.js';

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

const toolNode = new ToolNode([costCalculatorTool, supplierAuditTool]);

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

export function buildGraph() {
  const graph = new StateGraph(GraphState)
    .addNode('agent', agentNode)
    .addNode('tools', toolNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, { tools: 'tools', [END]: END })
    .addEdge('tools', 'agent');

  return graph.compile();
}
