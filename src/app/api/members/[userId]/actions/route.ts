import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Everything that can be done *to* a member.
 *
 * The members pages were read-only, which made this panel a dashboard
 * rather than a console: an admin who found a problem had to go and fix it
 * somewhere else. Every action here is one an admin previously had to open
 * the Supabase dashboard to perform, which is both slower and unlogged.
 *
 * One route with an `action` rather than eight endpoints, because these
 * share their auth, their audit trail, and the rule that matters most:
 * nothing is destructive by default. Suspension is a timestamp that can be
 * cleared, verification can be revoked, Roses move through the ledger that
 * already exists. Deleting an account is the single exception, and it says
 * so.
 */

type Action =
  | "suspend"
  | "unsuspend"
  | "verify_face"
  | "unverify_face"
  | "verify_phone"
  | "grant_premium"
  | "revoke_premium"
  | "grant_roses"
  | "unpublish"
  | "republish"
  | "delete";

/**
 * Actions that change what a person can do, written to auth_events so the
 * record of who did what survives the admin who did it.
 *
 * Best-effort: a failed audit write must not roll back a suspension that
 * an admin is applying for a reason. The action is what matters; the log
 * is how we explain it later.
 */
async function audit(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  adminId: string,
  detail?: Record<string, unknown>,
) {
  try {
    await supabase.from("auth_events").insert({
      user_id: userId,
      event: `admin_${action}`,
      metadata: { admin_id: adminId, ...detail },
    });
  } catch {
    // Deliberately swallowed. See above.
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { userId } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "") as Action;

    const adminId = auth.user?.id ?? "unknown";

    switch (action) {
      /*
       * Suspension is a timestamp, not a deletion. The account stays,
       * their matches stay, and clearing the column undoes it completely
       * — which is what makes suspending a reversible first response
       * rather than a decision to agonise over.
       */
      case "suspend": {
        const reason = String(body.reason ?? "").trim().slice(0, 200);

        const { error } = await auth.supabase
          .from("profiles")
          .update({ suspended_at: new Date().toISOString() })
          .eq("user_id", userId);

        if (error) throw error;

        await audit(auth.supabase, userId, "suspend", adminId, { reason });
        return NextResponse.json({ ok: true, suspended: true });
      }

      case "unsuspend": {
        const { error } = await auth.supabase
          .from("profiles")
          .update({ suspended_at: null })
          .eq("user_id", userId);

        if (error) throw error;

        await audit(auth.supabase, userId, "unsuspend", adminId);
        return NextResponse.json({ ok: true, suspended: false });
      }

      /*
       * Face verification is normally automatic, through Rekognition.
       * This is the override for the cases automation gets wrong — a
       * genuine person the model keeps rejecting, or a badge that needs
       * taking back after the fact.
       */
      case "verify_face":
      case "unverify_face": {
        const verifying = action === "verify_face";

        const { error } = await auth.supabase
          .from("profiles")
          .update({ face_verified_at: verifying ? new Date().toISOString() : null })
          .eq("user_id", userId);

        if (error) throw error;

        await audit(auth.supabase, userId, action, adminId);
        return NextResponse.json({ ok: true, faceVerified: verifying });
      }

      case "verify_phone": {
        const { error } = await auth.supabase
          .from("profiles")
          .update({ phone_verified_at: new Date().toISOString() })
          .eq("user_id", userId);

        if (error) throw error;

        await audit(auth.supabase, userId, "verify_phone", adminId);
        return NextResponse.json({ ok: true });
      }

      /*
       * Premium is an expiry date. Granting it is adding days from now —
       * or from an existing expiry, so comping a month to someone who
       * already paid extends rather than replaces what they bought.
       */
      case "grant_premium": {
        const days = Number(body.days ?? 30);

        if (!Number.isFinite(days) || days < 1 || days > 3650) {
          return NextResponse.json({ error: "Days must be between 1 and 3650." }, { status: 400 });
        }

        const { data: current } = await auth.supabase
          .from("profiles")
          .select("premium_until")
          .eq("user_id", userId)
          .maybeSingle();

        const existing = current?.premium_until ? new Date(current.premium_until).getTime() : 0;
        const from = Math.max(existing, Date.now());
        const until = new Date(from + days * 86_400_000).toISOString();

        const { error } = await auth.supabase
          .from("profiles")
          .update({ premium_until: until })
          .eq("user_id", userId);

        if (error) throw error;

        await audit(auth.supabase, userId, "grant_premium", adminId, { days, until });
        return NextResponse.json({ ok: true, premiumUntil: until });
      }

      case "revoke_premium": {
        const { error } = await auth.supabase
          .from("profiles")
          .update({ premium_until: null })
          .eq("user_id", userId);

        if (error) throw error;

        await audit(auth.supabase, userId, "revoke_premium", adminId);
        return NextResponse.json({ ok: true });
      }

      /*
       * Through the ledger function, never by writing the balance. The
       * ledger is what makes a balance explainable, and a direct update
       * is a number nobody can account for later. Negative amounts
       * deduct, which is the same call.
       */
      case "grant_roses": {
        const amount = Number(body.amount ?? 0);

        if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 10000) {
          return NextResponse.json(
            { error: "Amount must be non-zero and within 10,000." },
            { status: 400 },
          );
        }

        const { data, error } = await auth.supabase.rpc("admin_grant_roses", {
          p_user_id: userId,
          p_amount: Math.round(amount),
          p_reason: String(body.reason ?? "admin_grant").slice(0, 60),
        });

        if (error) throw error;

        await audit(auth.supabase, userId, "grant_roses", adminId, { amount });
        return NextResponse.json({ ok: true, balance: data });
      }

      /*
       * Unpublishing takes someone out of discovery without suspending
       * them. It is the right response to a profile that is not against
       * the rules but is not ready to be seen — a broken photo set, a bio
       * that is someone's phone number.
       */
      case "unpublish": {
        const { error } = await auth.supabase
          .from("profiles")
          .update({ published_at: null })
          .eq("user_id", userId);

        if (error) throw error;

        await audit(auth.supabase, userId, "unpublish", adminId);
        return NextResponse.json({ ok: true });
      }

      case "republish": {
        const { error } = await auth.supabase
          .from("profiles")
          .update({ published_at: new Date().toISOString() })
          .eq("user_id", userId);

        if (error) throw error;

        await audit(auth.supabase, userId, "republish", adminId);
        return NextResponse.json({ ok: true });
      }

      /*
       * The one irreversible action here.
       *
       * Guarded by typed confirmation rather than a dialog, because a
       * dialog is something you click through and this is something that
       * cannot be undone. Deleting the auth user cascades to the profile
       * and everything referencing it.
       */
      case "delete": {
        if (body.confirm !== "DELETE") {
          return NextResponse.json(
            { error: "Deletion needs explicit confirmation." },
            { status: 400 },
          );
        }

        // Logged before the delete, since afterwards there is no user row
        // for the audit to reference.
        await audit(auth.supabase, userId, "delete", adminId, {
          reason: String(body.reason ?? "").slice(0, 200),
        });

        const { error } = await auth.supabase.auth.admin.deleteUser(userId);
        if (error) throw error;

        return NextResponse.json({ ok: true, deleted: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (error) {
    return failed(error, "Action failed.");
  }
}
