import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Sending a Flare on somebody's behalf.
 *
 * A Flare is a like the other person is told about, with a note. Members
 * send their own from the app and pay Roses for them; this route exists
 * for the cases the app cannot cover — seeding a new city with something
 * to respond to, or making somebody whole after a Flare that failed to
 * deliver.
 *
 * ── Why it does not spend the sender's allowance ──────────────
 *
 * admin_send_flare tags the row paid_with = 'admin', so a Flare handed
 * out here never eats the daily allowance of the account it was sent
 * from. A gift that quietly costs the recipient something is not a gift,
 * and the tag also means the ledger can tell the two apart later.
 *
 * ── The note ──────────────────────────────────────────────────
 *
 * Optional, and capped at the same 160 characters the app's composer
 * allows. A Flare with no note is still a Flare: the other person is
 * told either way, which is the part being bought.
 */

const MAX_NOTE = 160;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "adjust.hearts");
    if (auth.error) return auth.error;

    const body = (await request.json()) as {
      sender_id?: string;
      target_id?: string;
      note?: string;
    };

    if (!body.sender_id || !body.target_id) {
      return NextResponse.json(
        { error: "A sender and a recipient are both required." },
        { status: 400 },
      );
    }

    if (body.sender_id === body.target_id) {
      return NextResponse.json(
        { error: "Somebody cannot send themselves a Flare." },
        { status: 400 },
      );
    }

    const note = (body.note ?? "").trim().slice(0, MAX_NOTE);

    const { data, error } = await auth.supabase.rpc("admin_send_flare", {
      p_sender: body.sender_id,
      p_target: body.target_id,
      p_note: note || null,
    });

    if (error) throw error;

    /*
     * The function reports its own refusals rather than throwing.
     *
     * already_sent is the common one — one Flare per pair, forever — and
     * it is a normal answer, not a fault. Surfacing it as a 400 with the
     * reason lets the panel say what happened instead of "failed".
     */
    const result = data as { ok: boolean; reason?: string; matched?: boolean };

    if (!result?.ok) {
      const REASONS: Record<string, string> = {
        self: "Somebody cannot send themselves a Flare.",
        already_sent: "They have already sent this person a Flare.",
      };

      return NextResponse.json(
        { error: REASONS[result?.reason ?? ""] ?? "That Flare could not be sent." },
        { status: 400 },
      );
    }

    return NextResponse.json({ matched: result.matched === true });
  } catch (error) {
    return failed(error, "Failed to send the Flare.");
  }
}
