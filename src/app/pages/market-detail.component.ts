import { DecimalPipe } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgxEchartsDirective } from 'ngx-echarts';
import { catchError, forkJoin, interval, of, switchMap } from 'rxjs';
import { ago, cents, money, percent, when } from '../core/format';
import { localInsight, replaceHistory } from '../core/market-index';
import { JevInsightService } from '../core/jev-insight.service';
import { LiveFeedService } from '../core/live-feed.service';
import { MarketView } from '../core/market.model';
import { MarketStoreService } from '../core/market-store.service';
import { PolymarketApiService } from '../core/polymarket-api.service';
import { MarketTape, largestTrades, parseBook, parseHolders, parseOpenInterest, parseTrades, tradeFlow } from '../core/tape';
import { bookChart, flowChart, holderChart, priceChart, tradeChart, volumeHorizonChart } from './tape-charts';

type RangeKey = '1d' | '1w' | 'max';

const RANGES: Record<RangeKey, { interval: string; fidelity: number }> = {
  '1d': { interval: '1d', fidelity: 15 },
  '1w': { interval: '1w', fidelity: 60 },
  max: { interval: 'max', fidelity: 360 },
};

@Component({
  selector: 'app-market-detail',
  imports: [DecimalPipe, RouterLink, NgxEchartsDirective],
  templateUrl: './market-detail.component.html',
  styleUrl: './market-detail.component.scss',
})
export class MarketDetailComponent implements OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly store = inject(MarketStoreService);
  private readonly api = inject(PolymarketApiService);
  private readonly live = inject(LiveFeedService);
  readonly jev = inject(JevInsightService);

  readonly money = money;
  readonly percent = percent;
  readonly cents = cents;
  readonly when = when;
  readonly ago = ago;
  readonly range = signal<RangeKey>('1w');
  readonly chartError = signal<string | null>(null);
  readonly tapeError = signal<string | null>(null);
  readonly missing = signal(false);
  readonly market = signal<MarketView | null>(null);
  readonly tape = signal<MarketTape | null>(null);
  readonly topTrades = computed(() => largestTrades(this.tape()?.trades ?? []));
  readonly latestTrade = computed(() => this.tape()?.trades.find((trade) => trade.outcome === 'YES') ?? this.tape()?.trades[0] ?? null);
  readonly insight = computed(() => {
    const current = this.market();
    return current ? localInsight(current) : null;
  });
  readonly jevNote = computed(() => {
    const current = this.market();
    return current ? this.jev.byId()[current.id] : undefined;
  });
  readonly priceOptions = computed(() => priceChart(this.market()?.history ?? []));
  readonly tradeOptions = computed(() => tradeChart(this.topTrades()));
  readonly bookOptions = computed(() => bookChart(this.tape()?.bids ?? [], this.tape()?.asks ?? []));
  readonly holderOptions = computed(() => holderChart(this.tape()?.holders ?? []));
  readonly flowOptions = computed(() =>
    flowChart(this.tape()?.flow ?? { yesBuy: 0, yesSell: 0, noBuy: 0, noSell: 0 }),
  );
  readonly volumeOptions = computed(() => {
    const current = this.market();
    return current ? volumeHorizonChart(current) : { backgroundColor: 'transparent' };
  });

  private stopLive: (() => void) | null = null;
  private marketId = '';

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.marketId = params.get('id') ?? '';
      this.bind(this.marketId);
    });

    interval(15000)
      .pipe(
        takeUntilDestroyed(),
        switchMap(() => {
          if (!this.marketId) {
            return of(null);
          }
          return this.store.refreshOne(this.marketId).pipe(catchError(() => of(null)));
        }),
      )
      .subscribe((market) => {
        if (market) {
          this.market.set(market);
          this.loadTape(market);
        }
      });
  }

  ngOnDestroy(): void {
    this.stopLive?.();
  }

  setRange(range: RangeKey): void {
    this.range.set(range);
    const current = this.market();
    if (current) {
      this.loadHistory(current);
    }
  }

  askJev(): void {
    const current = this.market();
    if (current) {
      void this.jev.ask(current, this.tape());
    }
  }

  private bind(id: string): void {
    this.stopLive?.();
    this.stopLive = null;
    this.missing.set(false);
    this.tape.set(null);
    if (!id) {
      this.missing.set(true);
      return;
    }
    const known = this.store.get(id) ?? null;
    this.market.set(known);
    this.store.refreshOne(id).subscribe({
      next: (market) => {
        if (!market) {
          return;
        }
        this.market.set(market);
        this.loadHistory(market);
        this.loadTape(market);
        if (market.yesTokenId) {
          this.stopLive = this.live.watch(market.yesTokenId, (price) => {
            this.store.noteLivePrice(id, price);
            const next = this.store.get(id);
            if (next) {
              this.market.set(next);
            }
          });
        }
      },
      error: () => {
        this.chartError.set('Ринок не вдалося оновити.');
        if (!this.market()) {
          this.missing.set(true);
        }
      },
    });
  }

  private loadHistory(market: MarketView): void {
    if (!market.yesTokenId) {
      this.chartError.set('Для цього ринку немає ідентифікатора токена YES, графік недоступний.');
      return;
    }
    const spec = RANGES[this.range()];
    this.chartError.set(null);
    this.api.priceHistory(market.yesTokenId, spec.interval, spec.fidelity).subscribe({
      next: (points) => {
        const next = replaceHistory(market, points);
        this.store.setHistory(market.id, next.history);
        this.market.set(this.store.get(market.id) ?? next);
      },
      error: () => this.chartError.set('Історію цін зараз не вдалося завантажити.'),
    });
  }

  private loadTape(market: MarketView): void {
    if (!market.conditionId || !market.yesTokenId) {
      this.tapeError.set('Для цього ринку немає ідентифікатора умови, стрічка угод недоступна.');
      return;
    }
    const yesTokenId = market.yesTokenId;
    forkJoin({
      trades: this.api.trades(market.conditionId).pipe(catchError(() => of(null))),
      holders: this.api.holders(market.conditionId).pipe(catchError(() => of(null))),
      book: this.api.book(yesTokenId).pipe(catchError(() => of(null))),
      oi: this.api.openInterest(market.conditionId).pipe(catchError(() => of(null))),
    }).subscribe(({ trades, holders, book, oi }) => {
      const parsedTrades = parseTrades(trades, yesTokenId);
      const parsedBook = parseBook(book);
      this.tape.set({
        updatedAt: new Date().toISOString(),
        openInterest: parseOpenInterest(oi),
        trades: parsedTrades,
        holders: parseHolders(holders, yesTokenId, market.yesPrice, market.noPrice),
        flow: tradeFlow(parsedTrades),
        ...parsedBook,
      });
      this.tapeError.set(parsedTrades.length || parsedBook.bids.length ? null : 'Стрічка угод зараз порожня.');
    });
  }
}
