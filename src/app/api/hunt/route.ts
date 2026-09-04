import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Heart Hunt: platform drops and the rules behind user drops.
 *
 * Platform hearts are the one thing in this app the company itself
 * places into the world, so this is the route that creates them. A drop
 * has a real cost — somebody travels to a venue expecting a reward — so
 * the reward is credited by the database on claim rather than promised
 * here and settled later.
 */

const REWARD_KINDS = ["roses", "super_likes", "premium_days", "promo", "venue"];

const SETTINGS: Record<string, { min: number; max: number }> = {
  extend_rose_cost: { min: 0, max: 500 },
  extend_max: { min: 0, max: 20 },
  free_drops_per_day: { min: 0, max: 50 },
  extra_drop_cost: { min: 0, max: 500 },
  // The compatibility floor for seeing somebody's heart. Raising it
  // makes the hunt quieter and better; lowering it makes it busier and
  // more random.
  hunt_compat_min: { min: 0, max: 100 },
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [settings, platform, places, userHearts] = await Promise.all([
      auth.supabase.from("heart_settings").select("*").eq("id", 1).single(),
      auth.supabase
        .from("platform_hearts")
        .select("*, places(name)")
        .order("created_at", { ascending: false })
        .limit(200),
      // Address comes along so the picker can tell two "Starbucks" apart,
      // and the ceiling is high because the picker is searchable now — a
      // truncated list is a venue somebody cannot drop a heart on.
      auth.supabase.from("places").select("id, name, address").order("name").limit(2000),
      auth.supabase.from("hearts").select("status, extended_count").limit(20000),
    ]);

    if (settings.error) throw settings.error;

    const hearts = (userHearts.data ?? []) as { status: string; extended_count: number }[];

    return NextResponse.json({
      settings: settings.data,
      platform: platform.data ?? [],
      places: places.data ?? [],
      rewardKinds: REWARD_KINDS,
      stats: {
        active: hearts.filter((h) => h.status === "active").length,
        claimed: hearts.filter((h) => h.status === "claimed").length,
        // How often people pay to keep a heart alive. Near zero means
        // the price is wrong or the window is already long enough.
        extended: hearts.filter((h) => h.extended_count > 0).length,
      },
    });
  } catch (error) {
    return failed(error, "Failed to load Heart Hunt.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    // Retiring a platform heart, rather than changing a setting.
    if (body.entity === "platform") {
      const id = String(body.id ?? "");
      if (!id) return NextResponse.json({ error: "Missing heart." }, { status: 400 });

      const { error } = await auth.supabase
        .from("platform_hearts")
        .update({ active: body.active === true })
        .eq("id", id);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const update: Record<string, unknown> = {};

    for (const [key, limits] of Object.entries(SETTINGS)) {
      if (!(key in body)) continue;

      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
        return NextResponse.json(
          { error: `${key} must be between ${limits.min} and ${limits.max}.` },
          { status: 400 },
        );
      }

      update[key] = Math.round(value);
    }

    if ("user_heart_hours" in body) {
      const hours = Number(body.user_heart_hours);

      if (!Number.isFinite(hours) || hours < 1 || hours > 168) {
        return NextResponse.json(
          { error: "A heart must last between 1 and 168 hours." },
          { status: 400 },
        );
      }

      update.user_heart_ttl = `${Math.round(hours)} hours`;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase.from("heart_settings").update(update).eq("id", 1);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update Heart Hunt settings.");
  }
}

/** Drop a platform heart at a venue. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const placeId = String(body.place_id ?? "");
    const title = String(body.title ?? "").trim();
    const rewardKind = String(body.reward_kind ?? "");
    const rewardValue = Number(body.reward_value ?? 0);
    const days = Number(body.days ?? 7);

    if (!placeId || title.length < 3) {
      return NextResponse.json({ error: "A drop needs a place and a title." }, { status: 400 });
    }

    if (!REWARD_KINDS.includes(rewardKind)) {
      return NextResponse.json({ error: "Unknown reward kind." }, { status: 400 });
    }

    /*
     * Roses and premium days are credited by the database on claim, so
     * the number has to be real. A promo or venue code is handed over
     * for the person to redeem elsewhere, so it needs a code instead.
     */
    if (["roses", "super_likes", "premium_days"].includes(rewardKind)) {
      if (!Number.isFinite(rewardValue) || rewardValue < 1 || rewardValue > 1000) {
        return NextResponse.json(
          { error: "That reward needs a value between 1 and 1000." },
          { status: 400 },
        );
      }
    } else if (!String(body.reward_code ?? "").trim()) {
      return NextResponse.json(
        { error: "A promo or venue reward needs a code." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(days) || days < 1 || days > 90) {
      return NextResponse.json({ error: "Days must be between 1 and 90." }, { status: 400 });
    }

    const limit = body.claim_limit == null ? null : Number(body.claim_limit);

    if (limit !== null && (!Number.isFinite(limit) || limit < 1 || limit > 100000)) {
      return NextResponse.json(
        { error: "Claim limit must be a number, or left empty for unlimited." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase
      .from("platform_hearts")
      .insert({
        place_id: placeId,
        title,
        body: String(body.body ?? "").trim() || null,
        reward_kind: rewardKind,
        reward_value: Math.round(rewardValue) || 0,
        reward_code: String(body.reward_code ?? "").trim() || null,
        claim_limit: limit,
        expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ heart: data });
  } catch (error) {
    return failed(error, "Failed to drop that heart.");
  }
}
