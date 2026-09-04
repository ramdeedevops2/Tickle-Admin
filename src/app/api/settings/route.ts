import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The heart_settings singleton — the live tuning knobs for the whole
 * drop-and-pick feature.
 *
 * Readable by anyone (the app needs the radius to draw the gate) but
 * writable by nobody: there is no UPDATE policy on the table, deliberately,
 * so the only way to change these is through an authenticated admin here.
 */

/**
 * Postgres hands intervals back as strings, in whichever shape it feels is
 * shortest — "06:00:00" for six hours, "7 days" for a week, "1 day 02:00:00"
 * for anything in between. The panel wants a number, so both directions get
 * translated here rather than in a component.
 */
function intervalToHours(value: string | null): number {
  if (!value) return 0;

  let hours = 0;

  const days = value.match(/(-?\d+)\s+day/);
  if (days) hours += Number(days[1]) * 24;

  const months = value.match(/(-?\d+)\s+mon/);
  if (months) hours += Number(months[1]) * 30 * 24;

  const clock = value.match(/(-?\d+):(\d+):(\d+)/);
  if (clock) {
    hours += Number(clock[1]) + Number(clock[2]) / 60 + Number(clock[3]) / 3600;
  }

  return Math.round(hours * 100) / 100;
}

type SettingsRow = {
  id: number;
  action_radius_m: number;
  max_accuracy_m: number;
  discovery_radius_m: number;
  heart_ttl: string;
  spark_ttl: string;
  place_cache_ttl: string;
  max_hearts_per_day: number;
  blocked_categories: string[];
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase
      .from("heart_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) throw error;

    const row = data as SettingsRow;

    return NextResponse.json({
      settings: {
        action_radius_m: row.action_radius_m,
        max_accuracy_m: row.max_accuracy_m,
        discovery_radius_m: row.discovery_radius_m,
        max_hearts_per_day: row.max_hearts_per_day,
        heart_ttl_hours: intervalToHours(row.heart_ttl),
        spark_ttl_days: intervalToHours(row.spark_ttl) / 24,
        place_cache_ttl_days: intervalToHours(row.place_cache_ttl) / 24,
        blocked_categories: row.blocked_categories ?? [],
      },
    });
  } catch (error) {
    return failed(error, "Failed to load settings.");
  }
}

/** Guard rails, so a typo cannot quietly break the feature for everyone. */
const NUMERIC_LIMITS: Record<string, { min: number; max: number }> = {
  action_radius_m: { min: 5, max: 500 },
  max_accuracy_m: { min: 10, max: 500 },
  discovery_radius_m: { min: 500, max: 50000 },
  max_hearts_per_day: { min: 1, max: 100 },
  heart_ttl_hours: { min: 1, max: 168 },
  spark_ttl_days: { min: 1, max: 90 },
  place_cache_ttl_days: { min: 1, max: 365 },
};

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    for (const [key, limits] of Object.entries(NUMERIC_LIMITS)) {
      if (!(key in body)) continue;

      const value = Number(body[key]);
      if (!Number.isFinite(value)) {
        return NextResponse.json({ error: `${key} must be a number.` }, { status: 400 });
      }
      if (value < limits.min || value > limits.max) {
        return NextResponse.json(
          { error: `${key} must be between ${limits.min} and ${limits.max}.` },
          { status: 400 },
        );
      }

      // The three durations are stored as intervals; the rest are plain
      // integers and must not arrive as 30.5 metres.
      if (key === "heart_ttl_hours") update.heart_ttl = `${value} hours`;
      else if (key === "spark_ttl_days") update.spark_ttl = `${value} days`;
      else if (key === "place_cache_ttl_days") update.place_cache_ttl = `${value} days`;
      else update[key] = Math.round(value);
    }

    if (Array.isArray(body.blocked_categories)) {
      update.blocked_categories = body.blocked_categories
        .map((entry) => String(entry).trim().toLowerCase())
        .filter(Boolean);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    // Who is changing this. A trigger on the table records the change;
    // this is what lets it record a name against it.
    await auth.supabase.rpc("set_config_actor", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_reason: null,
    });

    const { error } = await auth.supabase.from("heart_settings").update(update).eq("id", 1);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to save settings.");
  }
}
