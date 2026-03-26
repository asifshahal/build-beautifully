/**
 * DLMM Hot Pools — Batched multi-API pipeline.
 *
 * Pipeline: fetchPools → filterSOL → extractMints → batchFetchDex → batchFetchHelius → fetchSolPrice → merge → fillMissing → sort
 *
 * APIs:
 *   Meteora      – pool list, TVL, fee/tvl, volume, fees, created_at
 *   Dexscreener  – price, fdv, liquidity, volume24h, fees24h, priceChange, pairCreatedAt, logo
 *   Helius       – holders, metadata, logo
 *   Jupiter      – SOL/USD price
 */

import { PoolData } from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const DLMM_API = 'https://dlmm.datapi.meteora.ag';
const DEX_TOKEN_URL = 'https://api.dexscreener.com/tokens/v1/solana';
const HELIUS_URL = 'https://api.helius.xyz/v0/token-metadata';
const JUPITER_PRICE_URL = 'https://api.jup.ag/price/v2';
const DEFAULT_LOGO = '/token.png';
const SOL_PRICE_FALLBACK = 150;
const DEX_BATCH_SIZE = 30;
const HELIUS_BATCH_SIZE = 100;

// ─── Module-level caches (refreshed each cycle) ─────────────────────────────

let priceMap = new Map<string, number>();
let fdvMap = new Map<string, number>();
let holderMap = new Map<string, number>();
let logoMap = new Map<string, string>();
let priceChange1hMap = new Map<string, number>();
let priceChange24hMap = new Map<string, number>();
let volume24hMap = new Map<string, number>();
let fees24hMap = new Map<string, number>();

// ─── Meteora: fetch raw DLMM pools ──────────────────────────────────────────

interface RawMeteorPool {
  address: string;
  token_x: { address: string; symbol: string; market_cap?: number; holders?: number };
  token_y: { address: string; symbol: string; market_cap?: number; holders?: number };
  tvl: number;
  current_price: number;
  fee_tvl_ratio?: Record<string, number>;
  volume?: Record<string, number>;
  fees?: Record<string, number>;
  created_at?: number | string;
  pool_config?: { bin_step?: number; base_fee_pct?: number };
}

async function fetchMeteoraPools(): Promise<RawMeteorPool[]> {
  const res = await fetch(
    `${DLMM_API}/pools?page=1&page_size=100&sort_by=fee_tvl_ratio_30m:desc`
  );
  if (!res.ok) throw new Error(`Meteora API error: ${res.status}`);
  const json = await res.json();
  return json.data ?? [];
}

function filterSOLPairs(pools: RawMeteorPool[]): RawMeteorPool[] {
  return pools.filter((p) => {
    const mintA = p.token_x?.address ?? '';
    const mintB = p.token_y?.address ?? '';
    return mintA === SOL_MINT || mintB === SOL_MINT;
  });
}

function extractNonSOLMints(pools: RawMeteorPool[]): string[] {
  const mints = new Set<string>();
  for (const p of pools) {
    const mintA = p.token_x?.address ?? '';
    const mintB = p.token_y?.address ?? '';
    if (mintA && mintA !== SOL_MINT) mints.add(mintA);
    if (mintB && mintB !== SOL_MINT) mints.add(mintB);
  }
  return [...mints];
}

/** Get the non-SOL/USDC token mint from a pool */
function getTokenMint(mintA: string, mintB: string): string {
  if (mintA === SOL_MINT || mintA === USDC_MINT) return mintB;
  return mintA;
}

// ─── Dexscreener: batch fetch token data ─────────────────────────────────────

