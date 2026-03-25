import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const VALID_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "24h"];
const VALID_SORTS = [
  "fee_tvl_ratio", "score", "tvl", "volume_delta",
  "fees_delta", "price_change", "market_cap", "holders", "created_at",
];
const VALID_FILTERS = [
  "trending", "new", "risky", "fee_spike", "volume_spike", "high_fee", "stable",
];

// Safe number: never returns null/undefined/NaN
function safeNum(v: any, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const poolType = url.searchParams.get("type") ?? "dlmm";
  const timeframe = url.searchParams.get("timeframe") ?? "30m";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500);
  const sort = url.searchParams.get("sort") ?? "fee_tvl_ratio";
  const filter = url.searchParams.get("filter") ?? null;

  if (poolType !== "dlmm" && poolType !== "damm") {
    return Response.json(
      { ok: false, error: "Invalid pool type" },
      { status: 400, headers: corsHeaders }
    );
  }
  if (!VALID_TIMEFRAMES.includes(timeframe)) {
    return Response.json(
      { ok: false, error: `Invalid timeframe. Use: ${VALID_TIMEFRAMES.join(", ")}` },
      { status: 400, headers: corsHeaders }
    );
  }
  if (!VALID_SORTS.includes(sort)) {
    return Response.json(
      { ok: false, error: `Invalid sort. Use: ${VALID_SORTS.join(", ")}` },
      { status: 400, headers: corsHeaders }
    );
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Fetch summary + meta in parallel
    const [sumResult, metaResult] = await Promise.all([
      db
        .from("pool_summary")
        .select("*")
        .eq("pool_type", poolType)
        .eq("timeframe", timeframe)
        .order(sort, { ascending: false, nullsFirst: false })
        .limit(limit),
      db
        .from("pools_meta")
        .select("*")
        .eq("pool_type", poolType),
    ]);

    if (sumResult.error) throw new Error(sumResult.error.message);

    const summaries = sumResult.data ?? [];
    if (summaries.length === 0) {
      return Response.json(
        { ok: true, pools: [], count: 0, timeframe },
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const metaMap = new Map<string, any>();
    for (const m of metaResult.data ?? []) metaMap.set(m.pool_address, m);

    // Merge + apply fallbacks — every field guaranteed safe
    let pools = summaries.map((s: any) => {
      const meta = metaMap.get(s.pool_address);
      const mc = safeNum(meta?.market_cap) || safeNum(s.tvl);
      const holders = safeNum(meta?.holders);
      const createdAt = meta?.created_at || null;

      return {
        pool_address: s.pool_address,
        pool_type: s.pool_type,
        token_a_symbol: meta?.token_a_symbol ?? "???",
        token_b_symbol: meta?.token_b_symbol ?? "???",
        token_a_logo: meta?.token_a_logo ?? "",
        token_b_logo: meta?.token_b_logo ?? "",
        token_a_mint: meta?.token_a_mint ?? "",
        token_b_mint: meta?.token_b_mint ?? "",
        tvl: safeNum(s.tvl),
        fee_tvl_ratio: safeNum(s.fee_tvl_ratio, null),
        volume_delta: safeNum(s.volume_delta, null),
        fees_delta: safeNum(s.fees_delta, null),
        price: safeNum(s.price),
        price_change: safeNum(s.price_change, null),
        score: safeNum(s.score, null),
        flags: s.flags ?? {},
        market_cap: mc,
        holders: holders,
        created_at: createdAt,
        computed_at: s.computed_at,
      };
    });

    // Apply filter
    if (filter && VALID_FILTERS.includes(filter)) {
      pools = pools.filter((p: any) => {
        switch (filter) {
          case "trending": return p.flags?.trending_up === true;
          case "new": return p.flags?.new_pool === true;
          case "risky": return p.flags?.risky === true;
          case "fee_spike": return p.flags?.fee_spike === true;
          case "volume_spike": return p.flags?.volume_spike === true;
          case "high_fee": return (p.fee_tvl_ratio ?? 0) > 1.0;
          case "stable":
            return (p.fee_tvl_ratio ?? 0) > 0.1 && p.tvl > 10000 &&
              p.holders > 100 && p.flags?.risky !== true;
          default: return true;
        }
      });
    }

    return Response.json(
      { ok: true, pools, count: pools.length, timeframe },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err.message, pools: [] },
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
