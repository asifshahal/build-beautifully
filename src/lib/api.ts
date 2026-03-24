import { PoolData, FetchPoolsOptions } from './types';

/**
 * Fetch pools from the get-pools edge function (reads pre-computed summary tables).
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
      // Normalize field names for backward compat
      return json.pools.map((p: any) => ({
        ...p,
        volume_30min: p.volume_delta ?? p.volume_30min ?? null,
        fees_30min: p.fees_delta ?? p.fees_30min ?? null,
        price_change_5m: p.price_change ?? p.price_change_5m ?? null,
        flags: p.flags ?? {},
        score: p.score ?? null,
      }));
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
