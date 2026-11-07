import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { MarketView } from './market.model';

export interface JevInsight {
  id: string;
  direction: 'YES' | 'NO';
  probability: number;
  marketPrice: number;
  gap: number;
  model?: string;
  credits?: number;
  advisory: true;
}

interface MarketSlice {
  id: string;
  question: string;
  rules: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  volume24h: number;
  liquidity: number;
  endDate?: string;
  history: { ts: number; yesPrice: number }[];
  tape?: unknown;
}

@Injectable({ providedIn: 'root' })
export class JevInsightService {
  private readonly http = inject(HttpClient);
  readonly byId = signal<Record<string, JevInsight>>({});
  readonly running = signal(false);
  readonly progress = signal({ done: 0, total: 0 });
  readonly error = signal<string | null>(null);

  async ask(market: MarketView, tape?: unknown): Promise<void> {
    this.error.set(null);
    this.running.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<{ insight: JevInsight }>('/api/jev', { market: toSlice(market, tape) }),
      );
      this.remember([response.insight]);
    } catch (error) {
      this.error.set(readError(error));
    } finally {
      this.running.set(false);
    }
  }

  async askMany(markets: MarketView[]): Promise<void> {
    this.error.set(null);
    this.running.set(true);
    this.progress.set({ done: 0, total: markets.length });
    try {
      for (let index = 0; index < markets.length; index += 20) {
        const chunk = markets.slice(index, index + 20);
        const response = await firstValueFrom(
          this.http.post<{ insights: JevInsight[] }>('/api/jev/batch', { markets: chunk.map(toSlice) }),
        );
        this.remember(response.insights);
        this.progress.set({ done: Math.min(index + chunk.length, markets.length), total: markets.length });
      }
    } catch (error) {
      this.error.set(readError(error));
    } finally {
      this.running.set(false);
    }
  }

  private remember(insights: JevInsight[]): void {
    this.byId.update((current) => {
      const next = { ...current };
      for (const insight of insights) {
        next[insight.id] = insight;
      }
      return next;
    });
  }
}

function toSlice(market: MarketView, tape?: unknown): MarketSlice {
  return {
    id: market.id,
    question: market.question,
    rules: market.description,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    volume: market.volume,
    volume24h: market.volume24h,
    liquidity: market.liquidity,
    endDate: market.endDate,
    history: market.history.slice(-48),
    tape,
  };
}

function readError(error: unknown): string {
  const payload = (error as { error?: { error?: string } })?.error?.error;
  return payload || 'Не вдалося отримати висновок Jev AI.';
}
