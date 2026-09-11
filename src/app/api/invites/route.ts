import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * What an invite pays, and to whom.
 *
 * A milestone used to carry one reward in two columns — a kind and a
 * number — which meant one thing, of one type, and the same type to
 * both sides. "Whoever joins gets three days of Premium and five roses,
 * and whoever invited them gets a week" was not expressible.
 *
 * Rewards are rows now (077), so this route is mostly about them: list
 * them, add one, change one, remove one. The milestones themselves stay
 * as they are — their keys are written into trigger bodies, so a new or
 * renamed one would never fire.
 */

/** Every reward kind, and what each one needs to be valid. */
const KINDS = new Set(["roses", "plan", "boost", "incognito"]);

const SIDES = new Set(["referrer", "invitee"]);

/** Days are a real grant, so the ceiling is a year rather than a guess. */
const MAX_DAYS = 365;
const MAX_ROSES = 10000;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.economy");
    if (auth.error) return auth.error;

    const [milestones, rewards, plans, settings] = await Promise.all([
      auth.supabase.from("referral_milestones").select("*").order("sort_order"),
      auth.supabase.from("referral_rewards").select("*").order("sort_order"),
      // Free is never a reward: giving somebody what they already have
      // is not a reward, it is a downgrade for anybody who was paying.
      auth.supabase
        .from("plans")
        .select("key, label, days, price_minor, active")
        .neq("key", "free")
        .order("sort_order"),
      auth.supabase
        .from("fairness_settings")
        .select("referral_daily_cap, referral_total_cap")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (milestones.error) throw milestones.error;
    if (rewards.error) throw rewards.error;

    /*
     * How many people have actually reached each step.
     *
     * Shown next to the reward, because "this pays a week of Premium"
     * reads differently when it has fired four hundred times.
     */
    const { data: awards } = await auth.supabase
      .from("referral_awards")
      .select("milestone");

    const counts: Record<string, number> = {};
    for (const row of awards ?? []) {
      const key = String((row as { milestone: string }).milestone);
      counts[key] = (counts[key] ?? 0) + 1;
    }

    return NextResponse.json({
      milestones: milestones.data ?? [],
      rewards: rewards.data ?? [],
      plans: plans.data ?? [],
      caps: settings.data ?? null,
      awardCounts: counts,
    });
  } catch (error) {
    return failed(error, "Could not load the invite rewards.");
  }
}

/**
 * Turn a request body into a valid reward row.
 *
 * Shared by create and update, so a reward cannot be created in a shape
 * an edit would reject — which is how a row ends up existing that the
 * form then refuses to save.
 *
 * The database has the same rules as a CHECK constraint. They are
 * repeated here to say which field is wrong: a constraint violation
 * arrives as a Postgres code that cannot name the box to go and fix.
 */
function buildReward(
  body: Record<string, unknown>,
): { row: Record<string, unknown> } | { error: string } {
  const kind = String(body.kind ?? "");
  const side = String(body.side ?? "");

  if (!KINDS.has(kind)) return { error: "Pick what the reward is." };
  if (!SIDES.has(side)) return { error: "Pick who it pays." };

  const row: Record<string, unknown> = {
    side,
    kind,
    amount: null,
    plan_key: null,
    reward_days: null,
  };

  if (kind === "roses") {
    const amount = Math.round(Number(body.amount));

    if (!Number.isFinite(amount) || amount < 1 || amount > MAX_ROSES) {
      return { error: `Roses must be between 1 and ${MAX_ROSES}.` };
    }

    row.amount = amount;
    return { row };
  }

  if (kind === "plan") {
    const planKey = String(body.plan_key ?? "").trim();

    if (!planKey || planKey === "free") {
      return { error: "Pick which plan they get." };
    }

    row.plan_key = planKey;

    /*
     * Blank days means the plan's own length.
     *
     * So "Premium 7 days" grants seven without anybody restating it,
     * and a number here is the override for when a reward should be
     * shorter than the thing it is named after.
     */
    if (body.reward_days !== null && String(body.reward_days ?? "").trim() !== "") {
      const days = Math.round(Number(body.reward_days));

      if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
        return { error: `Days must be between 1 and ${MAX_DAYS}.` };
      }

      row.reward_days = days;
    }

    return { row };
  }

  // boost, incognito — a feature for a number of days.
  const days = Math.round(Number(body.reward_days));

  if (!Number.isFinite(days) || days < 1 || days > MAX_DAYS) {
    return { error: `Days must be between 1 and ${MAX_DAYS}.` };
  }

  row.reward_days = days;
  return { row };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.economy");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const milestone = String(body.milestone ?? "").trim();

    if (!milestone) {
      return NextResponse.json({ error: "Which step?" }, { status: 400 });
    }

    const built = buildReward(body);
    if ("error" in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("referral_rewards")
      .insert({ milestone, ...built.row })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (error) {
    return failed(error, "Could not add that reward.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.economy");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");

    if (!id) {
      return NextResponse.json({ error: "Which reward?" }, { status: 400 });
    }

    /*
     * Switching one off is not the same as editing it.
     *
     * A reward that is off keeps its settings and stops paying, which
     * is what somebody wants when pausing a promotion — so this path
     * does not go through buildReward and cannot be refused for a
     * field it is not touching.
     */
    if (Object.keys(body).length === 2 && typeof body.active === "boolean") {
      const { error } = await auth.supabase
        .from("referral_rewards")
        .update({ active: body.active })
        .eq("id", id);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const built = buildReward(body);
    if ("error" in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    const update: Record<string, unknown> = { ...built.row };
    if (typeof body.active === "boolean") update.active = body.active;

    const { error } = await auth.supabase
      .from("referral_rewards")
      .update(update)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Could not change that reward.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.economy");
    if (auth.error) return auth.error;

    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Which reward?" }, { status: 400 });
    }

    /*
     * Deleted outright, unlike an offer.
     *
     * referral_awards records that a milestone paid somebody, not which
     * reward row did it, so removing a reward loses no history — the
     * award stays, and the ledger entry for the roses stays with it.
     */
    const { error } = await auth.supabase
      .from("referral_rewards")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Could not remove that reward.");
  }
}
