import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import { Command } from '@langchain/langgraph';
import { buildGraph } from './workflows/graph.js';
import { config } from './config/index.js';

/**
 * index.js
 *
 * The "interface" layer mentioned in the project brief: a thin Express
 * server exposing the compiled LangGraph.
 *
 * Two endpoints, matching the two things a Human-in-the-Loop conversation
 * needs (Step 3):
 *
 *   POST /chat         - starts or continues a normal conversation turn.
 *                         Returns either a completed reply, or a
 *                         PENDING_APPROVAL response if the guardrail
 *                         (src/guardrails/humanApprovalNode.js) paused the
 *                         graph on an anomaly.
 *   POST /chat/resume  - resumes a paused conversation with a human's
 *                         approve/reject decision for a given threadId.
 */

const app = express();
app.use(cors());
app.use(express.json());

const graph = buildGraph();

app.get('/health', (req, res) => {
  res.json({ ok: true, message: 'GlobalGate Agent server is running.' });
});

app.post('/chat', async (req, res) => {
  try {
    const { message, threadId } = req.body ?? {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Request body must include a non-empty "message" string.' });
    }

    // A fresh thread per conversation unless the caller is continuing one
    // it already started — the thread_id is what LangGraph's checkpointer
    // uses to find the right paused/in-progress state to attach to.
    const activeThreadId = threadId || randomUUID();
    const runConfig = { configurable: { thread_id: activeThreadId } };

    const result = await graph.invoke({ messages: [{ role: 'user', content: message }] }, runConfig);

    res.json(formatGraphResult(result, activeThreadId));
  } catch (err) {
    console.error('[POST /chat] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error while processing the chat request.' });
  }
});

app.post('/chat/resume', async (req, res) => {
  try {
    const { threadId, approved } = req.body ?? {};

    if (!threadId || typeof threadId !== 'string') {
      return res
        .status(400)
        .json({ error: 'Request body must include a "threadId" string from a prior PENDING_APPROVAL /chat response.' });
    }
    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'Request body must include an "approved" boolean.' });
    }

    const runConfig = { configurable: { thread_id: threadId } };
    const result = await graph.invoke(new Command({ resume: { approved } }), runConfig);

    res.json(formatGraphResult(result, threadId));
  } catch (err) {
    console.error('[POST /chat/resume] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error while resuming the chat.' });
  }
});

/**
 * Normalizes a graph.invoke() result into either a completed reply, or a
 * pending-approval response the client should surface to a human reviewer
 * along with the threadId needed to call POST /chat/resume.
 *
 * VERSION NOTE: `result.__interrupt__` is the field LangGraph.js's dynamic
 * interrupt() API attaches the pause payload to, as of @langchain/langgraph
 * ^0.2.x. This is the one part of Step 3 that hasn't been run against a
 * live install — if you upgrade @langchain/langgraph and PENDING_APPROVAL
 * never appears even when an anomaly should have fired, check the current
 * "Human-in-the-loop" docs for the field name and update just this function.
 */
function formatGraphResult(result, threadId) {
  if (result.__interrupt__ && result.__interrupt__.length > 0) {
    const pending = result.__interrupt__[0].value;
    return {
      status: 'PENDING_APPROVAL',
      threadId,
      anomaly: pending.anomaly,
      toolName: pending.toolName,
      toolResult: pending.toolResult,
    };
  }

  const lastMessage = result.messages[result.messages.length - 1];
  return {
    status: 'COMPLETE',
    threadId,
    reply: lastMessage.content,
    messageCount: result.messages.length,
  };
}

app.listen(config.port, () => {
  console.log(`GlobalGate Agent server listening on port ${config.port}`);
});
