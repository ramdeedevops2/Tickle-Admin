"use client";

import { useCallback, useState } from "react";
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

    // Reading `names` through the setter rather than as a dependency:
    // this callback stays stable, so it can sit in a loader's dep array
    // without re-creating it on every resolved batch.
    let missing: string[] = [];

    setNames((current) => {
      missing = wanted.filter((id) => !current.has(id));
      return current;
    });

    if (missing.length === 0) return;

    const { data } = await adminTable<NamedRow>("profiles", {
      select: "user_id, name, email, photos",
      in: ["user_id", missing],
    });

    setNames((current) => {
      const next = new Map(current);

      for (const row of data ?? []) next.set(row.user_id, row);

      // Ids that came back with nothing are recorded as looked-up, or
      // every later call asks for them again forever.
      for (const id of missing) {
        if (!next.has(id)) {
          next.set(id, { user_id: id, name: null, email: null });
        }
      }

      return next;
    });
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
