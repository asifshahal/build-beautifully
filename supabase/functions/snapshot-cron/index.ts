import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DLMM_URL =
  "https://dlmm.datapi.meteora.ag/pools?page=1&page_size=100&sort_by=fee_tvl_ratio_30m:desc";
const DAMM_URL =
  "https://dammv2-api.meteora.ag/pools?page=0&limit=100&sort_by=tvl&order=desc";

// ── Fetch helpers ──────────────────────────────────────────────

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("All retries failed");
}

interface RawPool {
  address: string;
  token_a_symbol: string;
  token_b_symbol: string;
  token_a_mint: string;
  token_b_mint: string;
  tvl: number;
  volume: number;
  fees: number;
  price: number;
  market_cap: number;
  holders: number;
  created_at: string;
}

function normalizeDLMM(raw: any): RawPool {
  const tokenX = raw.token_x ?? {};
  const tokenY = raw.token_y ?? {};
  const createdAt =
    typeof raw.created_at === "number"
      ? new Date(raw.created_at * 1000).toISOString()
      : raw.created_at;

  return {
    address: raw.address ?? "",
    token_a_symbol: tokenX.symbol ?? raw.name?.split("-")[0]?.trim() ?? "",
    token_b_symbol: tokenY.symbol ?? raw.name?.split("-")[1]?.trim() ?? "",
    token_a_mint: tokenX.address ?? "",
    token_b_mint: tokenY.address ?? "",
    tvl: parseFloat(raw.tvl ?? 0),
    volume: parseFloat(raw.volume?.["30m"] ?? raw.volume?.["24h"] ?? 0),
    fees: parseFloat(raw.fees?.["30m"] ?? raw.fees?.["24h"] ?? 0),
    price: parseFloat(raw.current_price ?? 0),
    market_cap: parseFloat(
      (tokenX.market_cap ?? 0) + (tokenY.market_cap ?? 0)
    ),
    holders: parseInt(
      String(Math.max(tokenX.holders ?? 0, tokenY.holders ?? 0))
    ),
    created_at: createdAt ?? new Date().toISOString(),
  };
}

function normalizeDAMM(raw: any): RawPool {
  const createdTs = raw.created_at_slot_timestamp
    ? new Date(raw.created_at_slot_timestamp * 1000).toISOString()
    : raw.created_at ?? new Date().toISOString();
  return {
    address: raw.pool_address ?? raw.address ?? "",
    token_a_symbol: raw.token_a_symbol ?? "",
    token_b_symbol: raw.token_b_symbol ?? "",
    token_a_mint: raw.token_a_mint ?? "",
    token_b_mint: raw.token_b_mint ?? "",
    tvl: parseFloat(raw.tvl ?? 0),
    volume: parseFloat(raw.volume24h ?? raw.trading_volume ?? 0),
    fees: parseFloat(raw.fee24h ?? raw.trading_fee ?? 0),
    price: parseFloat(raw.pool_price ?? raw.current_price ?? 0),
    market_cap: 0,
    holders: 0,
    created_at: createdTs,
  };
}

// ── Batch DexScreener fetch ────────────────────────────────────

interface DexEnrichment {
  fdv: number;
  marketCap: number;
  priceUsd: number;
  imageUrl: string;
  pairCreatedAt: string | null;
}

