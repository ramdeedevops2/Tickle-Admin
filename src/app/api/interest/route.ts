import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Incoming interest, across the app.
 *
 * The question this answers is whether the three kinds actually behave
 * differently. If a comment converts to a match at the same rate as a plain
 * like, the comment is decoration and the daily budget it costs is a tax on
 * the people making the most effort.
 *
 * Comment bodies are returned because they are the moderation surface — a
 * private comment is the one place someone can write to a stranger before
 * matching, which makes it the first place abuse appears.
 */

type CommentRow = {
  id: string;
  author_id: string;
  subject_id: string;
  body: string;
  created_at: string;
  answered_at: string | null;
};

type SuperRow = {
  id: string;
  sender_id: string;
  target_id: string;
  note: string | null;
  paid_with: string;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  photos: string[] | null;
  suspended_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const [commentRes, superRes, likeRes, matchRes] = await Promise.all([
      supabase
        .from("profile_comments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("super_likes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("likes").select("id", { count: "exact", head: true }),
      supabase.from("matches").select("id", { count: "exact", head: true }),
    ]);

    if (commentRes.error) throw commentRes.error;

    const comments = (commentRes.data ?? []) as CommentRow[];
    const supers = (superRes.data ?? []) as SuperRow[];

    const userIds = [
      ...new Set([
        ...comments.flatMap((row) => [row.author_id, row.subject_id]),
        ...supers.flatMap((row) => [row.sender_id, row.target_id]),
      ]),
    ];

    const { data: profileData } = userIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, name, photos, suspended_at")
          .in("user_id", userIds)
      : { data: [] };

    const profileById = new Map(
      ((profileData ?? []) as ProfileRow[]).map((row) => [row.user_id, row]),
    );

    const answered = comments.filter((row) => row.answered_at !== null).length;

    return NextResponse.json({
      totals: {
        likes: likeRes.count ?? 0,
        matches: matchRes.count ?? 0,
        comments: comments.length,
        superLikes: supers.length,
        // The comparison worth making. If these are the same, the extra
        // effort a comment costs is buying nothing.
        commentConversion:
          comments.length > 0 ? Math.round((answered / comments.length) * 100) : 0,
        likeConversion:
          (likeRes.count ?? 0) > 0
            ? Math.round((((matchRes.count ?? 0) * 2) / (likeRes.count ?? 1)) * 100)
            : 0,
        superWithNote: supers.filter((row) => (row.note ?? "").trim().length > 0).length,
        superPaidWithRoses: supers.filter((row) => row.paid_with === "roses").length,
      },
      comments: comments.map((row) => ({
        ...row,
        author: profileById.get(row.author_id) ?? null,
        subject: profileById.get(row.subject_id) ?? null,
      })),
      superLikes: supers.map((row) => ({
        ...row,
        sender: profileById.get(row.sender_id) ?? null,
        target: profileById.get(row.target_id) ?? null,
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load incoming interest.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    const kind = params.get("kind");

    if (!id || (kind !== "comment" && kind !== "super")) {
      return NextResponse.json({ error: "An id and a kind are required." }, { status: 400 });
    }

    // Removing an abusive comment does not refund the interaction it cost.
    // The sender spent it; that they spent it on abuse is not a reason to
    // give it back.
    const table = kind === "comment" ? "profile_comments" : "super_likes";

    const { error } = await auth.supabase.from(table).delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to remove that.");
  }
}
