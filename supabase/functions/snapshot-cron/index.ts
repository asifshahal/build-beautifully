import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const DLMM_URL = "https://dlmm-api.meteora.ag/pair/all_with_pagination?page=0&limit=100&sort_key=volume&order_by=desc";
const DAMM_URL = "https://dammv2-api.meteora.ag/pools?page=0&limit=100&sort_by=tvl&order=desc";

interface MeteoraPool {
  address: string;
  token_a_symbol: string;
  token_b_symbol: string;
  token_a_mint: string;
  token_b_mint: string;
  token_a_logo: string;
  token_b_logo: string;
  tvl: number;
  volume: number;
  fees: number;
  price: number;
  market_cap: number;
  holders: number;
  created_at: string;
}

function normalizeDLMM(raw: any): MeteoraPool {
  return {
    address: raw.address ?? raw.pair_address ?? "",
    token_a_symbol: raw.name?.split("-")[0]?.trim() ?? raw.mint_x_symbol ?? "",
    token_b_symbol: raw.name?.split("-")[1]?.trim() ?? raw.mint_y_symbol ?? "",
    token_a_mint: raw.mint_x ?? "",
    token_b_mint: raw.mint_y ?? "",
    token_a_logo: "",
    token_b_logo: "",
    tvl: parseFloat(raw.liquidity ?? raw.tvl ?? 0),
    volume: parseFloat(raw.trade_volume_24h ?? raw.volume ?? raw.cumulative_volume ?? 0),
    fees: parseFloat(raw.fees_24h ?? raw.fees ?? raw.cumulative_fee_volume ?? 0),
    price: parseFloat(raw.current_price ?? raw.price ?? 0),
    market_cap: parseFloat(raw.market_cap ?? raw.mc ?? 0),
    holders: parseInt(raw.holders ?? raw.holder_count ?? 0),
    created_at: raw.created_at ?? raw.pool_created_at ?? new Date().toISOString(),
  };
}

function normalizeDAMM(raw: any): MeteoraPool {
  // dammv2-api fields: pool_address, pool_name, token_a_symbol, token_b_symbol,
  // token_a_mint, token_b_mint, tvl, volume24h, fee24h, pool_price,
  // created_at_slot_timestamp
  const createdTs = raw.created_at_slot_timestamp
    ? new Date(raw.created_at_slot_timestamp * 1000).toISOString()
    : raw.created_at ?? new Date().toISOString();
  return {
    address: raw.pool_address ?? raw.address ?? "",
    token_a_symbol: raw.token_a_symbol ?? "",
    token_b_symbol: raw.token_b_symbol ?? "",
    token_a_mint: raw.token_a_mint ?? "",
    token_b_mint: raw.token_b_mint ?? "",
    token_a_logo: "",
    token_b_logo: "",
    tvl: parseFloat(raw.tvl ?? 0),
    volume: parseFloat(raw.volume24h ?? raw.trading_volume ?? 0),
    fees: parseFloat(raw.fee24h ?? raw.trading_fee ?? 0),
    price: parseFloat(raw.pool_price ?? raw.current_price ?? 0),
    market_cap: 0,
    holders: 0,
    created_at: createdTs,
  };
}

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) return res;
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error("All retries failed");
}

async function fetchDLMMPools(): Promise<MeteoraPool[]> {
  const res = await fetchWithRetry(DLMM_URL);
  const data = await res.json();
  const pairs = data.pairs ?? data.data ?? data ?? [];
  return (Array.isArray(pairs) ? pairs : []).map((p: any) => normalizeDLMM(p));
}

