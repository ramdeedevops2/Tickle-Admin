"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Trash2 } from "lucide-react";

/**
 * Comments and Super Likes.
 *
 * Private comments are the one place someone can write to a stranger before
 * matching, which makes them the first place abuse turns up — so they are
 * readable here, and only here.
 *
 * The conversion figures at the top are the reason this page is worth
 * opening rather than a list to scroll: if a comment converts to a match at
 * the same rate as a plain like, the extra budget it costs is buying nothing
 * and the feature needs rethinking.
 */

type Person = {
  user_id: string;
  name: string | null;
  photos: string[] | null;
  suspended_at: string | null;
} | null;

type Comment = {
  id: string;
  author_id: string;
  subject_id: string;
  body: string;
  created_at: string;
  answered_at: string | null;
  author: Person;
  subject: Person;
};

type SuperLike = {
  id: string;
  sender_id: string;
  target_id: string;
  note: string | null;
  paid_with: string;
  created_at: string;
  sender: Person;
  target: Person;
};

type Payload = {
  totals: {
    likes: number;
    matches: number;
    comments: number;
    superLikes: number;
    commentConversion: number;
    likeConversion: number;
    superWithNote: number;
    superPaidWithRoses: number;
  };
  comments: Comment[];
  superLikes: SuperLike[];
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

function nameOf(person: Person, fallback: string) {
  return person?.name || fallback.slice(0, 8);
}

export default function InterestPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState<"comments" | "super">("comments");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/interest");

    if (error) setError(error);
    else setData(data);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const remove = useCallback(
    async (id: string, kind: "comment" | "super") => {
      if (!window.confirm("Remove this? The sender is not refunded.")) return;

      setBusy(id);

      const { error } = await adminFetch(`/api/interest?id=${id}&kind=${kind}`, {
        method: "DELETE",
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load],
  );

  const q = query.trim().toLowerCase();

  const comments = (data?.comments ?? []).filter(
    (row) =>
      !q ||
      row.body.toLowerCase().includes(q) ||
      nameOf(row.author, row.author_id).toLowerCase().includes(q) ||
      nameOf(row.subject, row.subject_id).toLowerCase().includes(q),
  );

  const supers = (data?.superLikes ?? []).filter(
    (row) =>
      !q ||
      (row.note ?? "").toLowerCase().includes(q) ||
      nameOf(row.sender, row.sender_id).toLowerCase().includes(q) ||
      nameOf(row.target, row.target_id).toLowerCase().includes(q),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Interest</h2>
          <p className="text-muted-foreground">
            Private comments and Super Likes, and whether they work.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rounded-none border border-border bg-transparent pl-8"
              placeholder="Text or person"
            />
          </div>
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
          >
            <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="py-16 text-center text-muted-foreground">Loading...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Comments Sent" value={data.totals.comments} />
            <Stat
              label="Comment → Match"
              value={`${data.totals.commentConversion}%`}
              note={`Plain likes: ${data.totals.likeConversion}%`}
            />
            <Stat label="Super Likes" value={data.totals.superLikes} />
            <Stat
              label="Super Likes With A Note"
              value={data.totals.superWithNote}
              note={`${data.totals.superPaidWithRoses} paid with roses`}
            />
          </div>

          <div className="flex w-fit border border-border/50">
            <TabButton active={tab === "comments"} onClick={() => setTab("comments")}>
              Comments ({comments.length})
            </TabButton>
            <TabButton active={tab === "super"} onClick={() => setTab("super")}>
              Super Likes ({supers.length})
            </TabButton>
          </div>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>{tab === "comments" ? "Private comments" : "Super Likes"}</CardTitle>
            </CardHeader>
            <CardContent>
              {(tab === "comments" ? comments.length : supers.length) === 0 ? (
                <div className="py-16 text-center text-muted-foreground">Nothing here.</div>
              ) : (
                <div className="space-y-4">
                  {tab === "comments"
                    ? comments.map((row) => (
                        <Row
                          key={row.id}
                          from={row.author}
                          fromId={row.author_id}
                          to={row.subject}
                          toId={row.subject_id}
                          body={row.body}
                          at={row.created_at}
                          badge={row.answered_at ? "Answered" : null}
                          busy={busy === row.id}
                          onRemove={() => remove(row.id, "comment")}
                        />
                      ))
                    : supers.map((row) => (
                        <Row
                          key={row.id}
                          from={row.sender}
                          fromId={row.sender_id}
                          to={row.target}
                          toId={row.target_id}
                          body={row.note ?? ""}
                          at={row.created_at}
                          badge={row.paid_with === "roses" ? "🌹 Roses" : "Free"}
                          busy={busy === row.id}
                          onRemove={() => remove(row.id, "super")}
                        />
                      ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({
  from,
  fromId,
  to,
  toId,
  body,
  at,
  badge,
  busy,
  onRemove,
}: {
  from: Person;
  fromId: string;
  to: Person;
  toId: string;
  body: string;
  at: string;
  badge: string | null;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-start gap-4 border-b border-border/50 pb-4 last:border-0 last:pb-0">
      <Link href={`/members/${fromId}`}>
        <Avatar className="h-10 w-10 border border-border bg-transparent">
          <AvatarImage src={from?.photos?.[0] ?? undefined} />
          <AvatarFallback className="bg-transparent text-xs">
            {nameOf(from, fromId).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm">
          <span className="font-medium">{nameOf(from, fromId)}</span>
          <span className="text-muted-foreground"> → </span>
          <Link href={`/members/${toId}`} className="font-medium hover:underline">
            {nameOf(to, toId)}
          </Link>
        </p>

        {body ? (
          <p className="text-sm text-muted-foreground">&ldquo;{body}&rdquo;</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">No note</p>
        )}

        <p className="text-xs text-muted-foreground">{formatDateTime(at)}</p>
      </div>

      {badge && (
        <Badge
          variant="outline"
          className="rounded-none text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
        >
          {badge}
        </Badge>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="rounded-none"
        disabled={busy}
        onClick={onRemove}
        title="Remove"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note?: string;
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-black tracking-tight">{value}</div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}
