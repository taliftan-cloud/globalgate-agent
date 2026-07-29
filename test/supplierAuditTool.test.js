import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierAuditTool } from '../src/tools/supplierAuditTool.js';

test('returns a deterministic risk level for the same supplier name', async () => {
  const raw1 = await supplierAuditTool.invoke({ supplierName: 'Shenzhen Example Co.' });
  const raw2 = await supplierAuditTool.invoke({ supplierName: 'Shenzhen Example Co.' });
  assert.equal(raw1, raw2);
});

test('returns a valid risk level and a summary for a well-formed name', async () => {
  const raw = await supplierAuditTool.invoke({ supplierName: 'Test Supplier Inc.' });
  const result = JSON.parse(raw);

  assert.equal(result.ok, true);
  assert.ok(['GREEN', 'YELLOW', 'RED'].includes(result.riskLevel));
  assert.ok(typeof result.summary === 'string' && result.summary.length > 0);
});

test('different supplier names can produce different risk levels', async () => {
  const names = ['Alpha Co.', 'Beta Manufacturing', 'Gamma Industrial', 'Delta Exports'];
  const results = await Promise.all(
    names.map(async (name) => JSON.parse(await supplierAuditTool.invoke({ supplierName: name })).riskLevel)
  );
  // Not every name should land on the same bucket — this guards against the
  // hashing logic accidentally collapsing to a constant.
  assert.ok(new Set(results).size > 1);
});

test('rejects an empty supplier name via the tool schema', async () => {
  await assert.rejects(() => supplierAuditTool.invoke({ supplierName: '' }));
});
