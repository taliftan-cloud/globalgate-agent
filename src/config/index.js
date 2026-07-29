import 'dotenv/config';

/**
 * config/index.js
 *
 * Single source of truth for environment configuration. Fails fast and
 * loudly at startup if something required is missing, instead of letting a
 * missing key surface later as a cryptic error deep inside a tool call.
 */

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value;
}

export const config = Object.freeze({
  anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
  port: Number(process.env.PORT) || 4002,
  nodeEnv: process.env.NODE_ENV || 'development',
  // Guardrail threshold (Step 3): landed-cost calculations whose buyer
  // out-of-pocket total exceeds this trigger a human-approval pause rather
  // than being auto-approved. Configurable via env so it can be tuned per
  // deployment without a code change.
  highCostThresholdUsd: Number(process.env.HIGH_COST_THRESHOLD_USD) || 5000,
});
