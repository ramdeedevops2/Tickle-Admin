"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye } from "lucide-react";

/**
 * What this member's own account looks like, read-only.
 *
 * For answering"why is my deck empty" or"where did my Hearts go"
 * without asking somebody to send screenshots. Nothing here can be
 * changed from this panel — adjustments happen under the admin's own
 * name, elsewhere, with a reason.
 */

type Payload = {
  profile: Record<string, unknown>;
  ledger: { amount: number; reason: string; balance_after: number; created_at: string }[];
  filters: { filter_key: string; value: unknown }[];
  blocked_count: number;
  tickets: { id: string; reference: string; subject: string; status: string }[];
  standing: unknown;
  deck_notes: string[];
  readonly: boolean;
};

export function ViewAsUser({ userId }: { userId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Payload>(`/api/view-as?user_id=${userId}`);

    if (error) setError(error);
    else {
      setData(data ?? null);
      setError(null);
    }
  }, [userId]);

  useEffect(() => {
    if (open && !data) void Promise.resolve().then(load);
  }, [open, data, load]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-[0.92rem] underline hover:text-foreground"
      >
        <Eye className="h-4 w-4" />
        View as this member
      </button>
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="h-4 w-4" />
          Their view
          <Badge variant="outline">read only</Badge>
        </CardTitle>
        <button onClick={() => setOpen(false)} className="text-[0.92rem] underline">
          close
        </button>
      </CardHeader>

      <CardContent className="space-y-4 text-[0.92rem]">
        {error && <p className="text-destructive">{error}</p>}
        {!data && !error && <p className="text-muted-foreground">Loading…</p>}

        {data && (
          <>
            {/* Why their deck may look empty — read off their own row
                rather than guessed at. */}
            {data.deck_notes.length > 0 && (
              <div>
                <p className="mb-1 text-[0.86rem] uppercase tracking-wider text-muted-foreground">
                  Affecting their deck
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-muted-foreground">
                  {data.deck_notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-[0.86rem] uppercase tracking-wider text-muted-foreground">
                  Hearts
                </p>
                <p className="text-lg font-bold">{String(data.profile.roses ?? 0)}</p>
              </div>
              <div>
                <p className="text-[0.86rem] uppercase tracking-wider text-muted-foreground">
                  Premium
                </p>
                <p className="text-lg font-bold">
                  {data.profile.premium_until
                    ? new Date(String(data.profile.premium_until)).toLocaleDateString()
                    :"—"}
                </p>
              </div>
              <div>
                <p className="text-[0.86rem] uppercase tracking-wider text-muted-foreground">
                  Blocked
                </p>
                <p className="text-lg font-bold">{data.blocked_count}</p>
              </div>
            </div>

            {data.filters.length > 0 && (
              <div>
                <p className="mb-1 text-[0.86rem] uppercase tracking-wider text-muted-foreground">
                  Filters they set
                </p>
                <div className="flex flex-wrap gap-1">
                  {data.filters.map((filter) => (
                    <Badge key={filter.filter_key} variant="secondary">
                      {filter.filter_key}: {JSON.stringify(filter.value)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {data.ledger.length > 0 && (
              <div>
                <p className="mb-1 text-[0.86rem] uppercase tracking-wider text-muted-foreground">
                  Recent Hearts
                </p>
                <div className="space-y-1">
                  {data.ledger.slice(0, 10).map((entry, index) => (
                    <div
                      key={`${entry.created_at}-${index}`}
                      className="flex justify-between text-muted-foreground"
                    >
                      <span>{entry.reason}</span>
                      <span>
                        {entry.amount > 0 ? "+" :""}
                        {entry.amount} → {entry.balance_after}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.tickets.length > 0 && (
              <div>
                <p className="mb-1 text-[0.86rem] uppercase tracking-wider text-muted-foreground">
                  Their tickets
                </p>
                {data.tickets.map((ticket) => (
                  <p key={ticket.id} className="text-muted-foreground">
                    {ticket.reference} · {ticket.subject} · {ticket.status}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
