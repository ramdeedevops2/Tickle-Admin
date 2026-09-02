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
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as {
      email?: string;
      display_name?: string;
    };
    const email = body.email?.trim().toLowerCase();
    const displayName = body.display_name?.trim();

    if (!email || !displayName) {
      return NextResponse.json(
        { error: "Email and display name are required." },
        { status: 400 },
      );
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
    const auth = await requireAdmin(request);
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
