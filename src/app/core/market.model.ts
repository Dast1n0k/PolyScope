export interface PricePoint {
  ts: number;
  yesPrice: number;
}

export interface MarketView {
  id: string;
  question: string;
  slug: string;
  description: string;
  image?: string;
  yesPrice: number;
  noPrice: number;
  volume: number;
  volume24h: number;
  liquidity: number;
  endDate?: string;
  updatedAt: string;
  active: boolean;
  closed: boolean;
  yesTokenId?: string;
  noTokenId?: string;
  conditionId?: string;
  volume1wk?: number;
  volume1mo?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
  history: PricePoint[];
}

export interface GammaMarket {
  id: string;
  question?: string;
  slug?: string;
  description?: string;
  image?: string;
  icon?: string;
  outcomePrices?: string | string[];
  volume?: string | number;
  volumeNum?: number;
  volume24hr?: number;
  liquidity?: string | number;
  liquidityNum?: number;
  endDate?: string;
  updatedAt?: string;
  active?: boolean;
  closed?: boolean;
  clobTokenIds?: string | string[];
  conditionId?: string;
  volume1wk?: number;
  volume1mo?: number;
  bestBid?: number;
  bestAsk?: number;
  spread?: number;
}

export type InsightDirection = 'YES' | 'NO';

export interface LocalInsight {
  direction: InsightDirection;
  rationale: string;
  advisory: true;
}
