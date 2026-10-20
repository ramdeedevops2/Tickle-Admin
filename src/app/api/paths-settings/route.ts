import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";
import { PATHS_DEFAULTS, PATHS_FEED_KEYS, parsePathsSettingsPatch, pathsFeedControlsReady } from "@/lib/pathsSettings";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "page.geo");
    if (auth.error) return auth.error;
    const { data, error } = await auth.supabase.from("paths_settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return NextResponse.json({
      settings: Object.fromEntries(Object.keys(PATHS_DEFAULTS).map(key => [key, data[key] ?? PATHS_DEFAULTS[key as keyof typeof PATHS_DEFAULTS]])),
      feed_controls_ready: pathsFeedControlsReady(data),
    });
  } catch (error) {
    return failed(error, "Failed to load Paths settings.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "page.geo");
    if (auth.error) return auth.error;
    const body: unknown = await request.json();
    const { data: current, error: readError } = await auth.supabase.from("paths_settings").select("*").eq("id", 1).single();
    if (readError) throw readError;
    let update;
    try {
      update = parsePathsSettingsPatch(body, { ...PATHS_DEFAULTS, ...current });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid Paths settings." }, { status: 400 });
    }
    if (!pathsFeedControlsReady(current) && PATHS_FEED_KEYS.some(key => key in update)) {
      return NextResponse.json({ error: "Apply migration 132_paths_admin_feed_controls.sql before changing feed controls." }, { status: 409 });
    }
    await auth.supabase.rpc("set_config_actor", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_reason: null,
    });
    const { error } = await auth.supabase.from("paths_settings")
      .update({ ...update, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to save Paths settings.");
  }
}
