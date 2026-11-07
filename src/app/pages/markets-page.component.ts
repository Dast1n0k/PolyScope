import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { NgxEchartsDirective } from 'ngx-echarts';
import { MarketView } from '../core/market.model';
import { activityRatio, sumVolume } from '../core/market-index';
import { cents, money, percent } from '../core/format';
import { MarketStoreService } from '../core/market-store.service';
import { topVolumeChart, yesDistributionChart } from './tape-charts';

type SortKey = 'volume' | 'volume24h' | 'liquidity' | 'yesPrice';

@Component({
  selector: 'app-markets-page',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    NgxEchartsDirective,
  ],
  templateUrl: './markets-page.component.html',
  styleUrl: './markets-page.component.scss',
})
export class MarketsPageComponent {
  readonly store = inject(MarketStoreService);
  readonly query = signal('');
  readonly sortKey = signal<SortKey>('volume');
  readonly money = money;
  readonly percent = percent;
  readonly cents = cents;
  readonly activity = activityRatio;

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const rows = this.store.markets().filter((market) => !q || market.question.toLowerCase().includes(q));
    const key = this.sortKey();
    return [...rows].sort((a, b) => b[key] - a[key]);
  });

  readonly loadedVolume = computed(() => sumVolume(this.store.markets()));
  readonly distOptions = computed(() => yesDistributionChart(this.store.markets()));
  readonly topOptions = computed(() => topVolumeChart(this.store.markets()));

  trackId(_index: number, market: MarketView): string {
    return market.id;
  }
}
