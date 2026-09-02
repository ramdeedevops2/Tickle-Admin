import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Server-side Supabase access for the panel.
 *
 * Every table the app writes is behind RLS written from the member's point
 * of view — you see your own hearts, your own sparks, and nothing else. That
 * is correct for the app and useless for an admin, so anything the panel
 * needs to read across all rows goes through a route handler holding the
 * service role key, gated by requireAdmin.
 *
 * The key never reaches the browser. NEXT_PUBLIC_ is what makes a variable
 * public, and SUPABASE_SERVICE_ROLE_KEY deliberately is not one.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getServiceClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase service credentials are not configured.");
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Two checks, not one: that the bearer token is a real session, and that the
 * session belongs to a row in admin_profiles. Being signed in to Supabase is
 * not the same as being allowed in here — every member of the app has a
 * valid token.
 *
 * The union is shaped so `if (auth.error) return auth.error` narrows the rest
 * to the authorised branch.
 */
export type AdminAuth =
  | { error: NextResponse; supabase?: undefined; user?: undefined }
  | { error?: undefined; supabase: SupabaseClient; user: User };

export async function requireAdmin(request: NextRequest): Promise<AdminAuth> {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");

  if (!token) {
    return { error: NextResponse.json({ error: "Missing session." }, { status: 401 }) };
  }

  const supabase = getServiceClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Invalid session." }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profileError || profile?.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }

  return { supabase, user };
}

/** Turns a thrown error into the JSON shape every route here returns. */
export function failed(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
