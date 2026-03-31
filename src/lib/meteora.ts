import { PoolData } from './types';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
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
      if (t.address && t.logoURI) tokenLogoCache[t.address] = t.logoURI;
    }
    tokenCacheLoaded = true;
  } catch (e) {
    console.warn('Failed to load Jupiter token list:', e);
  }
}

function getTokenLogo(mint: string): string {
  return tokenLogoCache[mint] || '';
}

function getTokenMint(mintA: string, mintB: string): string {
  if (mintA === SOL_MINT || mintA === USDC_MINT) return mintB;
  return mintA;
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

    const tvl = Number(p.tvl) || 0;
    const volume30min = (Number(p.volume24h) || Number(p.trading_volume) || 0) / 48;
    const fees30min = (Number(p.fee24h) || Number(p.trading_fee) || 0) / 48;
    const feeTvlRatio = tvl > 0 ? (fees30min / tvl) * 100 : null;

    let ageMs = 0;
    if (createdTs) {
      const ts = new Date(createdTs).getTime();
      ageMs = ts > 0 ? Date.now() - ts : 0;
      if (ageMs < 0) ageMs = 0;
    }

    const mintA = p.token_a_mint || '';
    const mintB = p.token_b_mint || '';

    return {
      pool_address: p.pool_address || p.address || '',
      pool_type: 'damm' as const,
      token_a_symbol: p.token_a_symbol || 'Unknown',
      token_b_symbol: p.token_b_symbol || 'Unknown',
      token_a_mint: mintA,
      token_b_mint: mintB,
      token_mint: getTokenMint(mintA, mintB),
      token_a_logo: getTokenLogo(mintA),
      token_b_logo: getTokenLogo(mintB),
      tvl,
      fee_tvl_ratio: feeTvlRatio,
      marketCapUsd: 0,
      volume_delta: volume30min || null,
      fees_delta: fees30min || null,
      volume_30min: volume30min,
      fees_30min: fees30min,
      volume_24h: Number(p.volume24h) || 0,
      fees_24h: Number(p.fee24h) || 0,
      price: 0,
      price_change_1h: null,
      price_change_24h: null,
      score: null,
      flags: {},
      holders: 0,
      created_at: createdTs,
      age_ms: ageMs,
    } satisfies PoolData;
  });
}
