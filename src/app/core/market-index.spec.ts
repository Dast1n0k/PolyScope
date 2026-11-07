import {
  appendPrice,
  isIndexCandidate,
  localInsight,
  normalizeMarket,
  priceChange,
  rankForIndex,
  upsertMarket,
} from './market-index';
import { MarketView } from './market.model';

function view(partial: Partial<MarketView>): MarketView {
  return {
    id: '1',
    question: 'Q',
    slug: 'q',
    description: '',
    yesPrice: 0.4,
    noPrice: 0.6,
    volume: 1,
    volume24h: 1,
    liquidity: 1,
    updatedAt: '',
    active: true,
    closed: false,
    history: [],
    ...partial,
  };
}

describe('market index', () => {
  it('normalizes string prices and token ids', () => {
    const market = normalizeMarket({
      id: '7',
      question: 'Test market',
      outcomePrices: '["0.42","0.58"]',
      clobTokenIds: '["yes-token","no-token"]',
      volume: '1000',
      liquidityNum: 50,
    });

    expect(market.yesPrice).toBeCloseTo(0.42);
    expect(market.noPrice).toBeCloseTo(0.58);
    expect(market.yesTokenId).toBe('yes-token');
    expect(market.volume).toBe(1000);
  });

  it('keeps history on upsert and skips a duplicate tick', () => {
    const first = upsertMarket(new Map(), {
      id: '7',
      outcomePrices: '["0.4","0.6"]',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const second = upsertMarket(first, {
      id: '7',
      outcomePrices: '["0.4","0.6"]',
      updatedAt: '2026-01-01T00:00:05.000Z',
    });

    expect(second.get('7')?.history.length).toBe(1);
  });

  it('trims history and reports price change', () => {
    const history = appendPrice(
      Array.from({ length: 500 }, (_, index) => ({ ts: index, yesPrice: 0.2 })),
      { ts: 900, yesPrice: 0.5 },
      500,
    );
    expect(history.length).toBe(500);
    expect(priceChange(history)).toBeCloseTo(0.3);
  });

  it('marks the local note as advisory', () => {
    const market = view({
      yesPrice: 0.7,
      noPrice: 0.3,
      history: [
        { ts: 1, yesPrice: 0.4 },
        { ts: 2, yesPrice: 0.7 },
      ],
    });
    const note = localInsight(market);
    expect(note.direction).toBe('YES');
    expect(note.advisory).toBeTrue();
    expect(note.rationale).toContain('не рекомендація');
  });

  it('drops extreme prices and US election long-shots from the index', () => {
    expect(isIndexCandidate(view({ yesPrice: 0.001, question: 'Will aliens land?' }))).toBeFalse();
    expect(
      isIndexCandidate(
        view({
          yesPrice: 0.2,
          question: 'Will LeBron James win the 2028 US Presidential Election?',
        }),
      ),
    ).toBeFalse();
    expect(
      isIndexCandidate(
        view({
          yesPrice: 0.42,
          question: 'Will Bitcoin reach $100,000 by December 31, 2026?',
        }),
      ),
    ).toBeTrue();
  });

  it('ranks contested markets by volume', () => {
    const ranked = rankForIndex([
      view({ id: 'a', yesPrice: 0.01, volume: 99, question: 'Joke long shot' }),
      view({ id: 'b', yesPrice: 0.4, volume: 10, question: 'Fed rate cut?' }),
      view({ id: 'c', yesPrice: 0.55, volume: 50, question: 'Israel PM race' }),
    ]);
    expect(ranked.map((market) => market.id)).toEqual(['c', 'b']);
  });
});
