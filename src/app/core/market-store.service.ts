import { Injectable, computed, inject, signal } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { MarketView } from './market.model';
import { rankForIndex, upsertMarket } from './market-index';
import { PolymarketApiService } from './polymarket-api.service';

const PAGE_SIZE = 100;
const PAGE_COUNT = 8;

@Injectable({ providedIn: 'root' })
export class MarketStoreService {
  private readonly api = inject(PolymarketApiService);
  private index = new Map<string, MarketView>();

  readonly markets = signal<MarketView[]>([]);
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly errorMessage = signal<string | null>(null);
  readonly lastSync = signal<Date | null>(null);
  readonly live = signal(false);

  readonly count = computed(() => this.markets().length);

  load(): void {
    this.status.set('loading');
    this.errorMessage.set(null);
    const pages = Array.from({ length: PAGE_COUNT }, (_, page) =>
      this.api.listOpenMarkets(PAGE_SIZE, page * PAGE_SIZE).pipe(catchError(() => of([]))),
    );
    forkJoin(pages)
      .pipe(
        map((chunks) => chunks.flat()),
        tap((raw) => {
          this.index = new Map();
          raw.forEach((market) => {
            this.index = upsertMarket(this.index, market);
          });
          this.publish();
          this.status.set('ready');
        }),
        catchError((error: unknown) => {
          console.error(error);
          this.status.set('error');
          this.errorMessage.set('Не вдалося отримати ринки Polymarket. Перевірте мережу і спробуйте ще раз.');
          return of([]);
        }),
      )
      .subscribe();
  }

  refreshOne(id: string) {
    return this.api.fetchMarket(id).pipe(
      map((raw) => {
        this.index = upsertMarket(this.index, raw);
        this.publish();
        return this.index.get(id) ?? null;
      }),
    );
  }

  get(id: string): MarketView | undefined {
    return this.index.get(id);
  }

  setHistory(id: string, history: MarketView['history']): void {
    const current = this.index.get(id);
    if (!current) {
      return;
    }
    this.index.set(id, { ...current, history });
    this.publish();
  }

  noteLivePrice(id: string, yesPrice: number): void {
    const current = this.index.get(id);
    if (!current || yesPrice < 0 || yesPrice > 1) {
      return;
    }
    const noPrice = Math.min(1, Math.max(0, 1 - yesPrice));
    this.index = upsertMarket(this.index, {
      id,
      outcomePrices: [String(yesPrice), String(noPrice)],
      updatedAt: new Date().toISOString(),
    });
    this.publish();
    this.live.set(true);
  }

  private publish(): void {
    this.markets.set(rankForIndex([...this.index.values()]));
    this.lastSync.set(new Date());
  }
}
