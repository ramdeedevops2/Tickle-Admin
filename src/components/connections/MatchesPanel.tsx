"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { adminTable } from "@/lib/adminFetch";
import { DataToolbar } from "@/components/DataToolbar";
import { RemoveRow } from "@/components/RemoveRow";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, SplitSquareHorizontal } from "lucide-react";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { PageSkeleton } from "@/components/ui/page";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  created_at: string;
  /** Null once someone has spoken. A pending match expires in 72 hours. */
  expires_at: string | null;
};

function hoursLeft(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.floor(ms / 3_600_000);
}

type MessageCountRow = {
  match_id: string;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
};

type MatchView = MatchRow & {
  user1: ProfileRow | null;
  user2: ProfileRow | null;
  messageCount: number;
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

function getName(profile: ProfileRow | null) {
  return profile?.name || profile?.email || "Deleted account";
}

function getInitials(profile: ProfileRow | null) {
  const source = getName(profile);
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function MatchesPanel() {
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<Record<string, string>>({});
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Through the panel's route: RLS scopes matches and messages to the
    // people in them, which for an admin means an empty page.
    const { data: matchData, error: matchError } = await adminTable<MatchRow>("matches", {
      select: "id, user1_id, user2_id, last_message_at, created_at, expires_at",
      order: "last_message_at",
      limit: 100,
    });

    if (matchError) {
      setError(matchError);
      setMatches([]);
      setLoading(false);
      return;
    }

    const rows = matchData ?? [];
    const userIds = Array.from(
      new Set(rows.flatMap((match) => [match.user1_id, match.user2_id])),
    );
    const matchIds = rows.map((match) => match.id);

    const [{ data: profileData }, { data: messageData }] = await Promise.all([
      userIds.length
        ? adminTable<ProfileRow>("profiles", {
            select: "user_id, name, email, photos",
            in: ["user_id", userIds],
          })
        : Promise.resolve({ data: [] as ProfileRow[] }),
      matchIds.length
        ? adminTable<{ match_id: string }>("messages", {
            select: "match_id",
            in: ["match_id", matchIds],
            limit: 5000,
          })
        : Promise.resolve({ data: [] as { match_id: string }[] }),
    ]);

    const profilesByUserId = new Map(
      (profileData ?? []).map((profile) => [profile.user_id, profile]),
    );
    const messageCounts = ((messageData ?? []) as MessageCountRow[]).reduce(
      (accumulator, message) => {
        accumulator.set(
          message.match_id,
          (accumulator.get(message.match_id) ?? 0) + 1,
        );
        return accumulator;
      },
      new Map<string, number>(),
    );

    setMatches(
      rows.map((match) => ({
        ...match,
        user1: profilesByUserId.get(match.user1_id) ?? null,
        user2: profilesByUserId.get(match.user2_id) ?? null,
        messageCount: messageCounts.get(match.id) ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useLoadOnMount(loadConnections);

  const filteredMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    const rows = matches.filter((match) => {
      if (normalized) {
        const haystack = [
          getName(match.user1),
          getName(match.user2),
          match.id,
        ]
          .join("")
          .toLowerCase();
        if (!haystack.includes(normalized)) return false;
      }

      // A match with no messages is the one worth looking at: it is what
      // the whole funnel is trying to reduce.
      const activity = facets.activity ??"all";
      if (activity === "talking" && match.messageCount === 0) return false;
      if (activity === "silent" && match.messageCount > 0) return false;

      return true;
    });

    return [...rows].sort((a, b) => {
      if (sort === "messages") return b.messageCount - a.messageCount;
      if (sort === "created") {
        return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
      }
      return (
        new Date(b.last_message_at ?? 0).getTime() -
        new Date(a.last_message_at ?? 0).getTime()
      );
    });
  }, [matches, query, facets, sort]);

  const stats = useMemo(() => {
    const messaged = matches.filter((match) => match.messageCount > 0).length;
    const totalMessages = matches.reduce(
      (sum, match) => sum + match.messageCount,
      0,
    );

    return {
      total: matches.length,
      messageRate: matches.length
        ? Math.round((messaged / matches.length) * 100)
        : 0,
      avgMessages: matches.length
        ? (totalMessages / matches.length).toFixed(1)
        :"0.0",
      /*
       * Matches still on the clock.
       *
       * The number worth watching alongside it is the message rate: if most
       * matches expire without a word, 72 hours is either too short or the
       * reminders are not landing.
       */
      pending: matches.filter((match) => match.expires_at !== null).length,
    };
  }, [matches]);

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you staring at an empty one.
  const { page, setPage } = usePagination(filteredMatches.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      </div>

      <DataToolbar
        query={query}
        onQuery={setQuery}
        searchPlaceholder="Search by either person's name"
        filters={[
          {
            id: "activity",
            label: "Activity",
            options: [
              { value: "talking", label: "Has messages" },
              { value: "silent", label: "Never messaged" },
            ],
          },
        ]}
        values={facets}
        onFilter={(id, value) => setFacets((current) => ({ ...current, [id]: value }))}
        sorts={[
          { id: "recent", label: "Recently active" },
          { id: "created", label: "Newest match" },
          { id: "messages", label: "Most messages" },
        ]}
        sort={sort}
        onSort={setSort}
        onRefresh={loadConnections}
        loading={loading}
        showing={filteredMatches.length}
        total={matches.length}
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-foreground/[0.06] bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
              Total Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-foreground/[0.06] bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
              Match to Message Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.messageRate}%</div>
          </CardContent>
        </Card>
        <Card className="border-foreground/[0.06] bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
              Avg Messages per Match
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgMessages}</div>
          </CardContent>
        </Card>
        <Card className="border-foreground/[0.06] bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
              Pending (On The Clock)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-foreground/[0.06] bg-card">
        <CardHeader>
          <CardTitle>Recent matches</CardTitle>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            The latest matches, and whether the two people have said anything to each other.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageSkeleton sections={2} />
          ) : error ? (
            <div className="py-16 text-center text-destructive">{error}</div>
          ) : filteredMatches.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              No matches yet in this period.
            </div>
          ) : (
            <div className="space-y-6">
              {paginate(filteredMatches, page).map((match) => (
                <div
                  key={match.id}
                  className="flex flex-col gap-4 border-b border-foreground/[0.06] pb-6 last:border-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-4">
                      <Avatar className="h-12 w-12 border border-foreground/[0.06] bg-transparent">
                        <AvatarImage src={match.user1?.photos?.[0] ||""} />
                        <AvatarFallback className="border border-foreground/[0.06] bg-transparent text-foreground">
                          {getInitials(match.user1)}
                        </AvatarFallback>
                      </Avatar>
                      <Avatar className="h-12 w-12 border border-foreground/[0.06] bg-transparent">
                        <AvatarImage src={match.user2?.photos?.[0] ||""} />
                        <AvatarFallback className="border border-foreground/[0.06] bg-transparent text-foreground">
                          {getInitials(match.user2)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <p className="text-[0.92rem] font-medium">
                        {getName(match.user1)} &{""}
                        {getName(match.user2)}
                      </p>
                      <div className="flex items-center gap-2 text-[0.86rem] text-muted-foreground">
                        <span>{formatDateTime(match.last_message_at)}</span>
                        <span>-</span>
                        <span>{match.messageCount} messages</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {match.expires_at ? (
                      <Badge
                        variant="outline"
                        className={`gap-1 text-[0.86rem] ${
                          (hoursLeft(match.expires_at) ?? 0) <= 6
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            :"border-orange-500/30 bg-orange-500/10 text-orange-600"
                        }`}
                      >
                        {hoursLeft(match.expires_at)}h left
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Heart className="size-3" />
                        Match
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-foreground/[0.06] hover:bg-muted"
                      render={<Link href={`/members/${match.user1_id}`} />}
                    >
                      <SplitSquareHorizontal className="mr-2 h-4 w-4" />
                      View
                    </Button>
                    {/* Unmatching removes the pair and the thread with it.
                        There is no hidden state for a match, so this is
                        the only form the action can take. */}
                    <RemoveRow
                      table="matches"
                      id={match.id}
                      label="Unmatch these two"
                      onDone={loadConnections}
                    />
                  </div>
                </div>
              ))}
            <Pagination page={page} total={filteredMatches.length} onPage={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
