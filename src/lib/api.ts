import { PoolData, FetchPoolsOptions } from './types';

/**
 * Fetch pools from get-pools edge function (reads pre-computed summary tables).
 * Falls back to:
 *   DLMM → dlmmPipeline (batched multi-API)
 *   DAMM → direct Meteora
 */
export async function fetchPoolsFromBackend(
  poolTypeOrOptions: 'dlmm' | 'damm' | FetchPoolsOptions
): Promise<PoolData[]> {
  const opts: FetchPoolsOptions =
    typeof poolTypeOrOptions === 'string'
      ? { poolType: poolTypeOrOptions }
      : poolTypeOrOptions;

  const { poolType, timeframe = '30m', limit = 100, sort = 'fee_tvl_ratio', filter } = opts;

  // ── DLMM: use multi-API pipeline as primary source ──
  if (poolType === 'dlmm') {
    try {
      const { fetchDLMMPoolsFull } = await import('./dlmmPipeline');
      return await fetchDLMMPoolsFull();
    } catch (pipelineErr) {
      console.warn('DLMM pipeline failed, trying backend:', pipelineErr);
      // Fall through to backend
    }
  }

  // ── Backend (primary for DAMM, fallback for DLMM) ──
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
      return json.pools.map((p: any) => normalizeBackendPool(p, poolType));
    }

    throw new Error('No backend data');
  } catch (err) {
    console.warn('Backend fetch failed, using direct API:', err);

    // Last resort fallback for DAMM
    const { fetchDAMMPools } = await import('./meteora');
    return fetchDAMMPools();
  }
}

/**
 * Normalize a backend pool row to ensure every field has a safe value.
 */
function normalizeBackendPool(p: any, poolType: string): PoolData {
  const tvl = Number(p.tvl) || 0;
  const marketCap = Number(p.market_cap) || tvl || 0;
  const holders = Number(p.holders) || 0;

  // Age
  let ageMs = 0;
  const createdAt = p.created_at ?? null;
  if (createdAt) {
    const ts = new Date(createdAt).getTime();
    ageMs = ts > 0 ? Date.now() - ts : 0;
    if (ageMs < 0) ageMs = 0;
  }

  return {
    pool_address: p.pool_address ?? '',
    pool_type: p.pool_type ?? poolType,
    token_a_symbol: p.token_a_symbol ?? '???',
    token_b_symbol: p.token_b_symbol ?? '???',
    token_a_logo: p.token_a_logo ?? '',
    token_b_logo: p.token_b_logo ?? '',
    token_a_mint: p.token_a_mint ?? '',
    token_b_mint: p.token_b_mint ?? '',
    tvl,
    fee_tvl_ratio: p.fee_tvl_ratio != null ? Number(p.fee_tvl_ratio) : null,
    market_cap: marketCap,
    mc_sol: Number(p.mc_sol) || 0,
    volume_delta: p.volume_delta != null ? Number(p.volume_delta) : null,
    fees_delta: p.fees_delta != null ? Number(p.fees_delta) : null,
    volume_30min: Number(p.volume_30min) || Number(p.volume_delta) || 0,
    fees_30min: Number(p.fees_30min) || Number(p.fees_delta) || 0,
    price: Number(p.price) || 0,
    price_change: p.price_change != null ? Number(p.price_change) : null,
    score: p.score != null ? Number(p.score) : null,
    flags: p.flags ?? {},
    holders,
    created_at: createdAt,
    age_ms: ageMs,
    computed_at: p.computed_at ?? undefined,
  } satisfies PoolData;
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
