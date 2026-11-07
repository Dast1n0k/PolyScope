import { largestTrades, parseBook, parseHolders, parseTrades, tradeFlow } from './tape';

describe('market tape', () => {
  const yes = 'yes-token';

  it('reads trades, notional and newest-first order', () => {
    const trades = parseTrades(
      {
        data: [
          { outcome: 'Yes', side: 'BUY', price: '0.2', size: 50, timestamp: 100, name: 'ada', proxy_wallet: '0x1', token_id: yes },
          { outcome: 'No', side: 'SELL', price: 0.8, size: 10, timestamp: 300, pseudonym: 'bob', proxy_wallet: '0x2', token_id: 'no' },
        ],
      },
      yes,
    );
    expect(trades[0].trader).toBe('bob');
    expect(trades[1].usd).toBe(10);
    expect(trades[1].outcome).toBe('YES');
    expect(tradeFlow(trades).yesBuy).toBe(10);
  });

  it('keeps the closest book levels and the largest holders', () => {
    const book = parseBook({
      bids: [
        { price: '0.01', size: '5' },
        { price: '0.18', size: '20' },
      ],
      asks: [
        { price: '0.99', size: '9' },
        { price: '0.19', size: '4' },
      ],
    });
    expect(book.bestBid).toBeCloseTo(0.18);
    expect(book.bestAsk).toBeCloseTo(0.19);
    expect(book.spread).toBeCloseTo(0.01);

    const holders = parseHolders(
      { data: [{ token_id: yes, holders: [{ name: 'whale', amount: 100, proxy_wallet: '0x3', token_id: yes }] }] },
      yes,
      0.2,
      0.8,
    );
    expect(holders[0].usd).toBeCloseTo(20);
    expect(largestTrades([{ ...parseTrades({ data: [{ outcome: 'Yes', side: 'BUY', price: 0.5, size: 2, timestamp: 1, token_id: yes }] }, yes)[0], usd: 1 }], 1).length).toBe(1);
  });
});
