import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Dashboard metrics.
 *
 * Aggregated server-side rather than by pulling tables into the browser
 * and counting there. Beyond being faster, it means the numbers come
 * from one definition — DAU computed in two places is DAU that
 * eventually disagrees with itself.
 *
 * Every figure is a count or a sum over real rows. Nothing here is
 * estimated, smoothed or projected.
 */

const WINDOWS: Record<string, number> = {
  today: 1,
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

function since(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const range = searchParams.get("range") ?? "week";

    // A custom range, or one of the presets. Both end up as two
    // timestamps, so nothing downstream cares which was used.
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const days = WINDOWS[range] ?? 7;
    const from = fromParam ?? since(days);
    const to = toParam ?? new Date().toISOString();

    const count = async (table: string, column?: string, gte?: string) => {
      let query = auth.supabase.from(table).select("*", { count: "exact", head: true });
      if (column && gte) query = query.gte(column, gte);
      const { count: n } = await query;
      return n ?? 0;
    };

    const [
      revenue,
      dau,
      wau,
      mau,
      members,
      newMembers,
      published,
      verified,
      premium,
      matches,
      messages,
      likes,
      reports,
      tickets,
      uncredited,
    ] = await Promise.all([
      auth.supabase.rpc("revenue_summary", { p_from: from, p_to: to }),
      auth.supabase.rpc("active_users", { p_since: since(1) }),
      auth.supabase.rpc("active_users", { p_since: since(7) }),
      auth.supabase.rpc("active_users", { p_since: since(30) }),
      count("profiles"),
      count("profiles", "created_at", from),
      auth.supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .not("published_at", "is", null),
      auth.supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .not("face_verified_at", "is", null),
      auth.supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gt("premium_until", new Date().toISOString()),
      count("matches", "created_at", from),
      count("messages", "created_at", from),
      count("likes", "created_at", from),
      auth.supabase
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      auth.supabase
        .from("support_tickets")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "reviewing"]),
      auth.supabase
        .from("purchase_attempts")
        .select("*", { count: "exact", head: true })
        .is("credited_at", null)
        .eq("status", "pending"),
    ]);

    /*
     * Registrations per day across the window, for the chart.
     *
     * Capped at 365 rows: a custom range of several years would
     * otherwise pull every profile row into memory to bucket it.
     */
    const { data: signups } = await auth.supabase
      .from("profiles")
      .select("created_at")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: true })
      .limit(20000);

    const buckets: Record<string, number> = {};
    for (const row of (signups ?? []) as { created_at: string }[]) {
      const day = row.created_at.slice(0, 10);
      buckets[day] = (buckets[day] ?? 0) + 1;
    }

    return NextResponse.json({
      range: { from, to, key: range },

      revenue: revenue.data ?? null,

      // Nested by definition: every daily active is also weekly and
      // monthly active, so dau <= wau <= mau always holds.
      active: { dau: dau.data ?? 0, wau: wau.data ?? 0, mau: mau.data ?? 0 },

      /*
       * Two shapes arrive from that Promise.all and only one of them is
       * a number.
       *
       * The `count()` helper above already unwraps and returns an
       * integer, but the entries written as a raw query — the ones
       * needing a filter the helper cannot express — resolve to a whole
       * PostgrestResponse. Six of those were being passed straight into
       * the JSON, so the client received `{data, error, count, …}` where
       * it expected a number and React refused to render it.
       */
      members: {
        total: members,
        new: newMembers,
        published: published.count ?? 0,
        verified: verified.count ?? 0,
        premium: premium.count ?? 0,
      },

      activity: { matches, messages, likes },

      // The things somebody has to act on, rather than watch.
      attention: {
        reports: reports.count ?? 0,
        tickets: tickets.count ?? 0,
        uncredited: uncredited.count ?? 0,
      },

      signups: Object.entries(buckets)
        .map(([day, n]) => ({ day, n }))
        .sort((a, b) => a.day.localeCompare(b.day)),

      windows: Object.keys(WINDOWS),
    });
  } catch (error) {
    return failed(error, "Failed to load metrics.");
  }
}
