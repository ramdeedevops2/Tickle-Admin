import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Fairness settings, and how the rotation is actually behaving.
 *
 * The settings are guesses until there is traffic — the right cooldown for
 * a city of two thousand is not the right one for a city of two hundred
 * thousand. So they are editable, and the numbers beside them are what tell
 * you whether the current guess is working.
 */

/**
 * Cooldowns arrive as days and are stored as intervals. Postgres hands them
 * back in whichever shape it likes ("2 days", "48:00:00"), so both
 * directions are translated here.
 */
function intervalToDays(value: string | null): number {
  return Math.round((intervalToRawHours(value) / 24) * 100) / 100;
}

/*
 * Hours and minutes are parsed from the raw interval, not derived from
 * intervalToDays.
 *
 * That function rounds to two decimal places *in days*, which is fine
 * for a cooldown measured in days and destroys anything smaller:
 * "04:00:00" came back as 4.08 hours, and a ten-minute edit window came
 * back as 0 — which the form would then have saved as zero.
 */
function intervalToRawHours(value: string | null): number {
  if (!value) return 0;

  let hours = 0;

  const days = value.match(/(-?\d+)\s+day/);
  if (days) hours += Number(days[1]) * 24;

  const clock = value.match(/(-?\d+):(\d+):(\d+)/);
  if (clock) {
    hours += Number(clock[1]) + Number(clock[2]) / 60 + Number(clock[3]) / 3600;
  }

  return hours;
}

function intervalToHours(value: string | null): number {
  return Math.round(intervalToRawHours(value) * 10) / 10;
}

function intervalToMinutes(value: string | null): number {
  return Math.round(intervalToRawHours(value) * 60);
}

const LIMITS: Record<string, { min: number; max: number }> = {
  pass_cooldown_1: { min: 0.5, max: 30 },
  pass_cooldown_2: { min: 0.5, max: 60 },
  pass_cooldown_3: { min: 0.5, max: 90 },
  pass_permanent_after: { min: 2, max: 20 },
  daily_exposure_cap: { min: 5, max: 1000 },
  reshow_gap: { min: 1, max: 168 },
  second_chance_delta: { min: 5, max: 60 },

  // Match revival. The cost climbs by revival_step each time a pair is
  // brought back, and stops being offered after revival_max.
  revival_cost: { min: 0, max: 500 },
  revival_step: { min: 0, max: 500 },
  revival_max: { min: 0, max: 20 },
  revival_request_ttl: { min: 1, max: 336 },

  /*
   * Everything below lived only in the table until now — real settings
   * with no way to reach them short of writing SQL.
   *
   * The floors are not decoration. A match_ttl of zero expires every
   * match the moment it is made; a delete_grace of zero removes the
   * window somebody has to change their mind. Both are one typo away
   * without a minimum.
   */
  match_ttl: { min: 1, max: 336 },
  match_remind_1: { min: 1, max: 336 },
  match_remind_2: { min: 1, max: 336 },

  face_checks_per_hour: { min: 1, max: 100 },
  face_approve_at: { min: 50, max: 100 },
  face_reject_at: { min: 0, max: 99 },

  // The split on a paid media save, as a percentage to the sender.
  save_price_min: { min: 1, max: 10000 },
  save_price_max: { min: 1, max: 100000 },
  save_sender_share: { min: 0, max: 100 },

  edit_window: { min: 0, max: 1440 },
  voice_max_seconds: { min: 5, max: 300 },

  referral_daily_cap: { min: 0, max: 100 },
  referral_total_cap: { min: 0, max: 10000 },

  inactive_after: { min: 1, max: 365 },
  dormant_after: { min: 1, max: 365 },
  inactive_penalty: { min: 0, max: 1 },

  report_window: { min: 1, max: 365 },
  delete_grace: { min: 1, max: 90 },
};

/*
 * How each value is stored.
 *
 * Postgres INTERVAL columns need a unit, and the unit differs per
 * field — sending "72" to an interval column is an error, and sending
 * "72 hours" to delete_grace would silently mean something very
 * different from the 14 days it holds.
 */
const HOURS = new Set([
  "reshow_gap",
  "revival_request_ttl",
  "match_ttl",
  "match_remind_1",
  "match_remind_2",
]);

const DAYS = new Set([
  "pass_cooldown_1",
  "pass_cooldown_2",
  "pass_cooldown_3",
  "inactive_after",
  "dormant_after",
  "report_window",
  "delete_grace",
]);

const MINUTES = new Set(["edit_window"]);

