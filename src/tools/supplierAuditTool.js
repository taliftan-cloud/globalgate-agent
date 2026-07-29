import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * supplierAuditTool.js
 *
 * Ported and hardened from the original SupplierAuditDemo mock. Structured
 * as an adapter: `fetchSupplierRegistryData()` is the seam where a real
 * Chinese corporate-registry API (Tianyancha/Qichacha) would be wired in —
 * everything else (the tool interface, risk summarization) is unaffected by
 * that swap. Kept deterministic/mocked here so the whole project runs and
 * is demoable without external credentials.
 */

const RISK_PROFILES = Object.freeze({
  GREEN: {
    operationalStatus: 'Active',
    exportLicenseValid: true,
    litigationLast24Months: 0,
    administrativePenalties: 0,
  },
  YELLOW: {
    operationalStatus: 'Active',
    exportLicenseValid: true,
    litigationLast24Months: 1,
    administrativePenalties: 0,
    factoryAddressMismatch: true,
  },
  RED: {
    operationalStatus: 'Bankruptcy proceedings',
    exportLicenseValid: false,
    litigationLast24Months: 3,
    administrativePenalties: 2,
  },
});

/**
 * Swap this function's implementation for a real HTTP client (e.g. a
 * China-hosted proxy calling Tianyancha/Qichacha, per data-residency
 * requirements) when a live data source is available. The async signature
 * and throw-on-failure contract already match what a real client looks like.
 */
async function fetchSupplierRegistryData(supplierName) {
  if (!supplierName || typeof supplierName !== 'string' || supplierName.trim().length === 0) {
    throw new Error('supplierName must be a non-empty string');
  }

  // Deterministic hash-based mock: the same name always yields the same
  // risk profile, so demos and tests are reproducible without a live API key.
  const hash = [...supplierName].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const riskBuckets = ['GREEN', 'YELLOW', 'RED'];
  const riskLevel = riskBuckets[hash % riskBuckets.length];

  return { riskLevel, registryData: RISK_PROFILES[riskLevel] };
}

function summarizeRisk(riskLevel) {
  switch (riskLevel) {
    case 'GREEN':
      return 'Active operational status, valid export license, and no litigation in the past 24 months.';
    case 'YELLOW':
      return 'Operational, but shows a factory address mismatch with the registered business license and at least one recent contract dispute — worth a closer look before a large order.';
    case 'RED':
      return 'Active bankruptcy proceedings and/or a revoked export license — high risk, recommend not proceeding without further diligence.';
    default:
      return 'Unable to classify risk level from the available data.';
  }
}

export const supplierAuditTool = tool(
  async (input) => {
    try {
      const { riskLevel, registryData } = await fetchSupplierRegistryData(input.supplierName);
      return JSON.stringify({
        ok: true,
        supplierName: input.supplierName,
        riskLevel,
        summary: summarizeRisk(riskLevel),
        registryData,
      });
    } catch (err) {
      return JSON.stringify({ ok: false, error: err.message });
    }
  },
  {
    name: 'audit_supplier',
    description:
      'Runs a risk audit on a Chinese supplier by name, returning a Green/Yellow/Red risk classification based ' +
      'on registry data such as operational status, export license validity, and litigation history. Use this ' +
      'whenever the user asks about a specific supplier\'s risk, reliability, or trustworthiness.',
    schema: z.object({
      supplierName: z.string().min(1).describe('The Chinese supplier company name or Alibaba listing name to audit'),
    }),
  }
);
