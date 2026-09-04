"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/page";
import { PageSkeleton } from "@/components/ui/page";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";

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

function nameOf(person: Person) {
  return person?.name || "Deleted account";
}

export function InterestPanel() {
  const confirm = useConfirm();
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

  useLoadOnMount(load);

  const remove = useCallback(
    async (id: string, kind: "comment" | "super") => {
      const ok = await confirm({
        title: "Remove this?",
        body: "Whoever sent it is not refunded, and is not told it was removed.",
        confirmLabel: "Remove",
        tone: "danger",
      });
      if (!ok) return;

      setBusy(id);

      const { error } = await adminFetch(`/api/interest?id=${id}&kind=${kind}`, {
        method: "DELETE",
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load, confirm],
  );

  const q = query.trim().toLowerCase();

  const comments = (data?.comments ?? []).filter(
    (row) =>
      !q ||
      row.body.toLowerCase().includes(q) ||
      nameOf(row.author).toLowerCase().includes(q) ||
      nameOf(row.subject).toLowerCase().includes(q),
  );

  const supers = (data?.superLikes ?? []).filter(
    (row) =>
      !q ||
      (row.note ??"").toLowerCase().includes(q) ||
      nameOf(row.sender).toLowerCase().includes(q) ||
      nameOf(row.target).toLowerCase().includes(q),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
              placeholder="Text or person"
            />
          </div>
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            className="border-foreground/[0.06] text-[0.86rem]"
          >
            <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" :""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {loading || !data ? (
        <PageSkeleton sections={2} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Comments sent" value={data.totals.comments} />
            <Stat
              label="Comments that led to a match"
              value={`${data.totals.commentConversion}%`}
              note={`Plain likes: ${data.totals.likeConversion}%`}
            />
            <Stat label="Super Likes sent" value={data.totals.superLikes} />
            <Stat
              label="Super Likes sent with a note"
              value={data.totals.superWithNote}
              note={`${data.totals.superPaidWithRoses} paid with roses`}
            />
          </div>

          <div className="inline-flex w-fit items-center gap-0.5 rounded-full bg-foreground/[0.05] p-0.5">
            <TabButton active={tab === "comments"} onClick={() => setTab("comments")}>
              Comments ({comments.length})
            </TabButton>
            <TabButton active={tab === "super"} onClick={() => setTab("super")}>
              Super Likes ({supers.length})
            </TabButton>
          </div>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>{tab === "comments" ? "Private comments" :"Super Likes"}</CardTitle>
            </CardHeader>
            <CardContent>
              {(tab === "comments" ? comments.length : supers.length) === 0 ? (
                <EmptyState
                  title="Nothing sent yet"
                  body="Comments and Super Likes members send will appear here."
                />
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
                          body={row.note ??""}
                          at={row.created_at}
                          badge={row.paid_with === "roses" ? "🌹 Roses" :"Free"}
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
    <div className="flex items-start gap-4 border-b border-foreground/[0.06] pb-4 last:border-0 last:pb-0">
      <Link href={`/members/${fromId}`}>
        <Avatar className="h-10 w-10 border border-foreground/[0.06] bg-transparent">
          <AvatarImage src={from?.photos?.[0] ?? undefined} />
          <AvatarFallback className="bg-transparent text-[0.86rem]">
            {nameOf(from).slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[0.92rem]">
          <span className="font-medium">{nameOf(from)}</span>
          <span className="text-muted-foreground"> → </span>
          <Link href={`/members/${toId}`} className="font-medium hover:underline">
            {nameOf(to)}
          </Link>
        </p>

        {body ? (
          <p className="text-[0.92rem] text-muted-foreground">&ldquo;{body}&rdquo;</p>
        ) : (
          <p className="text-[0.92rem] italic text-muted-foreground">No note</p>
        )}

        <p className="text-[1rem] leading-relaxed text-muted-foreground">{formatDateTime(at)}</p>
      </div>

      {badge && (
        <Badge
          variant="outline"
          className="text-[0.86rem] text-muted-foreground"
        >
          {badge}
        </Badge>
      )}

      <Button
        variant="ghost"
        size="sm"
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
      className={`rounded-full px-3.5 py-1.5 text-[0.86rem] font-medium transition-all duration-200 ${
        active
          ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(26,26,24,0.18)]"
          : "text-muted-foreground hover:text-foreground"
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
    <Card className="border-foreground/[0.06] bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="tnum text-[1.9rem] font-light tracking-tight">{value}</div>
        {note && <div className="text-[1rem] leading-relaxed text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}
