import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";
import { NAME_COLUMNS, nameByUserId, type NamedProfile } from "@/lib/supabase/names";

/**
 * Fresh Start Boost — the settings, who is inside the window, and a way
 * to put somebody back into it.
 *
 * A route of its own rather than four more fields on /api/fairness. That
 * one saves every field it knows about in a single PATCH, so adding
 * columns to it would break saving on any database where migration 051
 * has not been run yet — and migrations here are run by hand.
 *
 * Which is also why `ready` exists. If the columns are absent the route
 * answers with what it can and says so, and the page explains what to
 * run instead of showing an error nobody can act on.
 */

const LIMITS: Record<string, { min: number; max: number }> = {
  fresh_start_days: { min: 1, max: 60 },
  // Scale check: compatibility contributes up to ~45, distance 12, recent
  // activity 10. Past about 20 a new profile outranks everything on the
  // strength of being new, which is how a deck starts feeling random.
  fresh_start_weight: { min: 0, max: 40 },
};

const SETTING_COLUMNS =
  "fresh_start_enabled, fresh_start_days, fresh_start_weight, fresh_start_decay";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const settings = await supabase
      .from("fairness_settings")
      .select(SETTING_COLUMNS)
      .eq("id", 1)
      .maybeSingle();

    // The one error worth telling apart: the migration has not been run.
    if (settings.error) {
      return NextResponse.json({
        ready: false,
        migration: "supabase/migrations/051_fresh_start_boost.sql",
        detail: settings.error.message,
      });
    }

    /*
     * Everyone inside the window, newest first.
     *
     * `published_at` comes along because the pair answers the question
     * the page is really for: is the boost reaching people on their first
     * day, or are profiles publishing and then not being seen?
     */
    const { data: boostedRows } = await supabase
      .from("profiles")
      .select("user_id, new_here_until, published_at")
      .gt("new_here_until", new Date().toISOString())
      .order("new_here_until", { ascending: false })
      .limit(200);

    const boosted = (boostedRows ?? []) as {
      user_id: string;
      new_here_until: string;
      published_at: string | null;
    }[];

    const ids = boosted.map((row) => row.user_id);

    const { data: profileData } = ids.length
      ? await supabase.from("profiles").select(NAME_COLUMNS).in("user_id", ids)
      : { data: [] as NamedProfile[] };

    const names = await nameByUserId(
      supabase,
      ids,
      (profileData ?? []) as unknown as NamedProfile[],
    );

    // How much of the exposure they are actually getting. A boost that
    // changes no impressions is a boost that is not working.
    const { data: exposureRows } = ids.length
      ? await supabase.from("exposure").select("user_id, shown_count").in("user_id", ids)
      : { data: [] as { user_id: string; shown_count: number }[] };

    const shownById = new Map(
      ((exposureRows ?? []) as { user_id: string; shown_count: number }[]).map((row) => [
        row.user_id,
        row.shown_count,
      ]),
    );

    const { data: allExposure } = await supabase
      .from("exposure")
      .select("shown_count")
      .limit(50000);

    const everyone = (allExposure ?? []) as { shown_count: number }[];
    const averageShown =
      everyone.length > 0
        ? everyone.reduce((sum, row) => sum + (row.shown_count ?? 0), 0) / everyone.length
        : 0;

    const boostedShown = boosted.length
      ? boosted.reduce((sum, row) => sum + (shownById.get(row.user_id) ?? 0), 0) /
        boosted.length
      : 0;

    return NextResponse.json({
      ready: true,
      settings: settings.data,
      stats: {
        boosted: boosted.length,
        averageShown: Math.round(averageShown * 10) / 10,
        boostedShown: Math.round(boostedShown * 10) / 10,
      },
      members: boosted.map((row) => ({
        ...row,
        name: names.get(row.user_id) ?? "",
        shown: shownById.get(row.user_id) ?? 0,
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load Fresh Start settings.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.economy");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const update: Record<string, unknown> = {};

    for (const key of ["fresh_start_enabled", "fresh_start_decay"]) {
      if (typeof body[key] === "boolean") update[key] = body[key];
    }

    for (const [key, limits] of Object.entries(LIMITS)) {
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

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from("fairness_settings")
      .update(update)
      .eq("id", 1);

    if (error) throw error;

    /*
     * Changing the window does not move anybody already in one. Their
     * new_here_until was written when they published, and rewriting all
     * of them would either cut short a boost somebody is mid-way through
     * or hand out days nobody decided to give. The new number applies to
     * whoever publishes next.
     */
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update Fresh Start settings.");
  }
}

/** Put one member back into a fresh start, or end theirs. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "adjust.limits");
    if (auth.error) return auth.error;

    const body = (await request.json()) as { user_id?: string; days?: number };
    const days = Number(body.days);

    if (!body.user_id || !Number.isFinite(days) || days < 0 || days > 60) {
      return NextResponse.json(
        { error: "A member and a length between 0 and 60 days are required." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase.rpc("admin_set_fresh_start", {
      p_user_id: body.user_id,
      p_days: Math.round(days),
    });

    if (error) {
      if (error.message.includes("FRESH_START_RANGE")) {
        return NextResponse.json({ error: "That length is out of range." }, { status: 400 });
      }
      if (error.message.includes("NO_PROFILE")) {
        return NextResponse.json({ error: "That member has no profile." }, { status: 404 });
      }
      throw error;
    }

    return NextResponse.json({ until: data });
  } catch (error) {
    return failed(error, "Failed to set that member's fresh start.");
  }
}
