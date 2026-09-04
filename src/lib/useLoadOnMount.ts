"use client";

import { useEffect } from "react";

/**
 * Run a loader once on mount, and again if it changes.
 *
 * Every page here was writing this by hand, and in two different ways:
 * twenty used `void Promise.resolve().then(load)` and a handful used
 * `void load()`. The two behave differently and only one of them is
 * right, which is the kind of split that gets copied into the next page
 * by whoever looks at the nearest example.
 *
 * The deferral is the point. Calling the loader directly starts it
 * inside the effect's synchronous commit: the first `setState` it
 * reaches — usually `setLoading(true)` — lands before React has finished
 * committing, and the component renders twice before it has anything to
 * show. Going through a microtask lets the commit finish first, so the
 * loading state is one render rather than two. It is also what the
 * `react-hooks/set-state-in-effect` rule is asking for, since that rule
 * cannot see past an async function to know when the state actually
 * changes.
 *
 * Pass a `useCallback`-stable loader. An inline arrow re-creates itself
 * every render and this will refetch forever.
 */
export function useLoadOnMount(load: () => void | Promise<unknown>) {
  useEffect(() => {
    let cancelled = false;

    void Promise.resolve().then(() => {
      // A navigation between the microtask being queued and it running
      // would otherwise start a fetch whose results nobody wants.
      if (!cancelled) void load();
    });

    return () => {
      cancelled = true;
    };
  }, [load]);
}
