"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";

export type MyAccess = {
  email: string | null;
  role_key: string | null;
  is_super: boolean;
  permissions: string[];
};

/**
 * The signed-in admin's own permissions.
 *
 * Fetched once per mount and shared by the sidebar and any page that
 * needs to hide a control. Deliberately not cached across mounts: a
 * role change should take effect on the next navigation rather than
 * whenever a cache happened to expire.
 *
 * `ready` exists so callers can tell "no permissions" from "not loaded
 * yet". Without it the sidebar renders empty for a frame and the tabs
 * visibly pop in, which reads as a glitch.
 */
export function useMyAccess() {
  const [access, setAccess] = useState<MyAccess | null>(null);

  useEffect(() => {
    let alive = true;

    void adminFetch<MyAccess>("/api/me").then(({ data }) => {
      if (alive && data) setAccess(data);
    });

    return () => {
      alive = false;
    };
  }, []);

  return {
    access,
    ready: access !== null,
    can: (permission: string) =>
      Boolean(access?.is_super || access?.permissions.includes(permission)),
  };
}
