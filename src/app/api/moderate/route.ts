import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Removing a single row an admin has looked at and judged.
 *
 * Connections and Messages were views you could read and not act on, which
 * is the wrong shape for the pages you land on from a report: the whole
 * reason to open a conversation from the safety queue is to do something
 * about it.
 *
 * Deliberately narrow. This deletes one row by id from one of a fixed set
 * of tables — it is not a query runner, and there is no bulk form of it.
 * Everything reversible lives on the member actions route instead; what is
 * here is here because a match or a message has no meaningful "hidden"
 * state, only present or gone.
 */

/**
 * The tables a row can be removed from, and what to call the thing in the
 * audit log. Anything absent from this map cannot be touched, which is the
 * point of it being a map rather than a parameter.
 */
const REMOVABLE: Record<string, string> = {
  matches: "match",
  likes: "like",
  passes: "pass",
  messages: "message",
  dailies: "daily",
  profile_comments: "comment",
  super_likes: "super_like",
  hearts: "heart",
  random_matches: "spark",
  nearby_encounters: "encounter",
};

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const table = searchParams.get("table") ?? "";
    const id = searchParams.get("id") ?? "";

    if (!REMOVABLE[table]) {
      return NextResponse.json({ error: "That table cannot be edited here." }, { status: 400 });
    }

    if (!id) {
      return NextResponse.json({ error: "Missing row id." }, { status: 400 });
    }

    /*
     * Read before delete, so the audit entry can say what was removed
     * rather than only that something was. A deleted row is exactly the
     * thing you cannot go back and look up later.
     */
    const { data: row } = await auth.supabase.from(table).select("*").eq("id", id).maybeSingle();

    const { error } = await auth.supabase.from(table).delete().eq("id", id);
    if (error) throw error;

    try {
      await auth.supabase.from("auth_events").insert({
        // Whoever the row belonged to, under whichever name this table
        // gives that column.
        user_id:
          row?.user_id ?? row?.sender_id ?? row?.liker_id ?? row?.user1_id ?? null,
        event: `admin_remove_${REMOVABLE[table]}`,
        metadata: { admin_id: auth.user?.id, table, id, row },
      });
    } catch {
      // Best-effort: the removal is what the admin asked for.
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to remove.");
  }
}
