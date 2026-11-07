import assert from 'node:assert/strict';
import test from 'node:test';
import { decisionBody, interpretDecision, sliceMarket } from './jev.mjs';

test('slice keeps the market facts and trims the rules', () => {
  const slice = sliceMarket({
    id: '7',
    question: 'Will it rain?',
    rules: 'x'.repeat(5000),
    yesPrice: 0.18,
    noPrice: 0.82,
    volume: 10,
    history: [{ ts: 5, yesPrice: 0.2 }],
  });
  assert.equal(slice.rules.length, 4000);
  assert.equal(slice.yesPrice, 0.18);
  assert.equal(decisionBody(slice).questions.resolves_yes.type, 'noul');
});

test('interprets a noul answer as an advisory direction', () => {
  const slice = sliceMarket({ id: '7', question: 'Q', yesPrice: 0.2, noPrice: 0.8 });
  const insight = interpretDecision(
    { model: 'typesafe/jev-1.13', answers: { resolves_yes: { type: 'noul', noul: 0.71 } }, usage: { credits: 0.8 } },
    slice,
  );
  assert.equal(insight.direction, 'YES');
  assert.equal(insight.probability, 0.71);
  assert.equal(insight.advisory, true);
  assert.ok(insight.gap > 0);
});

test('rejects a response without a probability', () => {
  const slice = sliceMarket({ id: '7', question: 'Q', yesPrice: 0.2 });
  assert.throws(() => interpretDecision({ answers: {} }, slice));
});

test('keeps the largest trades inside the decision state', () => {
  const trades = Array.from({ length: 50 }, (_, index) => ({
    outcome: 'YES',
    side: 'BUY',
    price: 0.2,
    usd: index + 1,
    trader: 'whale',
    ts: index,
  }));
  const slice = sliceMarket({
    id: '7',
    question: 'Q',
    yesPrice: 0.2,
    tape: { trades, bestBid: 0.19, bestAsk: 0.21, spread: 0.02 },
  });
  assert.equal(decisionBody(slice).state.largest_trades.length, 40);
  assert.equal(decisionBody(slice).state.order_book.bestBid, 0.19);
});
