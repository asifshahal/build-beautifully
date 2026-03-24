import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Timeframe definitions in minutes
const TIMEFRAMES: Record<string, number> = {
  "5m": 5,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "4h": 240,
  "24h": 1440,
};

// ── Scoring ────────────────────────────────────────────────────

function computeScore(
  feeTvlRatio: number | null,
  volumeDelta: number | null,
  tvl: number,
  holders: number,
  ageHours: number
): number {
  const feeScore = Math.min((feeTvlRatio ?? 0) * 10, 40);
  const volScore = Math.min(Math.log10(Math.max(volumeDelta ?? 0, 1)) * 3, 20);
  const tvlScore = Math.min(Math.log10(Math.max(tvl, 1)) * 3, 15);
  const holderScore = Math.min(Math.log10(Math.max(holders, 1)) * 5, 15);

  // Age weight: newer pools get slight boost, very new pools penalized
  let ageWeight = 1.0;
  if (ageHours < 1) ageWeight = 0.7; // too new, risky
  else if (ageHours < 24) ageWeight = 1.2; // sweet spot
  else if (ageHours < 168) ageWeight = 1.0; // normal
  else ageWeight = 0.9; // old, less exciting

  return (feeScore + volScore + tvlScore + holderScore) * ageWeight;
}

// ── Flag detection ─────────────────────────────────────────────

interface PoolFlags {
  trending_up: boolean;
  fee_spike: boolean;
  volume_spike: boolean;
  new_pool: boolean;
  risky: boolean;
}

function detectFlags(
  feeTvlRatio: number | null,
  volumeDelta: number | null,
  tvl: number,
  holders: number,
  ageHours: number,
  priceChange: number | null
): PoolFlags {
  return {
    trending_up: (priceChange ?? 0) > 5 && (feeTvlRatio ?? 0) > 0.5,
    fee_spike: (feeTvlRatio ?? 0) > 2.0,
    volume_spike: (volumeDelta ?? 0) > 50000,
    new_pool: ageHours < 24,
    risky:
      holders < 50 ||
      (ageHours < 2 && (feeTvlRatio ?? 0) > 3) ||
      tvl < 1000,
  };
}

// ── Main processing ────────────────────────────────────────────