async function batchFetchDexscreener(mints: string[]): Promise<void> {
  if (mints.length === 0) return;

  const mintSet = new Set(mints);
  const batches: string[][] = [];
  for (let i = 0; i < mints.length; i += DEX_BATCH_SIZE) {
    batches.push(mints.slice(i, i + DEX_BATCH_SIZE));
  }

  try {
    const responses = await Promise.all(
      batches.map(async (batch) => {
        const url = `${DEX_TOKEN_URL}/${batch.join(',')}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Dexscreener ${res.status}`);
        return res.json();
      })
    );

    for (const data of responses) {
      const pairs: any[] = Array.isArray(data) ? data : [];
      for (const pair of pairs) {
        const baseAddr = pair.baseToken?.address ?? '';
        const quoteAddr = pair.quoteToken?.address ?? '';
        const mint = mintSet.has(baseAddr) ? baseAddr : mintSet.has(quoteAddr) ? quoteAddr : '';
        if (!mint) continue;

        // Take first (highest liquidity) pair per mint
        if (!priceMap.has(mint)) {
          const priceUsd = mint === baseAddr
            ? Number(pair.priceUsd) || 0
            : (Number(pair.priceUsd) > 0 ? 1 / Number(pair.priceUsd) : 0);
          priceMap.set(mint, priceUsd);
        }
        if (!fdvMap.has(mint)) {
          fdvMap.set(mint, Number(pair.fdv) || Number(pair.marketCap) || 0);
        }
        if (!logoMap.has(mint) && pair.info?.imageUrl) {
          logoMap.set(mint, pair.info.imageUrl);
        }

        // Price changes
        const changes = pair.priceChange ?? {};
        if (!priceChange1hMap.has(mint) && changes.h1 != null) {
          priceChange1hMap.set(mint, Number(changes.h1) || 0);
        }
        if (!priceChange24hMap.has(mint) && changes.h24 != null) {
          priceChange24hMap.set(mint, Number(changes.h24) || 0);
        }

        // Volume & fees 24h from DexScreener
        if (!volume24hMap.has(mint) && pair.volume?.h24 != null) {
          volume24hMap.set(mint, Number(pair.volume.h24) || 0);
        }
        // DexScreener doesn't give fees directly; estimate from volume * feeRate if available
      }
    }
  } catch (err) {
    console.warn('Dexscreener batch fetch failed, using Meteora values:', err);
  }
}

// ─── Helius: batch fetch holder counts & logos ───────────────────────────────

