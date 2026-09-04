"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/page";
import { Textarea } from "@/components/ui/input";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * Support tickets.
 *
 * Two kinds of note exist on a ticket: a reply the member reads, and an
 * internal note they never see. They look different on purpose — an
 * internal note that looks like a reply is how somebody eventually
 * writes"this one is a nightmare" into a customer's inbox.
 */

type Ticket = {
  id: string;
  reference: string;
  user_id: string;
  category: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  profile: { name: string | null; email: string | null } | null;
};

type Message = {
  id: string;
  ticket_id: string;
  body: string;
  from_admin: boolean;
  internal: boolean;
  created_at: string;
};

const STATUSES = ["open", "reviewing", "waiting_user", "resolved", "closed"] as const;

// The same words the member sees in the app, so the two sides of a
// conversation are not describing its state differently.
const STATUS_LABELS: Record<string, string> = {
  open: "Waiting for us",
  reviewing: "Looking at it",
  waiting_user: "Waiting for them",
  resolved: "Sorted",
  closed: "Closed",
};

export function TicketsPanel() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState<string>("open");
  const [active, setActive] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [internal, setInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ tickets: Ticket[] }>(
      `/api/support?status=${status}`,
    );

    if (error) setError(error);
    else setTickets(data?.tickets ?? []);

    setLoading(false);
  }, [status]);

  useLoadOnMount(load);

  const openThread = useCallback(async (ticket: Ticket) => {
    setActive(ticket);
    setReply("");
    setInternal(false);

    const { data } = await adminFetch<{ messages: Message[] }>(
      `/api/support?ticket_id=${ticket.id}`,
    );

    setMessages(data?.messages ?? []);
  }, []);

  const send = useCallback(async () => {
    if (!active || reply.trim().length < 2) return;

    setBusy(true);
    setError(null);

    const { error } = await adminFetch("/api/support", {
      method: "POST",
      body: JSON.stringify({ ticket_id: active.id, body: reply.trim(), internal }),
    });

    if (error) setError(error);
    else {
      setReply("");
      await openThread(active);
    }

    setBusy(false);
  }, [active, reply, internal, openThread]);

  const setTicketStatus = useCallback(
    async (next: string) => {
      if (!active) return;

      setBusy(true);

      const { error } = await adminFetch("/api/support", {
        method: "PATCH",
        body: JSON.stringify({ ticket_id: active.id, status: next }),
      });

      if (error) setError(error);
      else {
        setActive({ ...active, status: next });
        await load();
      }

      setBusy(false);
    },
    [active, load],
  );

  // Resets when the status filter shortens the list.
  const { page, setPage } = usePagination(tickets.length);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          {STATUSES.map((entry) => (
            <Button
              key={entry}
              variant={status === entry ? "default" :"outline"}
              size="sm"
              onClick={() => {
                setActive(null);
                setStatus(entry);
              }}
            >
              {STATUS_LABELS[entry] ?? entry}
            </Button>
          ))}
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" :"h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-[0.92rem] text-destructive">{error}</CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="space-y-2">
          {paginate(tickets, page).map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => openThread(ticket)}
              className={`w-full rounded-lg border p-3 text-left transition-colors hover:bg-accent ${
                active?.id === ticket.id ? "border-primary bg-accent" :""
              }`}
            >
              <p className="truncate text-[0.92rem] font-medium">{ticket.subject}</p>
              <p className="mt-1 text-[0.86rem] text-muted-foreground">
                {ticket.reference} · {ticket.category}
              </p>
              <p className="text-[1rem] leading-relaxed text-muted-foreground">
                {ticket.profile?.name ?? ticket.profile?.email ??"—"}
              </p>
            </button>
          ))}

          {tickets.length === 0 && !loading && (
            <Card>
              <CardContent className="py-10 text-center text-[0.92rem] text-muted-foreground">
                Nothing here.
              </CardContent>
            </Card>
          )}

          <Pagination page={page} total={tickets.length} onPage={setPage} />
        </div>

        {active ? (
          <Card>
            <CardHeader className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{active.subject}</CardTitle>
                <div className="flex gap-1">
                  {STATUSES.filter((entry) => entry !== active.status).map((entry) => (
                    <Button
                      key={entry}
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => setTicketStatus(entry)}
                    >
                      {STATUS_LABELS[entry] ?? entry}
                    </Button>
                  ))}
                </div>
              </div>
              <p className="text-[1rem] leading-relaxed text-muted-foreground">
                {active.reference} · {active.category} ·{""}
                <Link
                  href={`/members/${active.user_id}`}
                  className="underline hover:text-foreground"
                >
                  open profile
                </Link>
              </p>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="space-y-3">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`rounded-lg p-3 text-[0.92rem] ${
                      message.internal
                        ? "border border-dashed border-amber-500/40 bg-amber-500/5"
                        : message.from_admin
                          ? "bg-primary/10"
                          :"bg-muted"
                    }`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[0.86rem] text-muted-foreground">
                      {message.internal && (
                        <Badge variant="outline" className="gap-1 text-amber-600">
                          <Lock className="h-3 w-3" />
                          internal
                        </Badge>
                      )}
                      <span>
                        {message.from_admin ? "Tickle" :"Member"}
                      </span>
                      <span>{new Date(message.created_at).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{message.body}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {/* The dashed amber border is the only signal that what
                    you type here is private. Losing it while keeping the
                    toggle would make the riskier of the two modes the
                    less obvious one. */}
                <Textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder={
                    internal
                      ? "A note for the team. The member never sees this."
                      : "Your reply — the member reads this."
                  }
                  className={
                    internal
                      ? "min-h-28 border-dashed border-warning/60 focus-visible:border-warning"
                      : "min-h-28"
                  }
                />

                <div className="flex items-center justify-between gap-2">
                  {/* A visible toggle rather than a hidden mode. Which of
                      the two you are writing is the thing you must not
                      get wrong. */}
                  <label className="flex cursor-pointer items-center gap-2 text-[0.92rem] text-muted-foreground">
                    <Switch
                      checked={internal}
                      onCheckedChange={setInternal}
                      label="Internal note"
                    />
                    Internal note
                  </label>

                  <Button
                    onClick={send}
                    disabled={busy || reply.trim().length < 2}
                    variant={internal ? "outline" :"default"}
                  >
                    {internal ? "Save note" :"Send reply"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <EmptyState
                title="Nothing selected"
                body="Choose a ticket from the list to read it and reply."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
