"use client";

import { useCallback, useRef, useState } from "react";
import { adminTable } from "@/lib/adminFetch";

/**
 * Turning user ids into names, on any screen.
 *
 * Every list in the panel had the same shape of bug: it fetched rows
 * carrying `user_id`, had no profile to go with them, and fell back to
 * eight characters of a uuid. That is not an identity — it is the
 * absence of one, and two different members look like the same kind of
 * nothing.
 *
 * `/api/hearts` and `/api/roses` solve this server-side, where the auth
 * record can be consulted too. This is the client-side counterpart for
 * screens that read tables directly: hand it the ids a page just loaded,
 * and it fetches the profiles behind them once.
 *
 * What it cannot do is reach `auth.users`, so an account with no profile
 * row resolves to "Deleted account" rather than to an email. That is the
 * honest answer from here: a row referencing somebody with no profile is
 * usually somebody who left.
 */

export type NamedRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos?: string[] | null;
};

export function useNames() {
  const [names, setNames] = useState<Map<string, NamedRow>>(new Map());

  /*
   * The same map, readable synchronously.
   *
   * ── Why a ref as well as state ────────────────────────────────
   *
   * resolve() has to answer "which of these ids do I not have yet?"
   * before it can fetch, and it must not take `names` as a dependency
   * or it would be re-created on every resolved batch and restart the
   * loaders that hold it in their own dep arrays.
   *
   * It used to get that answer by calling setNames with an updater that
   * read `current`, assigned to a variable in the enclosing scope, and
   * returned `current` unchanged. That is a side effect inside an
   * updater, and it is unreliable in two ways: returning identical
   * state makes React bail out of the re-render, and under StrictMode
   * the updater runs twice — so the variable was written against state
   * that had already moved.
   *
   * The visible result was every name in the dashboard's activity feed
   * rendering as "…" — the placeholder for "not looked up yet" — while
   * the ids were valid and the request would have succeeded.
   *
   * The ref carries the same contents and is safe to read outright.
   * State stays because it is what re-renders the list when names land;
   * the ref is only the lookup.
   */
  const known = useRef<Map<string, NamedRow>>(new Map());

  /**
   * Look up whichever ids are not already known.
   *
   * Call it after loading rows, with every id on the page. Repeated
   * calls only fetch what is new, so paging a list does not refetch the
   * names it already has.
   */
  const resolve = useCallback(async (ids: (string | null | undefined)[]) => {
    const wanted = Array.from(
      new Set(ids.filter((id): id is string => Boolean(id))),
    );

    if (wanted.length === 0) return;

    const missing = wanted.filter((id) => !known.current.has(id));

    if (missing.length === 0) return;

    /*
     * Claimed before the request, not after.
     *
     * Two lists mounting at once both call resolve with overlapping
     * ids, and without this each sees an unclaimed map and fetches the
     * same profiles twice. Recording them now makes the second call a
     * no-op; the real rows overwrite these placeholders when they land.
     */
    for (const id of missing) {
      known.current.set(id, { user_id: id, name: null, email: null });
    }

    const { data } = await adminTable<NamedRow>("profiles", {
      select: "user_id, name, email, photos",
      in: ["user_id", missing],
    });

    // The ref first, so a resolve() racing this one sees the answer.
    // Ids that came back with nothing keep the placeholder set above,
    // which is what stops every later call asking for them forever.
    for (const row of data ?? []) known.current.set(row.user_id, row);

    /*
     * A new Map every time, deliberately.
     *
     * Handing React the same reference back makes it bail out of the
     * re-render, and the names never appear however correct the data is.
     */
    setNames(new Map(known.current));
  }, []);

  /** What to call somebody. Never a uuid. */
  const nameOf = useCallback(
    (id: string | null | undefined) => {
      if (!id) return "Nobody";

      const row = names.get(id);
      if (!row) return "…";

      return row.name || row.email || "Deleted account";
    },
    [names],
  );

  const profileOf = useCallback(
    (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null),
    [names],
  );

  return { resolve, nameOf, profileOf, names };
}
