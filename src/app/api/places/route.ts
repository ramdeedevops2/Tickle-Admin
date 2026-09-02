import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The venue cache, with what has actually happened at each venue.
 *
 * A place row on its own says only that Google once told us a café exists
 * there. The counts are what make the page worth opening: which venues
 * people actually drop hearts at, and which sit in the cache costing a row
 * and returning nothing.
 */

type PlaceRow = {
  id: string;
  google_place_id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  photo_ref: string | null;
  cached_at: string | null;
};

type HeartCountRow = { place_id: string; status: string };

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const [placeRes, heartRes, sparkRes] = await Promise.all([
      supabase
        .from("places")
        .select(
          "id, google_place_id, name, category, address, latitude, longitude, photo_ref, cached_at",
        )
        .order("cached_at", { ascending: false })
        .limit(1000),
      supabase.from("hearts").select("place_id, status").limit(5000),
      supabase.from("random_matches").select("place_id").limit(5000),
    ]);

    if (placeRes.error) throw placeRes.error;

    const places = (placeRes.data ?? []) as PlaceRow[];
    const hearts = (heartRes.data ?? []) as HeartCountRow[];
    const sparks = (sparkRes.data ?? []) as { place_id: string }[];

    const active = new Map<string, number>();
    const total = new Map<string, number>();
    const sparked = new Map<string, number>();

    for (const heart of hearts) {
      total.set(heart.place_id, (total.get(heart.place_id) ?? 0) + 1);
      if (heart.status === "active") {
        active.set(heart.place_id, (active.get(heart.place_id) ?? 0) + 1);
      }
    }

    for (const spark of sparks) {
      sparked.set(spark.place_id, (sparked.get(spark.place_id) ?? 0) + 1);
    }

    return NextResponse.json({
      places: places.map((place) => ({
        ...place,
        active_hearts: active.get(place.id) ?? 0,
        total_hearts: total.get(place.id) ?? 0,
        sparks: sparked.get(place.id) ?? 0,
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load places.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;
    const id = new URL(request.url).searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Place ID is required." }, { status: 400 });
    }

    /*
     * Deleting a place cascades to its hearts and, through them, its sparks.
     * That is the right shape for evicting a venue Google got wrong, and
     * exactly the wrong thing to do to a venue people are using, so refuse
     * while anything live still points at it.
     */
    const { count, error: countError } = await supabase
      .from("hearts")
      .select("id", { count: "exact", head: true })
      .eq("place_id", id)
      .eq("status", "active");

    if (countError) throw countError;

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `${count} live heart${count === 1 ? "" : "s"} here. Expire or withdraw them first.`,
        },
        { status: 409 },
      );
    }

    const { error } = await supabase.from("places").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to remove place.");
  }
}
