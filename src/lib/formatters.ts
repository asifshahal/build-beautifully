export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(2)}`;
}

export function formatMarketCapUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0 || isNaN(value)) return 'N/A';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.floor(value)}`;
}

export function formatFeeTvl(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value.toFixed(4)}%`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'N/A';
  return value.toLocaleString();
}

export function formatAge(createdAt: string | null | undefined): string {
  if (!createdAt) return 'N/A';
  const now = Date.now();
  const created = new Date(createdAt).getTime();
  const diffMs = now - created;
  const hours = diffMs / (1000 * 60 * 60);
  if (hours < 1) return `${Math.floor(hours * 60)}m`;
  if (hours < 24) return `${Math.floor(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.floor(months)}mo`;
  return `${(months / 12).toFixed(0)}y`;
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 8) return address || '';
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}
