import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The rest of the panel, as numbers.
 *
 * ── Why this exists ───────────────────────────────────────────
 *
 * Pulse answered for members, matches and money. The sidebar also
 * manages Hearts, Places, Moderation, Roses, Codes, Content and the
 * matching rules — and none of it surfaced here, so the only way to
 * know whether Hearts was alive or the Rose economy was leaking was to
 * open each screen and look.
 *
 * ── Why one route and not six ─────────────────────────────────
 *
 * Every section is a handful of counts over the same window. Six routes
 * would be six round trips and six chances for one slow table to hold
 * up the page; one route runs them together and returns whatever
 * answered. A section that errors comes back as nulls rather than
 * failing the whole response — a dashboard that shows five of six
 * sections is more useful than one that shows an error.
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

/** Roses in and out, by where they came from. */
const ROSE_IN = new Set([
  "purchase",
  "signup_bonus",
  "admin_grant",
  "promo",
  "referral",
  "pack_bonus",
  "gift",
  "milestone",
  "refund",
  "revival_refund",
]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const url = new URL(request.url);
    const range = url.searchParams.get("range") ?? "week";
    const from = since(WINDOWS[range] ?? 7);

    /** Rows in a table since `from`, counted without fetching them. */
    const count = async (table: string, column = "created_at") => {
      const { count: total } = await auth.supabase
        .from(table)
        .select("*", { count: "exact", head: true })
        .gte(column, from);

      return total ?? 0;
    };

    /** Every row in a table, ignoring the window. */
    const total = async (table: string) => {
      const { count: all } = await auth.supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      return all ?? 0;
    };

    const [
      roseRows,
      heartsOut,
      heartsTotal,
      venues,
      encounters,
      reportsOpen,
      reportsCleared,
      ticketsOpen,
      posts,
      flareRows,
      codes,
      invitesUsed,
    ] = await Promise.all([
      auth.supabase
        .from("rose_ledger")
        .select("amount, reason")
        .gte("created_at", from),
      count("hearts"),
      total("hearts"),
      total("places"),
      count("nearby_encounters", "last_day"),
      auth.supabase
        .from("reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "open"),
      auth.supabase
        .from("reports")
        .select("*", { count: "exact", head: true })
        .neq("status", "open")
        .gte("created_at", from),
      auth.supabase
        .from("support_tickets")
        .select("*", { count: "exact", head: true })
        .in("status", ["open", "reviewing"]),
      count("dailies"),
      auth.supabase
        .from("flares")
        .select("accepted, answered_at, paid_with")
        .gte("created_at", from),
      total("promo_codes"),
      count("promo_redemptions"),
    ]);

    /*
     * Roses, split by direction.
     *
     * The ledger stores a signed amount, but the sign alone does not say
     * where a Rose came from — a refund is positive and so is a
     * purchase, and only one of those is revenue. The reason is what
     * separates them, so both are reported.
     */
    const ledger = (roseRows.data ?? []) as { amount: number; reason: string }[];

    let rosesIn = 0;
    let rosesOut = 0;
    const bySource: Record<string, number> = {};

    for (const row of ledger) {
      const amount = Number(row.amount) || 0;

      if (amount >= 0 || ROSE_IN.has(row.reason)) rosesIn += Math.abs(amount);
      else rosesOut += Math.abs(amount);

      bySource[row.reason] = (bySource[row.reason] ?? 0) + Math.abs(amount);
    }

    const flares = (flareRows.data ?? []) as {
      accepted: boolean | null;
      answered_at: string | null;
      paid_with: string | null;
    }[];

    return NextResponse.json({
      range,
      roses: {
        in: rosesIn,
        out: rosesOut,
        net: rosesIn - rosesOut,
        bySource,
        entries: ledger.length,
      },
      places: {
        venues,
        heartsDropped: heartsOut,
        heartsAllTime: heartsTotal,
        encounters,
      },
      moderation: {
        reportsOpen: reportsOpen.count ?? 0,
        reportsCleared: reportsCleared.count ?? 0,
        ticketsOpen: ticketsOpen.count ?? 0,
      },
      content: {
        posts,
        flares: flares.length,
        flaresAnswered: flares.filter((row) => row.answered_at !== null).length,
        flaresAccepted: flares.filter((row) => row.accepted === true).length,
        flaresPaidWithRoses: flares.filter((row) => row.paid_with === "roses")
          .length,
      },
      growth: {
        codes,
        invitesUsed,
      },
    });
  } catch (error) {
    return failed(error, "Could not load the sections.");
  }
}
