import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DLMM_URL =
  "https://dlmm-api.meteora.ag/pair/all_with_pagination?page=0&limit=100&sort_key=volume&order_by=desc";
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
  return {
    address: raw.address ?? raw.pair_address ?? "",
    token_a_symbol: raw.name?.split("-")[0]?.trim() ?? raw.mint_x_symbol ?? "",
    token_b_symbol: raw.name?.split("-")[1]?.trim() ?? raw.mint_y_symbol ?? "",
    token_a_mint: raw.mint_x ?? "",
    token_b_mint: raw.mint_y ?? "",
    tvl: parseFloat(raw.liquidity ?? raw.tvl ?? 0),
    volume: parseFloat(raw.trade_volume_24h ?? raw.volume ?? raw.cumulative_volume ?? 0),
    fees: parseFloat(raw.fees_24h ?? raw.fees ?? raw.cumulative_fee_volume ?? 0),
    price: parseFloat(raw.current_price ?? raw.price ?? 0),
    market_cap: parseFloat(raw.market_cap ?? raw.mc ?? 0),
    holders: parseInt(raw.holders ?? raw.holder_count ?? 0),
    created_at: raw.created_at ?? raw.pool_created_at ?? new Date().toISOString(),
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

// ── Fetch raw pools ────────────────────────────────────────────

async function fetchDLMMPools(): Promise<RawPool[]> {
  const res = await fetchWithRetry(DLMM_URL);
  const data = await res.json();
  const pairs = data.pairs ?? data.data ?? data ?? [];
  return (Array.isArray(pairs) ? pairs : []).map(normalizeDLMM);
}

async function fetchDAMMPools(): Promise<RawPool[]> {
  const res = await fetchWithRetry(DAMM_URL);
  const data = await res.json();
  const pools = data.data ?? data.pools ?? data ?? [];
  return (Array.isArray(pools) ? pools : []).map(normalizeDAMM);
}

// ── Save snapshots + metadata ──────────────────────────────────

async function savePoolData(
  db: ReturnType<typeof createClient>,
  pools: RawPool[],
  poolType: "dlmm" | "damm",
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

  const metas = pools.map((p) => ({
    pool_address: p.address,
    pool_type: poolType,
    token_a_symbol: p.token_a_symbol,
    token_b_symbol: p.token_b_symbol,
    token_a_mint: p.token_a_mint,
    token_b_mint: p.token_b_mint,
    token_a_logo: "",
    token_b_logo: "",
    market_cap: p.market_cap,
    holders: p.holders,
    created_at: p.created_at,
    updated_at: now,
  }));

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
  await db.from("error_logs").insert({ source, message, details: details ?? {} });
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

  // DLMM — isolated, failure won't break DAMM
  try {
    const pools = await fetchDLMMPools();
    const count = await savePoolData(db, pools, "dlmm", runAt);
    totalPools += count;
    results.dlmm = { status: "success", pools_saved: count };
    await logCron(db, runAt, "dlmm", "success", count);
  } catch (err: any) {
    hasFailure = true;
    results.dlmm = { status: "failed", error: err.message };
    await logCron(db, runAt, "dlmm", "failed", 0, err.message);
    await logError(db, "snapshot-cron", `DLMM fetch failed: ${err.message}`);
  }

  // DAMM — isolated
  try {
    const pools = await fetchDAMMPools();
    const count = await savePoolData(db, pools, "damm", runAt);
    totalPools += count;
    results.damm = { status: "success", pools_saved: count };
    await logCron(db, runAt, "damm", "success", count);
  } catch (err: any) {
    hasFailure = true;
    results.damm = { status: "failed", error: err.message };
    await logCron(db, runAt, "damm", "failed", 0, err.message);
    await logError(db, "snapshot-cron", `DAMM fetch failed: ${err.message}`);
  }

  // Cleanup: keep 24h of snapshots
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await db.from("pool_snapshots").delete().lt("timestamp", cutoff);
    results.cleanup = "success";
  } catch {
    results.cleanup = "failed";
  }

  // Cleanup old error logs (>7 days)
  try {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.from("error_logs").delete().lt("created_at", cutoff);
  } catch { /* non-critical */ }

  // Update system status
  await updateSystemStatus(
    db,
    hasFailure ? "degraded" : "ok",
    totalPools,
    hasFailure ? "Partial fetch failure" : undefined
  );

  return new Response(
    JSON.stringify({ ok: true, run_at: runAt, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
