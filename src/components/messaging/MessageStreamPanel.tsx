"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DataToolbar } from "@/components/DataToolbar";
import Link from "next/link";
import { adminTable } from "@/lib/adminFetch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/ui/stat-strip";
import { EmptyState } from "@/components/ui/page";
import { ArrowLeft, Camera, Eye, MessageSquare, Mic, Timer, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * Reading messages the way they were written.
 *
 * A flat table of one-line truncations is a log, not a conversation: the
 * thing an admin needs in order to judge a report — who said what, to
 * whom, in what order, and how fast — is exactly the part a row-per-
 * message strips out. So the left column lists conversations and the
 * right one renders the chosen thread as the two people saw it.
 *
 * Both columns come through /api/table with the service role, because
 * RLS scopes messages to the two participants and a panel is neither.
 *
 * Read-only, deliberately. There is no delete on a message here: an
 * admin reading a conversation is establishing what happened, and a
 * button that destroys the evidence sits badly next to that. Acting on
 * what you read happens on the member — every name is a link there.
 */

/*
 * Everything a message is, including the ephemeral bookkeeping from 033.
 * A message that expired or was unsent still has its row, and the pane
 * says so rather than pretending the text is live.
 */
const COLUMNS =
  "id, match_id, sender_id, content, kind, created_at, edited_at, unsent_at, saved_at, expires_at, consumed_at, media_path, duration_ms";

/* Drift insurance. If 033 is not on this database the rich select 400s,
   and a blank tab would read as "there are no messages". */
const CORE_COLUMNS = "id, match_id, sender_id, content, created_at";

/*
 * `messages.read` is deliberately not among them.
 *
 * Nothing in the phone app ever sets it: mark_read() exists in migration
 * 039 and lib/presence.ts exports markRead(), and no screen calls either.
 * So the column is false on every row ever written, and an unread count
 * built on it marked every conversation unread — a signal that was only
 * ever reporting that the app does not send read receipts yet. Reading it
 * back belongs here again once the chat screen calls markRead().
 */

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string | null;
  kind?: string | null;
  created_at: string;
  edited_at?: string | null;
  unsent_at?: string | null;
  saved_at?: string | null;
  expires_at?: string | null;
  consumed_at?: string | null;
  media_path?: string | null;
  duration_ms?: number | null;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
};

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
};

type Conversation = {
  matchId: string;
  /** [left, right] in the thread pane. Match order, so it never shuffles. */
  userIds: [string, string];
  last: MessageRow;
  count: number;
};

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  photo: Camera,
  video: Video,
  voice: Mic,
  glimpse: Eye,
};

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const today = new Date();

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === new Date(today.getTime() - 86_400_000).toDateString())
    return "Yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function relative(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;

  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  if (minutes < 10080) return `${Math.round(minutes / 1440)}d`;

  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function displayName(profile: ProfileRow | null | undefined) {
  return profile?.name || profile?.email || "Deleted account";
}

function initials(profile: ProfileRow | null | undefined, id: string) {
  return (profile?.name || profile?.email || id).slice(0, 2).toUpperCase();
}

/**
 * A name that goes somewhere.
 *
 * Reading a thread is what raises the question — how old is this
 * account, what else has been reported about it — and the answer is one
 * screen away on the member. Underlined only on hover: every bubble has
 * a name above it and a pane of permanent blue links would read as a
 * link list rather than a conversation.
 */
function PersonLink({
  profile,
  id,
  className,
}: {
  profile: ProfileRow | null | undefined;
  id: string;
  className?: string;
}) {
  return (
    <Link
      href={`/members/${id}`}
      title="Open this member"
      className={cn(
        "underline-offset-2 transition-colors hover:text-foreground hover:underline",
        className,
      )}
    >
      {displayName(profile)}
    </Link>
  );
}

/** What a bubble says when there is no text to say it — media, or a removal. */
function summarise(message: MessageRow) {
  if (message.unsent_at) return "Unsent";
  if (message.content) return message.content;

  switch (message.kind) {
    case "photo":
      return "Photo";
    case "video":
      return "Video";
    case "voice":
      return message.duration_ms
        ? `Voice note · ${Math.round(message.duration_ms / 1000)}s`
        : "Voice note";
    case "glimpse":
      return "Glimpse";
    default:
      return "No content";
  }
}

