export interface PoolData {
  pool_address: string;
  pool_type: 'dlmm' | 'damm';
  token_a_symbol: string;
  token_b_symbol: string;
  token_a_logo: string;
  token_b_logo: string;
  token_a_mint: string;
  token_b_mint: string;
  tvl: number;
  fee_tvl_ratio: number | null;
  market_cap: number;
  volume_delta: number | null;
  fees_delta: number | null;
  price: number;
  price_change: number | null;
  score: number | null;
  flags: PoolFlags;
  holders: number;
  created_at: string | null;
  computed_at?: string;
  // Raw numeric fields for sorting — never undefined/NaN
  mc_sol: number;
  age_ms: number;
  volume_30min: number;
  fees_30min: number;
}

export interface PoolFlags {
  trending_up?: boolean;
  fee_spike?: boolean;
  volume_spike?: boolean;
  new_pool?: boolean;
  risky?: boolean;
}

export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '24h';

export type SortField = 'tvl' | 'fee_tvl_ratio' | 'mc_sol' | 'volume_delta' | 'fees_delta' | 'price_change' | 'score' | 'holders' | 'age_ms';
export type SortDirection = 'asc' | 'desc';

export interface FetchPoolsOptions {
  poolType: 'dlmm' | 'damm';
  timeframe?: Timeframe;
  limit?: number;
  sort?: string;
  filter?: string;
}
