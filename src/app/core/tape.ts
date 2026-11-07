export interface TapeTrade {
  outcome: 'YES' | 'NO';
  side: 'BUY' | 'SELL';
  price: number;
  shares: number;
  usd: number;
  trader: string;
  wallet: string;
  ts: number;
}

export interface TapeHolder {
  outcome: 'YES' | 'NO';
  trader: string;
  wallet: string;
  shares: number;
  usd: number;
}

export interface BookLevel {
  price: number;
  shares: number;
  usd: number;
}

export interface TradeFlow {
  yesBuy: number;
  yesSell: number;
  noBuy: number;
  noSell: number;
}

export interface MarketTape {
  updatedAt: string;
  openInterest: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  trades: TapeTrade[];
  holders: TapeHolder[];
  bids: BookLevel[];
  asks: BookLevel[];
  flow: TradeFlow;
}

export function parseTrades(payload: unknown, yesTokenId?: string): TapeTrade[] {
  return rows(payload)
    .map((row) => {
      const price = unit(row['price']);
      const shares = positive(row['size']);
      const token = String(row['token_id'] ?? '');
      const outcome = outcomeOf(row['outcome'], token, yesTokenId);
      const ts = epochMs(row['timestamp']);
      if (!outcome || price == null || shares <= 0 || ts <= 0) {
        return null;
      }
      return {
        outcome,
        side: String(row['side']).toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
        price,
        shares,
        usd: shares * price,
        trader: traderName(row),
        wallet: String(row['proxy_wallet'] ?? ''),
        ts,
      } satisfies TapeTrade;
    })
    .filter((trade): trade is TapeTrade => trade != null)
    .sort((a, b) => b.ts - a.ts);
}

export function parseHolders(payload: unknown, yesTokenId: string | undefined, yesPrice: number, noPrice: number): TapeHolder[] {
  const holders: TapeHolder[] = [];
  for (const group of rows(payload)) {
    const token = String(group['token_id'] ?? '');
    const nested = Array.isArray(group['holders']) ? group['holders'] : [group];
    for (const row of nested) {
      if (!row || typeof row !== 'object') {
        continue;
      }
      const record = row as Record<string, unknown>;
      const rowToken = String(record['token_id'] ?? token);
      const outcome = outcomeOf(record['outcome'], rowToken, yesTokenId) ?? (yesTokenId && rowToken === yesTokenId ? 'YES' : rowToken ? 'NO' : null);
      const shares = positive(record['amount'] ?? record['size']);
      if (!outcome || shares <= 0) {
        continue;
      }
      holders.push({
        outcome,
        trader: traderName(record),
        wallet: String(record['proxy_wallet'] ?? ''),
        shares,
        usd: shares * (outcome === 'YES' ? yesPrice : noPrice),
      });
    }
  }
  return holders.sort((a, b) => b.usd - a.usd);
}

export function parseBook(payload: unknown): Pick<MarketTape, 'bids' | 'asks' | 'bestBid' | 'bestAsk' | 'spread'> {
  const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const bids = levels(record['bids'], true).slice(0, 8);
  const asks = levels(record['asks'], false).slice(0, 8);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;
  const spread = bestBid != null && bestAsk != null && bestAsk >= bestBid ? bestAsk - bestBid : null;
  return { bids, asks, bestBid, bestAsk, spread };
}

export function parseOpenInterest(payload: unknown): number | null {
  const value = rows(payload)[0]?.['value'];
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function tradeFlow(trades: TapeTrade[]): TradeFlow {
  const flow: TradeFlow = { yesBuy: 0, yesSell: 0, noBuy: 0, noSell: 0 };
  for (const trade of trades) {
    if (trade.outcome === 'YES') {
      flow[trade.side === 'BUY' ? 'yesBuy' : 'yesSell'] += trade.usd;
    } else {
      flow[trade.side === 'BUY' ? 'noBuy' : 'noSell'] += trade.usd;
    }
  }
  return flow;
}

export function largestTrades(trades: TapeTrade[], limit = 12): TapeTrade[] {
  return [...trades].sort((a, b) => b.usd - a.usd).slice(0, limit);
}

function rows(payload: unknown): Record<string, unknown>[] {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>)['data'] ?? payload : payload;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
}

function levels(value: unknown, bids: boolean): BookLevel[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed = value
    .map((level) => {
      if (!level || typeof level !== 'object') {
        return null;
      }
      const row = level as Record<string, unknown>;
      const price = unit(row['price']);
      const shares = positive(row['size']);
      if (price == null || shares <= 0) {
        return null;
      }
      return { price, shares, usd: shares * price };
    })
    .filter((level): level is BookLevel => level != null);
  parsed.sort((a, b) => (bids ? b.price - a.price : a.price - b.price));
  return parsed;
}

function outcomeOf(outcome: unknown, token: string, yesTokenId?: string): 'YES' | 'NO' | null {
  const label = String(outcome ?? '').toLowerCase();
  if (label === 'yes') {
    return 'YES';
  }
  if (label === 'no') {
    return 'NO';
  }
  if (yesTokenId && token) {
    return token === yesTokenId ? 'YES' : 'NO';
  }
  return null;
}

function traderName(row: Record<string, unknown>): string {
  const name = String(row['name'] ?? '').trim();
  const pseudo = String(row['pseudonym'] ?? '').trim();
  const wallet = String(row['proxy_wallet'] ?? '');
  const chosen = name || pseudo;
  if (chosen && !chosen.startsWith('0x') && chosen.length <= 22) {
    return chosen;
  }
  if (wallet.length > 12) {
    return `${wallet.slice(0, 6)}…${wallet.slice(-4)}`;
  }
  return chosen.slice(0, 18) || 'невідомий';
}

function unit(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    return null;
  }
  return number;
}

function positive(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function epochMs(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return 0;
  }
  return number > 10_000_000_000 ? number : number * 1000;
}
