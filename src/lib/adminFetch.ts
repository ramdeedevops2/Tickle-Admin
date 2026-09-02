import { createClient } from "@/lib/supabase/client";

/**
 * Call one of the panel's own API routes with the signed-in admin's session.
 *
 * Everything privileged in the panel goes through a route handler holding
 * the service role key, and every one of those routes proves the caller is
 * an admin from the bearer token. Doing that by hand at each call site is
 * how one of them eventually ends up without the header — so it lives here.
 */
/**
 * Read a table the way the pages used to read it directly.
 *
 * Shaped to mirror the supabase-js call it replaces, so switching a page
 * over is a rename rather than a rewrite. Returns the same
 * `{ data, error }` those call sites already branch on.
 */
export async function adminTable<T>(
  table: string,
  options: {
    select?: string;
    order?: string;
    ascending?: boolean;
    limit?: number;
    eq?: [column: string, value: string];
    in?: [column: string, values: string[]];
    gt?: [column: string, value: string];
  } = {},
): Promise<{ data: T[] | null; error: string | null }> {
  const params = new URLSearchParams({ table });

  if (options.select) params.set("select", options.select);
  if (options.order) params.set("order", options.order);
  if (options.ascending) params.set("ascending", "true");
  if (options.limit) params.set("limit", String(options.limit));
  if (options.eq) {
    params.set("eq", options.eq[0]);
    params.set("value", options.eq[1]);
  }
  if (options.in) {
    params.set("in", options.in[0]);
    params.set("values", options.in[1].join(","));
  }
  if (options.gt) {
    params.set("gt", options.gt[0]);
    params.set("gtValue", options.gt[1]);
  }

  const { data, error } = await adminFetch<{ rows: T[] }>(`/api/table?${params}`);

  return { data: data?.rows ?? null, error };
}

/** Row counts for several tables at once, without fetching the rows. */
export async function adminCounts(
  tables: (string | { table: string; gt?: [string, string] })[],
): Promise<{ data: Record<string, number> | null; error: string | null }> {
  const { data, error } = await adminFetch<{ counts: Record<string, number> }>("/api/table", {
    method: "POST",
    body: JSON.stringify({ tables }),
  });

  return { data: data?.counts ?? null, error };
}

export async function adminFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data: T | null; error: string | null }> {
  const supabase = createClient();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { data: null, error: "Your session has expired. Sign in again." };
  }

  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        data: null,
        error: result?.error ?? `Request failed (${response.status}).`,
      };
    }

    return { data: result as T, error: null };
  } catch (error) {
    // A network failure and a 500 read the same to the person looking at the
    // page, so they get the same shape rather than one throwing past the UI.
    return {
      data: null,
      error: error instanceof Error ? error.message : "Request failed.",
    };
  }
}