async function fetchDAMMPools(): Promise<MeteoraPool[]> {
  const res = await fetchWithRetry(DAMM_URL);
  const data = await res.json();
  const pools = data.data ?? data.pools ?? data ?? [];
  return (Array.isArray(pools) ? pools : []).map((p: any) => normalizeDAMM(p));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret
  const url = new URL(req.url);
  const secret =
    req.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret && secret !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const results: Record<string, any> = {};
  const runAt = new Date().toISOString();

  // Fetch and save DLMM pools
  try {
    const pools = await fetchDLMMPools();
    const now = new Date().toISOString();

    const snapshots = pools.map((p) => ({
      pool_address: p.address,
      pool_type: "dlmm",
      tvl: p.tvl,
      volume: p.volume,
      fees: p.fees,
      price: p.price,
      timestamp: now,
    }));

    const { error: snapErr } = await supabaseAdmin
      .from("pool_snapshots")
      .insert(snapshots);
    if (snapErr) throw new Error(`Snapshot insert: ${snapErr.message}`);

    const metas = pools.map((p) => ({
      pool_address: p.address,
      pool_type: "dlmm",
      token_a_symbol: p.token_a_symbol,
      token_b_symbol: p.token_b_symbol,
      token_a_mint: p.token_a_mint,
      token_b_mint: p.token_b_mint,
      token_a_logo: p.token_a_logo,
      token_b_logo: p.token_b_logo,
      market_cap: p.market_cap,
      holders: p.holders,
      created_at: p.created_at,
      updated_at: now,
    }));

    const { error: metaErr } = await supabaseAdmin
      .from("pools_meta")
      .upsert(metas, { onConflict: "pool_address" });
    if (metaErr) throw new Error(`Meta upsert: ${metaErr.message}`);

    results.dlmm = { status: "success", pools_saved: pools.length };
    await supabaseAdmin.from("cron_logs").insert({
      run_at: runAt,
      pool_type: "dlmm",
      status: "success",
      pools_saved: pools.length,
    });
  } catch (err: any) {
    results.dlmm = { status: "failed", error: err.message };
    await supabaseAdmin.from("cron_logs").insert({
      run_at: runAt,
      pool_type: "dlmm",
      status: "failed",
      pools_saved: 0,
      error_message: err.message,
    });
  }

  // Fetch and save DAMM pools
  try {
    const pools = await fetchDAMMPools();
    const now = new Date().toISOString();

    const snapshots = pools.map((p) => ({
      pool_address: p.address,
      pool_type: "damm",
      tvl: p.tvl,
      volume: p.volume,
      fees: p.fees,
      price: p.price,
      timestamp: now,
    }));

    const { error: snapErr } = await supabaseAdmin
      .from("pool_snapshots")
      .insert(snapshots);
    if (snapErr) throw new Error(`Snapshot insert: ${snapErr.message}`);

    const metas = pools.map((p) => ({
      pool_address: p.address,
      pool_type: "damm",
      token_a_symbol: p.token_a_symbol,
      token_b_symbol: p.token_b_symbol,
      token_a_mint: p.token_a_mint,
      token_b_mint: p.token_b_mint,
      token_a_logo: p.token_a_logo,
      token_b_logo: p.token_b_logo,
      market_cap: p.market_cap,
      holders: p.holders,
      created_at: p.created_at,
      updated_at: now,
    }));

    const { error: metaErr } = await supabaseAdmin
      .from("pools_meta")
      .upsert(metas, { onConflict: "pool_address" });
    if (metaErr) throw new Error(`Meta upsert: ${metaErr.message}`);

    results.damm = { status: "success", pools_saved: pools.length };
    await supabaseAdmin.from("cron_logs").insert({
      run_at: runAt,
      pool_type: "damm",
      status: "success",
      pools_saved: pools.length,
    });
  } catch (err: any) {
    results.damm = { status: "failed", error: err.message };
    await supabaseAdmin.from("cron_logs").insert({
      run_at: runAt,
      pool_type: "damm",
      status: "failed",
      pools_saved: 0,
      error_message: err.message,
    });
  }

  // Cleanup old snapshots (>2 hours)
  try {
    const twoHoursAgo = new Date(
      Date.now() - 2 * 60 * 60 * 1000
    ).toISOString();
    await supabaseAdmin
      .from("pool_snapshots")
      .delete()
      .lt("timestamp", twoHoursAgo);
    results.cleanup = "success";
  } catch {
    results.cleanup = "failed";
  }

  return new Response(
    JSON.stringify({ ok: true, run_at: runAt, results }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