/* The marks under a bubble. Only what is true — an empty meta line is
   the common case and should stay empty rather than say "delivered". */
function metaFor(message: MessageRow) {
  const marks: string[] = [];

  if (message.edited_at) marks.push("Edited");
  if (message.unsent_at) marks.push("Unsent");
  if (message.saved_at) marks.push("Saved");
  if (message.consumed_at) marks.push("Viewed away");
  else if (message.expires_at && new Date(message.expires_at) < new Date())
    marks.push("Expired");

  return marks;
}

const PANE = "flex h-[min(34rem,calc(100vh-24rem))] min-h-[24rem] flex-col overflow-hidden rounded-2xl border border-foreground/[0.06] bg-card";

export function MessageStreamPanel() {
  const [recent, setRecent] = useState<MessageRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [matches, setMatches] = useState<Map<string, MatchRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<MessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const scroller = useRef<HTMLDivElement | null>(null);

  /*
   * The thread is fetched for its match rather than filtered out of the
   * 500 the list already holds: that window is the newest messages
   * across everyone, so a busy day would silently truncate the
   * conversation you opened in order to read in full.
   */
  const loadThread = useCallback(async (matchId: string) => {
    setThreadLoading(true);
    setThreadError(null);

    let { data, error } = await adminTable<MessageRow>("messages", {
      select: COLUMNS,
      eq: ["match_id", matchId],
      order: "created_at",
      ascending: true,
      limit: 1000,
    });

    if (error) {
      ({ data, error } = await adminTable<MessageRow>("messages", {
        select: CORE_COLUMNS,
        eq: ["match_id", matchId],
        order: "created_at",
        ascending: true,
        limit: 1000,
      }));
    }

    if (error) {
      setThreadError(error);
      setThread([]);
    } else {
      setThread(data ?? []);
    }

    setThreadLoading(false);
  }, []);

  const open = useCallback(
    (matchId: string) => {
      setSelected(matchId);
      void loadThread(matchId);
    },
    [loadThread],
  );

  const loadRecent = useCallback(async () => {
    setLoading(true);
    setError(null);

    let { data, error } = await adminTable<MessageRow>("messages", {
      select: COLUMNS,
      order: "created_at",
      limit: 500,
    });

    if (error) {
      ({ data, error } = await adminTable<MessageRow>("messages", {
        select: CORE_COLUMNS,
        order: "created_at",
        limit: 500,
      }));
    }

    if (error) {
      setError(error);
      setRecent([]);
      setLoading(false);
      return [] as MessageRow[];
    }

    const rows = data ?? [];
    setRecent(rows);

    const matchIds = Array.from(new Set(rows.map((row) => row.match_id))).filter(Boolean);

    const { data: matchData } = matchIds.length
      ? await adminTable<MatchRow>("matches", {
          select: "id, user1_id, user2_id",
          in: ["id", matchIds],
        })
      : { data: [] as MatchRow[] };

    setMatches(new Map((matchData ?? []).map((row) => [row.id, row])));

    // Both participants, not only senders: a thread where one person
    // never replied still has two names at the top of the pane.
    const userIds = Array.from(
      new Set([
        ...rows.map((row) => row.sender_id),
        ...(matchData ?? []).flatMap((row) => [row.user1_id, row.user2_id]),
      ]),
    ).filter(Boolean);

    const { data: profileData } = userIds.length
      ? await adminTable<ProfileRow>("profiles", {
          select: "user_id, name, email, photos",
          in: ["user_id", userIds],
        })
      : { data: [] as ProfileRow[] };

    setProfiles(new Map((profileData ?? []).map((row) => [row.user_id, row])));
    setLoading(false);

    // Handed back so the first load can open the newest conversation
    // without reading state React has not committed yet.
    return rows;
  }, []);

  /*
   * Arriving on an empty right half makes the tab look broken, so the
   * newest conversation opens itself — on the first load only, never on
   * a refresh, which would yank the pane away from what you were reading.
   */
  const boot = useCallback(async () => {
    const rows = await loadRecent();
    if (rows[0]) open(rows[0].match_id);
  }, [loadRecent, open]);

  useLoadOnMount(boot);

  const reload = useCallback(() => {
    void loadRecent();
    if (selected) void loadThread(selected);
  }, [loadRecent, loadThread, selected]);

  const conversations = useMemo(() => {
    const byMatch = new Map<string, Conversation>();

    // recent is newest-first, so the first row seen for a match is its
    // last message and the list order is already activity order.
    for (const message of recent) {
      const existing = byMatch.get(message.match_id);

      if (existing) {
        existing.count += 1;
        continue;
      }

      const match = matches.get(message.match_id);

      byMatch.set(message.match_id, {
        matchId: message.match_id,
        userIds: match
          ? [match.user1_id, match.user2_id]
          : [message.sender_id, message.sender_id],
        last: message,
        count: 1,
      });
    }

    return Array.from(byMatch.values());
  }, [recent, matches]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return conversations.filter((conversation) => {
      if (!q) return true;

      const people = conversation.userIds.map((id) => {
        const profile = profiles.get(id);
        return [profile?.name, profile?.email, id].filter(Boolean).join(" ");
      });

      return [...people, conversation.last.content, conversation.matchId]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [conversations, profiles, query]);

  /* A pane that opens at the top of a 400-message thread is a pane
     nobody scrolls. Land on the newest, the way the app does. */
  useEffect(() => {
    const node = scroller.current;
    if (node && !threadLoading) node.scrollTop = node.scrollHeight;
  }, [thread, threadLoading]);

  const current = useMemo(
    () => conversations.find((conversation) => conversation.matchId === selected),
    [conversations, selected],
  );

  const sides = useMemo<[string, string]>(() => {
    if (current) return current.userIds;

    // A thread reached before its match row is known: derive the two
    // sides from who actually spoke.
    const senders = Array.from(new Set(thread.map((row) => row.sender_id)));
    return [senders[0] ?? "", senders[1] ?? senders[0] ?? ""];
  }, [current, thread]);

  const stats = useMemo(
    () => ({
      conversations: conversations.length,
      messages: recent.length,
      media: recent.filter((message) => message.kind && message.kind !== "text").length,
    }),
    [conversations, recent],
  );

  return (
    <div className="space-y-4">
      <StatStrip
        stats={[
          { label: "Conversations", value: stats.conversations, icon: MessageSquare },
          { label: "Recent messages", value: stats.messages },
          { label: "Photo, voice or Glimpse", value: stats.media, icon: Timer },
        ]}
      />

      <DataToolbar
        query={query}
        onQuery={setQuery}
        searchPlaceholder="Search people, message text or match id"
        onRefresh={reload}
        loading={loading}
        showing={visible.length}
        total={conversations.length}
      />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-card px-4 py-3 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
        {/* Who is talking */}
        <div className={cn(PANE, selected && "hidden lg:flex")}>
          <div className="border-b border-foreground/[0.06] px-4 py-3 text-[0.92rem] text-muted-foreground">
            {loading ? "Loading…" : `${visible.length} conversations`}
          </div>

          <div className="flex-1 overflow-y-auto">
            {!loading && visible.length === 0 ? (
              <p className="px-4 py-8 text-center text-[0.92rem] text-muted-foreground">
                No conversations match this search.
              </p>
            ) : (
              visible.map((conversation) => {
                const [a, b] = conversation.userIds;
                const left = profiles.get(a);
                const right = profiles.get(b);

                return (
                  <button
                    key={conversation.matchId}
                    onClick={() => open(conversation.matchId)}
                    className={cn(
                      "flex w-full items-start gap-3 border-b border-foreground/[0.04] px-4 py-3 text-left transition-colors hover:bg-accent/60",
                      conversation.matchId === selected && "bg-accent",
                    )}
                  >
                    <div className="flex -space-x-2">
                      <Avatar size="sm">
                        <AvatarImage src={left?.photos?.[0] || ""} />
                        <AvatarFallback>{initials(left, a)}</AvatarFallback>
                      </Avatar>
                      <Avatar size="sm">
                        <AvatarImage src={right?.photos?.[0] || ""} />
                        <AvatarFallback>{initials(right, b)}</AvatarFallback>
                      </Avatar>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[0.95rem] font-medium">
                          {displayName(left)} · {displayName(right)}
                        </span>
                        <span className="tnum shrink-0 text-[0.8rem] text-muted-foreground">
                          {relative(conversation.last.created_at)}
                        </span>
                      </div>

                      <p className="truncate text-[0.88rem] text-muted-foreground">
                        {summarise(conversation.last)}
                      </p>
                    </div>

                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* What they said */}
        <div className={cn(PANE, !selected && "hidden lg:flex")}>
          <div className="flex items-center gap-3 border-b border-foreground/[0.06] px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSelected(null)}
              aria-label="Back to conversations"
            >
              <ArrowLeft />
            </Button>

            {current ? (
              <div className="min-w-0">
                <div className="truncate text-[0.95rem] font-medium">
                  <PersonLink profile={profiles.get(sides[0])} id={sides[0]} />
                  <span className="text-muted-foreground"> and </span>
                  <PersonLink profile={profiles.get(sides[1])} id={sides[1]} />
                </div>
                <div className="text-[0.82rem] text-muted-foreground">
                  {thread.length} messages
                </div>
              </div>
            ) : (
              <div className="text-[0.92rem] text-muted-foreground">
                Pick a conversation to read it.
              </div>
            )}
          </div>

          <div
            ref={scroller}
            className="flex-1 space-y-1 overflow-y-auto bg-background/40 px-4 py-4"
          >
            {threadLoading ? (
              <p className="py-10 text-center text-[0.92rem] text-muted-foreground">
                Loading conversation…
              </p>
            ) : threadError ? (
              <p className="py-10 text-center text-[0.92rem] text-destructive">
                {threadError}
              </p>
            ) : thread.length === 0 ? (
              <EmptyState
                title="Nothing to read"
                body="This conversation has no messages left to show."
              />
            ) : (
              thread.map((message, index) => {
                const previous = thread[index - 1];
                const newDay =
                  !previous ||
                  new Date(previous.created_at).toDateString() !==
                    new Date(message.created_at).toDateString();

                // A new speaker after a run of one person's messages is
                // where the name belongs; repeating it on every bubble is
                // noise that the alignment already carries.
                const newSpeaker =
                  newDay || !previous || previous.sender_id !== message.sender_id;

                const right = message.sender_id === sides[1];
                const sender = profiles.get(message.sender_id);
                const marks = metaFor(message);
                const Icon =
                  message.kind && message.kind !== "text"
                    ? KIND_ICON[message.kind]
                    : undefined;

                return (
                  <div key={message.id}>
                    {newDay && (
                      <div className="py-3 text-center text-[0.8rem] text-muted-foreground">
                        {formatDay(message.created_at)}
                      </div>
                    )}

                    <div
                      className={cn(
                        "group flex items-end gap-2",
                        right ? "justify-end" : "justify-start",
                        newSpeaker ? "mt-3" : "mt-0.5",
                      )}
                    >
                      {!right && (
                        <Link
                          href={`/members/${message.sender_id}`}
                          className={cn("mb-5 shrink-0", !newSpeaker && "invisible")}
                          aria-label={`Open ${displayName(sender)}`}
                        >
                          <Avatar size="sm">
                            <AvatarImage src={sender?.photos?.[0] || ""} />
                            <AvatarFallback>
                              {initials(sender, message.sender_id)}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                      )}

                      <div className={cn("max-w-[min(32rem,78%)]", right && "text-right")}>
                        {newSpeaker && (
                          <div className="mb-1 px-1 text-[0.8rem] text-muted-foreground">
                            <PersonLink profile={sender} id={message.sender_id} />
                          </div>
                        )}

                        <div
                          className={cn(
                            "rounded-2xl px-3.5 py-2 text-left text-[0.95rem] leading-relaxed break-words whitespace-pre-wrap",
                            right
                              ? "rounded-br-md bg-muted"
                              : "rounded-bl-md border border-foreground/[0.06] bg-card",
                            message.unsent_at && "text-muted-foreground italic",
                          )}
                        >
                          {Icon && (
                            <Icon className="mr-1.5 inline size-3.5 align-[-2px] text-muted-foreground" />
                          )}
                          {summarise(message)}
                        </div>

                        <div
                          className={cn(
                            "mt-0.5 flex items-center gap-2 px-1 text-[0.75rem] text-muted-foreground",
                            right ? "justify-end" : "justify-start",
                          )}
                        >
                          <span className="tnum">{formatTime(message.created_at)}</span>
                          {marks.map((mark) => (
                            <span key={mark}>{mark}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
