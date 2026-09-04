import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Roles and permissions.
 *
 * Roles are rows rather than an enum in code, so a new role does not
 * need a deploy. What they may do is a join table, which is what makes
 * "who can suspend accounts" a question with an answer.
 *
 * Two things are refused outright here rather than being left to
 * care: a system role cannot be deleted, and nobody can edit their own
 * role. The second is the one that matters — an admin who can grant
 * themselves permissions does not really have a role.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [roles, permissions, grants, admins] = await Promise.all([
      auth.supabase.from("admin_roles").select("*").order("key"),
      auth.supabase.from("admin_permissions").select("*").order("sort_order"),
      auth.supabase.from("role_permissions").select("*"),
      auth.supabase
        .from("admin_profiles")
        .select("id, email, role, role_key, created_at")
        .order("created_at"),
    ]);

    if (roles.error) throw roles.error;

    return NextResponse.json({
      roles: roles.data ?? [],
      permissions: permissions.data ?? [],
      grants: grants.data ?? [],
      admins: admins.data ?? [],
      me: auth.user?.id ?? null,
    });
  } catch (error) {
    return failed(error, "Failed to load roles.");
  }
}

/** Grant or revoke one permission on one role. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "roles.manage");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const roleKey = String(body.role_key ?? "");
    const permissionKey = String(body.permission_key ?? "");
    const granted = body.granted === true;

    if (!roleKey || !permissionKey) {
      return NextResponse.json({ error: "Missing role or permission." }, { status: 400 });
    }

    const { data: role } = await auth.supabase
      .from("admin_roles")
      .select("key, is_super")
      .eq("key", roleKey)
      .maybeSingle();

    if (!role) {
      return NextResponse.json({ error: "No such role." }, { status: 404 });
    }

    /*
     * A super role already implies everything — admin_can short-circuits
     * on is_super. Storing grants against it would suggest that
     * unticking one takes something away, which it would not.
     */
    if (role.is_super) {
      return NextResponse.json(
        { error: "A super role already has everything. Its list cannot be edited." },
        { status: 400 },
      );
    }

    if (granted) {
      await auth.supabase
        .from("role_permissions")
        .upsert(
          { role_key: roleKey, permission_key: permissionKey },
          { onConflict: "role_key,permission_key" },
        );
    } else {
      await auth.supabase
        .from("role_permissions")
        .delete()
        .eq("role_key", roleKey)
        .eq("permission_key", permissionKey);
    }

    await auth.supabase.rpc("record_admin_action", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_action: granted ? "role.grant" : "role.revoke",
      p_target_type: "admin_role",
      p_target_id: null,
      p_reason: `${granted ? "Granted" : "Revoked"} ${permissionKey} on ${roleKey}.`,
      p_before: { role: roleKey, permission: permissionKey, granted: !granted },
      p_after: { role: roleKey, permission: permissionKey, granted },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to change that permission.");
  }
}

/** Put an admin into a role. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "roles.manage");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const adminId = String(body.admin_id ?? "");
    const roleKey = body.role_key ? String(body.role_key) : null;

    if (!adminId) {
      return NextResponse.json({ error: "Missing admin." }, { status: 400 });
    }

    /*
     * Nobody edits their own role.
     *
     * Without this, the whole permission system is decorative: any
     * admin who can reach this endpoint could put themselves in the
     * super role and then do anything at all.
     */
    if (adminId === auth.user?.id) {
      return NextResponse.json(
        { error: "You cannot change your own role. Ask another admin." },
        { status: 400 },
      );
    }

    const { data: before } = await auth.supabase
      .from("admin_profiles")
      .select("id, email, role_key")
      .eq("id", adminId)
      .maybeSingle();

    if (!before) {
      return NextResponse.json({ error: "No such admin." }, { status: 404 });
    }

    const { error } = await auth.supabase
      .from("admin_profiles")
      .update({ role_key: roleKey })
      .eq("id", adminId);

    if (error) throw error;

    await auth.supabase.rpc("record_admin_action", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_action: "admin.role",
      p_target_type: "admin_profile",
      p_target_id: adminId,
      p_reason: `Role for ${before.email} set to ${roleKey ?? "none"}.`,
      p_before: { role_key: before.role_key },
      p_after: { role_key: roleKey },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to change that role.");
  }
}
