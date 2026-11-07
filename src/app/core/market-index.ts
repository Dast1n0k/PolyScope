import { GammaMarket, LocalInsight, MarketView, PricePoint } from './market.model';

const HISTORY_LIMIT = 500;

export function parseNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function parseStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeMarket(raw: GammaMarket, previous?: MarketView): MarketView {
  const prices = parseStringList(raw.outcomePrices).map((item) => parseNumber(item));
  const yesPrice = prices[0] ?? previous?.yesPrice ?? 0;
  const noPrice = prices[1] ?? previous?.noPrice ?? Math.max(0, 1 - yesPrice);
  const tokens = parseStringList(raw.clobTokenIds);
  const updatedAt = raw.updatedAt ?? new Date().toISOString();

  return {
    id: String(raw.id),
    question: raw.question?.trim() || previous?.question || 'Ринок без назви',
    slug: raw.slug ?? previous?.slug ?? '',
    description: raw.description ?? previous?.description ?? '',
    image: raw.image || raw.icon || previous?.image,
    yesPrice,
    noPrice,
    volume: raw.volumeNum ?? parseNumber(raw.volume, previous?.volume ?? 0),
    volume24h: raw.volume24hr ?? previous?.volume24h ?? 0,
    liquidity: raw.liquidityNum ?? parseNumber(raw.liquidity, previous?.liquidity ?? 0),
    endDate: raw.endDate ?? previous?.endDate,
    updatedAt,
    active: raw.active ?? previous?.active ?? true,
    closed: raw.closed ?? previous?.closed ?? false,
    yesTokenId: tokens[0] ?? previous?.yesTokenId,
    noTokenId: tokens[1] ?? previous?.noTokenId,
    conditionId: raw.conditionId ?? previous?.conditionId,
    volume1wk: raw.volume1wk ?? previous?.volume1wk ?? 0,
    volume1mo: raw.volume1mo ?? previous?.volume1mo ?? 0,
    bestBid: raw.bestBid ?? previous?.bestBid,
    bestAsk: raw.bestAsk ?? previous?.bestAsk,
    spread: raw.spread ?? previous?.spread,
    history: previous?.history ?? [],
  };
}

export function appendPrice(history: PricePoint[], point: PricePoint, limit = HISTORY_LIMIT): PricePoint[] {
  const last = history[history.length - 1];
  if (last && last.yesPrice === point.yesPrice && point.ts - last.ts < 15_000) {
    return history;
  }
  const next = [...history, point];
  return next.length > limit ? next.slice(next.length - limit) : next;
}

export function upsertMarket(current: Map<string, MarketView>, raw: GammaMarket): Map<string, MarketView> {
  const previous = current.get(String(raw.id));
  const next = normalizeMarket(raw, previous);
  const ts = Date.parse(next.updatedAt);
  next.history = appendPrice(previous?.history ?? [], {
    ts: Number.isFinite(ts) ? ts : Date.now(),
    yesPrice: next.yesPrice,
  });
  const copy = new Map(current);
  copy.set(next.id, next);
  return copy;
}

export function replaceHistory(market: MarketView, points: PricePoint[]): MarketView {
  const sorted = [...points].sort((a, b) => a.ts - b.ts);
  return { ...market, history: sorted.slice(-HISTORY_LIMIT) };
}

export function priceChange(history: PricePoint[]): number | null {
  if (history.length < 2) {
    return null;
  }
  return history[history.length - 1].yesPrice - history[0].yesPrice;
}

export function activityRatio(market: MarketView): number | null {
  if (market.liquidity <= 0) {
    return null;
  }
  return market.volume24h / market.liquidity;
}

export function localInsight(market: MarketView): LocalInsight {
  const change = priceChange(market.history);
  const leaningYes = market.yesPrice >= 0.5;
  const rising = (change ?? 0) > 0.01;
  const falling = (change ?? 0) < -0.01;
  const direction = rising ? 'YES' : falling ? 'NO' : leaningYes ? 'YES' : 'NO';
  const changeText =
    change == null
      ? 'Історії ще замало, тому нотатка спирається лише на поточну ціну.'
      : `На завантаженому відрізку ціна YES змінилася на ${(change * 100).toFixed(1)} п.п.`;

  return {
    direction,
    advisory: true,
    rationale: `${changeText} Поточна ціна YES ${(market.yesPrice * 100).toFixed(1)}%. Це локальне правило PolyScope, а не висновок Jev AI і не рекомендація робити ставку.`,
  };
}

export function sumVolume(markets: MarketView[]): number {
  return markets.reduce((sum, market) => sum + market.volume, 0);
}

/** Long-shot US election noise dominates raw volume rankings with ~0%/100% prices. */
const US_ELECTION_NOISE =
  /presidential\s+(election|nomination)|us presidential|(democrat|republican).{0,40}(nomination|primary)|presidential nominee|\b2028\b.{0,60}(democrat|republican|president)/i;

export const INDEX_LIMIT = 200;
export const MIN_YES = 0.05;
export const MAX_YES = 0.95;

export function isIndexCandidate(market: MarketView): boolean {
  if (market.closed) {
    return false;
  }
  if (market.yesPrice < MIN_YES || market.yesPrice > MAX_YES) {
    return false;
  }
  if (US_ELECTION_NOISE.test(market.question)) {
    return false;
  }
  return true;
}

export function rankForIndex(markets: MarketView[], limit = INDEX_LIMIT): MarketView[] {
  return [...markets]
    .filter(isIndexCandidate)
    .sort((a, b) => b.volume - a.volume || b.volume24h - a.volume24h)
    .slice(0, limit);
}
