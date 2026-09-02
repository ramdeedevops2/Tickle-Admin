import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Roses — the currency, granted and audited.
 *
 * Roses are bought with real money, so two things follow. Support has to be
 * able to make somebody whole after a failed purchase, and every movement
 * has to be attributable afterwards — a currency with no audit trail is one
 * where "my roses vanished" cannot be answered either way.
 *
 * Not to be confused with Hearts, which are the things left at venues.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;
    const userId = new URL(request.url).searchParams.get("user_id");

    // One person's ledger, for a support conversation about their balance.
    if (userId) {
      const [profileRes, ledgerRes] = await Promise.all([
        supabase.from("profiles").select("user_id, name, roses").eq("user_id", userId).single(),
        supabase
          .from("rose_ledger")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (profileRes.error) throw profileRes.error;

      return NextResponse.json({
        profile: profileRes.data,
        ledger: ledgerRes.data ?? [],
      });
    }

    const [ledgerRes, superRes] = await Promise.all([
      supabase.from("rose_ledger").select("amount, reason").limit(50000),
      supabase.from("super_likes").select("paid_with, note").limit(50000),
    ]);

    const ledger = (ledgerRes.data ?? []) as { amount: number; reason: string }[];
    const supers = (superRes.data ?? []) as { paid_with: string; note: string | null }[];

    const byReason = new Map<string, { count: number; total: number }>();
    for (const row of ledger) {
      const entry = byReason.get(row.reason) ?? { count: 0, total: 0 };
      entry.count += 1;
      entry.total += row.amount;
      byReason.set(row.reason, entry);
    }

    return NextResponse.json({
      movements: ledger.length,
      byReason: Object.fromEntries(byReason),
      superLikes: {
        total: supers.length,
        paidWithRoses: supers.filter((row) => row.paid_with === "roses").length,
        // The number that says whether the note is worth having: a Super
        // Like with a sentence is a different product from one without.
        withNote: supers.filter((row) => (row.note ?? "").trim().length > 0).length,
      },
    });
  } catch (error) {
    return failed(error, "Failed to load rose data.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as { user_id?: string; amount?: number };

    if (!body.user_id || !Number.isFinite(Number(body.amount)) || Number(body.amount) === 0) {
      return NextResponse.json(
        { error: "A user and a non-zero amount are required." },
        { status: 400 },
      );
    }

    const amount = Math.round(Number(body.amount));

    // A cap on a single grant. Not because a larger one is never right, but
    // because a mistyped zero should not become a thousand roses.
    if (Math.abs(amount) > 500) {
      return NextResponse.json(
        { error: "Grants are capped at 500 at a time." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc("admin_grant_roses", {
      p_user_id: body.user_id,
      p_amount: amount,
    });

    if (error) throw error;

    return NextResponse.json({ balance: data });
  } catch (error) {
    return failed(error, "Failed to move roses.");
  }
}
