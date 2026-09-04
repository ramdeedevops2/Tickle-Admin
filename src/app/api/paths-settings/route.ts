import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The paths_settings singleton — the live knobs for Paths Crossed.
 *
 * Same arrangement as heart_settings: readable by anyone (the app needs
 * the radius to describe the feature honestly) but writable by nobody,
 * because there is no UPDATE policy on the table. The only way to change
 * these is through an authenticated admin here.
 *
 * The radius matters more than most settings on this panel. It is what
 * the pairing job compares distances against, so raising it does not
 * merely change a label — it changes who is considered to have met whom,
 * for everybody, on the next run.
 */

type SettingsRow = {
  id: number;
  crossing_radius_m: number;
  max_accuracy_m: number;
  max_time_gap_min: number;
  share_deck_budget: boolean;
  ping_retention_hours: number;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase
      .from("paths_settings")
      .select("*")
      .eq("id", 1)
      .single();

    if (error) throw error;

    const row = data as SettingsRow;

    return NextResponse.json({
      settings: {
        crossing_radius_m: row.crossing_radius_m,
        max_accuracy_m: row.max_accuracy_m,
        max_time_gap_min: row.max_time_gap_min,
        ping_retention_hours: row.ping_retention_hours,
        share_deck_budget: row.share_deck_budget,
      },
    });
  } catch (error) {
    return failed(error, "Failed to load Paths settings.");
  }
}

/**
 * Guard rails, so a typo cannot quietly break the feature for everyone.
 *
 * The radius ceiling is deliberately low. At a kilometre "you crossed
 * paths" stops being true — that is most of a neighbourhood, and the
 * claim the feature makes to its users would become a false one.
 */
const NUMERIC_LIMITS: Record<string, { min: number; max: number }> = {
  crossing_radius_m: { min: 20, max: 1000 },
  max_accuracy_m: { min: 20, max: 500 },
  max_time_gap_min: { min: 1, max: 120 },
  ping_retention_hours: { min: 1, max: 168 },
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

      // Metres and minutes are integers. Nobody means 100.5 metres.
      update[key] = Math.round(value);
    }

    if (typeof body.share_deck_budget === "boolean") {
      update.share_deck_budget = body.share_deck_budget;
    }

    // An accuracy floor looser than the radius accepts readings that
    // cannot establish the thing being measured: a ±300m fix is not
    // evidence of having been within 100m of somebody. Refused here
    // rather than silently producing crossings that did not happen.
    const radius = Number(update.crossing_radius_m ?? body.crossing_radius_m);
    const accuracy = Number(update.max_accuracy_m ?? body.max_accuracy_m);
    if (Number.isFinite(radius) && Number.isFinite(accuracy) && accuracy > radius * 2) {
      return NextResponse.json(
        {
          error:
            "Worst usable fix cannot exceed twice the crossing radius — a reading that vague cannot show two people were that close.",
        },
        { status: 400 },
      );
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    update.updated_at = new Date().toISOString();

    // Who is changing this, for the config history trigger.
    await auth.supabase.rpc("set_config_actor", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_reason: null,
    });

    const { error } = await auth.supabase.from("paths_settings").update(update).eq("id", 1);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to save Paths settings.");
  }
}