async function batchFetchDexScreener(
  mints: string[]
): Promise<Map<string, DexEnrichment>> {
  const map = new Map<string, DexEnrichment>();
  if (mints.length === 0) return map;

  // DexScreener supports up to 30 addresses per call
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += 30) {
    chunks.push(mints.slice(i, i + 30));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const url = `https://api.dexscreener.com/latest/dex/tokens/${chunk.join(",")}`;
        const res = await fetchWithRetry(url);
        const data = await res.json();
        const pairs = data.pairs ?? [];
        for (const pair of pairs) {
          const base = pair.baseToken?.address;
          const quote = pair.quoteToken?.address;
          for (const addr of [base, quote]) {
            if (addr && !map.has(addr)) {
              map.set(addr, {
                fdv: parseFloat(pair.fdv ?? 0),
                marketCap: parseFloat(pair.marketCap ?? 0),
                priceUsd: parseFloat(pair.priceUsd ?? 0),
                imageUrl: pair.info?.imageUrl ?? "",
                pairCreatedAt: pair.pairCreatedAt
                  ? new Date(pair.pairCreatedAt).toISOString()
                  : null,
              });
            }
          }
        }
      } catch (err) {
        console.warn("DexScreener batch failed for chunk:", err);
      }
    })
  );

  return map;
}

// ── Extract unique mints ───────────────────────────────────────

function extractUniqueMints(pools: RawPool[]): string[] {
  const set = new Set<string>();
  for (const p of pools) {
    if (p.token_a_mint) set.add(p.token_a_mint);
    if (p.token_b_mint) set.add(p.token_b_mint);
  }
  return Array.from(set);
}

// ── Save enriched data ─────────────────────────────────────────

async function savePoolData(
  db: ReturnType<typeof createClient>,
  pools: RawPool[],
  poolType: "dlmm" | "damm",
  dexMap: Map<string, DexEnrichment>,
  now: string
) {
  const snapshots = pools.map((p) => ({
    pool_address: p.address,
    pool_type: poolType,
    tvl: p.tvl,
    volume: p.volume,
    fees: p.fees,
    price: p.price,
    timestamp: now,
  }));

  const { error: snapErr } = await db.from("pool_snapshots").insert(snapshots);
  if (snapErr) throw new Error(`Snapshot insert: ${snapErr.message}`);

  const metas = pools.map((p) => {
    const dexA = dexMap.get(p.token_a_mint);
    const dexB = dexMap.get(p.token_b_mint);
    // Use whichever token has better data (non-SOL token usually)
    const dex = dexA?.fdv ? dexA : dexB?.fdv ? dexB : dexA ?? dexB;

    const marketCap = dex?.fdv || dex?.marketCap || p.market_cap || p.tvl || 0;
    const holders = p.holders || 0;
    const logoA = dexA?.imageUrl || "";
    const logoB = dexB?.imageUrl || "";
    const createdAt =
      dex?.pairCreatedAt || p.created_at || new Date().toISOString();

    return {
      pool_address: p.address,
      pool_type: poolType,
      token_a_symbol: p.token_a_symbol,
      token_b_symbol: p.token_b_symbol,
      token_a_mint: p.token_a_mint,
      token_b_mint: p.token_b_mint,
      token_a_logo: logoA,
      token_b_logo: logoB,
      market_cap: marketCap,
      holders: holders,
      created_at: createdAt,
      updated_at: now,
    };
  });

  const { error: metaErr } = await db
    .from("pools_meta")
    .upsert(metas, { onConflict: "pool_address" });
  if (metaErr) throw new Error(`Meta upsert: ${metaErr.message}`);

  return pools.length;
}

// ── Logging helpers ────────────────────────────────────────────

async function logCron(
  db: ReturnType<typeof createClient>,
  runAt: string,
  poolType: string,
  status: "success" | "failed",
  poolsSaved: number,
  errorMessage?: string
) {
  await db.from("cron_logs").insert({
    run_at: runAt,
    pool_type: poolType,
    status,
    pools_saved: poolsSaved,
    error_message: errorMessage ?? null,
  });
}

async function logError(
  db: ReturnType<typeof createClient>,
  source: string,
  message: string,
  details?: Record<string, unknown>
) {
  await db
    .from("error_logs")
    .insert({ source, message, details: details ?? {} });
}

async function updateSystemStatus(
  db: ReturnType<typeof createClient>,
  status: "ok" | "degraded" | "down",
  poolCount: number,
  lastError?: string
) {
  await db.from("system_status").upsert(
    {
      component: "snapshot-cron",
      status,
      last_success: status === "ok" ? new Date().toISOString() : undefined,
      last_error: lastError ?? null,
      pool_count: poolCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "component" }
  );
}

