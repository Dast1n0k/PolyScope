import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { GammaMarket } from './market.model';

interface HistoryResponse {
  history?: { t: number; p: number }[];
}

@Injectable({ providedIn: 'root' })
export class PolymarketApiService {
  private readonly http = inject(HttpClient);
  private readonly gamma = 'https://gamma-api.polymarket.com';
  private readonly clob = 'https://clob.polymarket.com';
  private readonly data = 'https://data-api.polymarket.com/v2';

  listOpenMarkets(limit = 100, offset = 0): Observable<GammaMarket[]> {
    const params = new HttpParams()
      .set('closed', 'false')
      .set('limit', String(limit))
      .set('offset', String(offset))
      .set('order', 'volumeNum')
      .set('ascending', 'false');
    return this.http.get<GammaMarket[] | { markets?: GammaMarket[] }>(`${this.gamma}/markets`, { params }).pipe(
      map((body) => (Array.isArray(body) ? body : (body.markets ?? []))),
    );
  }

  fetchMarket(id: string): Observable<GammaMarket> {
    return this.http.get<GammaMarket>(`${this.gamma}/markets/${id}`);
  }

  priceHistory(tokenId: string, interval: string, fidelity: number): Observable<{ ts: number; yesPrice: number }[]> {
    const params = new HttpParams()
      .set('market', tokenId)
      .set('interval', interval)
      .set('fidelity', String(fidelity));
    return this.http.get<HistoryResponse>(`${this.clob}/prices-history`, { params }).pipe(
      map((response) =>
        (response.history ?? []).map((point) => ({
          ts: point.t > 10_000_000_000 ? point.t : point.t * 1000,
          yesPrice: point.p,
        })),
      ),
    );
  }

  trades(conditionId: string) {
    const params = new HttpParams().set('condition', conditionId).set('limit', '200');
    return this.http.get<unknown>(`${this.data}/trades`, { params });
  }

  holders(conditionId: string) {
    const params = new HttpParams().set('condition', conditionId);
    return this.http.get<unknown>(`${this.data}/holders`, { params });
  }

  book(tokenId: string) {
    const params = new HttpParams().set('token_id', tokenId);
    return this.http.get<unknown>(`${this.clob}/book`, { params });
  }

  openInterest(conditionId: string) {
    const params = new HttpParams().set('condition', conditionId);
    return this.http.get<unknown>(`${this.data}/oi`, { params });
  }
}
