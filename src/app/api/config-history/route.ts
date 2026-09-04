import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * What has been changed, and putting one back.
 *
 * The history is written by a trigger on the settings tables, not by
 * this route — so it captures changes made through the panel, through
 * another route added later, and through SQL somebody ran by hand.
 * A change with no admin against it came from outside the panel, and
 * is shown that way rather than hidden.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const source = searchParams.get("source");

    const query = auth.supabase
      .from("config_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    const { data, error } = source ? await query.eq("source", source) : await query;

    if (error) throw error;

    return NextResponse.json({ history: data ?? [] });
  } catch (error) {
    return failed(error, "Failed to load the change history.");
  }
}

/** Put one change back. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const entryId = String(body.entry_id ?? "");

    if (!entryId) {
      return NextResponse.json({ error: "Missing entry." }, { status: 400 });
    }

    const { data, error } = await auth.supabase.rpc("rollback_config", {
      p_entry_id: entryId,
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
    });

    if (error) throw error;

    const result = data as { ok: boolean; reason?: string };

    if (!result?.ok) {
      const messages: Record<string, string> = {
        unknown_entry: "That change is no longer in the history.",
        unknown_source: "That change came from a table this cannot restore.",
        nothing_to_undo: "Nothing in that change still exists to put back.",
      };

      return NextResponse.json(
        { error: messages[result?.reason ?? ""] ?? "Could not undo that." },
        { status: 400 },
      );
    }

    /*
     * Recorded in the admin audit as well as in config_history.
     *
     * The two answer different questions: config_history is "what is
     * this value's story", the audit is "what has this admin done".
     * A rollback belongs in both.
     */
    await auth.supabase.rpc("record_admin_action", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_action: "config.rollback",
      p_target_type: "config_history",
      p_target_id: entryId,
      p_reason: "Undid an earlier configuration change.",
      p_before: null,
      p_after: result,
    });

    return NextResponse.json({ ok: true, restored: result });
  } catch (error) {
    return failed(error, "Failed to undo that change.");
  }
}