// ── Main handler ───────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Record<string, unknown> = {};
  const runAt = new Date().toISOString();
  let totalPools = 0;
  let hasFailure = false;

  // Fetch both pool types in parallel
  const [dlmmResult, dammResult] = await Promise.allSettled([
    fetchDLMMPools(),
    fetchDAMMPools(),
  ]);

  const dlmmPools =
    dlmmResult.status === "fulfilled" ? dlmmResult.value : [];
  const dammPools =
    dammResult.status === "fulfilled" ? dammResult.value : [];

  // Extract all unique mints and batch-fetch DexScreener once
  const allMints = extractUniqueMints([...dlmmPools, ...dammPools]);
  const dexMap = await batchFetchDexScreener(allMints);

  // Save DLMM
  if (dlmmResult.status === "fulfilled") {
    try {
      const count = await savePoolData(db, dlmmPools, "dlmm", dexMap, runAt);
      totalPools += count;
      results.dlmm = { status: "success", pools_saved: count };
      await logCron(db, runAt, "dlmm", "success", count);
    } catch (err: any) {
      hasFailure = true;
      results.dlmm = { status: "failed", error: err.message };
      await logCron(db, runAt, "dlmm", "failed", 0, err.message);
      await logError(db, "snapshot-cron", `DLMM save failed: ${err.message}`);
    }
  } else {
    hasFailure = true;
    const msg = (dlmmResult as PromiseRejectedResult).reason?.message ?? "unknown";
    results.dlmm = { status: "failed", error: msg };
    await logCron(db, runAt, "dlmm", "failed", 0, msg);
    await logError(db, "snapshot-cron", `DLMM fetch failed: ${msg}`);
  }

  // Save DAMM
  if (dammResult.status === "fulfilled") {
    try {
      const count = await savePoolData(db, dammPools, "damm", dexMap, runAt);
      totalPools += count;
      results.damm = { status: "success", pools_saved: count };
      await logCron(db, runAt, "damm", "success", count);
    } catch (err: any) {
      hasFailure = true;
      results.damm = { status: "failed", error: err.message };
      await logCron(db, runAt, "damm", "failed", 0, err.message);
      await logError(db, "snapshot-cron", `DAMM save failed: ${err.message}`);
    }
  } else {
    hasFailure = true;
    const msg = (dammResult as PromiseRejectedResult).reason?.message ?? "unknown";
    results.damm = { status: "failed", error: msg };
    await logCron(db, runAt, "damm", "failed", 0, msg);
    await logError(db, "snapshot-cron", `DAMM fetch failed: ${msg}`);
  }

  // Cleanup old data in parallel
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();
  await Promise.allSettled([
    db.from("pool_snapshots").delete().lt("timestamp", cutoff24h),
    db.from("error_logs").delete().lt("created_at", cutoff7d),
  ]);

  await updateSystemStatus(
    db,
    hasFailure ? "degraded" : "ok",
    totalPools,
    hasFailure ? "Partial fetch failure" : undefined
  );

  return new Response(
    JSON.stringify({ ok: true, run_at: runAt, results, dex_mints: allMints.length }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});

// ── Pool fetchers ──────────────────────────────────────────────

async function fetchDLMMPools(): Promise<RawPool[]> {
  const res = await fetchWithRetry(DLMM_URL);
  const data = await res.json();
  const pools = data.data ?? [];
  return (Array.isArray(pools) ? pools : []).map(normalizeDLMM);
}

async function fetchDAMMPools(): Promise<RawPool[]> {
  const res = await fetchWithRetry(DAMM_URL);
  const data = await res.json();
  const pools = data.data ?? data.pools ?? data ?? [];
  return (Array.isArray(pools) ? pools : []).map(normalizeDAMM);
}
