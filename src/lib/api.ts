import { PoolData, FetchPoolsOptions } from './types';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

/** Response cache to avoid repeated calls */
const responseCache = new Map<string, { data: PoolData[]; ts: number }>();
const CACHE_TTL = 15_000; // 15s

function getTokenMint(mintA: string, mintB: string): string {
  if (mintA === SOL_MINT || mintA === USDC_MINT) return mintB;
  return mintA;
}

export async function fetchPoolsFromBackend(
  poolTypeOrOptions: 'dlmm' | 'damm' | FetchPoolsOptions
): Promise<PoolData[]> {
  const opts: FetchPoolsOptions =
    typeof poolTypeOrOptions === 'string'
      ? { poolType: poolTypeOrOptions }
      : poolTypeOrOptions;

  const { poolType, timeframe = '30m', limit = 100, sort = 'fee_tvl_ratio', filter } = opts;
  const cacheKey = `${poolType}:${timeframe}:${limit}:${sort}:${filter ?? ''}`;

  // Check cache
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  // DLMM: use multi-API pipeline as primary source
  if (poolType === 'dlmm') {
    try {
      const { fetchDLMMPoolsFull } = await import('./dlmmPipeline');
      const data = await fetchDLMMPoolsFull();
      responseCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    } catch (pipelineErr) {
      console.warn('DLMM pipeline failed, trying backend:', pipelineErr);
    }
  }

  // Backend (primary for DAMM, fallback for DLMM)
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !anonKey) throw new Error('Missing config');

    const params = new URLSearchParams({ type: poolType, timeframe, limit: String(limit), sort });
    if (filter) params.set('filter', filter);

    const res = await fetch(`${supabaseUrl}/functions/v1/get-pools?${params}`, {
      headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
    });

    if (!res.ok) throw new Error(`Edge function error: ${res.status}`);
    const json = await res.json();

    if (json.ok && json.pools?.length > 0) {
      const data = json.pools.map((p: any) => normalizeBackendPool(p, poolType));
      responseCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    }
    throw new Error('No backend data');
  } catch (err) {
    console.warn('Backend fetch failed, using direct API:', err);
    const { fetchDAMMPools } = await import('./meteora');
    return fetchDAMMPools();
  }
}

function normalizeBackendPool(p: any, poolType: string): PoolData {
  const tvl = Number(p.tvl) || 0;
  const marketCap = Number(p.market_cap) || tvl || 0;
  const holders = Number(p.holders) || 0;

  let ageMs = 0;
  const createdAt = p.created_at ?? null;
  if (createdAt) {
    const ts = new Date(createdAt).getTime();
    ageMs = ts > 0 ? Date.now() - ts : 0;
    if (ageMs < 0) ageMs = 0;
  }

  const mintA = p.token_a_mint ?? '';
  const mintB = p.token_b_mint ?? '';

  return {
    pool_address: p.pool_address ?? '',
    pool_type: p.pool_type ?? poolType,
    token_a_symbol: p.token_a_symbol ?? '???',
    token_b_symbol: p.token_b_symbol ?? '???',
    token_a_logo: mintA === SOL_MINT ? '/sol.png' : (p.token_a_logo ?? ''),
    token_b_logo: mintB === SOL_MINT ? '/sol.png' : (p.token_b_logo ?? ''),
    token_a_mint: mintA,
    token_b_mint: mintB,
    token_mint: getTokenMint(mintA, mintB),
    tvl,
    fee_tvl_ratio: p.fee_tvl_ratio != null ? Number(p.fee_tvl_ratio) : null,
    marketCapUsd: marketCap,
    volume_delta: p.volume_delta != null ? Number(p.volume_delta) : null,
    fees_delta: p.fees_delta != null ? Number(p.fees_delta) : null,
    volume_30min: Number(p.volume_30min) || Number(p.volume_delta) || 0,
    fees_30min: Number(p.fees_30min) || Number(p.fees_delta) || 0,
    volume_24h: Number(p.volume_24h) || 0,
    fees_24h: Number(p.fees_24h) || 0,
    price: Number(p.price) || 0,
    price_change_1h: p.price_change_1h != null ? Number(p.price_change_1h) : null,
    price_change_24h: p.price_change_24h != null ? Number(p.price_change_24h) : null,
    score: p.score != null ? Number(p.score) : null,
    flags: p.flags ?? {},
    holders,
    created_at: createdAt,
    age_ms: ageMs,
    computed_at: p.computed_at ?? undefined,
  } satisfies PoolData;
}

export async function fetchHealthStatus(): Promise<any> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) throw new Error('Missing config');

  const res = await fetch(`${supabaseUrl}/functions/v1/health`, {
    headers: { Authorization: `Bearer ${anonKey}`, apikey: anonKey },
  });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}
