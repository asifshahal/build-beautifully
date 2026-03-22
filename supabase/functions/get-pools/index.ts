import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ComputedPool {
  pool_address: string;
  pool_type: string;
  token_a_symbol: string;
  token_b_symbol: string;
  token_a_logo: string;
  token_b_logo: string;
  token_a_mint: string;
  token_b_mint: string;
  tvl: number;
  fee_tvl_ratio: number | null;
  market_cap: number;
  volume_30min: number | null;
  fees_30min: number | null;
  price: number;
  price_change_5m: number | null;
  holders: number;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const poolType = url.searchParams.get("type") ?? "dlmm";

  if (poolType !== "dlmm" && poolType !== "damm") {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid pool type" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();

    // Get latest snapshots (last 5 min)
    const { data: latestRows, error: e1 } = await supabase
      .from("pool_snapshots")
      .select("*")
      .eq("pool_type", poolType)
      .gte("timestamp", fiveMinAgo)
      .order("timestamp", { ascending: false });

    if (e1) throw new Error(e1.message);
    if (!latestRows || latestRows.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, pools: [], count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate: keep most recent per pool
    const latestMap = new Map<string, any>();
    for (const row of latestRows) {
      if (!latestMap.has(row.pool_address)) {
        latestMap.set(row.pool_address, row);
      }
    }

    const addresses = Array.from(latestMap.keys());

    // Get ~30min-ago snapshots, ~5min-ago prices, and metadata in parallel
    const [oldResult, prevPriceResult, metaResult] = await Promise.all([
      supabase
        .from("pool_snapshots")
        .select("*")
        .eq("pool_type", poolType)
        .in("pool_address", addresses)
        .lte("timestamp", thirtyMinAgo)
        .order("timestamp", { ascending: false }),
      supabase
        .from("pool_snapshots")
        .select("pool_address, price, timestamp")
        .eq("pool_type", poolType)
        .in("pool_address", addresses)
        .lte("timestamp", fiveMinAgo)
        .order("timestamp", { ascending: false }),
      supabase
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
    for (const m of metaResult.data ?? []) {
      metaMap.set(m.pool_address, m);
    }

    // Compute 30min metrics
    const results: ComputedPool[] = [];
    for (const [addr, nowSnap] of latestMap.entries()) {
      const meta = metaMap.get(addr);
      if (!meta) continue;

      const oldSnap = oldMap.get(addr) ?? null;
      const prevPrice = prevPriceMap.get(addr) ?? null;

      let fees_30min: number | null = null;
      let volume_30min: number | null = null;
      let fee_tvl_ratio: number | null = null;
      let price_change_5m: number | null = null;

      if (oldSnap) {
        const f = nowSnap.fees - oldSnap.fees;
        const v = nowSnap.volume - oldSnap.volume;
        fees_30min = f >= 0 ? f : null;
        volume_30min = v >= 0 ? v : null;
        if (fees_30min !== null && nowSnap.tvl > 0) {
          fee_tvl_ratio = (fees_30min / nowSnap.tvl) * 100;
        }
      }

      if (prevPrice !== null && prevPrice > 0 && nowSnap.price > 0) {
        price_change_5m =
          ((nowSnap.price - prevPrice) / prevPrice) * 100;
      }

      results.push({
        pool_address: nowSnap.pool_address,
        pool_type: meta.pool_type,
        token_a_symbol: meta.token_a_symbol,
        token_b_symbol: meta.token_b_symbol,
        token_a_logo: meta.token_a_logo,
        token_b_logo: meta.token_b_logo,
        token_a_mint: meta.token_a_mint,
        token_b_mint: meta.token_b_mint,
        tvl: nowSnap.tvl,
        fee_tvl_ratio,
        market_cap: meta.market_cap,
        volume_30min,
        fees_30min,
        price: nowSnap.price,
        price_change_5m,
        holders: meta.holders,
        created_at: meta.created_at,
      });
    }

    // Sort by fee_tvl_ratio descending (nulls last)
    results.sort((a, b) => {
      if (a.fee_tvl_ratio === null) return 1;
      if (b.fee_tvl_ratio === null) return -1;
      return b.fee_tvl_ratio - a.fee_tvl_ratio;
    });

    return new Response(
      JSON.stringify({ ok: true, pools: results, count: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message, pools: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
