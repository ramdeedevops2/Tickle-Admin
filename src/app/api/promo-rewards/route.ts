import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * What a promo code pays.
 *
 * The twin of /api/invites, deliberately identical in shape: a code
 * pays a list of rewards, each of which credits something a member can
 * actually see. The five-option dropdown it replaced had three choices
 * that recorded a redemption and gave nothing.
 */

const KINDS = new Set(["roses", "plan", "boost", "incognito"]);

const MAX_DAYS = 365;
const MAX_ROSES = 10000;

/**
 * Turn a request body into a valid reward row.
 *
 * The same rules exist as a CHECK constraint. Repeated here so a
 * refusal names the box to go and fix, which a Postgres error code
 * cannot.
 */
function buildReward(
  body: Record<string, unknown>,
): { row: Record<string, unknown> } | { error: string } {
  const kind = String(body.kind ?? "");

  if (!KINDS.has(kind)) return { error: "Pick what the reward is." };

  const row: Record<string, unknown> = {
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

    // Blank means the plan's own length, so nobody has to restate it.
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
    const auth = await requireAdmin(request, "config.campaigns");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const promoId = String(body.promo_id ?? "").trim();

    if (!promoId) {
      return NextResponse.json({ error: "Which code?" }, { status: 400 });
    }

    const built = buildReward(body);
    if ("error" in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("promo_rewards")
      .insert({ promo_id: promoId, ...built.row })
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
    const auth = await requireAdmin(request, "config.campaigns");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");

    if (!id) {
      return NextResponse.json({ error: "Which reward?" }, { status: 400 });
    }

    /*
     * Switching one off keeps its settings.
     *
     * Which is what somebody wants when pausing part of a campaign, so
     * this path does not go through buildReward and cannot be refused
     * for a field it is not touching.
     */
    if (Object.keys(body).length === 2 && typeof body.active === "boolean") {
      const { error } = await auth.supabase
        .from("promo_rewards")
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
      .from("promo_rewards")
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
    const auth = await requireAdmin(request, "config.campaigns");
    if (auth.error) return auth.error;

    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Which reward?" }, { status: 400 });
    }

    /*
     * Deleted outright.
     *
     * promo_redemptions records that somebody used the code, not which
     * reward row paid them, so removing a reward loses no history — and
     * the roses that were credited stay in the ledger regardless.
     */
    const { error } = await auth.supabase.from("promo_rewards").delete().eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Could not remove that reward.");
  }
}
