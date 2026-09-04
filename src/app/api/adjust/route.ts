import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Manual adjustments to a member's account.
 *
 * Hearts, Premium, verification, allowances. Every one of them is a
 * thing somebody paid for or earned, which is exactly why every one is
 * audited with a reason and a before/after state.
 *
 * The before/after is the part that gets skipped and the part that
 * matters. "Admin X adjusted Hearts" answers nothing later; "from 40 to
 * 4000, reason: 'compensation for failed purchase'" answers everything.
 *
 * There is no bulk endpoint, deliberately. An adjustment applied to a
 * hundred accounts at once is a hundred decisions nobody made
 * individually.
 */

/*
 * No 'reset_daily'.
 *
 * The daily allowance is not a counter — it is derived by counting
 * today's rows in likes, profile_comments and super_likes. Resetting it
 * would mean deleting those, which undoes real matches and real
 * comments to give somebody their swipes back.
 *
 * Granting Hearts is the honest compensation, and it leaves a ledger
 * entry explaining why.
 */
const ADJUSTMENTS = ["hearts", "premium_days", "verify", "unverify"] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    // The audit trail, either for one member or the recent lot.
    const query = auth.supabase
      .from("admin_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    const { data, error } = userId ? await query.eq("target_id", userId) : await query;

    if (error) throw error;

    return NextResponse.json({ audit: data ?? [], kinds: ADJUSTMENTS });
  } catch (error) {
    return failed(error, "Failed to load the audit trail.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "adjust.limits");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const userId = String(body.user_id ?? "");
    const kind = String(body.kind ?? "");
    const reason = String(body.reason ?? "").trim();
    const amount = Number(body.amount ?? 0);

    if (!userId) {
      return NextResponse.json({ error: "Missing member." }, { status: 400 });
    }

    if (!ADJUSTMENTS.includes(kind as (typeof ADJUSTMENTS)[number])) {
      return NextResponse.json({ error: "Unknown adjustment." }, { status: 400 });
    }

    if (reason.length < 3) {
      return NextResponse.json(
        { error: "Say why. Without a reason this is unexplainable later." },
        { status: 400 },
      );
    }

    /*
     * Everything that could change, read before and after.
     *
     * One select rather than per-kind, so the audit row is the same
     * shape whatever was adjusted and a diff is readable across kinds.
     */
    const columns = "roses, premium_until, face_verified_at, phone_verified_at";

    const { data: before } = await auth.supabase
      .from("profiles")
      .select(columns)
      .eq("user_id", userId)
      .maybeSingle();

    if (!before) {
      return NextResponse.json({ error: "No such member." }, { status: 404 });
    }

    if (kind === "hearts") {
      if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) {
        return NextResponse.json(
          { error: "Amount must be non-zero and within 100,000." },
          { status: 400 },
        );
      }

      // Through the ledger, never by writing the balance. A balance
      // changed outside the ledger is a number nobody can account for.
      const { error } = await auth.supabase.rpc("admin_grant_roses", {
        p_user_id: userId,
        p_amount: Math.round(amount),
        p_reason: amount > 0 ? "admin_grant" : "admin_deduct",
      });

      if (error) throw error;
    }

    if (kind === "premium_days") {
      if (!Number.isFinite(amount) || amount < -3650 || amount > 3650) {
        return NextResponse.json({ error: "Days out of range." }, { status: 400 });
      }

      const current = before.premium_until ? new Date(before.premium_until).getTime() : 0;
      const from = Math.max(current, Date.now());
      const until = new Date(from + amount * 86_400_000);

      const { error } = await auth.supabase
        .from("profiles")
        // Past dates are stored as null rather than as an expiry in the
        // past — the two mean the same thing and one of them reads
        // strangely in every query that follows.
        .update({ premium_until: until.getTime() > Date.now() ? until.toISOString() : null })
        .eq("user_id", userId);

      if (error) throw error;
    }

    if (kind === "verify" || kind === "unverify") {
      const { error } = await auth.supabase
        .from("profiles")
        .update({
          face_verified_at: kind === "verify" ? new Date().toISOString() : null,
        })
        .eq("user_id", userId);

      if (error) throw error;
    }

    const { data: after } = await auth.supabase
      .from("profiles")
      .select(columns)
      .eq("user_id", userId)
      .maybeSingle();

    await auth.supabase.rpc("record_admin_action", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_action: `adjust.${kind}`,
      p_target_type: "profile",
      p_target_id: userId,
      p_reason: reason,
      p_before: before,
      p_after: after,
    });

    return NextResponse.json({ ok: true, before, after });
  } catch (error) {
    return failed(error, "Failed to make that adjustment.");
  }
}
