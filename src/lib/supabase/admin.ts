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

/**
 * Authenticate, and optionally authorise.
 *
 * Until now this only asked whether `role` was the string "admin". The
 * whole roles system underneath it — admin_roles, admin_permissions,
 * role_permissions, admin_profiles.role_key, and an `admin_can()`
 * function written for exactly this — was stored, editable in the
 * panel, and consulted by nothing. Ticking a permission box changed a
 * row and changed nobody's access.
 *
 * Passing `permission` now gates the route on it for real.
 *
 * Two deliberate conservative choices:
 *
 *   - A route with no `permission` keeps the old rule (must be
 *     role "admin"). Opening every ungated route to every role as a
 *     side effect of adding enforcement would be a widening nobody
 *     asked for; routes join the new system one at a time, by being
 *     given a permission.
 *
 *   - An admin whose `role_key` was never backfilled is treated as the
 *     built-in "admin" role rather than as having no permissions. The
 *     alternative locks the only administrator out of their own panel,
 *     which is a worse failure than a slightly generous default.
 */
export async function requireAdmin(
  request: NextRequest,
  permission?: string,
): Promise<AdminAuth> {
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
    .select("role, role_key")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return {
      error: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }

  const roleKey = (profile.role_key as string | null) ?? null;

  // Ungated route: unchanged behaviour.
  if (!permission) {
    if (profile.role !== "admin") {
      return {
        error: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
      };
    }
    return { supabase, user };
  }

  /*
   * Nobody has assigned this person a role yet.
   *
   * Before enforcement existed they could do everything, so anyone
   * still in that state keeps it. Resolving them to the built-in
   * "admin" role instead would look tidier and would lock the only
   * administrator out of the roles page — the one screen that could
   * undo the problem. Enforcement begins the moment a role is
   * deliberately assigned.
   */
  if (!roleKey) {
    if (profile.role === "admin") return { supabase, user };

    return {
      error: NextResponse.json(
        { error: "No role assigned. Ask a super admin to give you one." },
        { status: 403 },
      ),
    };
  }

  const allowed = await hasPermission(supabase, roleKey, permission);

  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: `Your role cannot do this (${permission}).` },
        { status: 403 },
      ),
    };
  }

  return { supabase, user };
}

/**
 * Whether a role grants a permission.
 *
 * Prefers the `admin_can` function from migration 050 so the answer
 * matches anything else asking the same question. Where that function
 * has not been created yet, it falls back to reading the same two
 * tables directly rather than failing open — a permission check that
 * returns "yes" when it errors is worse than no check at all.
 */
async function hasPermission(
  supabase: SupabaseClient,
  roleKey: string,
  permission: string,
): Promise<boolean> {
  const { data: role } = await supabase
    .from("admin_roles")
    .select("is_super")
    .eq("key", roleKey)
    .maybeSingle();

  // The super flag is a flag rather than a permission set precisely so
  // it cannot be assembled by ticking boxes.
  if (role?.is_super) return true;

  const { data: grant } = await supabase
    .from("role_permissions")
    .select("permission_key")
    .eq("role_key", roleKey)
    .eq("permission_key", permission)
    .maybeSingle();

  return Boolean(grant);
}

/** Turns a thrown error into the JSON shape every route here returns. */
export function failed(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : fallback },
    { status: 500 },
  );
}
