import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * What the signed-in admin is allowed to do.
 *
 * The sidebar and the pages need this to hide what somebody cannot
 * open. It is a convenience for the interface only — every route still
 * checks its own permission, because a hidden link is not a closed door
 * and anybody can type a URL.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { data: profile } = await auth.supabase
      .from("admin_profiles")
      .select("email, display_name, role_key")
      .eq("id", auth.user.id)
      .single();

    const roleKey = profile?.role_key ?? null;

    if (!roleKey) {
      return NextResponse.json({
        email: profile?.email ?? null,
        role_key: null,
        is_super: false,
        permissions: [],
      });
    }

    const { data: role } = await auth.supabase
      .from("admin_roles")
      .select("is_super")
      .eq("key", roleKey)
      .maybeSingle();

    /*
     * A super admin holds everything, including permissions added
     * after their role was set up. Listing the table rather than their
     * grants means a new screen does not quietly become invisible to
     * the only person who could grant it.
     */
    if (role?.is_super) {
      const { data: all } = await auth.supabase
        .from("admin_permissions")
        .select("key");

      return NextResponse.json({
        email: profile?.email ?? null,
        role_key: roleKey,
        is_super: true,
        permissions: (all ?? []).map((row) => row.key as string),
      });
    }

    const { data: grants } = await auth.supabase
      .from("role_permissions")
      .select("permission_key")
      .eq("role_key", roleKey);

    return NextResponse.json({
      email: profile?.email ?? null,
      role_key: roleKey,
      is_super: false,
      permissions: (grants ?? []).map((row) => row.permission_key as string),
    });
  } catch (error) {
    return failed(error, "Failed to read your access.");
  }
}
