import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Announcements.
 *
 * The send itself is one INSERT ... SELECT inside send_broadcast(), so
 * twenty thousand notifications are one statement rather than twenty
 * thousand round trips from this handler.
 */

const AUDIENCES = ["everyone", "active", "male", "female"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase
      .from("broadcasts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return NextResponse.json({ broadcasts: data ?? [] });
  } catch (error) {
    return failed(error, "Failed to load broadcasts.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as {
      title?: string;
      body?: string;
      audience?: string;
    };

    const title = body.title?.trim();
    const audience = body.audience ?? "everyone";

    if (!title) {
      return NextResponse.json({ error: "A broadcast needs a title." }, { status: 400 });
    }
    if (!AUDIENCES.includes(audience)) {
      return NextResponse.json({ error: "Unknown audience." }, { status: 400 });
    }

    const { data, error } = await auth.supabase.rpc("send_broadcast", {
      p_title: title,
      p_body: body.body?.trim() ?? "",
      p_audience: audience,
      p_sent_by: auth.user.id,
    });

    if (error) throw error;

    return NextResponse.json({ recipients: data ?? 0 });
  } catch (error) {
    return failed(error, "Failed to send broadcast.");
  }
}
