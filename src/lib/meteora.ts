import { PoolData } from './types';

const DLMM_API = 'https://dlmm.datapi.meteora.ag';
const DAMM_API = 'https://dammv2-api.meteora.ag';
const JUPITER_TOKEN_LIST = 'https://token.jup.ag/all';

let tokenLogoCache: Record<string, string> = {};
let tokenCacheLoaded = false;

async function loadTokenLogos() {
  if (tokenCacheLoaded) return;
  try {
    const res = await fetch(JUPITER_TOKEN_LIST);
    const tokens = await res.json();
    for (const t of tokens) {
      if (t.address && t.logoURI) {
        tokenLogoCache[t.address] = t.logoURI;
      }
    }
    tokenCacheLoaded = true;
  } catch (e) {
    console.warn('Failed to load Jupiter token list:', e);
  }
}

function getTokenLogo(mint: string): string {
  return tokenLogoCache[mint] || '';
}

export async function fetchDLMMPools(): Promise<PoolData[]> {
  await loadTokenLogos();

  const res = await fetch(`${DLMM_API}/pools?page=1&page_size=100&sort_by=fee_tvl_ratio_30m:desc`);
  if (!res.ok) throw new Error(`DLMM API error: ${res.status}`);
  const json = await res.json();

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const pools = (json.data ?? []).filter((p: any) => {
    const mintA = p.token_x?.address ?? '';
    const mintB = p.token_y?.address ?? '';
    return mintA === SOL_MINT || mintB === SOL_MINT;
  });

  return pools.map((p: any) => {
    const tokenX = p.token_x ?? {};
    const tokenY = p.token_y ?? {};
    const feeTvlRatio = p.fee_tvl_ratio?.['30m'] ?? null;
    const volume30m = p.volume?.['30m'] ?? null;
    const fees30m = p.fees?.['30m'] ?? null;
    const createdAt = typeof p.created_at === 'number' ? new Date(p.created_at * 1000).toISOString() : p.created_at ?? null;

    return {
      pool_address: p.address ?? '',
      pool_type: 'dlmm' as const,
      token_a_symbol: tokenX.symbol ?? 'Unknown',
      token_b_symbol: tokenY.symbol ?? 'Unknown',
      token_a_mint: tokenX.address ?? '',
      token_b_mint: tokenY.address ?? '',
      token_a_logo: getTokenLogo(tokenX.address ?? ''),
      token_b_logo: getTokenLogo(tokenY.address ?? ''),
      tvl: Number(p.tvl) || 0,
      fee_tvl_ratio: feeTvlRatio !== undefined ? Number(feeTvlRatio) : null,
      market_cap: Number(tokenX.market_cap || 0) + Number(tokenY.market_cap || 0),
      volume_delta: null,
      fees_delta: null,
      price: Number(p.current_price) || 0,
      price_change: null,
      score: null,
      flags: {},
      holders: Math.max(Number(tokenX.holders || 0), Number(tokenY.holders || 0)),
      created_at: createdAt,
      volume_30min: volume30m !== null ? Number(volume30m) : null,
      fees_30min: fees30m !== null ? Number(fees30m) : null,
      price_change_5m: null,
      bin_step: p.pool_config?.bin_step ?? undefined,
      base_fee: p.pool_config?.base_fee_pct ?? undefined,
    };
  });
}

export async function fetchDAMMPools(): Promise<PoolData[]> {
  await loadTokenLogos();
  
  const res = await fetch(`${DAMM_API}/pools?page=0&limit=100&sort_by=tvl&order=desc`);
  if (!res.ok) throw new Error(`DAMM API error: ${res.status}`);
  const data = await res.json();
  
  const pools = data.data ?? data.pools ?? data ?? [];
  
  return pools.map((p: any) => {
    const createdTs = p.created_at_slot_timestamp
      ? new Date(p.created_at_slot_timestamp * 1000).toISOString()
      : p.created_at || null;
    return {
      pool_address: p.pool_address || p.address || '',
      pool_type: 'damm' as const,
      token_a_symbol: p.token_a_symbol || 'Unknown',
      token_b_symbol: p.token_b_symbol || 'Unknown',
      token_a_mint: p.token_a_mint || '',
      token_b_mint: p.token_b_mint || '',
      token_a_logo: getTokenLogo(p.token_a_mint || ''),
      token_b_logo: getTokenLogo(p.token_b_mint || ''),
      tvl: Number(p.tvl) || 0,
      fee_tvl_ratio: (Number(p.tvl) || 0) > 0 ? ((Number(p.fee24h) || Number(p.trading_fee) || 0) / Number(p.tvl)) * 100 / 48 : null,
      market_cap: null,
      volume_30min: (Number(p.volume24h) || Number(p.trading_volume) || 0) / 48,
      fees_30min: (Number(p.fee24h) || Number(p.trading_fee) || 0) / 48,
      price_change_5m: null,
      holders: null,
      created_at: createdTs,
    };
  });
}
