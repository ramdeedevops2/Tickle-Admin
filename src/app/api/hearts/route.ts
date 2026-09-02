import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Hearts and sparks, denormalised for the panel.
 *
 * The joins happen here rather than in the browser because the underlying
 * tables cannot be joined at all in PostgREST: hearts reference profiles by
 * a bare user_id with no foreign key behind it, since the live profiles
 * table has no unique constraint there. Two extra id lookups on the server
 * beat six hundred round trips from the client.
 */

type HeartRow = {
  id: string;
  dropper_id: string;
  place_id: string;
  note: string | null;
  vibe: string | null;
  dropper_gender: string | null;
  status: string;
  created_at: string;
  expires_at: string;
};

type SparkRow = {
  id: string;
  heart_id: string;
  place_id: string;
  dropper_id: string;
  picker_id: string;
  created_at: string;
  expires_at: string;
  removed_by: string | null;
};

type PlaceRow = { id: string; name: string; category: string | null };

type ProfileRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const [heartRes, sparkRes] = await Promise.all([
      supabase
        .from("hearts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("random_matches")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

    if (heartRes.error) throw heartRes.error;
    if (sparkRes.error) throw sparkRes.error;

    const hearts = (heartRes.data ?? []) as HeartRow[];
    const sparks = (sparkRes.data ?? []) as SparkRow[];

    const placeIds = [...new Set([...hearts, ...sparks].map((row) => row.place_id))];
    const userIds = [
      ...new Set([
        ...hearts.map((row) => row.dropper_id),
        ...sparks.flatMap((row) => [row.dropper_id, row.picker_id]),
      ]),
    ];

    const [placeRes, profileRes] = await Promise.all([
      placeIds.length
        ? supabase.from("places").select("id, name, category").in("id", placeIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("profiles").select("user_id, name, email, photos").in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const placeById = new Map(
      ((placeRes.data ?? []) as PlaceRow[]).map((row) => [row.id, row]),
    );
    const profileById = new Map(
      ((profileRes.data ?? []) as ProfileRow[]).map((row) => [row.user_id, row]),
    );

    return NextResponse.json({
      hearts: hearts.map((row) => ({
        ...row,
        place: placeById.get(row.place_id) ?? null,
        dropper: profileById.get(row.dropper_id) ?? null,
      })),
      sparks: sparks.map((row) => ({
        ...row,
        place: placeById.get(row.place_id) ?? null,
        dropper: profileById.get(row.dropper_id) ?? null,
        picker: profileById.get(row.picker_id) ?? null,
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load hearts.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;
    const body = (await request.json()) as { action?: string; id?: string };

    if (body.action === "expire") {
      // The same sweep pg_cron runs every ten minutes, on demand.
      const { error } = await supabase.rpc("expire_hearts");
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (body.action === "withdraw") {
      if (!body.id) {
        return NextResponse.json({ error: "Heart ID is required." }, { status: 400 });
      }

      // Withdrawn, never deleted. A heart that already produced a spark is
      // referenced by random_matches, and the pair who met through it should
      // not lose their spark because an admin tidied up the map.
      const { error } = await supabase
        .from("hearts")
        .update({ status: "withdrawn" })
        .eq("id", body.id)
        .eq("status", "active");

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return failed(error, "Failed to update hearts.");
  }
}
