"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PagedList } from "@/components/ui/paged-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";

/**
 * One member's Rose balance and ledger.
 *
 * Roses are bought with real money, so the ledger is the point of this
 * component rather than the balance."My roses vanished" is a question with
 * an answer, and this is where it lives.
 *
 * Roses are the currency. Hearts are the things left at venues — unrelated,
 * deliberately named apart.
 */

type Ledger = {
  id: string;
  amount: number;
  reason: string;
  balance_after: number;
  created_at: string;
};

type Payload = {
  profile: { user_id: string; name: string | null; roses: number };
  ledger: Ledger[];
};

const REASON_LABEL: Record<string, string> = {
  purchase: "Bought",
  gift: "Gift",
  signup_bonus: "Joining bonus",
  milestone: "Milestone",
  super_like: "Super Like",
  refund: "Refund",
  admin_grant: "Granted by admin",
  admin_deduct: "Removed by admin",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function RoseWallet({ userId }: { userId: string }) {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Payload>(
      `/api/roses?user_id=${encodeURIComponent(userId)}`,
    );

    if (error) setError(error);
    else setData(data);
  }, [userId]);

  useLoadOnMount(load);

  const grant = useCallback(
    async (sign: 1 | -1) => {
      const value = Number(amount) * sign;

      if (!Number.isFinite(value) || value === 0) {
        setError("Enter an amount.");
        return;
      }

      if (
        !(await confirm({
          title: `${value > 0 ? "Grant" : "Take back"} ${Math.abs(value)} roses?`,
          body: `${value > 0 ? "Given to" : "Taken from"} ${
            data?.profile.name ?? "this member"
          }, and recorded in their history with your name against it.`,
          confirmLabel: value > 0 ? "Grant them" : "Take them",
          tone: value > 0 ? "default" : "danger",
        }))
      ) {
        return;
      }

      setBusy(true);
      setError(null);

      const { error } = await adminFetch("/api/roses", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, amount: value }),
      });

      if (error) setError(error);
      else {
        setAmount("");
        await load();
      }

      setBusy(false);
    },
    [amount, userId, data, load, confirm],
  );

  if (!data) return null;

  return (
    <Card className="border-foreground/[0.06] bg-card">
      <CardHeader className="flex flex-row items-baseline justify-between space-y-0">
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
          Roses
        </CardTitle>
        <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
          What this member has, what they have spent, and anything you have
          granted them.
        </p>
        <span className="tnum text-[1.6rem] font-light tracking-tight">
          🌹 {data.profile.roses}
        </span>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="Amount"
          />
          <Button
            variant="outline"
            onClick={() => grant(1)}
            disabled={busy}
            className="border-foreground/[0.06] text-[0.86rem]"
          >
            Grant
          </Button>
          <Button
            variant="outline"
            onClick={() => grant(-1)}
            disabled={busy}
            className="border-destructive/40 text-[0.86rem] text-destructive"
          >
            Remove
          </Button>
        </div>

        {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

        {data.ledger.length === 0 ? (
          <p className="py-4 text-center text-[0.92rem] text-muted-foreground">
            No movements yet.
          </p>
        ) : (
          <PagedList items={data.ledger} perPage={12} className="space-y-1">
            {(entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between border-b border-foreground/[0.06] py-2 text-[0.92rem] last:border-0"
              >
                <span>{REASON_LABEL[entry.reason] ?? entry.reason}</span>
                <span className="flex items-center gap-3">
                  <span
                    className={`tabular-nums ${
                      entry.amount > 0
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                    }`}
                  >
                    {entry.amount > 0 ? "+" : ""}
                    {entry.amount}
                  </span>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">
                    {entry.balance_after}
                  </span>
                  <span className="text-[1rem] leading-relaxed text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </span>
                </span>
              </div>
            )}
          </PagedList>
        )}
      </CardContent>
    </Card>
  );
}
