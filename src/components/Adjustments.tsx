"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PagedList } from "@/components/ui/paged-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * Manual adjustments, with the audit trail underneath them.
 *
 * The reason field is required before any button enables, and the trail
 * is shown on the same card rather than on a separate page. Somebody
 * about to grant Hearts should be able to see that two other admins
 * already did today.
 */

type AuditRow = {
  id: string;
  admin_email: string | null;
  action: string;
  reason: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
};

const KIND_LABELS: Record<string, string> = {
  hearts: "Hearts",
  premium_days: "Premium days",
  verify: "Mark verified",
  unverify: "Remove verification",
};

export function Adjustments({ userId }: { userId: string }) {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [kind, setKind] = useState("hearts");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await adminFetch<{ audit: AuditRow[] }>(
      `/api/adjust?user_id=${userId}`,
    );

    setAudit(data?.audit ?? []);
  }, [userId]);

  useLoadOnMount(load);

  const needsAmount = kind === "hearts" || kind === "premium_days";

  const apply = useCallback(async () => {
    setBusy(true);
    setError(null);
    setDone(null);

    const { error } = await adminFetch("/api/adjust", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        kind,
        reason: reason.trim(),
        amount: needsAmount ? Number(amount) : 0,
      }),
    });

    if (error) setError(error);
    else {
      setDone("Done, and recorded.");
      setAmount("");
      setReason("");
      await load();
    }

    setBusy(false);
  }, [userId, kind, reason, amount, needsAmount, load]);

  const ready =
    reason.trim().length >= 3 && (!needsAmount || Number(amount) !== 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Adjustments</CardTitle>
        <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
          Roses added or taken away by hand, and who did it.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(KIND_LABELS).map(([key, label]) => (
            <Button
              key={key}
              size="sm"
              variant={kind === key ? "default" : "outline"}
              onClick={() => setKind(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {needsAmount && (
          <Input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={
              kind === "hearts"
                ? "How many Hearts — negative to take away"
                : "How many days — negative to take away"
            }
          />
        )}

        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why — recorded against your name"
        />

        <div className="flex items-center gap-3">
          <Button onClick={apply} disabled={busy || !ready}>
            Apply
          </Button>
          {error && (
            <span className="text-[0.92rem] text-destructive">{error}</span>
          )}
          {done && (
            <span className="text-[0.92rem] text-muted-foreground">{done}</span>
          )}
        </div>

        {audit.length > 0 && (
          <div className="space-y-2 border-t border-foreground/[0.06] pt-3">
            <p className="text-[0.86rem] uppercase tracking-wider text-muted-foreground">
              What has been done to this account
            </p>

            <PagedList items={audit} perPage={12} className="space-y-2">
              {(row) => (
                <div key={row.id} className="text-[0.92rem]">
                  <p>
                    <span className="font-medium">{row.action}</span>
                    {" ·"}
                    <span className="text-muted-foreground">
                      {row.admin_email ?? "unknown"} ·{""}
                      {new Date(row.created_at).toLocaleString()}
                    </span>
                  </p>
                  {row.reason && (
                    <p className="text-muted-foreground">{row.reason}</p>
                  )}

                  {/* The before/after is the part that answers questions
                    later."Adjusted Hearts" explains nothing;"40 to
                    4000" explains everything. */}
                  {row.before_state && row.after_state && (
                    <p className="font-mono text-[0.86rem] text-muted-foreground">
                      {JSON.stringify(row.before_state)} →{" "}
                      {JSON.stringify(row.after_state)}
                    </p>
                  )}
                </div>
              )}
            </PagedList>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
