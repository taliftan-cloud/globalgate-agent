# Guardrails — Human-in-the-Loop (HITL)

Implements an async approval gate sitting between the `tools` and `agent` nodes in the
graph (see `src/workflows/graph.js`).

## How it works

After every tool call, `humanApprovalNode.js` checks the result against the rules in
`anomalyRules.js`:

- Supplier risk audit returns `RED`
- A landed-cost calculation's buyer out-of-pocket total exceeds
  `HIGH_COST_THRESHOLD_USD` (configurable via `.env`, defaults to $5000)
- A landed-cost calculation surfaces any compliance alert (e.g. a restricted-goods flag)

If none of these match, the node is a transparent pass-through and the graph continues
to the agent as normal. If one does, the graph calls LangGraph's `interrupt()`, which
durably **pauses the entire graph** — via the `MemorySaver` checkpointer configured in
`graph.js` — and returns the anomaly details to the caller instead of continuing.

## Resuming

The graph only resumes once `POST /chat/resume` is called with `{ threadId, approved }`
for that conversation's `threadId` (returned in the original `PENDING_APPROVAL`
response from `POST /chat`). Approving continues to the agent as normal; rejecting ends
the graph with a message explaining the flagged action was not approved.

## Files

- `anomalyRules.js` — pure, dependency-free anomaly-detection rules (independently testable)
- `humanApprovalNode.js` — the actual graph node; calls `interrupt()`
