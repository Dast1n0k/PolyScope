export function money(value: number): string {
  return new Intl.NumberFormat('uk-UA', {
    style: 'currency',
    currency: 'USD',
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function percent(price: number): string {
  return `${(price * 100).toFixed(1)}%`;
}

export function cents(price: number): string {
  return `${(price * 100).toFixed(1)}¢`;
}

export function ago(ts?: number): string {
  if (!ts) {
    return '—';
  }
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 1) {
    return 'щойно';
  }
  if (minutes < 60) {
    return `${minutes} хв тому`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours} год тому`;
  }
  return `${Math.round(hours / 24)} дн тому`;
}

export function when(iso?: string): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
