"use client";

import { useMemo } from "react";
import { CollapsibleCard } from "@/components/access/CollapsibleCard";

/**
 * Which roles can open which screens.
 *
 * ── Why a grid, inside the roles tab ──────────────────────────
 *
 * These are permissions like any other and did briefly live in the
 * per-role checkbox lists below. They read badly there: that list
 * answers "what may this role change?" one role at a time, and fifteen
 * near-identical "Open X" lines repeated inside every role card is
 * something you scroll past rather than set.
 *
 * Opening a screen is a different question and a smaller one — the same
 * question asked of every role — so it gets the shape that fits: roles
 * across, screens down, one checkbox per cell. The whole map is legible
 * at a glance, which the list form cannot do.
 *
 * It stays in this tab rather than a tab of its own because it is the
 * same subject: first which parts of the panel somebody sees, then what
 * they may change inside them.
 *
 * ── State lives in the parent ─────────────────────────────────
 *
 * This component fetches nothing. RolesPanel already has the roles, the
 * permissions and the grants, and passing them down means one load and
 * one source of truth — a second fetch here would show stale ticks the
 * moment somebody edited a role below.
 */

type Role = { key: string; label: string; is_super: boolean };
type Permission = { key: string; label: string; sensitive: boolean; area: string };

/** Strips the "Open " that reads as noise once the column says it. */
function screenName(label: string): string {
  return label.replace(/^Open\s+/i, "");
}

export function ScreensGrid({
  roles,
  permissions,
  granted,
  busy,
  onToggle,
}: {
  roles: Role[];
  permissions: Permission[];
  /** Keys of the form `${role_key}:${permission_key}`. */
  granted: Set<string>;
  busy: boolean;
  onToggle: (roleKey: string, permissionKey: string, next: boolean) => void;
}) {
  const screens = useMemo(
    () => permissions.filter((p) => p.key.startsWith("page.")),
    [permissions],
  );

  // Nothing to show until the migration that defines them has run.
  if (screens.length === 0) return null;

  return (
    <CollapsibleCard
      title="Screens they can open"
      subtitle="Unticking a screen hides it from that role’s sidebar and refuses it if somebody types the address."
    >
      {/*
        The table scrolls sideways rather than the page.

        One column per role means the grid outgrows a narrow window as
        soon as a few roles exist, and a page that scrolls horizontally
        takes the sidebar and heading with it.
      */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.92rem]">
          <thead>
            <tr className="border-b border-foreground/[0.06]">
              <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">
                Screen
              </th>
              {roles.map((role) => (
                <th
                  key={role.key}
                  className="px-3 py-2 text-center font-medium whitespace-nowrap"
                >
                  {role.label}
                  {role.is_super && (
                    <div className="text-[0.78rem] font-normal text-muted-foreground">
                      always everything
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {screens.map((screen) => (
              <tr
                key={screen.key}
                className="border-b border-foreground/[0.06] last:border-0"
              >
                <td className="sticky left-0 z-10 bg-card px-4 py-2 whitespace-nowrap">
                  {screenName(screen.label)}
                  {screen.sensitive && (
                    <span className="ml-2 text-[0.86rem] text-amber-600">
                      sensitive
                    </span>
                  )}
                </td>

                {roles.map((role) => {
                  const on =
                    role.is_super || granted.has(`${role.key}:${screen.key}`);

                  return (
                    <td key={role.key} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={on}
                        /*
                         * A super admin's boxes are ticked and fixed.
                         * Their access does not come from these rows —
                         * the permission check short-circuits on
                         * is_super — so letting somebody untick one
                         * would show a change that does not happen.
                         */
                        disabled={busy || role.is_super}
                        onChange={(event) =>
                          onToggle(role.key, screen.key, event.target.checked)
                        }
                        className="size-3.5 rounded border border-foreground/30 accent-foreground"
                        aria-label={`${role.label} can open ${screenName(screen.label)}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleCard>
  );
}
