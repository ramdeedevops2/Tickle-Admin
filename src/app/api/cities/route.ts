import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Cities, waitlists and launch.
 *
 * The numbers here are real counts over published profiles. Nothing is
 * padded, and there is no route that could pad them — a dating app that
 * inflates its density is lying to people about their chances of
 * meeting somebody, which is the one lie it cannot afford.
 *
 * Launching a city notifies everybody on its waitlist, so it goes
 * through the database function rather than a status update — the
 * notification and the status change belong in one transaction.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [cities, waitlist, profiles] = await Promise.all([
      auth.supabase.from("cities").select("*").order("status").order("name"),
      auth.supabase.from("city_waitlist").select("city_slug"),
      auth.supabase
        .from("profiles")
        .select("city, published_at, last_active")
        .not("city", "is", null)
        .limit(50000),
    ]);

    if (cities.error) throw cities.error;

    const rows = (profiles.data ?? []) as {
      city: string;
      published_at: string | null;
      last_active: string | null;
    }[];

    const dayAgo = Date.now() - 86_400_000;
    const weekAgo = Date.now() - 7 * 86_400_000;

    const counts: Record<
      string,
      { people: number; week: number; active: number }
    > = {};

    for (const row of rows) {
      const slug = row.city.trim().toLowerCase();
      const entry = (counts[slug] ??= { people: 0, week: 0, active: 0 });

      if (row.published_at) {
        entry.people += 1;
        if (new Date(row.published_at).getTime() > weekAgo) entry.week += 1;
      }

      if (row.last_active && new Date(row.last_active).getTime() > dayAgo) {
        entry.active += 1;
      }
    }

    const waiting: Record<string, number> = {};
    for (const row of (waitlist.data ?? []) as { city_slug: string }[]) {
      waiting[row.city_slug] = (waiting[row.city_slug] ?? 0) + 1;
    }

    /*
     * Cities people are in that nobody has created a row for.
     *
     * These are invisible to City Pulse — the function returns
     * `known: false` — so somebody in one sees no city context at all.
     * Surfacing them is how that gets noticed.
     */
    const known = new Set((cities.data ?? []).map((c) => c.slug));
    const unlisted = Object.entries(counts)
      .filter(([slug, c]) => !known.has(slug) && c.people > 0)
      .map(([slug, c]) => ({ slug, people: c.people }))
      .sort((a, b) => b.people - a.people)
      .slice(0, 20);

    return NextResponse.json({
      cities: (cities.data ?? []).map((city) => ({
        ...city,
        people: counts[city.slug]?.people ?? 0,
        joined_this_week: counts[city.slug]?.week ?? 0,
        active_today: counts[city.slug]?.active ?? 0,
        waitlist: waiting[city.slug] ?? 0,
      })),
      unlisted,
    });
  } catch (error) {
    return failed(error, "Failed to load cities.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.cities");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const slug = String(body.slug ?? "").trim().toLowerCase();

    if (!slug) return NextResponse.json({ error: "Missing city." }, { status: 400 });

    /*
     * Going live is a launch, not a status edit.
     *
     * The function notifies everybody waiting, and doing that in the
     * same transaction as the status change is what stops a city being
     * live while its waitlist is never told.
     */
    if (body.status === "founding") {
      const { data, error } = await auth.supabase.rpc("launch_city", { p_slug: slug });
      if (error) throw error;

      return NextResponse.json({ ok: true, notified: data ?? 0 });
    }

    const update: Record<string, unknown> = {};

    if (typeof body.status === "string" && ["waitlist", "live", "paused"].includes(body.status)) {
      update.status = body.status;
    }

    for (const field of ["threshold", "founding_roses", "founding_premium_days"]) {
      if (!(field in body)) continue;

      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0 || value > 100000) {
        return NextResponse.json({ error: `${field} is out of range.` }, { status: 400 });
      }

      update[field] = Math.round(value);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase.from("cities").update(update).eq("slug", slug);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update that city.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "config.cities");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const name = String(body.name ?? "").trim();
    if (name.length < 2) {
      return NextResponse.json({ error: "A city needs a name." }, { status: 400 });
    }

    // Slug is derived rather than typed, so "New Delhi" and "new delhi"
    // can never become two rows.
    const slug =
      String(body.slug ?? name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const { data, error } = await auth.supabase
      .from("cities")
      .insert({
        name,
        slug,
        status: String(body.status ?? "waitlist"),
        threshold: Number(body.threshold ?? 200),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That city already exists." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ city: data });
  } catch (error) {
    return failed(error, "Failed to add that city.");
  }
}
