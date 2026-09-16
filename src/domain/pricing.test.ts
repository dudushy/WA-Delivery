import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateCost } from './pricing.js';

test('calcula campanha de marketing no Brasil', () => {
  const result = estimateCost(1_000, 'marketing');
  assert.equal(result.unitPrice, 0.3217);
  assert.equal(result.estimatedTotal, 321.7);
  assert.equal(result.currency, 'BRL');
});

test('arredonda o total monetário para centavos', () => {
  assert.equal(estimateCost(3, 'utility').estimatedTotal, 0.11);
});
