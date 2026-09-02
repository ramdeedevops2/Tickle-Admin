import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Where a heart may be dropped.
 *
 * This is the most consequential list in the panel and worth treating
 * that way. Allowing a category means strangers can be directed to a
 * place and told somebody is there — which is fine for a café and is
 * not fine for a school, a clinic, or the building somebody lives in.
 *
 * Blocking a venue takes down the hearts already at it, by trigger.
 * Otherwise a block would be a rule about the future while the actual
 * problem stayed live.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [categories, blocked, settings, places] = await Promise.all([
      auth.supabase.from("venue_categories").select("*").order("allowed", { ascending: false }),
      auth.supabase
        .from("blocked_venues")
        .select("*, places(name, address)")
        .order("created_at", { ascending: false }),
      auth.supabase.from("heart_settings").select("capture_radius_m").eq("id", 1).single(),
      auth.supabase.from("places").select("id, name, category, address").order("name").limit(500),
    ]);

    if (categories.error) throw categories.error;

    const known = new Set((categories.data ?? []).map((row) => row.category));

    /*
     * Place categories nobody has ruled on yet.
     *
     * venue_allows_hearts refuses an unknown category, so these are
     * currently blocked by default — which is the safe direction, but an
     * admin should be told rather than left wondering why a café will
     * not accept a drop.
     */
    const unclassified = [
      ...new Set(
        (places.data ?? [])
          .map((place) => place.category)
          .filter((category) => category && !known.has(category)),
      ),
    ];

    return NextResponse.json({
      categories: categories.data ?? [],
      blocked: blocked.data ?? [],
      places: places.data ?? [],
      captureRadius: settings.data?.capture_radius_m ?? 15,
      unclassified,
    });
  } catch (error) {
    return failed(error, "Failed to load venue rules.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    if ("capture_radius_m" in body) {
      const metres = Number(body.capture_radius_m);

      /*
       * Floor of 5 metres, deliberately.
       *
       * Phone GPS is routinely off by ten to twenty metres indoors, so
       * a tighter radius does not make the feature precise — it makes it
       * fail for people who are genuinely standing there.
       */
      if (!Number.isFinite(metres) || metres < 5 || metres > 200) {
        return NextResponse.json(
          { error: "Capture radius must be between 5 and 200 metres." },
          { status: 400 },
        );
      }

      const { error } = await auth.supabase
        .from("heart_settings")
        .update({ capture_radius_m: Math.round(metres) })
        .eq("id", 1);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing category." }, { status: 400 });

    const update: Record<string, unknown> = {};

    if (typeof body.allowed === "boolean") update.allowed = body.allowed;
    if (typeof body.reason === "string") update.reason = body.reason.trim() || null;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase.from("venue_categories").update(update).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    if (body.entity === "category") {
      const category = String(body.category ?? "").trim();
      const label = String(body.label ?? "").trim();

      if (!category || !label) {
        return NextResponse.json({ error: "A category and label are required." }, { status: 400 });
      }

      const { data, error } = await auth.supabase
        .from("venue_categories")
        .insert({
          category,
          label,
          allowed: body.allowed === true,
          reason: String(body.reason ?? "").trim() || null,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That category already exists." }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ row: data });
    }

    if (body.entity === "venue") {
      const placeId = String(body.place_id ?? "");
      const reason = String(body.reason ?? "").trim();

      if (!placeId || !reason) {
        return NextResponse.json(
          { error: "Blocking a venue needs a place and a reason." },
          { status: 400 },
        );
      }

      // The Google id is carried too, so the block survives a cache
      // purge that re-fetches the place under a new row.
      const { data: place } = await auth.supabase
        .from("places")
        .select("google_place_id")
        .eq("id", placeId)
        .maybeSingle();

      const { data, error } = await auth.supabase
        .from("blocked_venues")
        .insert({
          place_id: placeId,
          google_place_id: place?.google_place_id ?? null,
          reason,
        })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ row: data });
    }

    return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
  } catch (error) {
    return failed(error, "Failed to add.");
  }
}

/** Unblocking a venue. Hearts already removed stay removed. */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") ?? "";

    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const { error } = await auth.supabase.from("blocked_venues").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to unblock.");
  }
}
