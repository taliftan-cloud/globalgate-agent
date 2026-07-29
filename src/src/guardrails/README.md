# Guardrails (reserved for Step 3)

This folder is intentionally present but empty as of Step 1 — it is reserved for the
Human-in-the-Loop (HITL) interrupt logic planned for Step 3: an async pause in the
graph's `tools -> agent` edge that holds execution and waits for human approval when
a tool result looks anomalous (e.g. a `RED` supplier risk rating, or a landed cost
above a configurable threshold), before the graph is allowed to continue.
