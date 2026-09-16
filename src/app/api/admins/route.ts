import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, requireAdmin } from "@/lib/supabase/admin";

async function findUserIdByEmail(
  supabase: ReturnType<typeof getServiceClient>,
  email: string,
) {
  let page = 1;

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });

    if (error) throw error;

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    );
    if (user) return user.id;

    if (data.users.length < 1000) break;
    page += 1;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "admins.manage");
    if (auth.error) return auth.error;

    const body = (await request.json()) as {
      email?: string;
      display_name?: string;
      role_key?: string;
    };
    const email = body.email?.trim().toLowerCase();
    const displayName = body.display_name?.trim();

    if (!email || !displayName) {
      return NextResponse.json(
        { error: "Email and display name are required." },
        { status: 400 },
      );
    }

    /*
     * A new admin gets a role, and the least powerful one by default.
     *
     * This used to write role only — leaving role_key null — which put
     * every new admin into the pre-roles legacy state. requireAdmin
     * treats that state as "predates enforcement, allow everything", so
     * adding a moderator silently created a full administrator, and the
     * roles page showed them as "no role" while the admins page showed
     * "Everything, including admins". Both were reading the same row;
     * only one of them was wrong about what it meant.
     *
     * Defaulting to 'support' rather than 'admin' because a role that
     * has to be widened deliberately is a smaller mistake than one that
     * has to be narrowed after the fact.
     */
    const requestedRole = body.role_key?.trim() || "support";

    const { data: roleRow } = await auth.supabase
      .from("admin_roles")
      .select("key, is_super")
      .eq("key", requestedRole)
      .maybeSingle();

    if (!roleRow) {
      return NextResponse.json(
        { error: `There is no "${requestedRole}" role.` },
        { status: 400 },
      );
    }

    /*
     * Only a super admin can mint another one.
     *
     * admins.manage is enough to add people; it is not enough to hand
     * out the role that can remove you.
     */
    if (roleRow.is_super) {
      const { data: me } = await auth.supabase
        .from("admin_profiles")
        .select("role_key")
        .eq("id", auth.user.id)
        .single();

      const { data: myRole } = await auth.supabase
        .from("admin_roles")
        .select("is_super")
        .eq("key", me?.role_key ?? "")
        .maybeSingle();

      if (!myRole?.is_super) {
        return NextResponse.json(
          { error: "Only a super admin can add another super admin." },
          { status: 403 },
        );
      }
    }

    let userId = await findUserIdByEmail(auth.supabase, email);

    if (!userId) {
      const { data, error } = await auth.supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
        },
      });

      if (error) throw error;
      userId = data.user.id;
    }

    const { error } = await auth.supabase.from("admin_profiles").upsert(
      {
        id: userId,
        email,
        role: "admin",
        // Set explicitly, so the new row is governed by the roles system
        // rather than falling into the legacy allow-everything path.
        role_key: roleRow.key,
        display_name: displayName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) throw error;

    return NextResponse.json({ id: userId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create admin." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "admins.manage");
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Admin ID is required." }, { status: 400 });
    }

    if (id === auth.user.id) {
      return NextResponse.json(
        { error: "You cannot delete your own admin access." },
        { status: 400 },
      );
    }

    const { error } = await auth.supabase
      .from("admin_profiles")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete admin." },
      { status: 500 },
    );
  }
}
