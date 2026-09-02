import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Live Dailies, for moderation.
 *
 * The only page in the panel that reads user content which vanishes on its
 * own — a reported Daily is gone within a day whether or not anyone looked,
 * so this is deliberately a live view rather than a queue to work through.
 *
 * Media is signed for ten minutes as the page renders. Nothing here is a
 * stored URL.
 */

type DailyRow = {
  id: string;
  user_id: string;
  kind: string;
  payload: { path?: string; url?: string; text?: string; artist?: string } | null;
  caption: string | null;
  created_at: string;
  expires_at: string;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  photos: string[] | null;
  suspended_at: string | null;
};

const MEDIA_KINDS = new Set(["photo", "video", "voice"]);
const SIGN_SECONDS = 600;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const { data, error } = await supabase
      .from("dailies")
      .select("*")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) throw error;

    const rows = (data ?? []) as DailyRow[];

    if (rows.length === 0) return NextResponse.json({ dailies: [] });

    const userIds = [...new Set(rows.map((row) => row.user_id))];

    const { data: profileData } = await supabase
      .from("profiles")
      .select("user_id, name, photos, suspended_at")
      .in("user_id", userIds);

    const profileById = new Map(
      ((profileData ?? []) as ProfileRow[]).map((row) => [row.user_id, row]),
    );

    const paths = rows
      .filter((row) => MEDIA_KINDS.has(row.kind) && row.payload?.path)
      .map((row) => row.payload!.path as string);

    const { data: signed } = paths.length
      ? await supabase.storage.from("dailies").createSignedUrls(paths, SIGN_SECONDS)
      : { data: [] };

    const urlByPath = new Map(
      (signed ?? [])
        .filter((entry) => entry.path && entry.signedUrl)
        .map((entry) => [entry.path as string, entry.signedUrl]),
    );

    return NextResponse.json({
      dailies: rows.map((row) => ({
        ...row,
        author: profileById.get(row.user_id) ?? null,
        url: row.payload?.path
          ? (urlByPath.get(row.payload.path) ?? null)
          : (row.payload?.url ?? null),
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load dailies.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;
    const id = new URL(request.url).searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Daily ID is required." }, { status: 400 });
    }

    // Read the path before deleting the row, or there is nothing left to
    // point the object delete at.
    const { data: row } = await supabase
      .from("dailies")
      .select("payload")
      .eq("id", id)
      .single();

    const { error } = await supabase.from("dailies").delete().eq("id", id);
    if (error) throw error;

    const path = (row?.payload as { path?: string } | null)?.path;
    if (path) await supabase.storage.from("dailies").remove([path]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to remove that daily.");
  }
}
