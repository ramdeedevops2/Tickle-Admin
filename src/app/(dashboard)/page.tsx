"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Heart, MessageSquare, RefreshCw, Users } from "lucide-react";
import ReactECharts from "echarts-for-react";
import { Button } from "@/components/ui/button";

type ProfileRow = {
  created_at: string;
  is_online: boolean | null;
};

type MatchRow = {
  created_at: string;
};

type FeedItem = {
  id: string;
  label: string;
  detail: string;
  created_at: string;
};

type RecentMessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  created_at: string;
};

type RecentMatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
};

type RecentLikeRow = {
  id: string;
  liker_id: string;
  liked_id: string;
  created_at: string;
};

type RecentPassRow = {
  id: string;
  passer_id: string;
  passed_id: string;
  created_at: string;
};

type RecentStoryRow = {
  id: string;
  user_id: string;
  created_at: string;
};

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

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

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

export default function PulseDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [messagesCount, setMessagesCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [passesCount, setPassesCount] = useState(0);
  const [storiesCount, setStoriesCount] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPulse = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [
      profilesResult,
      matchesResult,
      messagesResult,
      likesResult,
      passesResult,
      storiesResult,
      recentMessagesResult,
      recentMatchesResult,
      recentLikesResult,
      recentPassesResult,
      recentStoriesResult,
    ] = await Promise.all([
      supabase.from("profiles").select("created_at, is_online"),
      supabase.from("matches").select("created_at"),
      supabase.from("messages").select("id", { count: "exact", head: true }),
      supabase.from("likes").select("id", { count: "exact", head: true }),
      supabase.from("passes").select("id", { count: "exact", head: true }),
      supabase
        .from("stories")
        .select("id", { count: "exact", head: true })
        .gt("expires_at", new Date().toISOString()),
      supabase
        .from("messages")
        .select("id, match_id, sender_id, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("matches")
        .select("id, user1_id, user2_id, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("likes")
        .select("id, liker_id, liked_id, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("passes")
        .select("id, passer_id, passed_id, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("stories")
        .select("id, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

    const firstError =
      profilesResult.error ??
      matchesResult.error ??
      messagesResult.error ??
      likesResult.error ??
      passesResult.error ??
      storiesResult.error ??
      recentMessagesResult.error ??
      recentMatchesResult.error ??
      recentLikesResult.error ??
      recentPassesResult.error ??
      recentStoriesResult.error;

    if (firstError) {
      setError(firstError.message);
      setLoading(false);
      return;
    }

    setProfiles((profilesResult.data ?? []) as ProfileRow[]);
    setMatches((matchesResult.data ?? []) as MatchRow[]);
    setMessagesCount(messagesResult.count ?? 0);
    setLikesCount(likesResult.count ?? 0);
    setPassesCount(passesResult.count ?? 0);
    setStoriesCount(storiesResult.count ?? 0);

    const recentMessages = (
      (recentMessagesResult.data ?? []) as RecentMessageRow[]
    ).map((message) => ({
      id: `message-${message.id}`,
      label: "Message",
      detail: `sender ${shortId(message.sender_id)} / match ${shortId(message.match_id)}`,
      created_at: message.created_at,
    }));
    const recentMatches = (
      (recentMatchesResult.data ?? []) as RecentMatchRow[]
    ).map((match) => ({
      id: `match-${match.id}`,
      label: "Match",
      detail: `${shortId(match.user1_id)} + ${shortId(match.user2_id)}`,
      created_at: match.created_at,
    }));
    const recentLikes = ((recentLikesResult.data ?? []) as RecentLikeRow[]).map(
      (like) => ({
        id: `like-${like.id}`,
        label: "Like",
        detail: `${shortId(like.liker_id)} -> ${shortId(like.liked_id)}`,
        created_at: like.created_at,
      }),
    );
    const recentPasses = (
      (recentPassesResult.data ?? []) as RecentPassRow[]
    ).map((pass) => ({
      id: `pass-${pass.id}`,
      label: "Pass",
      detail: `${shortId(pass.passer_id)} -> ${shortId(pass.passed_id)}`,
      created_at: pass.created_at,
    }));
    const recentStories = (
      (recentStoriesResult.data ?? []) as RecentStoryRow[]
    ).map((story) => ({
      id: `story-${story.id}`,
      label: "Story",
      detail: `user ${shortId(story.user_id)}`,
      created_at: story.created_at,
    }));

    setFeed(
      [
        ...recentMessages,
        ...recentMatches,
        ...recentLikes,
        ...recentPasses,
        ...recentStories,
      ]
        .sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )
        .slice(0, 10),
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadPulse);
  }, [loadPulse]);

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const activeToday = profiles.filter((profile) => {
      if (!profile.is_online) return false;
      return true;
    }).length;
    const matchesToday = matches.filter(
      (match) => new Date(match.created_at) >= today,
    ).length;

    return {
      totalUsers: profiles.length,
      activeToday,
      matchesToday,
      messages: messagesCount,
      likes: likesCount,
      passes: passesCount,
      stories: storiesCount,
    };
  }, [profiles, matches, messagesCount, likesCount, passesCount, storiesCount]);

  const chartOption = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = startOfDay(new Date());
      date.setDate(date.getDate() - (6 - index));
      return date;
    });
    const counts = days.map(
      (day) =>
        profiles.filter((profile) => {
          const created = new Date(profile.created_at);
          return (
            created >= day &&
            created < new Date(day.getTime() + 24 * 60 * 60 * 1000)
          );
        }).length,
    );

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        backgroundColor: "#000",
        borderColor: "rgba(255,255,255,0.2)",
        textStyle: { color: "#fff" },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: days.map((day) =>
          day.toLocaleDateString("en-US", { weekday: "short" }),
        ),
        axisLine: { lineStyle: { color: "rgba(255,255,255,0.2)" } },
        axisLabel: { color: "#A1A1AA" },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "rgba(255,255,255,0.1)" } },
        axisLabel: { color: "#A1A1AA" },
      },
      series: [
        {
          name: "New Profiles",
          type: "line",
          smooth: true,
          showSymbol: false,
          lineStyle: { width: 2, color: "#fff" },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(255, 255, 255, 0.3)" },
                { offset: 1, color: "rgba(255, 255, 255, 0)" },
              ],
            },
          },
          data: counts,
        },
      ],
    };
  }, [profiles]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Pulse Overview</h2>
          <p className="text-muted-foreground">
            Live metrics from profiles, matches, messages, likes, passes, and stories.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadPulse}
          disabled={loading}
          className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border border-border/50 bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
            <Users className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              public.profiles
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Online Now
            </CardTitle>
            <Activity className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.activeToday}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              profiles.is_online
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Matches Today
            </CardTitle>
            <Heart className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.matchesToday}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.likes} likes / {stats.passes} passes
            </p>
          </CardContent>
        </Card>

        <Card className="border border-border/50 bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Messages Sent
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.messages}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.stories} active stories
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border border-border/50 bg-card">
          <CardHeader>
            <CardTitle>User Growth</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] pl-2">
            <ReactECharts
              option={chartOption}
              style={{ height: "100%", width: "100%" }}
            />
          </CardContent>
        </Card>
        <Card className="col-span-3 border border-border/50 bg-card">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                Loading activity...
              </div>
            ) : feed.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No recent activity found.
              </div>
            ) : (
              <div className="space-y-4">
                {feed.map((item) => (
                  <div key={item.id} className="flex items-center gap-4">
                    <div className="h-2 w-2 bg-foreground" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium leading-none">
                        {item.label}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(item.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