async function processTimeframe(
  db: ReturnType<typeof createClient>,
  poolType: "dlmm" | "damm",
  timeframe: string,
  minutes: number
) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - minutes * 60 * 1000).toISOString();
  const recentCutoff = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

  // Latest snapshots (within last 5 min)
  const { data: latestRows, error: e1 } = await db
    .from("pool_snapshots")
    .select("*")
    .eq("pool_type", poolType)
    .gte("timestamp", recentCutoff)
    .order("timestamp", { ascending: false });

  if (e1) throw new Error(e1.message);
  if (!latestRows || latestRows.length === 0) return 0;

  // Deduplicate: most recent per pool
  const latestMap = new Map<string, any>();
  for (const row of latestRows) {
    if (!latestMap.has(row.pool_address)) latestMap.set(row.pool_address, row);
  }

  const addresses = Array.from(latestMap.keys());

  // Older snapshots + metadata in parallel
  const [oldResult, prevPriceResult, metaResult] = await Promise.all([
    db
      .from("pool_snapshots")
      .select("*")
      .eq("pool_type", poolType)
      .in("pool_address", addresses)
      .lte("timestamp", cutoff)
      .order("timestamp", { ascending: false }),
    db
      .from("pool_snapshots")
      .select("pool_address, price, timestamp")
      .eq("pool_type", poolType)
      .in("pool_address", addresses)
      .lte("timestamp", recentCutoff)
      .order("timestamp", { ascending: false }),
    db
      .from("pools_meta")
      .select("*")
      .eq("pool_type", poolType)
      .in("pool_address", addresses),
  ]);

  // Build lookup maps
  const oldMap = new Map<string, any>();
  for (const row of oldResult.data ?? []) {
    if (!oldMap.has(row.pool_address)) oldMap.set(row.pool_address, row);
  }

  const prevPriceMap = new Map<string, number>();
  for (const row of prevPriceResult.data ?? []) {
    if (!prevPriceMap.has(row.pool_address))
      prevPriceMap.set(row.pool_address, row.price);
  }

  const metaMap = new Map<string, any>();
  for (const m of metaResult.data ?? []) metaMap.set(m.pool_address, m);

  // Compute summaries
  const summaries: any[] = [];
  const computedAt = now.toISOString();

  for (const [addr, nowSnap] of latestMap.entries()) {
    const meta = metaMap.get(addr);
    if (!meta) continue;

    const oldSnap = oldMap.get(addr) ?? null;
    const prevPrice = prevPriceMap.get(addr) ?? null;

    let feesDelta: number | null = null;
    let volumeDelta: number | null = null;
    let feeTvlRatio: number | null = null;
    let priceChange: number | null = null;

    if (oldSnap) {
      const f = nowSnap.fees - oldSnap.fees;
      const v = nowSnap.volume - oldSnap.volume;
      feesDelta = f >= 0 ? f : null;
      volumeDelta = v >= 0 ? v : null;
      if (feesDelta !== null && nowSnap.tvl > 0) {
        feeTvlRatio = (feesDelta / nowSnap.tvl) * 100;
      }
    }

    if (prevPrice !== null && prevPrice > 0 && nowSnap.price > 0) {
      priceChange = ((nowSnap.price - prevPrice) / prevPrice) * 100;
    }

    const ageHours = meta.created_at
      ? (Date.now() - new Date(meta.created_at).getTime()) / 3600000
      : 999;

    const score = computeScore(
      feeTvlRatio,
      volumeDelta,
      nowSnap.tvl,
      meta.holders,
      ageHours
    );

    const flags = detectFlags(
      feeTvlRatio,
      volumeDelta,
      nowSnap.tvl,
      meta.holders,
      ageHours,
      priceChange
    );

    summaries.push({
      pool_address: addr,
      pool_type: poolType,
      timeframe,
      tvl: nowSnap.tvl,
      volume_delta: volumeDelta,
      fees_delta: feesDelta,
      fee_tvl_ratio: feeTvlRatio,
      price: nowSnap.price,
      price_change: priceChange,
      score,
      flags,
      computed_at: computedAt,
    });
  }

  if (summaries.length > 0) {
    const { error } = await db
      .from("pool_summary")
      .upsert(summaries, { onConflict: "pool_address,timeframe" });
    if (error) throw new Error(`Summary upsert: ${error.message}`);
  }

  return summaries.length;
}

// ── Handler ────────────────────────────────────────────────────

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
  let hasFailure = false;

  for (const poolType of ["dlmm", "damm"] as const) {
    for (const [tf, minutes] of Object.entries(TIMEFRAMES)) {
      const key = `${poolType}_${tf}`;
      try {
        const count = await processTimeframe(db, poolType, tf, minutes);
        results[key] = { status: "success", pools: count };
      } catch (err: any) {
        hasFailure = true;
        results[key] = { status: "failed", error: err.message };
        await db.from("error_logs").insert({
          source: "process-cron",
          message: `${key}: ${err.message}`,
        });
      }
    }
  }

  // Update system status
  await db.from("system_status").upsert(
    {
      component: "process-cron",
      status: hasFailure ? "degraded" : "ok",
      last_success: hasFailure ? undefined : runAt,
      last_error: hasFailure ? "Partial processing failure" : null,
      updated_at: runAt,
    },
    { onConflict: "component" }
  );

  // Log
  await db.from("cron_logs").insert({
    run_at: runAt,
    pool_type: "dlmm",
    status: hasFailure ? "failed" : "success",
    pools_saved: 0,
    error_message: hasFailure ? "process-cron partial failure" : null,
  });

  return new Response(
    JSON.stringify({ ok: true, run_at: runAt, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
