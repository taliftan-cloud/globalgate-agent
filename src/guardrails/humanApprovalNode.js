import { interrupt } from '@langchain/langgraph';
import { detectAnomaly } from './anomalyRules.js';

/**
 * humanApprovalNode.js
 *
 * Sits between the "tools" and "agent" nodes in the graph (see
 * workflows/graph.js). After every tool call, it inspects the most recent
 * tool result against the rules in anomalyRules.js:
 *
 *   - no anomaly found  -> transparent pass-through, graph continues to "agent"
 *   - anomaly found     -> calls interrupt(), which durably PAUSES the whole
 *                          graph (via the MemorySaver checkpointer configured
 *                          in graph.js) and returns the anomaly details to
 *                          the caller instead of continuing.
 *
 * The graph only resumes once the caller invokes it again with
 * `new Command({ resume: { approved: true | false } })` against the same
 * thread_id — see the POST /chat/resume route in index.js.
 *
 * Version note: this relies on @langchain/langgraph's dynamic interrupt()
 * API. If the installed version's interrupt/resume behavior doesn't match
 * (the field LangGraph attaches the pause payload to has changed across
 * versions), check the current "Human-in-the-loop" docs for
 * @langchain/langgraph and adjust index.js's formatGraphResult() accordingly
 * — this file itself (the call to interrupt()) should not need to change.
 */
export async function humanApprovalNode(state) {
  const lastMessage = state.messages[state.messages.length - 1];

  // Only a ToolMessage carries a structured tool result worth evaluating —
  // anything else (e.g. the graph reaching this node with no prior tool
  // call, which shouldn't normally happen given the edges in graph.js) is a
  // safe no-op pass-through rather than a hard error.
  const isToolMessage = lastMessage?.getType?.() === 'tool' || lastMessage?._getType?.() === 'tool';
  if (!lastMessage || !isToolMessage) {
    return { route: 'continue' };
  }

  let payload;
  try {
    payload = JSON.parse(lastMessage.content);
  } catch (err) {
    // Not valid JSON (a malformed tool result) — nothing structured for the
    // guardrail to evaluate; let the agent see and handle it normally
    // rather than blocking the graph on a parse failure.
    return { route: 'continue' };
  }

  const toolName = lastMessage.name;
  const anomaly = detectAnomaly(toolName, payload);

  if (!anomaly) {
    return { route: 'continue' };
  }

  // Execution pauses here. Everything below only runs after a human
  // resumes the graph with their decision via POST /chat/resume.
  const decision = interrupt({
    type: 'HUMAN_APPROVAL_REQUIRED',
    anomaly,
    toolName,
    toolResult: payload,
  });

  if (decision?.approved === true) {
    return { route: 'continue' };
  }

  return {
    route: 'rejected',
    messages: [
      {
        role: 'assistant',
        content:
          `This action was flagged for review (${anomaly.type}: ${anomaly.message}) and was not ` +
          'approved by a human reviewer, so I did not proceed further.',
      },
    ],
  };
}
