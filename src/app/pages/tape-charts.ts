import { EChartsCoreOption } from 'echarts/core';
import { MarketView } from '../core/market.model';
import { BookLevel, TapeHolder, TapeTrade, TradeFlow } from '../core/tape';

const axis = { color: '#9aa4b2' };
const split = { lineStyle: { color: '#243041' } };
const YES = '#3ddc97';
const NO = '#ff8b7a';
const GOLD = '#d7b36a';

export function priceChart(history: { ts: number; yesPrice: number }[]): EChartsCoreOption {
  const prices = history.map((point) => point.yesPrice);
  const low = prices.length ? Math.min(...prices) : 0;
  const high = prices.length ? Math.max(...prices) : 1;
  const pad = Math.max(0.005, (high - low) * 0.35);
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 52, right: 16, top: 16, bottom: 28 },
    xAxis: { type: 'time', axisLabel: axis, axisLine: { lineStyle: { color: '#2c3542' } } },
    yAxis: {
      type: 'value',
      min: Math.max(0, low - pad),
      max: Math.min(1, high + pad),
      axisLabel: { ...axis, formatter: (value: number) => `${(value * 100).toFixed(1)}%` },
      splitLine: split,
    },
    series: [
      {
        name: 'YES',
        type: 'line',
        showSymbol: false,
        data: history.map((point) => [point.ts, point.yesPrice]),
        lineStyle: { color: YES, width: 2 },
        areaStyle: { color: 'rgba(61, 220, 151, 0.12)' },
      },
    ],
  };
}

export function tradeChart(trades: TapeTrade[]): EChartsCoreOption {
  const rows = [...trades].reverse();
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 108, right: 16, top: 12, bottom: 28 },
    xAxis: { type: 'value', axisLabel: { ...axis, formatter: (value: number) => moneyTick(value) }, splitLine: split },
    yAxis: { type: 'category', data: rows.map(labelTrade), axisLabel: { ...axis, width: 96, overflow: 'truncate' } },
    series: [{ type: 'bar', data: rows.map((trade) => trade.usd), itemStyle: { color: GOLD } }],
  };
}

export function bookChart(bids: BookLevel[], asks: BookLevel[]): EChartsCoreOption {
  const bidRows = [...bids].reverse();
  const askRows = asks;
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#9aa4b2' }, top: 0 },
    grid: [
      { left: 48, right: '52%', top: 28, bottom: 24 },
      { left: '52%', right: 16, top: 28, bottom: 24 },
    ],
    xAxis: [
      { type: 'value', gridIndex: 0, inverse: true, axisLabel: axis, splitLine: split },
      { type: 'value', gridIndex: 1, axisLabel: axis, splitLine: split },
    ],
    yAxis: [
      { type: 'category', gridIndex: 0, data: bidRows.map((level) => pct(level.price)), axisLabel: axis },
      { type: 'category', gridIndex: 1, data: askRows.map((level) => pct(level.price)), axisLabel: axis },
    ],
    series: [
      { name: 'Попит', type: 'bar', xAxisIndex: 0, yAxisIndex: 0, data: bidRows.map((level) => level.shares), itemStyle: { color: YES } },
      { name: 'Пропозиція', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: askRows.map((level) => level.shares), itemStyle: { color: NO } },
    ],
  };
}

export function holderChart(holders: TapeHolder[]): EChartsCoreOption {
  const rows = holders.slice(0, 10).reverse();
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 108, right: 16, top: 12, bottom: 28 },
    xAxis: { type: 'value', axisLabel: { ...axis, formatter: (value: number) => moneyTick(value) }, splitLine: split },
    yAxis: {
      type: 'category',
      data: rows.map((holder) => `${holder.outcome} · ${holder.trader}`),
      axisLabel: { ...axis, width: 96, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((holder) => ({
          value: holder.usd,
          itemStyle: { color: holder.outcome === 'YES' ? YES : NO },
        })),
      },
    ],
  };
}

