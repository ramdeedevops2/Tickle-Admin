"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { adminFetch } from "@/lib/adminFetch";
import { PageSkeleton } from "@/components/ui/page";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";

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

/*
 * Who a campaign is aimed at.
 *
 * The first four are who somebody is. The rest are where somebody has
 * got to, which is what a campaign is usually actually about.
 *
 * Suspended, deactivated and pending-deletion accounts are excluded
 * from every one of these — somebody on their way out does not get
 * marketing.
 */
const AUDIENCES: { key: string; label: string; hint: string }[] = [
  { key: "everyone", label: "Everyone", hint: "Every reachable account." },
  { key: "active", label: "Active", hint: "Seen in the last thirty days." },
  { key: "male", label: "Men", hint: "Accounts with gender set to male." },
  { key: "female", label: "Women", hint: "Accounts with gender set to female." },
  {
    key: "unpublished",
    label: "Never finished",
    hint: "Signed up but never published a profile.",
  },
  { key: "unverified", label: "Unverified", hint: "Never passed the selfie check." },
  { key: "dormant", label: "Dormant", hint: "Nothing for over thirty days." },
  { key: "new", label: "New", hint: "Joined in the last week." },
  { key: "premium", label: "Premium", hint: "Premium right now." },
  {
    key: "lapsed_premium",
    label: "Lapsed premium",
    hint: "Had premium, does not now.",
  },
  { key: "never_paid", label: "Never paid", hint: "No Hearts or premium ever bought." },
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

export function BroadcastPanel() {
  // useSearchParams bails out of prerendering up to the nearest boundary, and
  // a production build fails outright without one.
  return (
    <Suspense
      fallback={<PageSkeleton sections={2} />}
    >
      <BroadcastView />
    </Suspense>
  );
}

function BroadcastView() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const titleRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState("everyone");
  const [history, setHistory] = useState<Broadcast[]>([]);

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(history.length);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<number | null>(null);
  const [sizes, setSizes] = useState<Record<string, number> | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<{
      broadcasts: Broadcast[];
      sizes: Record<string, number> | null;
    }>("/api/broadcast?sizes=1");

    if (error) setError(error);
    else {
      setHistory(data?.broadcasts ?? []);
      setSizes(data?.sizes ?? null);
    }
  }, []);

  useLoadOnMount(load);

  // The palette links here as /broadcast?compose=1, which should land with
  // the cursor already in the box rather than merely on the right page.
  const compose = searchParams.get("compose") === "1";
  useEffect(() => {
    if (compose) titleRef.current?.focus();
  }, [compose]);

  const send = useCallback(async () => {
    const label = AUDIENCES.find((entry) => entry.key === audience)?.label ?? audience;

    // The number, not just the segment name."Everyone" and"18,400
    // people" land very differently on the person about to click yes.
    const reach = sizes?.[audience];
    const who = reach != null ? `${label} — ${reach.toLocaleString()} accounts` : label;

    const ok = await confirm({
      title: `Send "${title}" to ${who}?`,
      body: "It reaches real phones the moment you send it. There is no way to take it back.",
      confirmLabel: "Send it",
      tone: "danger",
    });
    if (!ok) return;

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
  }, [title, message, audience, sizes, load, confirm]);

  const ready = title.trim().length > 0 && !sending;

  return (
    <div className="w-full space-y-8">

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {sent !== null && (
        <div className="rounded-xl border border-success/25 bg-success/8 px-3.5 py-2.5 text-[0.92rem] text-success">
          Delivered to {sent.toLocaleString()} {sent === 1 ? "account" :"accounts"}.
        </div>
      )}

      <div className="space-y-8 border border-foreground/[0.06] p-8">
        <div className="space-y-3">
          <label className="text-[0.8rem] font-bold text-muted-foreground">
            Target Audience
          </label>
          <div className="flex flex-wrap gap-4">
            {AUDIENCES.map((entry) => (
              <Button
                key={entry.key}
                variant="outline"
                onClick={() => setAudience(entry.key)}
                title={entry.hint}
                className={
                  audience === entry.key
                    ? "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
                    : undefined
                }
              >
                {entry.label}
                {sizes?.[entry.key] != null && (
                  <span className="ml-2 opacity-60">
                    {sizes[entry.key].toLocaleString()}
                  </span>
                )}
              </Button>
            ))}
          </div>
          <p className="text-[1rem] leading-relaxed text-muted-foreground">
            {AUDIENCES.find((entry) => entry.key === audience)?.hint}
            {sizes?.[audience] != null && (
              <>
                {""}
                Reaches {sizes[audience].toLocaleString()}{""}
                {sizes[audience] === 1 ? "account" :"accounts"}.
              </>
            )}
          </p>
        </div>

        <div className="group space-y-3">
          <label
            htmlFor="broadcast-title"
            className="text-[0.8rem] font-bold text-muted-foreground transition-colors group-focus-within:text-foreground"
          >
            Notification Title
          </label>
          <Input
            id="broadcast-title"
            ref={titleRef}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-14 px-3 text-xl"
            placeholder="Something worth interrupting people for"
          />
        </div>

        <div className="group space-y-3">
          <label
            htmlFor="broadcast-body"
            className="text-[0.8rem] font-bold text-muted-foreground transition-colors group-focus-within:text-foreground"
          >
            Message
          </label>
          <Textarea
            id="broadcast-body"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="min-h-32"
            placeholder="The body of the notification."
          />
        </div>

        <Button
          onClick={send}
          disabled={!ready}
          className="h-14 w-full bg-foreground text-[0.86rem] font-bold text-background transition-colors hover:bg-muted-foreground disabled:opacity-40"
        >
          {sending ? "Sending" :"Send Broadcast"}
        </Button>
      </div>

      <div className="border border-foreground/[0.06] p-8">

        {history.length === 0 ? (
          <p className="py-6 text-center text-[0.92rem] text-muted-foreground">
            Nothing sent yet.
          </p>
        ) : (
          <div className="space-y-4 font-mono text-[0.92rem]">
            <>
              {paginate(history, page).map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between gap-6 border-b border-foreground/[0.06] pb-4 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-foreground">{entry.title}</div>
                  <div className="mt-1 text-[0.86rem] text-muted-foreground">
                    {AUDIENCES.find((item) => item.key === entry.audience)?.label ??
                      entry.audience}
                    {" ·"}
                    {entry.recipients.toLocaleString()} delivered
                  </div>
                </div>
                <div className="shrink-0 text-right text-[0.86rem] text-muted-foreground">
                  {formatDateTime(entry.created_at)}
                </div>
              </div>
            ))}
              <Pagination page={page} total={history.length} onPage={setPage} />
            </>
          </div>
        )}
      </div>
    </div>
  );
}
