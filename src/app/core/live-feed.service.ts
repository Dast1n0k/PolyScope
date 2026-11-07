import { Injectable } from '@angular/core';

/**
 * Public CLOB market socket. If the socket is unavailable, callers keep the REST poll.
 * The returned function closes the socket.
 */
@Injectable({ providedIn: 'root' })
export class LiveFeedService {
  watch(tokenId: string, onPrice: (yesPrice: number) => void): () => void {
    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket('wss://ws-subscriptions-clob.polymarket.com/ws/market');
    } catch {
      return () => undefined;
    }

    socket.onopen = () => {
      socket?.send(JSON.stringify({ type: 'market', assets_ids: [tokenId] }));
    };
    socket.onmessage = (event) => {
      const price = readPrice(event.data, tokenId);
      if (price != null) {
        onPrice(price);
      }
    };

    return () => socket?.close();
  }
}

export function readPrice(payload: unknown, tokenId: string): number | null {
  let data: unknown = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload) as unknown;
    } catch {
      return null;
    }
  }
  const events = Array.isArray(data) ? data : [data];
  for (const item of events) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const eventType = String(record['event_type'] ?? '');
    const asset = String(record['asset_id'] ?? record['assetId'] ?? '');
    if (eventType === 'book' && asset === tokenId) {
      const quoted = tightQuote(record['bids'], record['asks']);
      if (quoted != null) {
        return quoted;
      }
    }
    if (asset === tokenId && record['price'] != null && eventType !== 'book') {
      const direct = asUnitPrice(record['price']);
      if (direct != null) {
        return direct;
      }
    }
    const changes = record['price_changes'] ?? record['changes'];
    if (Array.isArray(changes)) {
      for (const change of changes) {
        if (!change || typeof change !== 'object') {
          continue;
        }
        const row = change as Record<string, unknown>;
        if (String(row['asset_id'] ?? '') !== tokenId) {
          continue;
        }
        const quoted = tightMid(asUnitPrice(row['best_bid']), asUnitPrice(row['best_ask']));
        if (quoted != null) {
          return quoted;
        }
      }
    }
  }
  return null;
}

function tightQuote(bids: unknown, asks: unknown): number | null {
  return tightMid(extremePrice(bids, true), extremePrice(asks, false));
}

/** Midpoint only when the spread is a real quote. A wide book or a stale last trade is ignored. */
function tightMid(bid: number | null, ask: number | null): number | null {
  if (bid == null || ask == null || ask < bid || ask - bid > 0.05) {
    return null;
  }
  return (bid + ask) / 2;
}

function extremePrice(levels: unknown, highest: boolean): number | null {
  if (!Array.isArray(levels)) {
    return null;
  }
  let chosen: number | null = null;
  for (const level of levels) {
    if (!level || typeof level !== 'object') {
      continue;
    }
    const price = asUnitPrice((level as Record<string, unknown>)['price']);
    if (price == null) {
      continue;
    }
    if (chosen == null || (highest ? price > chosen : price < chosen)) {
      chosen = price;
    }
  }
  return chosen;
}

function asUnitPrice(value: unknown): number | null {
  const price = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(price) || price < 0 || price > 1) {
    return null;
  }
  return price;
}
