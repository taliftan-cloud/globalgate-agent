import { tool } from '@langchain/core/tools';
import { z } from 'zod';

/**
 * costCalculatorTool.js
 *
 * Ported from the original incotermsEngine.js: resolves the correct
 * Incoterm (EXW/FOB/CIF) from a 3-question logistics questionnaire, then
 * computes an itemized Total Landed Cost. Kept as pure, dependency-free
 * functions underneath the LangChain `tool()` wrapper so the business logic
 * stays independently unit-testable, exactly as it was in the original
 * StackBlitz version — only the interface (LangChain tool schema) is new.
 */

const INCOTERMS = Object.freeze({ EXW: 'EXW', FOB: 'FOB', CIF: 'CIF' });

function resolveIncoterm({ domesticLogisticsBy, riskTransferPoint, hasIpToProtect }) {
  let incoterm;
  let liabilityClause;

  if (domesticLogisticsBy === 'IMPORTER') {
    incoterm = INCOTERMS.EXW;
    liabilityClause =
      'All risk and shipping costs transfer to the Importer at the factory gates in China (Ex Works). ' +
      'The Supplier bears no responsibility for domestic transport, export customs clearance, or loading.';
  } else if (riskTransferPoint === 'SHIP_LOADING') {
    incoterm = INCOTERMS.FOB;
    liabilityClause =
      "The Supplier bears all local costs and risks within China, including domestic transport and export " +
      "clearance. Liability transfers to the Importer only after the goods pass the ship's rail at the " +
      "Chinese port of loading (Free On Board).";
  } else {
    incoterm = INCOTERMS.CIF;
    liabilityClause =
      'The Supplier pays for ocean freight and marine insurance to the destination port. However, the ' +
      'transfer of risk for loss or damage passes to the Importer at the port of origin in China, ' +
      "notwithstanding the Supplier's payment obligations for freight and insurance (Cost, Insurance and Freight).";
  }

  const clauses = [liabilityClause];
  if (hasIpToProtect) {
    clauses.push(
      'IP Protection Clause: An NNN (Non-Disclosure, Non-Use, Non-Circumvention) structure applies. The ' +
        "Supplier is prohibited from manufacturing, marketing, or disclosing the Buyer's proprietary design or " +
        'patented product to any third party, with liquidated damages enforceable in the competent Chinese IP court.'
    );
  }

  return { incoterm, includesIpClause: Boolean(hasIpToProtect), clauses };
}

const COST_RESPONSIBILITY_BY_INCOTERM = Object.freeze({
  EXW: { chinaInlandFreight: 'BUYER', oceanOrAirFreight: 'BUYER', marineInsurance: 'BUYER' },
  FOB: { chinaInlandFreight: 'SUPPLIER', oceanOrAirFreight: 'BUYER', marineInsurance: 'BUYER' },
  CIF: { chinaInlandFreight: 'SUPPLIER', oceanOrAirFreight: 'SUPPLIER', marineInsurance: 'SUPPLIER' },
});

const RESTRICTED_GOODS_RULES = Object.freeze({
  LITHIUM_ION_BATTERY: {
    code: 'LITHIUM_ION_BATTERY',
    message:
      'This product contains lithium-ion batteries and requires official Standards Institution clearance before air shipping.',
    estimatedApprovalCostUsd: 350,
    estimatedProcessingDays: 10,
  },
  MEDICAL_DEVICE_COMPONENT: {
    code: 'MEDICAL_DEVICE_COMPONENT',
    message:
      'This product contains medical/health components and may require additional regulatory clearance in the destination country.',
    estimatedApprovalCostUsd: 800,
    estimatedProcessingDays: 21,
  },
  COSMETICS: {
    code: 'COSMETICS',
    message:
      'Cosmetic products typically require ingredient safety documentation and destination-country registration before customs release.',
    estimatedApprovalCostUsd: 250,
    estimatedProcessingDays: 14,
  },
});

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function withResponsibility(amount, payer) {
  return { amountUsd: round2(amount), paidBy: payer };
}

