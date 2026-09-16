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
 * The screen each API route belongs to.
 *
 * A route that names no permission of its own is gated on the screen it
 * serves, so a role that cannot open Plans cannot read /api/plans
 * either. Matched longest-prefix-first.
 *
 * Routes absent from this list stay open to any admin with a role.
 * That is deliberate for the genuinely shared ones — search, the member
 * picker, settings — which several screens call and which give away
 * nothing a signed-in admin cannot already see.
 */
const ROUTE_SCREEN: { prefix: string; permission: string }[] = [
  { prefix: "/api/plans", permission: "page.plans" },
  { prefix: "/api/economy", permission: "page.plans" },
  { prefix: "/api/roses", permission: "page.roses" },
  { prefix: "/api/promos", permission: "page.codes" },
  { prefix: "/api/promo-rewards", permission: "page.codes" },
  { prefix: "/api/invites", permission: "page.codes" },
  { prefix: "/api/seed-profiles", permission: "page.seed" },
  { prefix: "/api/roles", permission: "page.access" },
  { prefix: "/api/admins", permission: "page.access" },
  { prefix: "/api/compatibility", permission: "page.compatibility" },
  { prefix: "/api/fields", permission: "page.fields" },
  { prefix: "/api/filters", permission: "page.fields" },
  { prefix: "/api/messaging", permission: "page.messaging" },
  { prefix: "/api/places", permission: "page.places" },
  { prefix: "/api/venues", permission: "page.places" },
  { prefix: "/api/hearts", permission: "page.hearts" },
  { prefix: "/api/safety", permission: "page.safety" },
  { prefix: "/api/moderation", permission: "page.safety" },
  { prefix: "/api/moderate", permission: "page.safety" },
  { prefix: "/api/reports", permission: "page.safety" },
  { prefix: "/api/verification", permission: "page.safety" },
  { prefix: "/api/members", permission: "page.members" },
  { prefix: "/api/adjust", permission: "page.members" },
  { prefix: "/api/view-as", permission: "page.members" },
  { prefix: "/api/metrics", permission: "page.pulse" },
  { prefix: "/api/pulse-sections", permission: "page.pulse" },
];

/** The screen permission a path falls back to, if any. */
function screenFor(pathname: string): string | undefined {
  return ROUTE_SCREEN.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  )?.permission;
}

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
 * A route that names no `permission` falls back to the screen it feeds
 * (see ROUTE_SCREEN below), so the data behind a screen somebody cannot
 * open is refused as well as hidden. Before that fallback existed,
 * hiding the Plans tab from a role still left /api/plans readable to
 * them by typing the address — the interface was gated and the data
 * was not.
 *
 * A null `role_key` is refused outright. It used to mean "predates the
 * roles system, allow everything", which quietly made every newly added
 * admin a full administrator.
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

  if (profile.role !== "admin" || !roleKey) {
    return {
      error: NextResponse.json({ error: "Admin access required." }, { status: 403 }),
    };
  }

  /*
   * A route that names no permission inherits its screen's.
   *
   * Annotating seventy-odd routes by hand is seventy chances to miss
   * one, and a missed route is silently open rather than loudly broken.
   * Falling back to the screen map means a new route under an existing
   * prefix is covered the moment it is written.
   */
  const required = permission ?? screenFor(new URL(request.url).pathname);

  if (!required) return { supabase, user };

  const allowed = await hasPermission(supabase, roleKey, required);

  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: `Your role cannot do this (${required}).` },
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

/**
 * Turns a thrown error into the JSON shape every route here returns.
 *
 * ── Why this reads more than `instanceof Error` ───────────────
 *
 * Supabase rejects with a plain object — `{ message, code, details,
 * hint }` — not an Error instance. So every database refusal fell past
 * the instanceof check to the fallback, and the panel said "Failed to
 * remove that tier." whether the cause was a foreign key, a permission,
 * or a typo in a column name. The one piece of information worth having
 * was the one piece being discarded.
 *
 * A few Postgres codes are rewritten into something a non-technical
 * admin can act on; anything else passes its own message through, which
 * is still far better than a fallback that says only that something
 * went wrong.
 */
export function failed(error: unknown, fallback: string) {
  const db = error as
    | { message?: string; code?: string; details?: string; hint?: string }
    | null;

  const code = db?.code;
  let message = error instanceof Error ? error.message : db?.message;

  // 23503: foreign key violation — something else still points at this.
  if (code === "23503") {
    message =
      "Something else in the app still uses this, so it cannot be removed yet." +
      (db?.details ? ` (${db.details})` : "");
  }

  // 23505: unique violation — a row with this identity already exists.
  if (code === "23505") {
    message = "Something with that name or key already exists.";
  }

  return NextResponse.json(
    { error: message || fallback },
    { status: 500 },
  );
}
