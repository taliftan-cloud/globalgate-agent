import { Annotation } from '@langchain/langgraph';

/**
 * state.js
 *
 * The shared state object that flows through every node in the graph.
 * Each field is an Annotation with an explicit reducer, which is how
 * LangGraph merges a node's return value into the running state:
 *
 *   - `messages` uses a concatenating reducer, so each node appends to the
 *     conversation history instead of overwriting it (the standard
 *     "message list" pattern for chat agents).
 *   - `route` and `lastToolResult` use a replace reducer — the latest node
 *     to write wins, since they represent "current" values rather than a log.
 *
 * Kept in its own file (separate from graph.js) so Step 3's guardrail nodes
 * can import and extend this same schema without touching the graph wiring.
 */
export const GraphState = Annotation.Root({
  messages: Annotation({
    reducer: (current, update) => current.concat(update),
    default: () => [],
  }),

  // Set by the tool-execution node after any tool call, so guardrail nodes
  // (Step 3) can inspect structured results (e.g. a RED supplier risk
  // rating, or a landed cost above a threshold) without re-parsing text.
  lastToolResult: Annotation({
    reducer: (_current, update) => update,
    default: () => null,
  }),

  // Free-form routing hint a node can set for downstream conditional edges.
  route: Annotation({
    reducer: (_current, update) => update,
    default: () => null,
  }),
});