export function flowChart(flow: TradeFlow): EChartsCoreOption {
  const rows = [
    { name: 'Купівля YES', value: flow.yesBuy, color: YES },
    { name: 'Продаж YES', value: flow.yesSell, color: '#1f9a68' },
    { name: 'Купівля NO', value: flow.noBuy, color: NO },
    { name: 'Продаж NO', value: flow.noSell, color: '#c45a4c' },
  ].filter((row) => row.value > 0);

  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: '{b}: {c} USD ({d}%)' },
    legend: { bottom: 0, textStyle: { color: '#9aa4b2' } },
    series: [
      {
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '46%'],
        label: { color: '#c9d3de', formatter: '{b}\n{d}%' },
        data: rows.map((row) => ({ name: row.name, value: row.value, itemStyle: { color: row.color } })),
      },
    ],
  };
}

export function volumeHorizonChart(market: MarketView): EChartsCoreOption {
  const rows = [
    { name: '24 год', value: market.volume24h },
    { name: 'Тиждень', value: market.volume1wk ?? 0 },
    { name: 'Місяць', value: market.volume1mo ?? 0 },
    { name: 'Усього', value: market.volume },
  ];
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis', valueFormatter: (value: number | string) => moneyTick(Number(value)) },
    grid: { left: 52, right: 16, top: 16, bottom: 28 },
    xAxis: { type: 'category', data: rows.map((row) => row.name), axisLabel: axis },
    yAxis: {
      type: 'value',
      axisLabel: { ...axis, formatter: (value: number) => moneyTick(value) },
      splitLine: split,
    },
    series: [
      {
        type: 'bar',
        data: rows.map((row) => row.value),
        itemStyle: { color: GOLD },
        barWidth: 36,
      },
    ],
  };
}

export function yesDistributionChart(markets: MarketView[]): EChartsCoreOption {
  const buckets = [
    { label: '5–20%', min: 0.05, max: 0.2 },
    { label: '20–35%', min: 0.2, max: 0.35 },
    { label: '35–50%', min: 0.35, max: 0.5 },
    { label: '50–65%', min: 0.5, max: 0.65 },
    { label: '65–80%', min: 0.65, max: 0.8 },
    { label: '80–95%', min: 0.8, max: 0.96 },
  ];
  const counts = buckets.map(
    (bucket) => markets.filter((market) => market.yesPrice >= bucket.min && market.yesPrice < bucket.max).length,
  );
  return {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 12, top: 16, bottom: 28 },
    xAxis: { type: 'category', data: buckets.map((bucket) => bucket.label), axisLabel: axis },
    yAxis: { type: 'value', minInterval: 1, axisLabel: axis, splitLine: split },
    series: [{ type: 'bar', data: counts, itemStyle: { color: YES }, barWidth: 28 }],
  };
}

export function topVolumeChart(markets: MarketView[]): EChartsCoreOption {
  const rows = [...markets].sort((a, b) => b.volume24h - a.volume24h).slice(0, 8).reverse();
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [];
        const point = list[0] as { name?: string; value?: number } | undefined;
        if (!point) {
          return '';
        }
        return `${point.name}<br/>24 год: ${moneyTick(Number(point.value ?? 0))}`;
      },
    },
    grid: { left: 120, right: 16, top: 8, bottom: 24 },
    xAxis: {
      type: 'value',
      axisLabel: { ...axis, formatter: (value: number) => moneyTick(value) },
      splitLine: split,
    },
    yAxis: {
      type: 'category',
      data: rows.map((market) => shortTitle(market.question)),
      axisLabel: { ...axis, width: 110, overflow: 'truncate' },
    },
    series: [{ type: 'bar', data: rows.map((market) => market.volume24h), itemStyle: { color: GOLD } }],
  };
}

function shortTitle(question: string): string {
  return question.length > 42 ? `${question.slice(0, 40)}…` : question;
}

function labelTrade(trade: TapeTrade): string {
  return `${trade.outcome} ${trade.side === 'BUY' ? 'куп.' : 'прод.'} ${trade.trader}`;
}

function pct(price: number): string {
  return `${(price * 100).toFixed(1)}%`;
}

function moneyTick(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}м`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}т`;
  }
  return String(Math.round(value));
}
