"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/adminFetch";

/**
 * Announcements to the whole app.
 *
 * These land in the app's own notification list, which is what the app
 * reads. There is no push infrastructure yet, so nobody gets a lock-screen
 * banner until there is — the message waits until they open the app.
 *
 * The send is irreversible and reaches everyone at once, so the button
 * asks once before firing and tells you the audience size in the same
 * sentence. There is no undo to build; the confirmation is the safety.
 *
 * Suspended accounts are excluded in send_broadcast() rather than here —
 * a rule about who may be contacted belongs next to the send, not in a
 * component that could be bypassed by the next caller.
 */

type Broadcast = {
  id: string;
  title: string;
  body: string;
  audience: string;
  recipients: number;
  created_at: string;
};

const AUDIENCES: { key: string; label: string; hint: string }[] = [
  { key: "everyone", label: "Everyone", hint: "Every account that is not suspended." },
  { key: "active", label: "Active", hint: "Seen in the last thirty days." },
  { key: "male", label: "Men", hint: "Accounts with gender set to male." },
  { key: "female", label: "Women", hint: "Accounts with gender set to female." },
];

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function BroadcastPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary, and
  // a production build fails outright without one.
  return (
    <Suspense
      fallback={<div className="py-16 text-center text-muted-foreground">Loading...</div>}
    >
      <BroadcastView />
    </Suspense>
  );
}

function BroadcastView() {
  const searchParams = useSearchParams();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("everyone");
  const [history, setHistory] = useState<Broadcast[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<{ broadcasts: Broadcast[] }>("/api/broadcast");
    if (error) setError(error);
    else setHistory(data?.broadcasts ?? []);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  // The palette links here as /broadcast?compose=1, which should land with
  // the cursor already in the box rather than merely on the right page.
  const compose = searchParams.get("compose") === "1";
  useEffect(() => {
    if (compose) titleRef.current?.focus();
  }, [compose]);

  const send = useCallback(async () => {
    const label = AUDIENCES.find((entry) => entry.key === audience)?.label ?? audience;

    if (!window.confirm(`Send "${title}" to ${label}? This cannot be taken back.`)) return;

    setSending(true);
    setError(null);
    setSent(null);

    const { data, error } = await adminFetch<{ recipients: number }>("/api/broadcast", {
      method: "POST",
      body: JSON.stringify({ title, body: message, audience }),
    });

    if (error) {
      setError(error);
    } else {
      setSent(data?.recipients ?? 0);
      setTitle("");
      setMessage("");
      await load();
    }

    setSending(false);
  }, [title, message, audience, load]);

  const ready = title.trim().length > 0 && !sending;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter">Broadcast</h1>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          In-app announcements
        </p>
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {sent !== null && (
        <div className="border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-600">
          Delivered to {sent.toLocaleString()} {sent === 1 ? "account" : "accounts"}.
        </div>
      )}

      <div className="space-y-8 border border-border/50 p-8">
        <div className="space-y-3">
          <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Target Audience
          </label>
          <div className="flex flex-wrap gap-4">
            {AUDIENCES.map((entry) => (
              <Button
                key={entry.key}
                variant="outline"
                onClick={() => setAudience(entry.key)}
                title={entry.hint}
                className={`rounded-none text-xs uppercase tracking-widest ${
                  audience === entry.key
                    ? "border-foreground bg-foreground text-background hover:bg-foreground"
                    : "border-border/50"
                }`}
              >
                {entry.label}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {AUDIENCES.find((entry) => entry.key === audience)?.hint}
          </p>
        </div>

        <div className="group space-y-3">
          <label
            htmlFor="broadcast-title"
            className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors group-focus-within:text-foreground"
          >
            Notification Title
          </label>
          <Input
            id="broadcast-title"
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-14 rounded-none border-0 border-b border-border/50 bg-transparent px-0 text-xl transition-all focus-visible:border-foreground focus-visible:ring-0"
            placeholder="Something worth interrupting people for"
          />
        </div>

        <div className="group space-y-3">
          <label
            htmlFor="broadcast-body"
            className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors group-focus-within:text-foreground"
          >
            Message
          </label>
          <textarea
            id="broadcast-body"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="h-32 w-full resize-none rounded-none border border-border/50 bg-transparent p-4 font-mono text-sm outline-none transition-all focus:border-foreground focus:ring-0"
            placeholder="The body of the notification."
          />
        </div>

        <Button
          onClick={send}
          disabled={!ready}
          className="h-14 w-full rounded-none bg-foreground text-xs font-bold uppercase tracking-[0.2em] text-background transition-colors hover:bg-muted-foreground disabled:opacity-40"
        >
          {sending ? "Sending" : "Send Broadcast"}
        </Button>
      </div>

      <div className="border border-border/50 p-8">
        <h2 className="mb-6 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Recent Broadcasts
        </h2>

        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nothing sent yet.
          </p>
        ) : (
          <div className="space-y-4 font-mono text-sm">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-6 border-b border-border/50 pb-4 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-foreground">{entry.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {AUDIENCES.find((item) => item.key === entry.audience)?.label ??
                      entry.audience}
                    {" · "}
                    {entry.recipients.toLocaleString()} delivered
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  {formatDateTime(entry.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
