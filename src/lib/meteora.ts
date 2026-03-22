import { PoolData } from './types';

const DLMM_API = 'https://dlmm-api.meteora.ag';
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
  
  const res = await fetch(`${DLMM_API}/pair/all_with_pagination?page=0&limit=100&sort_key=volume&order_by=desc`);
  if (!res.ok) throw new Error(`DLMM API error: ${res.status}`);
  const data = await res.json();
  
  const pairs = data.pairs || data.data || data || [];
  
  return pairs.map((p: any) => ({
    pool_address: p.address || p.pair_address || '',
    pool_type: 'dlmm' as const,
    token_a_symbol: p.name?.split('-')[0]?.trim() || p.mint_x_symbol || 'Unknown',
    token_b_symbol: p.name?.split('-')[1]?.trim() || p.mint_y_symbol || 'Unknown',
    token_a_mint: p.mint_x || '',
    token_b_mint: p.mint_y || '',
    token_a_logo: getTokenLogo(p.mint_x || ''),
    token_b_logo: getTokenLogo(p.mint_y || ''),
    tvl: Number(p.liquidity) || Number(p.tvl) || 0,
    fee_tvl_ratio: p.liquidity > 0 ? ((Number(p.fees_24h) || 0) / Number(p.liquidity)) * 100 / 48 : null,
    market_cap: null,
    volume_30min: (Number(p.trade_volume_24h) || Number(p.volume) || 0) / 48,
    fees_30min: (Number(p.fees_24h) || Number(p.fees) || 0) / 48,
    price_change_5m: null,
    holders: null,
    created_at: p.created_at || null,
    bin_step: p.bin_step,
    base_fee: p.base_fee_percentage ? Number(p.base_fee_percentage) : undefined,
  }));
}

export async function fetchDAMMPools(): Promise<PoolData[]> {
  await loadTokenLogos();
  
  const res = await fetch(`${DAMM_API}/pools?page=0&limit=100&sort_by=tvl&order=desc`);
  if (!res.ok) throw new Error(`DAMM API error: ${res.status}`);
  const data = await res.json();
  
  const pools = data.data || data.pools || data || [];
  
  return pools.map((p: any) => ({
    pool_address: p.pool_address || p.address || '',
    pool_type: 'damm' as const,
    token_a_symbol: p.pool_token_mints?.[0]?.symbol || p.token_a_symbol || 'Unknown',
    token_b_symbol: p.pool_token_mints?.[1]?.symbol || p.token_b_symbol || 'Unknown',
    token_a_mint: p.pool_token_mints?.[0]?.address || p.token_a_mint || '',
    token_b_mint: p.pool_token_mints?.[1]?.address || p.token_b_mint || '',
    token_a_logo: getTokenLogo(p.pool_token_mints?.[0]?.address || p.token_a_mint || ''),
    token_b_logo: getTokenLogo(p.pool_token_mints?.[1]?.address || p.token_b_mint || ''),
    tvl: Number(p.pool_tvl) || Number(p.tvl) || 0,
    fee_tvl_ratio: (Number(p.pool_tvl) || 0) > 0 ? ((Number(p.trading_fee) || Number(p.fees_24h) || 0) / Number(p.pool_tvl)) * 100 / 48 : null,
    market_cap: null,
    volume_30min: (Number(p.trading_volume) || Number(p.volume_24h) || 0) / 48,
    fees_30min: (Number(p.trading_fee) || Number(p.fees_24h) || 0) / 48,
    price_change_5m: null,
    holders: null,
    created_at: p.created_at || null,
  }));
}