async function batchFetchHelius(mints: string[]): Promise<void> {
  if (mints.length === 0) return;

  const apiKey = import.meta.env.VITE_HELIUS_API_KEY;
  if (!apiKey) {
    console.warn('VITE_HELIUS_API_KEY not set, skipping holder enrichment');
    return;
  }

  const batches: string[][] = [];
  for (let i = 0; i < mints.length; i += HELIUS_BATCH_SIZE) {
    batches.push(mints.slice(i, i + HELIUS_BATCH_SIZE));
  }

  try {
    const responses = await Promise.all(
      batches.map(async (batch) => {
        const res = await fetch(`${HELIUS_URL}?api-key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mintAccounts: batch, includeOffChain: true }),
        });
        if (!res.ok) throw new Error(`Helius ${res.status}`);
        return res.json();
      })
    );

    for (const items of responses) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const mint = item.account;
        if (!mint) continue;
        const holders = Number(item.onChainAccountInfo?.tokenAmount?.holders) || 0;
        if (holders > 0) holderMap.set(mint, holders);
        const heliusLogo = item.offChainMetadata?.metadata?.image || item.onChainMetadata?.metadata?.uri;
        if (heliusLogo && !logoMap.has(mint)) logoMap.set(mint, heliusLogo);
      }
    }
  } catch (err) {
    console.warn('Helius batch fetch failed, holders will be 0:', err);
  }
}

// ─── Jupiter: SOL price ──────────────────────────────────────────────────────

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch(`${JUPITER_PRICE_URL}?ids=${SOL_MINT}`);
    if (res.ok) {
      const json = await res.json();
      const price = Number(json.data?.[SOL_MINT]?.price);
      if (price && price > 0) return price;
    }
  } catch { /* continue */ }

  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (res.ok) {
      const json = await res.json();
      const price = Number(json.solana?.usd);
      if (price && price > 0) return price;
    }
  } catch { /* continue */ }

  console.warn('All SOL price APIs failed, using fallback:', SOL_PRICE_FALLBACK);
  return SOL_PRICE_FALLBACK;
}

// ─── Merge & normalize ──────────────────────────────────────────────────────

function mergeAndNormalize(pools: RawMeteorPool[], solPrice: number): PoolData[] {
  return pools.map((p) => {
    const tokenX = p.token_x ?? ({} as any);
    const tokenY = p.token_y ?? ({} as any);
    const mintA = tokenX.address ?? '';
    const mintB = tokenY.address ?? '';
    const nonSolMint = mintA === SOL_MINT ? mintB : mintA;
    const tokenMint = getTokenMint(mintA, mintB);

    // Market cap
    const fdv = fdvMap.get(nonSolMint) ?? 0;
    const meteoraMcap = Number(tokenX.market_cap || 0) + Number(tokenY.market_cap || 0);
    const tvl = Number(p.tvl) || 0;
    const marketCapUsd = fdv || meteoraMcap || tvl || 0;
    const mcSol = solPrice > 0 ? marketCapUsd / solPrice : 0;

    // Holders
    const nonSolToken = mintA === SOL_MINT ? tokenY : tokenX;
    const holders = holderMap.get(nonSolMint) || Number(nonSolToken.holders || 0) || 0;

    // Age
    const rawCreated = p.created_at;
    let createdAtIso: string | null = null;
    let ageMs = 0;
    if (typeof rawCreated === 'number' && rawCreated > 0) {
      const ts = rawCreated > 1e12 ? rawCreated : rawCreated * 1000;
      createdAtIso = new Date(ts).toISOString();
      ageMs = Date.now() - ts;
    } else if (typeof rawCreated === 'string' && rawCreated) {
      createdAtIso = rawCreated;
      ageMs = Date.now() - new Date(rawCreated).getTime();
    }
    if (ageMs < 0) ageMs = 0;

    // Logos
    const logoA = logoMap.get(mintA) || `https://cdn.jsdelivr.net/gh/nicholasgasior/solana-tokens-list/logos/${mintA}.png`;
    const logoB = logoMap.get(mintB) || `https://cdn.jsdelivr.net/gh/nicholasgasior/solana-tokens-list/logos/${mintB}.png`;

    // Price
    const price = priceMap.get(nonSolMint) || Number(p.current_price) || 0;

    // Volume & fees
    const volume30m = Number(p.volume?.['30m']) || 0;
    const fees30m = Number(p.fees?.['30m']) || 0;
    const volume24h = volume24hMap.get(nonSolMint) || Number(p.volume?.['24h']) || 0;
    const fees24h = fees24hMap.get(nonSolMint) || Number(p.fees?.['24h']) || 0;

    // Fee/TVL ratio
    const feeTvlRatio = p.fee_tvl_ratio?.['30m'] != null ? Number(p.fee_tvl_ratio['30m']) : null;

    // Price changes from DexScreener
    const priceChange1h = priceChange1hMap.get(nonSolMint) ?? null;
    const priceChange24h = priceChange24hMap.get(nonSolMint) ?? null;

    return {
      pool_address: p.address ?? '',
      pool_type: 'dlmm' as const,
      token_a_symbol: tokenX.symbol ?? 'Unknown',
      token_b_symbol: tokenY.symbol ?? 'Unknown',
      token_a_mint: mintA,
      token_b_mint: mintB,
      token_mint: tokenMint,
      token_a_logo: logoA,
      token_b_logo: logoB,
      tvl,
      fee_tvl_ratio: feeTvlRatio,
      market_cap: marketCapUsd,
      mc_sol: mcSol,
      volume_delta: volume30m || null,
      fees_delta: fees30m || null,
      volume_30min: volume30m,
      fees_30min: fees30m,
      volume_24h: volume24h,
      fees_24h: fees24h,
      price,
      price_change_1h: priceChange1h,
      price_change_24h: priceChange24h,
      score: null,
      flags: {},
      holders,
      created_at: createdAtIso,
      age_ms: ageMs,
    } satisfies PoolData;
  });
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchDLMMPoolsFull(): Promise<PoolData[]> {
  const rawPools = await fetchMeteoraPools();
  const solPools = filterSOLPairs(rawPools);
  if (solPools.length === 0) return [];

  const mints = extractNonSOLMints(solPools);

  // Clear caches for fresh cycle
  priceMap = new Map();
  fdvMap = new Map();
  holderMap = new Map();
  logoMap = new Map();
  priceChange1hMap = new Map();
  priceChange24hMap = new Map();
  volume24hMap = new Map();
  fees24hMap = new Map();

  const [solPrice] = await Promise.all([
    fetchSolPrice(),
    batchFetchDexscreener(mints),
    batchFetchHelius(mints),
  ]);

  return mergeAndNormalize(solPools, solPrice);
}
