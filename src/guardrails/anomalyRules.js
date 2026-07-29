import { config } from '../config/index.js';

/**
 * anomalyRules.js
 *
 * Pure, dependency-free rule functions — kept separate from
 * humanApprovalNode.js so the anomaly conditions themselves are
 * independently unit-testable without touching LangGraph at all.
 *
 * @param {string} toolName - the LangChain tool name that produced this result
 * @param {object} resultPayload - the parsed JSON result the tool returned
 * @returns {{ type: string, message: string } | null} an anomaly descriptor, or null if none
 */
export function detectAnomaly(toolName, resultPayload) {
  if (!resultPayload || resultPayload.ok === false) {
    // Tool-level errors are surfaced to the agent normally — they aren't a
    // guardrail concern, since there's no "anomalous but successful" result
    // to review a human's approval on.
    return null;
  }

  if (toolName === 'audit_supplier' && resultPayload.riskLevel === 'RED') {
    return {
      type: 'HIGH_RISK_SUPPLIER',
      message: `Supplier "${resultPayload.supplierName}" was classified RED risk: ${resultPayload.summary}`,
    };
  }

  if (toolName === 'calculate_landed_cost') {
    if (
      typeof resultPayload.buyerOutOfPocketUsd === 'number' &&
      resultPayload.buyerOutOfPocketUsd > config.highCostThresholdUsd
    ) {
      return {
        type: 'HIGH_COST',
        message:
          `Buyer out-of-pocket cost of $${resultPayload.buyerOutOfPocketUsd} exceeds the ` +
          `$${config.highCostThresholdUsd} auto-approval threshold.`,
      };
    }

    if (Array.isArray(resultPayload.complianceAlerts) && resultPayload.complianceAlerts.length > 0) {
      return {
        type: 'COMPLIANCE_ALERT',
        message: `Compliance alert(s) triggered: ${resultPayload.complianceAlerts
          .map((alert) => alert.message)
          .join(' ')}`,
      };
    }
  }

  return null;
}
