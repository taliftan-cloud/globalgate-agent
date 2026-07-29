/**
 * logger.js
 *
 * Minimal structured logging, no external service or API key required.
 * Every log line is a single JSON object with a timestamp, so it's grep-able
 * and could be piped into a real log aggregator later without changing the
 * call sites. This isn't a substitute for real tracing (LangSmith or
 * similar would give you a visual timeline and token-level detail), but it
 * means every graph run leaves an audit trail of which nodes ran, in what
 * order, and how long each one took, which is the minimum bar for
 * debugging an agent in production.
 */
export function logEvent(event, data = {}) {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), event, ...data }));
}

/**
 * Wraps a LangGraph node function with entry/exit/error logging and timing.
 * Use this when registering nodes in the StateGraph rather than adding
 * logging calls inside each node function, so the instrumentation is
 * consistent and can't accidentally be forgotten on a new node.
 */
export function withNodeLogging(nodeName, nodeFn) {
  return async (state, config) => {
    const start = Date.now();
    logEvent('node_start', { node: nodeName });

    try {
      const result = await nodeFn(state, config);
      logEvent('node_end', { node: nodeName, durationMs: Date.now() - start });
      return result;
    } catch (err) {
      logEvent('node_error', { node: nodeName, durationMs: Date.now() - start, error: err.message });
      throw err;
    }
  };
}
