import test from 'node:test';
import assert from 'node:assert/strict';

// config/index.js validates ANTHROPIC_API_KEY is present at import time,
// even though detectAnomaly() itself never touches it. Set a dummy value
// before importing so this test file can run in isolation without needing
// a real key — the dynamic import() below (rather than a static import)
// keeps this ordering guaranteed under ESM's hoisting rules.
process.env.ANTHROPIC_API_KEY ||= 'test-key-for-unit-tests';

const { detectAnomaly } = await import('../src/guardrails/anomalyRules.js');

test('flags a RED supplier risk rating', () => {
  const anomaly = detectAnomaly('audit_supplier', {
    ok: true,
    riskLevel: 'RED',
    supplierName: 'Bad Co',
    summary: 'Bankruptcy proceedings',
  });
  assert.equal(anomaly.type, 'HIGH_RISK_SUPPLIER');
});

test('does not flag a GREEN supplier', () => {
  const anomaly = detectAnomaly('audit_supplier', { ok: true, riskLevel: 'GREEN' });
  assert.equal(anomaly, null);
});

test('flags a cost above the configured threshold', () => {
  const anomaly = detectAnomaly('calculate_landed_cost', {
    ok: true,
    buyerOutOfPocketUsd: 999999,
    complianceAlerts: [],
  });
  assert.equal(anomaly.type, 'HIGH_COST');
});

test('does not flag a low cost with no compliance alerts', () => {
  const anomaly = detectAnomaly('calculate_landed_cost', {
    ok: true,
    buyerOutOfPocketUsd: 100,
    complianceAlerts: [],
  });
  assert.equal(anomaly, null);
});

test('flags a compliance alert regardless of cost', () => {
  const anomaly = detectAnomaly('calculate_landed_cost', {
    ok: true,
    buyerOutOfPocketUsd: 10,
    complianceAlerts: [{ code: 'LITHIUM_ION_BATTERY', message: 'Needs clearance' }],
  });
  assert.equal(anomaly.type, 'COMPLIANCE_ALERT');
});

test('does not flag a failed tool result, since there is nothing to review', () => {
  const anomaly = detectAnomaly('audit_supplier', { ok: false, error: 'network failure' });
  assert.equal(anomaly, null);
});

test('does not flag a tool the guardrail has no rule for', () => {
  const anomaly = detectAnomaly('search_compliance_docs', { ok: true, found: true, excerpts: [] });
  assert.equal(anomaly, null);
});