// Stored as a fraction, edited as one too — a multiplier, not a count.
const DECIMALS = new Set(["inactive_penalty"]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const [settingRes, passRes, exposureRes, retentionRes] = await Promise.all([
      supabase.from("fairness_settings").select("*").eq("id", 1).single(),
      supabase.from("passes").select("pass_count, permanent, expires_at").limit(50000),
      supabase.from("exposure").select("shown_count, shown_today").limit(50000),
      supabase.from("retention_options").select("key, label").eq("active", true),
    ]);

    if (settingRes.error) throw settingRes.error;

    const row = settingRes.data as Record<string, string | number | boolean>;
    const passes = (passRes.data ?? []) as {
      pass_count: number;
      permanent: boolean;
      expires_at: string | null;
    }[];
    const exposure = (exposureRes.data ?? []) as {
      shown_count: number;
      shown_today: number;
    }[];

    const now = Date.now();
    const counts = exposure.map((row) => row.shown_count).sort((a, b) => a - b);

    /*
     * The number that says whether fairness is working.
     *
     * If the top tenth of profiles absorb most of the exposure, the
     * fairness term is losing to everything else and attention is pooling
     * exactly where it should not.
     */
    const total = counts.reduce((sum, value) => sum + value, 0);
    const topTenth = counts.slice(Math.floor(counts.length * 0.9));
    const topShare =
      total > 0 ? Math.round((topTenth.reduce((s, v) => s + v, 0) / total) * 100) : 0;

    return NextResponse.json({
      retention_options: retentionRes.data ?? [],
      settings: {
        pass_cooldown_1: intervalToDays(row.pass_cooldown_1 as string),
        pass_cooldown_2: intervalToDays(row.pass_cooldown_2 as string),
        pass_cooldown_3: intervalToDays(row.pass_cooldown_3 as string),
        pass_permanent_after: row.pass_permanent_after,
        daily_exposure_cap: row.daily_exposure_cap,
        reshow_gap: intervalToHours(row.reshow_gap as string),
        second_chance_on_change: row.second_chance_on_change,
        second_chance_delta: row.second_chance_delta,

        // Everything below was in the table with no way to reach it.
        match_ttl: intervalToHours(row.match_ttl as string),
        match_remind_1: intervalToHours(row.match_remind_1 as string),
        match_remind_2: intervalToHours(row.match_remind_2 as string),

        revival_cost: row.revival_cost,
        revival_step: row.revival_step,
        revival_max: row.revival_max,
        revival_request_ttl: intervalToHours(row.revival_request_ttl as string),

        face_checks_per_hour: row.face_checks_per_hour,
        face_approve_at: row.face_approve_at,
        face_reject_at: row.face_reject_at,

        save_price_min: row.save_price_min,
        save_price_max: row.save_price_max,
        save_sender_share: row.save_sender_share,

        edit_window: intervalToMinutes(row.edit_window as string),
        voice_max_seconds: row.voice_max_seconds,

        referral_daily_cap: row.referral_daily_cap,
        referral_total_cap: row.referral_total_cap,

        inactive_after: intervalToDays(row.inactive_after as string),
        dormant_after: intervalToDays(row.dormant_after as string),
        inactive_penalty: row.inactive_penalty,

        default_retention: row.default_retention,

        report_window: intervalToDays(row.report_window as string),
        delete_grace: intervalToDays(row.delete_grace as string),
      },
      stats: {
        passes: passes.length,
        permanent: passes.filter((row) => row.permanent).length,
        active: passes.filter(
          (row) => !row.permanent && row.expires_at && new Date(row.expires_at).getTime() > now,
        ).length,
        repeat: passes.filter((row) => row.pass_count > 1).length,
        profilesShown: exposure.length,
        // The cap lives on the settings row, not on each exposure row.
        atCapToday: exposure.filter(
          (entry) => entry.shown_today >= Number(row.daily_exposure_cap ?? 60),
        ).length,
        topTenthShare: topShare,
        medianExposure: counts.length ? counts[Math.floor(counts.length / 2)] : 0,
      },
    });
  } catch (error) {
    return failed(error, "Failed to load fairness settings.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    for (const [key, limits] of Object.entries(LIMITS)) {
      if (!(key in body)) continue;

      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
        return NextResponse.json(
          { error: `${key} must be between ${limits.min} and ${limits.max}.` },
          { status: 400 },
        );
      }

      // Each interval column carries its own unit; the rest are plain
      // numbers. Getting this wrong is silent — Postgres would accept
      // "14 hours" into a column meant to hold 14 days.
      if (DAYS.has(key)) update[key] = `${value} days`;
      else if (HOURS.has(key)) update[key] = `${value} hours`;
      else if (MINUTES.has(key)) update[key] = `${value} minutes`;
      else if (DECIMALS.has(key)) update[key] = value;
      else update[key] = Math.round(value);
    }

    if (typeof body.second_chance_on_change === "boolean") {
      update.second_chance_on_change = body.second_chance_on_change;
    }

    /*
     * The default retention mode, checked against the options table
     * rather than a list copied into this file — a default pointing at
     * a key that does not exist would make every message fall back,
     * silently.
     */
    if (typeof body.default_retention === "string") {
      const { data: option } = await auth.supabase
        .from("retention_options")
        .select("key")
        .eq("key", body.default_retention)
        .eq("active", true)
        .maybeSingle();

      if (!option) {
        return NextResponse.json(
          { error: "That is not an active retention mode." },
          { status: 400 },
        );
      }

      update.default_retention = body.default_retention;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    /*
     * Pairs that only make sense in order.
     *
     * Each is read against the stored row when only one half is being
     * changed — otherwise raising the floor above an unchanged ceiling
     * passes validation and leaves a range nothing can satisfy.
     */
    const { data: current } = await auth.supabase
      .from("fairness_settings")
      .select("face_approve_at, face_reject_at, save_price_min, save_price_max")
      .eq("id", 1)
      .single();

    const merged = { ...(current ?? {}), ...update } as Record<string, number>;

    if (merged.face_reject_at >= merged.face_approve_at) {
      return NextResponse.json(
        {
          error:
            "The reject score must be below the approve score, or every check lands in review.",
        },
        { status: 400 },
      );
    }

    if (merged.save_price_min > merged.save_price_max) {
      return NextResponse.json(
        { error: "The lowest save price cannot be above the highest." },
        { status: 400 },
      );
    }

    /*
     * Who is changing this, before the write.
     *
     * A trigger on the table records the change; this is what lets it
     * record a name against it. Set transaction-locally, so it cannot
     * leak into another request.
     */
    await auth.supabase.rpc("set_config_actor", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_reason: String(body.reason ?? "").trim() || null,
    });

    const { error } = await auth.supabase
      .from("fairness_settings")
      .update(update)
      .eq("id", 1);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to save fairness settings.");
  }
}
