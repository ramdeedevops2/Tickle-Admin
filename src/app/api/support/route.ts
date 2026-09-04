import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Support tickets.
 *
 * The internal flag is the load-bearing part. RLS excludes internal
 * messages from what a member can read, so the flag is enforced in the
 * database rather than by this route remembering to filter — a route
 * that forgets is a note in somebody's inbox.
 */

// Exactly the values support_tickets.status allows. A value outside
// this list is rejected by the CHECK constraint, not silently stored.
const STATUSES = ["open", "reviewing", "waiting_user", "resolved", "closed"] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get("ticket_id");

    // One thread, with the internal notes included — this is the admin
    // side, which is the only place they are ever visible.
    if (ticketId) {
      const { data, error } = await auth.supabase
        .from("support_messages")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return NextResponse.json({ messages: data ?? [] });
    }

    const status = searchParams.get("status") ?? "open";

    const { data: tickets, error } = await auth.supabase
      .from("support_tickets")
      .select("*")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    const rows = (tickets ?? []) as { user_id: string }[];
    const ids = [...new Set(rows.map((row) => row.user_id))];

    const { data: profiles } = ids.length
      ? await auth.supabase
          .from("profiles")
          .select("user_id, name, email")
          .in("user_id", ids)
      : { data: [] };

    const byUser = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p]));

    return NextResponse.json({
      tickets: rows.map((ticket) => ({
        ...ticket,
        profile: byUser[ticket.user_id] ?? null,
      })),
      statuses: STATUSES,
    });
  } catch (error) {
    return failed(error, "Failed to load tickets.");
  }
}

/** Reply to a member, or leave a note the member never sees. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const ticketId = String(body.ticket_id ?? "");
    const text = String(body.body ?? "").trim();
    const internal = body.internal === true;

    if (!ticketId || text.length < 2) {
      return NextResponse.json({ error: "Missing ticket or message." }, { status: 400 });
    }

    const { data: ticket } = await auth.supabase
      .from("support_tickets")
      .select("id, user_id, status, reference")
      .eq("id", ticketId)
      .maybeSingle();

    if (!ticket) {
      return NextResponse.json({ error: "That ticket is gone." }, { status: 404 });
    }

    const { error } = await auth.supabase.from("support_messages").insert({
      ticket_id: ticketId,
      body: text,
      from_admin: true,
      internal,
      author_id: auth.user?.id,
    });

    if (error) throw error;

    /*
     * A reply moves the ticket to waiting-on-them and notifies. An
     * internal note does neither — it is a note to the team, and a
     * member being pinged about one would be the exact leak the flag
     * exists to prevent.
     */
    if (!internal) {
      await auth.supabase
        .from("support_tickets")
        .update({ status: "waiting_user", updated_at: new Date().toISOString() })
        .eq("id", ticketId);

      // Type 'support', which is what the constraint allows. The
      // category is stamped by a trigger from the type — setting it
      // here would only be a second chance to set it wrong.
      await auth.supabase.from("notifications").insert({
        user_id: ticket.user_id,
        type: "support",
        title: "We replied",
        body: `There is an answer on ${ticket.reference}.`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to send that.");
  }
}

/** Move a ticket between states. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const ticketId = String(body.ticket_id ?? "");
    const status = String(body.status ?? "");

    if (!ticketId || !STATUSES.includes(status as (typeof STATUSES)[number])) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from("support_tickets")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", ticketId);

    if (error) throw error;

    await auth.supabase.rpc("record_admin_action", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_action: `support.${status}`,
      p_target_type: "support_ticket",
      p_target_id: ticketId,
      p_reason: `Ticket moved to ${status}.`,
      p_before: null,
      p_after: { status },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to change that ticket.");
  }
}
