import { PoolData, FetchPoolsOptions } from './types';

/**
 * Fetch pools from get-pools edge function (reads pre-computed summary tables).
 * Falls back to direct Meteora API when backend has no data.
 */
export async function fetchPoolsFromBackend(
  poolTypeOrOptions: 'dlmm' | 'damm' | FetchPoolsOptions
): Promise<PoolData[]> {
  const opts: FetchPoolsOptions =
    typeof poolTypeOrOptions === 'string'
      ? { poolType: poolTypeOrOptions }
      : poolTypeOrOptions;

  const { poolType, timeframe = '30m', limit = 100, sort = 'fee_tvl_ratio', filter } = opts;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !anonKey) throw new Error('Missing config');

    const params = new URLSearchParams({
      type: poolType,
      timeframe,
      limit: String(limit),
      sort,
    });
    if (filter) params.set('filter', filter);

    const res = await fetch(
      `${supabaseUrl}/functions/v1/get-pools?${params}`,
      {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          apikey: anonKey,
        },
      }
    );

    if (!res.ok) throw new Error(`Edge function error: ${res.status}`);
    const json = await res.json();

    if (json.ok && json.pools?.length > 0) {
      // Normalize: ensure every field has a safe value
      return json.pools.map((p: any) => ({
        pool_address: p.pool_address ?? '',
        pool_type: p.pool_type ?? poolType,
        token_a_symbol: p.token_a_symbol ?? '???',
        token_b_symbol: p.token_b_symbol ?? '???',
        token_a_logo: p.token_a_logo ?? '',
        token_b_logo: p.token_b_logo ?? '',
        token_a_mint: p.token_a_mint ?? '',
        token_b_mint: p.token_b_mint ?? '',
        tvl: Number(p.tvl) || 0,
        fee_tvl_ratio: p.fee_tvl_ratio != null ? Number(p.fee_tvl_ratio) : null,
        market_cap: Number(p.market_cap) || 0,
        volume_delta: p.volume_delta != null ? Number(p.volume_delta) : null,
        fees_delta: p.fees_delta != null ? Number(p.fees_delta) : null,
        price: Number(p.price) || 0,
        price_change: p.price_change != null ? Number(p.price_change) : null,
        score: p.score != null ? Number(p.score) : null,
        flags: p.flags ?? {},
        holders: Number(p.holders) || 0,
        created_at: p.created_at ?? null,
        computed_at: p.computed_at ?? undefined,
      } satisfies PoolData));
    }

    throw new Error('No backend data');
  } catch (err) {
    console.warn('Backend fetch failed, using direct Meteora API:', err);
    const { fetchDLMMPools, fetchDAMMPools } = await import('./meteora');
    return poolType === 'dlmm' ? fetchDLMMPools() : fetchDAMMPools();
  }
}

/**
 * Fetch system health status.
 */
export async function fetchHealthStatus(): Promise<any> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('Missing config');

  const res = await fetch(`${supabaseUrl}/functions/v1/health`, {
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
    },
  });

  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}
