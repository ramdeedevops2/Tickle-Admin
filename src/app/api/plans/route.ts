import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Plan limits.
 *
 * The spec says the free comment and Super Like numbers stay
 * backend-configurable, which is what this route is for — changing them is a
 * row update, not a deploy.
 *
 * Nothing here can touch compatibility. The only lever premium has over
 * discovery is visibility_multiplier, which the ranker applies to position
 * after the score is settled. That separation is the product promise, so it
 * is enforced by there being no other column to change.
 */

const NUMERIC_LIMITS: Record<string, { min: number; max: number }> = {
  daily_comments: { min: 0, max: 500 },
  daily_super_likes: { min: 0, max: 100 },
  visibility_multiplier: { min: 1, max: 5 },

  // How many conversations can be open at once. The constraint is the
  // product — an inbox of forty half-conversations is how a dating app
  // becomes a chore — so this is a lever, not a cap to raise freely.
  active_chat_limit: { min: 1, max: 100 },
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [planRes, countRes] = await Promise.all([
      auth.supabase.from("plans").select("*").order("key"),
      auth.supabase
        .from("profiles")
        .select("premium_until")
        .not("premium_until", "is", null)
        .limit(20000),
    ]);

    if (planRes.error) throw planRes.error;

    const now = Date.now();
    const premium = (countRes.data ?? []) as { premium_until: string }[];

    return NextResponse.json({
      plans: planRes.data ?? [],
      // Active and lapsed are different numbers and mean different things:
      // one is revenue, the other is churn.
      activePremium: premium.filter((row) => new Date(row.premium_until).getTime() > now).length,
      lapsedPremium: premium.filter((row) => new Date(row.premium_until).getTime() <= now).length,
    });
  } catch (error) {
    return failed(error, "Failed to load plans.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown> & { key?: string };

    if (!body.key || (body.key !== "free" && body.key !== "premium")) {
      return NextResponse.json({ error: "Unknown plan." }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    for (const [field, limits] of Object.entries(NUMERIC_LIMITS)) {
      if (!(field in body)) continue;

      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
        return NextResponse.json(
          { error: `${field} must be between ${limits.min} and ${limits.max}.` },
          { status: 400 },
        );
      }

      update[field] =
        field === "visibility_multiplier" ? Number(value.toFixed(2)) : Math.round(value);
    }

    /*
     * How long an expired match stays revivable. Handled apart from the
     * numeric limits because the column is an interval and takes
     * "30 days", not 30.
     */
    if ("expired_history_days" in body) {
      const days = Number(body.expired_history_days);

      if (!Number.isFinite(days) || days < 1 || days > 365) {
        return NextResponse.json(
          { error: "Expired history must be between 1 and 365 days." },
          { status: 400 },
        );
      }

      update.expired_history = `${Math.round(days)} days`;
    }

    /*
     * daily_interactions accepts null, which is what makes premium
     * unlimited. Handled separately because "not present" and "explicitly
     * null" mean different things and Number(null) is 0 — which would
     * silently give premium members zero likes a day.
     */
    if ("daily_interactions" in body) {
      const raw = body.daily_interactions;

      if (raw === null) {
        update.daily_interactions = null;
      } else {
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 1 || value > 1000) {
          return NextResponse.json(
            { error: "Daily interactions must be between 1 and 1000, or unlimited." },
            { status: 400 },
          );
        }
        update.daily_interactions = Math.round(value);
      }
    }

    /*
     * The premium gates from 039. Booleans rather than numbers, so they
     * sit apart from NUMERIC_LIMITS.
     *
     * There is deliberately no can_hide_distance. Knowing roughly how
     * far away somebody is is what makes this app about meeting rather
     * than browsing, and selling the ability to opt out would quietly
     * break that for everyone else.
     */
    for (const gate of [
      "sees_who_liked",
      "can_hide_presence",
      "can_incognito",
      "can_travel",
    ]) {
      if (typeof body[gate] === "boolean") {
        update[gate] = body[gate];
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase.from("plans").update(update).eq("key", body.key);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update that plan.");
  }
}
