import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const [statusResult, cronResult, snapshotCount, summaryCount] =
      await Promise.all([
        db.from("system_status").select("*"),
        db
          .from("cron_logs")
          .select("*")
          .order("run_at", { ascending: false })
          .limit(5),
        db
          .from("pool_snapshots")
          .select("id", { count: "exact", head: true }),
        db
          .from("pool_summary")
          .select("id", { count: "exact", head: true }),
      ]);

    const components: Record<string, any> = {};
    for (const s of statusResult.data ?? []) {
      components[s.component] = {
        status: s.status,
        last_success: s.last_success,
        last_error: s.last_error,
        pool_count: s.pool_count,
        updated_at: s.updated_at,
      };
    }

    const overallStatus =
      Object.values(components).every((c: any) => c.status === "ok")
        ? "healthy"
        : Object.values(components).some((c: any) => c.status === "down")
        ? "down"
        : "degraded";

    return Response.json(
      {
        ok: true,
        status: overallStatus,
        components,
        counts: {
          snapshots: snapshotCount.count ?? 0,
          summaries: summaryCount.count ?? 0,
        },
        recent_cron_runs: (cronResult.data ?? []).map((r: any) => ({
          run_at: r.run_at,
          pool_type: r.pool_type,
          status: r.status,
          pools_saved: r.pools_saved,
        })),
        checked_at: new Date().toISOString(),
      },
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, status: "error", error: err.message },
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
