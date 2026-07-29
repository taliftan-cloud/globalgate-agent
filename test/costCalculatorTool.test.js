import test from 'node:test';
import assert from 'node:assert/strict';
import { costCalculatorTool } from '../src/tools/costCalculatorTool.js';

test('resolves FOB and computes the correct total for a known scenario', async () => {
  const raw = await costCalculatorTool.invoke({
    domesticLogisticsBy: 'SUPPLIER',
    riskTransferPoint: 'SHIP_LOADING',
    hasIpToProtect: true,
    exFactoryPrice: 1000,
    chinaInlandFreight: 50,
    oceanOrAirFreight: 200,
    marineInsurance: 30,
    portHandlingFees: 40,
    customsDuties: 100,
    complianceTestingCosts: 60,
    finalDeliveryCost: 80,
    vatRate: 0.17,
    restrictedGoodsFlags: ['LITHIUM_ION_BATTERY'],
  });
  const result = JSON.parse(raw);

  assert.equal(result.ok, true);
  assert.equal(result.incoterm, 'FOB');
  assert.equal(result.includesIpClause, true);
  // dutiable base = 1000+50+200+30 = 1280; +duties 100 = 1380; *0.17 vat = 234.6
  assert.equal(result.totalLandedCostUsd, 1794.6);
  assert.equal(result.complianceAlerts.length, 1);
  assert.equal(result.complianceAlerts[0].code, 'LITHIUM_ION_BATTERY');
});

test('resolves EXW when the importer handles domestic logistics', async () => {
  const raw = await costCalculatorTool.invoke({
    domesticLogisticsBy: 'IMPORTER',
    riskTransferPoint: 'SHIP_LOADING',
    hasIpToProtect: false,
    exFactoryPrice: 500,
    chinaInlandFreight: 20,
    oceanOrAirFreight: 100,
    marineInsurance: 10,
    portHandlingFees: 15,
    customsDuties: 30,
    complianceTestingCosts: 0,
    finalDeliveryCost: 25,
    vatRate: 0.17,
  });
  const result = JSON.parse(raw);
  assert.equal(result.incoterm, 'EXW');
  assert.equal(result.includesIpClause, false);
});

test('resolves CIF when the supplier handles logistics and risk transfers at destination', async () => {
  const raw = await costCalculatorTool.invoke({
    domesticLogisticsBy: 'SUPPLIER',
    riskTransferPoint: 'DESTINATION',
    hasIpToProtect: false,
    exFactoryPrice: 500,
    chinaInlandFreight: 20,
    oceanOrAirFreight: 100,
    marineInsurance: 10,
    portHandlingFees: 15,
    customsDuties: 30,
    complianceTestingCosts: 0,
    finalDeliveryCost: 25,
    vatRate: 0.17,
  });
  const result = JSON.parse(raw);
  assert.equal(result.incoterm, 'CIF');
});

test('rejects an invalid enum value via the tool schema instead of silently coercing it', async () => {
  await assert.rejects(() =>
    costCalculatorTool.invoke({
      domesticLogisticsBy: 'NOT_A_VALID_OPTION',
      riskTransferPoint: 'SHIP_LOADING',
      hasIpToProtect: false,
      exFactoryPrice: 100,
      chinaInlandFreight: 0,
      oceanOrAirFreight: 0,
      marineInsurance: 0,
      portHandlingFees: 0,
      customsDuties: 0,
      complianceTestingCosts: 0,
      finalDeliveryCost: 0,
      vatRate: 0.17,
    })
  );
});
