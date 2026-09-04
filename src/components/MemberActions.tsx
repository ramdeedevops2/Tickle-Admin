"use client";

import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Ban,
  BadgeCheck,
  Crown,
  Flower2,
  EyeOff,
  Trash2,
  ShieldCheck,
} from "lucide-react";

/**
 * What an admin can actually do about a member.
 *
 * Grouped by how hard each one is to undo, and labelled with what it does
 * rather than what it is called internally."Hide from discovery" is a
 * more honest button than"unpublish" for something that quietly removes
 * a person from everyone else's deck.
 *
 * Deleting is separated, styled as the exception it is, and requires the
 * word typed out. Everything above it is reversible from this same panel,
 * which is the property that makes acting quickly on a report safe.
 */

export interface MemberState {
  suspended_at: string | null;
  face_verified_at: string | null;
  phone_verified_at: string | null;
  premium_until: string | null;
  published_at: string | null;
  roses_balance?: number | null;
}

export function MemberActions({
  userId,
  state,
  onDone,
}: {
  userId: string;
  state: MemberState;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [roses, setRoses] = useState("");
  const [premiumDays, setPremiumDays] = useState("30");

  const run = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      setBusy(action);
      setError(null);

      const { error } = await adminFetch(`/api/members/${userId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action, ...payload }),
      });

      if (error) setError(error);
      else onDone();

      setBusy(null);
    },
    [userId, onDone],
  );

  const suspended = !!state.suspended_at;
  const faceVerified = !!state.face_verified_at;
  const published = !!state.published_at;
  const premium = state.premium_until && new Date(state.premium_until) > new Date();

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.86rem] font-medium uppercase tracking-wider text-muted-foreground">
            Status
          </span>
          {suspended && <Badge variant="destructive">Suspended</Badge>}
          {!published && <Badge variant="secondary">Not in discovery</Badge>}
          {faceVerified && <Badge>Face verified</Badge>}
          {state.phone_verified_at && <Badge variant="secondary">Phone verified</Badge>}
          {premium && <Badge>Premium</Badge>}
          {!suspended && published && !faceVerified && !premium && (
            <span className="text-[0.92rem] text-muted-foreground">Nothing applied</span>
          )}
        </div>

        {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            variant={suspended ? "default" :"outline"}
            size="sm"
            disabled={busy !== null}
            onClick={() => run(suspended ? "unsuspend" :"suspend")}
          >
            <Ban className="mr-1.5 h-4 w-4" />
            {suspended ? "Lift suspension" :"Suspend"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => run(faceVerified ? "unverify_face" :"verify_face")}
          >
            <BadgeCheck className="mr-1.5 h-4 w-4" />
            {faceVerified ? "Remove face badge" :"Verify face"}
          </Button>

          {!state.phone_verified_at && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => run("verify_phone")}
            >
              <ShieldCheck className="mr-1.5 h-4 w-4" />
              Verify phone
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => run(published ? "unpublish" :"republish")}
          >
            <EyeOff className="mr-1.5 h-4 w-4" />
            {published ? "Hide from discovery" :"Return to discovery"}
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-4 border-t pt-4">
          <div className="space-y-1">
            <label className="text-[0.86rem] font-medium text-muted-foreground">Roses</label>
            <div className="flex gap-1">
              <Input
                type="number"
                value={roses}
                onChange={(event) => setRoses(event.target.value)}
                placeholder="0"
                className="h-8 w-24"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || !roses || Number(roses) === 0}
                onClick={() => {
                  run("grant_roses", { amount: Number(roses) });
                  setRoses("");
                }}
              >
                <Flower2 className="mr-1 h-4 w-4" />
                Grant
              </Button>
            </div>
            {/* Negative deducts, through the same ledger entry. */}
            <p className="text-[1rem] leading-relaxed text-muted-foreground">Negative to deduct</p>
          </div>

          <div className="space-y-1">
            <label className="text-[0.86rem] font-medium text-muted-foreground">Premium</label>
            <div className="flex gap-1">
              <Input
                type="number"
                value={premiumDays}
                onChange={(event) => setPremiumDays(event.target.value)}
                className="h-8 w-24"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null || Number(premiumDays) < 1}
                onClick={() => run("grant_premium", { days: Number(premiumDays) })}
              >
                <Crown className="mr-1 h-4 w-4" />
                Add days
              </Button>
              {premium && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => run("revoke_premium")}
                >
                  Revoke
                </Button>
              )}
            </div>
            {premium && (
              <p className="text-[1rem] leading-relaxed text-muted-foreground">
                Until {new Date(state.premium_until!).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Everything above is reversible from this panel. This is not. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-destructive/30 pt-4">
          <Trash2 className="h-4 w-4 text-destructive" />
          <span className="text-[0.92rem] text-muted-foreground">
            Delete this account and everything attached to it.
          </span>
          <Input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="Type DELETE"
            className="h-8 w-32"
          />
          <Button
            variant="destructive"
            size="sm"
            disabled={busy !== null || confirmText !== "DELETE"}
            onClick={() => run("delete", { confirm: "DELETE" })}
          >
            Delete permanently
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
