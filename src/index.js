import express from 'express';
import cors from 'cors';
import { buildGraph } from './workflows/graph.js';
import { config } from './config/index.js';

/**
 * index.js
 *
 * The "interface" layer mentioned in the project brief: a thin Express
 * server exposing the compiled LangGraph as a single POST /chat endpoint.
 * Deliberately minimal — this is not the final production interface, just
 * enough surface area to exercise the graph end-to-end and demo it.
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
    const { message } = req.body ?? {};

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Request body must include a non-empty "message" string.' });
    }

    const result = await graph.invoke({
      messages: [{ role: 'user', content: message }],
    });

    const lastMessage = result.messages[result.messages.length - 1];

    res.json({
      reply: lastMessage.content,
      messageCount: result.messages.length,
    });
  } catch (err) {
    console.error('[POST /chat] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error while processing the chat request.' });
  }
});

app.listen(config.port, () => {
  console.log(`GlobalGate Agent server listening on port ${config.port}`);
});
