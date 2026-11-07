import { readPrice } from './live-feed.service';

describe('readPrice', () => {
  it('reads a matching asset price', () => {
    const raw = JSON.stringify([{ asset_id: 'yes', price: '0.64' }]);
    expect(readPrice(raw, 'yes')).toBeCloseTo(0.64);
  });

  it('ignores another asset and prices outside 0..1', () => {
    expect(readPrice([{ asset_id: 'other', price: 0.2 }], 'yes')).toBeNull();
    expect(readPrice([{ asset_id: 'yes', price: 4 }], 'yes')).toBeNull();
  });

  it('ignores a wide book and a stale last trade', () => {
    const raw = {
      event_type: 'book',
      asset_id: 'yes',
      last_trade_price: '0.981',
      bids: [{ price: '0.001' }, { price: '0.018' }],
      asks: [{ price: '0.999' }, { price: '0.5' }],
    };
    expect(readPrice(raw, 'yes')).toBeNull();
  });

  it('reads the quoted market, not a changed book level', () => {
    const raw = {
      event_type: 'price_change',
      price_changes: [
        { asset_id: 'no', price: '0.81', best_bid: '0.981', best_ask: '0.982' },
        { asset_id: 'yes', price: '0.19', best_bid: '0.018', best_ask: '0.019' },
      ],
    };
    expect(readPrice(raw, 'yes')).toBeCloseTo(0.0185);
  });
});