function calculateLandedCost(input) {
  const {
    incoterm,
    exFactoryPrice,
    chinaInlandFreight,
    oceanOrAirFreight,
    marineInsurance,
    portHandlingFees,
    customsDuties,
    complianceTestingCosts,
    finalDeliveryCost,
    vatRate,
    restrictedGoodsFlags = [],
  } = input;

  const responsibility = COST_RESPONSIBILITY_BY_INCOTERM[incoterm];
  if (!responsibility) {
    throw new Error(`Unknown incoterm: ${incoterm}`);
  }

  const numericFields = {
    exFactoryPrice,
    chinaInlandFreight,
    oceanOrAirFreight,
    marineInsurance,
    portHandlingFees,
    customsDuties,
    complianceTestingCosts,
    finalDeliveryCost,
  };
  for (const [key, value] of Object.entries(numericFields)) {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
      throw new Error(`Invalid numeric input for "${key}": ${value}`);
    }
  }
  if (typeof vatRate !== 'number' || vatRate < 0) {
    throw new Error(`Invalid vatRate: ${vatRate}`);
  }

  // Customs duties are typically assessed on the full CIF value, so the
  // dutiable base includes freight/insurance regardless of who paid for them.
  const dutiableBase = exFactoryPrice + chinaInlandFreight + oceanOrAirFreight + marineInsurance;
  const vatAmount = round2((dutiableBase + customsDuties) * vatRate);

  const totalLandedCost = round2(
    exFactoryPrice +
      chinaInlandFreight +
      oceanOrAirFreight +
      marineInsurance +
      portHandlingFees +
      customsDuties +
      complianceTestingCosts +
      finalDeliveryCost +
      vatAmount
  );

  const buyerOutOfPocket = round2(
    exFactoryPrice +
      (responsibility.chinaInlandFreight === 'BUYER' ? chinaInlandFreight : 0) +
      (responsibility.oceanOrAirFreight === 'BUYER' ? oceanOrAirFreight : 0) +
      (responsibility.marineInsurance === 'BUYER' ? marineInsurance : 0) +
      portHandlingFees +
      customsDuties +
      complianceTestingCosts +
      finalDeliveryCost +
      vatAmount
  );

  const complianceAlerts = restrictedGoodsFlags
    .map((flag) => RESTRICTED_GOODS_RULES[flag])
    .filter(Boolean);

  return {
    lineItems: {
      exFactoryPrice: withResponsibility(exFactoryPrice, 'BUYER'),
      chinaInlandFreight: withResponsibility(chinaInlandFreight, responsibility.chinaInlandFreight),
      oceanOrAirFreight: withResponsibility(oceanOrAirFreight, responsibility.oceanOrAirFreight),
      marineInsurance: withResponsibility(marineInsurance, responsibility.marineInsurance),
      portHandlingFees: withResponsibility(portHandlingFees, 'BUYER'),
      customsDuties: withResponsibility(customsDuties, 'BUYER'),
      complianceTestingCosts: withResponsibility(complianceTestingCosts, 'BUYER'),
      finalDeliveryCost: withResponsibility(finalDeliveryCost, 'BUYER'),
      vat: withResponsibility(vatAmount, 'BUYER'),
    },
    totalLandedCostUsd: totalLandedCost,
    buyerOutOfPocketUsd: buyerOutOfPocket,
    complianceAlerts,
  };
}

export const costCalculatorTool = tool(
  async (input) => {
    try {
      const resolution = resolveIncoterm({
        domesticLogisticsBy: input.domesticLogisticsBy,
        riskTransferPoint: input.riskTransferPoint,
        hasIpToProtect: input.hasIpToProtect,
      });

      const costResult = calculateLandedCost({
        incoterm: resolution.incoterm,
        exFactoryPrice: input.exFactoryPrice,
        chinaInlandFreight: input.chinaInlandFreight,
        oceanOrAirFreight: input.oceanOrAirFreight,
        marineInsurance: input.marineInsurance,
        portHandlingFees: input.portHandlingFees,
        customsDuties: input.customsDuties,
        complianceTestingCosts: input.complianceTestingCosts,
        finalDeliveryCost: input.finalDeliveryCost,
        vatRate: input.vatRate,
        restrictedGoodsFlags: input.restrictedGoodsFlags ?? [],
      });

      return JSON.stringify({
        ok: true,
        incoterm: resolution.incoterm,
        includesIpClause: resolution.includesIpClause,
        liabilityClauses: resolution.clauses,
        costBreakdown: costResult.lineItems,
        totalLandedCostUsd: costResult.totalLandedCostUsd,
        buyerOutOfPocketUsd: costResult.buyerOutOfPocketUsd,
        complianceAlerts: costResult.complianceAlerts,
      });
    } catch (err) {
      // Tools must never throw back into the agent loop — a stringified
      // error object lets the LLM see what went wrong and decide whether to
      // retry with corrected arguments or surface the problem to the user.
      return JSON.stringify({ ok: false, error: err.message });
    }
  },
  {
    name: 'calculate_landed_cost',
    description:
      'Resolves the correct Incoterm (EXW/FOB/CIF) from a 3-question logistics questionnaire and computes the ' +
      'itemized Total Landed Cost for a China import shipment, including compliance alerts for restricted goods ' +
      '(e.g. lithium-ion batteries, medical devices, cosmetics). Use this whenever the user asks about shipping ' +
      'costs, Incoterms, or landed cost for an import from China.',
    schema: z.object({
      domesticLogisticsBy: z
        .enum(['SUPPLIER', 'IMPORTER'])
        .describe('Who handles transport from the factory to the Chinese port of export'),
      riskTransferPoint: z
        .enum(['DESTINATION', 'SHIP_LOADING'])
        .describe(
          "Where risk of loss transfers to the buyer: at the destination country (supplier bears risk longer) " +
            "or the moment the container is loaded on the ship (buyer bears risk from the Chinese port)"
        ),
      hasIpToProtect: z.boolean().describe('Whether the product is based on the buyer\'s own design/patent'),
      exFactoryPrice: z.number().nonnegative().describe('Ex-factory unit price in USD'),
      chinaInlandFreight: z.number().nonnegative().describe('Domestic freight cost within China, in USD'),
      oceanOrAirFreight: z.number().nonnegative().describe('International freight cost, in USD'),
      marineInsurance: z.number().nonnegative().describe('Marine cargo insurance cost, in USD'),
      portHandlingFees: z.number().nonnegative().describe('Destination port handling fees, in USD'),
      customsDuties: z.number().nonnegative().describe('Customs duties owed at destination, in USD'),
      complianceTestingCosts: z.number().nonnegative().describe('Lab/compliance testing costs, in USD'),
      finalDeliveryCost: z.number().nonnegative().describe('Final-mile delivery cost to the buyer\'s warehouse, in USD'),
      vatRate: z.number().nonnegative().describe('Decimal VAT rate at destination, e.g. 0.17 for 17%'),
      restrictedGoodsFlags: z
        .array(z.enum(['LITHIUM_ION_BATTERY', 'MEDICAL_DEVICE_COMPONENT', 'COSMETICS']))
        .optional()
        .describe('Any restricted-goods categories that apply to this product, if known'),
    }),
  }
);
