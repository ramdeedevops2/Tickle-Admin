"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, RefreshCw, Search, SplitSquareHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  created_at: string;
};

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

function getName(profile: ProfileRow | null, fallback: string) {
  return profile?.name || profile?.email || fallback.slice(0, 8);
}

function getInitials(profile: ProfileRow | null, fallback: string) {
  const source = getName(profile, fallback);
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function ConnectionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [matches, setMatches] = useState<MatchView[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data: matchData, error: matchError } = await supabase
      .from("matches")
      .select("id, user1_id, user2_id, last_message_at, created_at")
      .order("last_message_at", { ascending: false })
      .limit(100);

    if (matchError) {
      setError(matchError.message);
      setMatches([]);
      setLoading(false);
      return;
    }

    const rows = (matchData ?? []) as MatchRow[];
    const userIds = Array.from(
      new Set(rows.flatMap((match) => [match.user1_id, match.user2_id])),
    );
    const matchIds = rows.map((match) => match.id);

    const [{ data: profileData }, { data: messageData }] = await Promise.all([
      userIds.length
        ? supabase
            .from("profiles")
            .select("user_id, name, email, photos")
            .in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      matchIds.length
        ? supabase.from("messages").select("match_id").in("match_id", matchIds)
        : Promise.resolve({ data: [] }),
    ]);

    const profilesByUserId = new Map(
      ((profileData ?? []) as ProfileRow[]).map((profile) => [
        profile.user_id,
        profile,
      ]),
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
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadConnections);
  }, [loadConnections]);

  const filteredMatches = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return matches;

    return matches.filter((match) =>
      [
        getName(match.user1, match.user1_id),
        getName(match.user2, match.user2_id),
        match.id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [matches, query]);

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
        : "0.0",
    };
  }, [matches]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Connections</h2>
          <p className="text-muted-foreground">
            Matches from public.matches with message counts.
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
              placeholder="Search matches"
            />
          </div>
          <Button
            variant="outline"
            onClick={loadConnections}
            disabled={loading}
            className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Matches
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Match to Message Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.messageRate}%</div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Messages per Match
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.avgMessages}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle>Recent Connections</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">
              Loading connections...
            </div>
          ) : error ? (
            <div className="py-16 text-center text-destructive">{error}</div>
          ) : filteredMatches.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              No matches found.
            </div>
          ) : (
            <div className="space-y-6">
              {filteredMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex flex-col gap-4 border-b border-border/50 pb-6 last:border-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-4">
                      <Avatar className="h-12 w-12 border border-border bg-transparent">
                        <AvatarImage src={match.user1?.photos?.[0] || ""} />
                        <AvatarFallback className="border border-border bg-transparent text-foreground">
                          {getInitials(match.user1, match.user1_id)}
                        </AvatarFallback>
                      </Avatar>
                      <Avatar className="h-12 w-12 border border-border bg-transparent">
                        <AvatarImage src={match.user2?.photos?.[0] || ""} />
                        <AvatarFallback className="border border-border bg-transparent text-foreground">
                          {getInitials(match.user2, match.user2_id)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {getName(match.user1, match.user1_id)} &{" "}
                        {getName(match.user2, match.user2_id)}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDateTime(match.last_message_at)}</span>
                        <span>-</span>
                        <span>{match.messageCount} messages</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <Heart className="size-3" />
                      Match
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border hover:bg-muted"
                    >
                      <SplitSquareHorizontal className="mr-2 h-4 w-4" />
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
