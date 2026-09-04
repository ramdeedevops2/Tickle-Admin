"use client";
import { useCallback, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * Who may do what.
 *
 * A sensitive permission is marked as such rather than hidden. Somebody
 * assembling a role should be able to see that"suspend accounts" is not
 * the same weight as"view members" while they are ticking boxes.
 */

type Role = {
  key: string;
  label: string;
  description: string | null;
  is_super: boolean;
  system: boolean;
};

type Permission = {
  key: string;
  label: string;
  area: string;
  sensitive: boolean;
};

type Grant = { role_key: string; permission_key: string };

type Admin = {
  id: string;
  email: string | null;
  role: string | null;
  role_key: string | null;
};

type Payload = {
  roles: Role[];
  permissions: Permission[];
  grants: Grant[];
  admins: Admin[];
  me: string | null;
};

export function RolesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Payload>("/api/roles");

    if (error) setError(error);
    else {
      setData(data ?? null);
      setError(null);
    }
  }, []);

  useLoadOnMount(load);

  const granted = useMemo(() => {
    const set = new Set<string>();
    for (const grant of data?.grants ?? []) {
      set.add(`${grant.role_key}:${grant.permission_key}`);
    }
    return set;
  }, [data?.grants]);

  const toggle = useCallback(
    async (roleKey: string, permissionKey: string, next: boolean) => {
      setBusy(true);
      setError(null);

      const { error } = await adminFetch("/api/roles", {
        method: "POST",
        body: JSON.stringify({
          role_key: roleKey,
          permission_key: permissionKey,
          granted: next,
        }),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const assign = useCallback(
    async (adminId: string, roleKey: string) => {
      setBusy(true);
      setError(null);

      const { error } = await adminFetch("/api/roles", {
        method: "PATCH",
        body: JSON.stringify({ admin_id: adminId, role_key: roleKey || null }),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const byArea = useMemo(() => {
    const groups: Record<string, Permission[]> = {};
    for (const permission of data?.permissions ?? []) {
      (groups[permission.area] ??= []).push(permission);
    }
    return groups;
  }, [data?.permissions]);

  // Above the early return: React needs the same hooks in the same order
  // on every render, and one that runs only after data arrives changes
  // the count between renders.
  const { page, setPage } = usePagination(data?.admins.length ?? 0);

  if (!data) {
    return <p className="text-[0.92rem] text-muted-foreground">{error ?? "Loading…"}</p>;
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Admins</CardTitle>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Everybody who can sign in here, and what each of them is allowed to
            change. {data.roles.length} roles, {data.permissions.length}{" "}
            permissions.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <>
            {paginate(data.admins, page).map((admin) => {
            const self = admin.id === data.me;

            return (
              <div
                key={admin.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-foreground/[0.06] pb-2 last:border-0"
              >
                <div>
                  <p className="text-[0.92rem] font-medium">{admin.email ?? admin.id}</p>
                  {self && (
                    <p className="text-[1rem] leading-relaxed text-muted-foreground">
                      You — change your own role from another admin account.
                    </p>
                  )}
                </div>

                <Select
                  value={admin.role_key ??""}
                  disabled={busy || self}
                  onChange={(next) => assign(admin.id, next)}
                  options={[
                    { value: "", label: "no role" },
                    ...data.roles.map((role) => ({
                      value: role.key,
                      label: role.label,
                    })),
                  ]}
                  className="w-[9rem]"
                  align="end"
                />
              </div>
            );
          })}
            <Pagination page={page} total={data.admins.length} onPage={setPage} />
          </>
        </CardContent>
      </Card>

      {data.roles.map((role) => (
        <Card key={role.key}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{role.label}</CardTitle>
              {role.is_super && (
                <Badge variant="destructive" className="gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  everything
                </Badge>
              )}
              {role.system && <Badge variant="outline">built in</Badge>}
            </div>
            {role.description && (
              <p className="text-[0.92rem] text-muted-foreground">{role.description}</p>
            )}
          </CardHeader>

          <CardContent>
            {role.is_super ? (
              /* Not a list of ticked boxes, because unticking one would
                 change nothing — admin_can returns true for a super role
                 without consulting the grants at all. */
              <p className="text-[0.92rem] text-muted-foreground">
                This role can do everything, including anything added later. There
                is nothing to configure.
              </p>
            ) : (
              <div className="space-y-4">
                {Object.entries(byArea).map(([area, permissions]) => (
                  <div key={area}>
                    <p className="mb-2 text-[0.86rem] uppercase tracking-wider text-muted-foreground">
                      {area}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {permissions.map((permission) => {
                        const on = granted.has(`${role.key}:${permission.key}`);

                        return (
                          <label
                            key={permission.key}
                            className="flex items-start gap-2 text-[0.92rem]"
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              disabled={busy}
                              onChange={(event) =>
                                toggle(role.key, permission.key, event.target.checked)
                              }
                              className="mt-0.5 size-3.5 shrink-0 rounded border border-foreground/30 accent-foreground"
                            />
                            <span>
                              {permission.label}
                              {permission.sensitive && (
                                <span className="ml-1 text-[0.86rem] text-amber-600">
                                  sensitive
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
