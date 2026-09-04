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

const REWARD_KINDS = [
  "roses",
  "super_likes",
  "premium_days",
  "premium_discount",
  "pack_bonus",
];

const SEGMENTS = ["new", "premium", "free", "lapsed"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [codes, milestones, awards, redemptions, cities] = await Promise.all([
      auth.supabase.from("promo_codes").select("*").order("created_at", { ascending: false }),
      auth.supabase.from("referral_milestones").select("*").order("sort_order"),
      auth.supabase.from("referral_awards").select("milestone, referrer_id").limit(50000),
      auth.supabase.from("promo_redemptions").select("promo_id").limit(50000),
      auth.supabase.from("cities").select("slug, name, live").order("name"),
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
      rewardKinds: REWARD_KINDS,
      // Offered as a list so a code cannot be scoped to a city that does
      // not exist. Live ones first: those are the ones a campaign is
      // almost always for.
      cities: (cities.data ?? []).sort(
        (a, b) => Number(b.live) - Number(a.live) || String(a.name).localeCompare(String(b.name)),
      ),
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
        reward_kind: kind,
        reward_value: Math.round(value),
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

    const table = body.entity === "milestone" ? "referral_milestones" : "promo_codes";

    const update: Record<string, unknown> = {};

    if (typeof body.active === "boolean") update.active = body.active;

    if ("reward_value" in body) {
      const value = Number(body.reward_value);
      if (!Number.isFinite(value) || value < 1 || value > 100000) {
        return NextResponse.json({ error: "Value is out of range." }, { status: 400 });
      }
      update.reward_value = Math.round(value);
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
