import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Promo codes and referral milestones.
 *
 * Two things that look alike and are not: a promo code is handed out,
 * and a referral milestone is earned. They share this route because
 * they share a failure mode — a campaign with no cap is an open-ended
 * cost, and the person who created it is not the one who notices.
 *
 * The redemption counts are shown beside every code for that reason.
 */

/*
 * What a promo code can pay.
 *
 * Three kinds are gone as of 079 — super_likes, premium_discount and
 * pack_bonus. redeem_promo() never had a branch for any of them, so a
 * code set to one recorded the redemption, reported success, and
 * credited nothing.
 */
const REWARD_KINDS = ["roses", "plan", "boost", "incognito"];

/*
 * Invite rewards are not here.
 *
 * They were, as a shorter list of kinds a milestone could pay. 077 gave
 * them their own table and their own route (/api/invites), because one
 * step can now pay several things and each side can get something
 * different — which a single kind on a single row cannot say.
 */

const SEGMENTS = ["new", "premium", "free", "lapsed"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [codes, milestones, rewards, promoRewards, plans, awards, redemptions, cities, caps] =
      await Promise.all([
      auth.supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
      auth.supabase.from("referral_milestones").select("*").order("sort_order"),

      // What each step pays. Rows since 077, so a step can pay several
      // things and each side can get something different.
      auth.supabase.from("referral_rewards").select("*").order("sort_order"),

      // What each promo code pays. Rows since 079 — the five-option
      // dropdown they replaced had three kinds that credited nothing.
      auth.supabase.from("promo_rewards").select("*").order("sort_order"),

      // Plans a reward can grant. Free is never one: giving somebody
      // what they already have is not a reward.
      auth.supabase
        .from("plans")
        .select("key, label, days, active")
        .neq("key", "free")
        .order("sort_order"),

      auth.supabase.from("referral_awards").select("milestone, referrer_id").limit(50000),
      auth.supabase.from("promo_redemptions").select("promo_id").limit(50000),
      /*
       * The cities people are actually in.
       *
       * This read the `cities` table, which held six metros somebody
       * seeded once — and not one member is in any of them. A code
       * scoped from that list would have reached nobody, while the
       * places members really are (Mohali, Zirakpur, Kharar) were not
       * offered at all.
       *
       * redeem_promo() compares promo_codes.city to profiles.city as
       * lowercase text and never consults the cities table, so this is
       * also the only list that matches how a code is actually applied.
       */
      auth.supabase
        .from("profiles")
        .select("city")
        .not("city", "is", null)
        .limit(50000),
      auth.supabase
        .from("fairness_settings")
        .select("referral_daily_cap, referral_total_cap")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (codes.error) throw codes.error;

    const perMilestone: Record<string, number> = {};
    const referrers = new Set<string>();

    for (const row of (awards.data ?? []) as { milestone: string; referrer_id: string }[]) {
      perMilestone[row.milestone] = (perMilestone[row.milestone] ?? 0) + 1;
      referrers.add(row.referrer_id);
    }

    return NextResponse.json({
      codes: codes.data ?? [],
      milestones: milestones.data ?? [],
      rewards: rewards.data ?? [],
      promoRewards: promoRewards.data ?? [],
      rewardPlans: plans.data ?? [],
      rewardKinds: REWARD_KINDS,
      // What the anti-farm ceiling is set to. Shown beside the rewards
      // because it is the reason a reward can look correct and still
      // not pay: past this many, awards stop silently by design.
      referralCaps: caps.data ?? null,
      /*
       * Offered as a list so a code cannot be scoped to a city that
       * does not exist. Launched ones first: those are the ones a
       * campaign is almost always for.
       *
       * The column is `status`, not `live`. Selecting a column that is
       * not there fails the whole query — which is why this arrived
       * empty and the city dropdown had nothing in it.
       */
      /*
       * Busiest first, with the member count on each.
       *
       * A campaign is worth running where people are, so the ordering
       * is by how many members are there rather than alphabetical — and
       * the count travels with it so the number is visible at the point
       * the choice is made.
       */
      cities: Object.entries(
        ((cities.data ?? []) as { city: string | null }[]).reduce<Record<string, number>>(
          (tally, row) => {
            const name = (row.city ?? "").trim();
            if (name) tally[name] = (tally[name] ?? 0) + 1;
            return tally;
          },
          {},
        ),
      )
        .map(([name, people]) => ({ slug: name.toLowerCase(), name, people }))
        .sort((a, b) => b.people - a.people || a.name.localeCompare(b.name)),
      segments: SEGMENTS,
      referral: {
        awarded: (awards.data ?? []).length,
        // People who have successfully brought somebody in. The ratio of
        // this to total awards says whether referrals are broad or a
        // handful of accounts doing something odd.
        referrers: referrers.size,
        perMilestone,
      },
      totalRedemptions: (redemptions.data ?? []).length,
    });
  } catch (error) {
    return failed(error, "Failed to load promotions.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.campaigns");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const code = String(body.code ?? "").trim().toUpperCase();
    const label = String(body.label ?? "").trim();
    const kind = String(body.reward_kind ?? "");
    const value = Number(body.reward_value ?? 0);

    if (code.length < 3 || label.length < 3) {
      return NextResponse.json(
        { error: "A code needs at least three characters and a label." },
        { status: 400 },
      );
    }

    if (!REWARD_KINDS.includes(kind)) {
      return NextResponse.json({ error: "Unknown reward kind." }, { status: 400 });
    }

    if (!Number.isFinite(value) || value < 1 || value > 100000) {
      return NextResponse.json({ error: "Value must be between 1 and 100000." }, { status: 400 });
    }

    const segment = body.segment ? String(body.segment) : null;
    if (segment && !SEGMENTS.includes(segment)) {
      return NextResponse.json({ error: "Unknown segment." }, { status: 400 });
    }

    const days = body.days == null ? null : Number(body.days);

    const { data, error } = await auth.supabase
      .from("promo_codes")
      .insert({
        code,
        label,
        city: body.city ? String(body.city).trim().toLowerCase() : null,
        segment,
        max_uses: body.max_uses == null ? null : Math.round(Number(body.max_uses)),
        ends_at:
          days && Number.isFinite(days)
            ? new Date(Date.now() + days * 86_400_000).toISOString()
            : null,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That code already exists." }, { status: 409 });
      }
      throw error;
    }

    /*
     * The first reward, written as a row.
     *
     * A code with no rewards is refused at redemption (079), so
     * creating one without its first reward would make a code that
     * exists and cannot be used. More can be added afterwards.
     */
    const reward: Record<string, unknown> = { promo_id: data.id, kind, sort_order: 0 };

    if (kind === "roses") {
      reward.amount = Math.round(value);
    } else if (kind === "plan") {
      reward.plan_key = String(body.plan_key ?? "").trim();
      reward.reward_days = Math.round(value);
    } else {
      reward.reward_days = Math.round(value);
    }

    const { error: rewardError } = await auth.supabase
      .from("promo_rewards")
      .insert(reward);

    if (rewardError) {
      // The code without its reward is unusable, so it does not survive
      // a half-finished create.
      await auth.supabase.from("promo_codes").delete().eq("id", data.id);
      throw rewardError;
    }

    return NextResponse.json({ code: data });
  } catch (error) {
    return failed(error, "Failed to create that code.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.campaigns");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");

    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const isMilestone = body.entity === "milestone";
    const table = isMilestone ? "referral_milestones" : "promo_codes";

    const update: Record<string, unknown> = {};

    if (typeof body.active === "boolean") update.active = body.active;

    // Promo codes only. A milestone has no reward_value since 077 —
    // its rewards are rows in referral_rewards.
    if ("reward_value" in body && !isMilestone) {
      const value = Number(body.reward_value);
      if (!Number.isFinite(value) || value < 1 || value > 100000) {
        return NextResponse.json({ error: "Value is out of range." }, { status: 400 });
      }
      update.reward_value = Math.round(value);
    }

    /*
     * What kind of reward, not just how much.
     *
     * Checked against the list rather than passed through: reward_kind
     * is read by the crediting function, and an unrecognised value
     * there is a reward that silently never pays.
     */
    if ("reward_kind" in body && !isMilestone) {
      const kind = String(body.reward_kind);
      if (!REWARD_KINDS.includes(kind)) {
        return NextResponse.json({ error: "Unknown reward." }, { status: 400 });
      }
      update.reward_kind = kind;
    }

    /*
     * The wording members read.
     *
     * Editable because these are sentences shown in the app — "They
     * joined" is a choice about tone, not a database key. The key
     * itself is never editable: it is what the crediting code matches
     * on, and renaming it would stop the reward paying.
     */
    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (label.length < 2) {
        return NextResponse.json({ error: "That needs a name." }, { status: 400 });
      }
      update.label = label;
    }

    if (isMilestone) {
      /*
       * No reward fields here any more.
       *
       * A milestone used to carry its reward in its own columns —
       * kind, amount, and two switches saying who was paid. 077 moved
       * all of that into referral_rewards, so a step can pay several
       * things and each side can get something different. Those
       * columns are gone from the table, and writing them here would
       * be an error rather than a no-op.
       *
       * Rewards are edited through /api/invites. What is left on a
       * milestone is the wording and the order.
       */

      // Shown to the invited person, who is not "they". Cleared back to
      // null rather than empty string so the payout falls back to label.
      if (typeof body.invitee_label === "string") {
        update.invitee_label = body.invitee_label.trim() || null;
      }

      if ("sort_order" in body) {
        const order = Number(body.sort_order);
        if (!Number.isFinite(order) || order < 0 || order > 10000) {
          return NextResponse.json({ error: "Order is out of range." }, { status: 400 });
        }
        update.sort_order = Math.round(order);
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase.from(table).update(update).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update.");
  }
}

/**
 * Removing a promo code.
 *
 * Deleted outright, including its redemption rows, because a code is a
 * campaign rather than a record — nobody audits which code somebody
 * used six months ago, and the roses it paid stay in the rose ledger
 * under their own reason regardless.
 *
 * Milestones are not deletable here on purpose: their keys are written
 * into trigger bodies, so a missing one is a reward that silently stops
 * firing rather than an error anybody sees.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.campaigns");
    if (auth.error) return auth.error;

    const entity = request.nextUrl.searchParams.get("entity");
    const id = request.nextUrl.searchParams.get("id");

    if (entity !== "code") {
      return NextResponse.json(
        { error: "Only codes can be removed here." },
        { status: 400 },
      );
    }

    if (!id) {
      return NextResponse.json({ error: "Which code?" }, { status: 400 });
    }

    const { error } = await auth.supabase.from("promo_codes").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to remove that code.");
  }
}
