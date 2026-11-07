import { Routes } from '@angular/router';
import { MarketDetailComponent } from './pages/market-detail.component';
import { MarketsPageComponent } from './pages/markets-page.component';

export const routes: Routes = [
  { path: '', component: MarketsPageComponent },
  { path: 'markets/:id', component: MarketDetailComponent },
  { path: '**', redirectTo: '' },
];
