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
  if (!value) return 0;

  let hours = 0;

  const days = value.match(/(-?\d+)\s+day/);
  if (days) hours += Number(days[1]) * 24;

  const clock = value.match(/(-?\d+):(\d+):/);
  if (clock) hours += Number(clock[1]) + Number(clock[2]) / 60;

  return Math.round((hours / 24) * 100) / 100;
}

function intervalToHours(value: string | null): number {
  return Math.round(intervalToDays(value) * 24 * 10) / 10;
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
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const [settingRes, passRes, exposureRes] = await Promise.all([
      supabase.from("fairness_settings").select("*").eq("id", 1).single(),
      supabase.from("passes").select("pass_count, permanent, expires_at").limit(50000),
      supabase.from("exposure").select("shown_count, shown_today").limit(50000),
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
      settings: {
        pass_cooldown_1: intervalToDays(row.pass_cooldown_1 as string),
        pass_cooldown_2: intervalToDays(row.pass_cooldown_2 as string),
        pass_cooldown_3: intervalToDays(row.pass_cooldown_3 as string),
        pass_permanent_after: row.pass_permanent_after,
        daily_exposure_cap: row.daily_exposure_cap,
        reshow_gap: intervalToHours(row.reshow_gap as string),
        second_chance_on_change: row.second_chance_on_change,
        second_chance_delta: row.second_chance_delta,
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

      // Days for the cooldowns, hours for the re-show gap, plain integers
      // for the rest.
      if (key.startsWith("pass_cooldown")) update[key] = `${value} days`;
      else if (key === "reshow_gap" || key === "revival_request_ttl")
        update[key] = `${value} hours`;
      else update[key] = Math.round(value);
    }

    if (typeof body.second_chance_on_change === "boolean") {
      update.second_chance_on_change = body.second_chance_on_change;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

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
