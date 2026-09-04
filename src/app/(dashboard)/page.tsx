"use client";
import { useCallback, useMemo, useState } from "react";
import { PagedList } from "@/components/ui/paged-list";
import { adminCounts, adminTable } from "@/lib/adminFetch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Activity, Heart, MessageSquare, RefreshCw, Users } from "lucide-react";
import type { EChartsOption } from "echarts";
import { Chart, lineSeries } from "@/components/ui/chart";
import { StatStrip } from "@/components/ui/stat-strip";
import { Skeleton, SkeletonStats } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MetricsBand } from "@/components/MetricsBand";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useNames } from "@/lib/useNames";

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
  /** Who it happened to. Named at render time, once their profile is in. */
  people: string[];
  /** The word between two people: "and", "liked", "passed on". */
  join?: string;
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

export default function PulseDashboard() {
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [messagesCount, setMessagesCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [passesCount, setPassesCount] = useState(0);
  const [storiesCount, setStoriesCount] = useState(0);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The feed is people doing things to each other, so it needs names.
  const { resolve: resolveNames, nameOf } = useNames();

  const loadPulse = useCallback(async () => {
    setLoading(true);
    setError(null);

    /*
     * Everything reads through the panel's own route now.
     *
     * With RLS on, a signed-in admin querying these tables directly sees
     * their own rows and nothing else, so this page rendered six zeroes and
     * an empty feed. The route uses the service role behind an admin check.
     *
     * The four totals are counts rather than fetches — the old code pulled
     * every message row into the browser to call .length on it.
     */
    const [
      countsResult,
      profilesResult,
      matchesResult,
      recentMessagesResult,
      recentMatchesResult,
      recentLikesResult,
      recentPassesResult,
      recentStoriesResult,
    ] = await Promise.all([
      adminCounts([
        "messages",
        "likes",
        "passes",
        { table: "dailies", gt: ["expires_at", new Date().toISOString()] },
      ]),
      adminTable<ProfileRow>("profiles", {
        select: "created_at, is_online",
        limit: 5000,
      }),
      adminTable<MatchRow>("matches", { select: "created_at", limit: 5000 }),
      adminTable<RecentMessageRow>("messages", {
        select: "id, match_id, sender_id, created_at",
        order: "created_at",
        limit: 3,
      }),
      adminTable<RecentMatchRow>("matches", {
        select: "id, user1_id, user2_id, created_at",
        order: "created_at",
        limit: 3,
      }),
      adminTable<RecentLikeRow>("likes", {
        select: "id, liker_id, liked_id, created_at",
        order: "created_at",
        limit: 3,
      }),
      adminTable<RecentPassRow>("passes", {
        select: "id, passer_id, passed_id, created_at",
        order: "created_at",
        limit: 3,
      }),
      adminTable<RecentStoryRow>("dailies", {
        select: "id, user_id, created_at",
        order: "created_at",
        limit: 3,
      }),
    ]);

    const firstError =
      countsResult.error ??
      profilesResult.error ??
      matchesResult.error ??
      recentMessagesResult.error ??
      recentMatchesResult.error ??
      recentLikesResult.error ??
      recentPassesResult.error ??
      recentStoriesResult.error;

    if (firstError) {
      setError(firstError);
      setLoading(false);
      return;
    }

    const counts = countsResult.data ?? {};

    setProfiles(profilesResult.data ?? []);
    setMatches(matchesResult.data ?? []);
    setMessagesCount(counts.messages ?? 0);
    setLikesCount(counts.likes ?? 0);
    setPassesCount(counts.passes ?? 0);
    setStoriesCount(counts.dailies ?? 0);

    const recentMessages = (
      (recentMessagesResult.data ?? []) as RecentMessageRow[]
    ).map((message) => ({
      id: `message-${message.id}`,
      label: "Message",
      people: [message.sender_id],
      created_at: message.created_at,
    }));
    const recentMatches = (
      (recentMatchesResult.data ?? []) as RecentMatchRow[]
    ).map((match) => ({
      id: `match-${match.id}`,
      label: "Match",
      people: [match.user1_id, match.user2_id],
      join: "and",
      created_at: match.created_at,
    }));
    const recentLikes = ((recentLikesResult.data ?? []) as RecentLikeRow[]).map(
      (like) => ({
        id: `like-${like.id}`,
        label: "Like",
        people: [like.liker_id, like.liked_id],
        join: "liked",
        created_at: like.created_at,
      }),
    );
    const recentPasses = (
      (recentPassesResult.data ?? []) as RecentPassRow[]
    ).map((pass) => ({
      id: `pass-${pass.id}`,
      label: "Pass",
      people: [pass.passer_id, pass.passed_id],
      join: "passed on",
      created_at: pass.created_at,
    }));
    const recentStories = (
      (recentStoriesResult.data ?? []) as RecentStoryRow[]
    ).map((story) => ({
      id: `story-${story.id}`,
      label: "Daily",
      people: [story.user_id],
      created_at: story.created_at,
    }));

    // Names for everybody the feed mentions, in one lookup. The feed
    // renders immediately and fills in as they arrive.
    void resolveNames(
      [
        ...recentMessages,
        ...recentMatches,
        ...recentLikes,
        ...recentPasses,
        ...recentStories,
      ].flatMap((item) => item.people),
    );

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
  }, [resolveNames]);

  useLoadOnMount(loadPulse);

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

  /*
   * Seven days of signups.
   *
   * The theme is gone from here entirely — it lived inline and was
   * written for the old black panel, so every colour in it (white
   * strokes, a black tooltip) is invisible on the light ground. The
   * Chart wrapper owns the house style now; this supplies only the
   * shape of the data.
   */
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
      xAxis: {
        data: days.map((day) =>
          day.toLocaleDateString("en-US", { weekday: "short" }),
        ),
      },
      series: [lineSeries("New profiles", counts, "#f0821e", { area: true })],
    } as EChartsOption;
  }, [profiles]);

  /* The sparkline under each stat: signups per day, same seven days. */
  const spark = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, index) => {
      const date = startOfDay(new Date());
      date.setDate(date.getDate() - (13 - index));
      return date;
    });

    return days.map(
      (day) =>
        profiles.filter((profile) => {
          const created = new Date(profile.created_at);
          return (
            created >= day &&
            created < new Date(day.getTime() + 24 * 60 * 60 * 1000)
          );
        }).length,
    );
  }, [profiles]);

  return (
    <div className="space-y-4">
      {/* Title row: heading left, actions right, ascending in weight —
          ghost, then secondary, then the one filled button. */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] leading-tight font-medium tracking-tight">
            Pulse Overview
          </h1>
          <p className="mt-0.5 text-[1rem] text-muted-foreground">
            Live metrics across profiles, matches, messages and activity.
          </p>
        </div>

        <Button variant="secondary" onClick={loadPulse} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : undefined} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {/* One strip, four facts, hairline rules — not four cards. */}
      {loading ? (
        <SkeletonStats count={4} />
      ) : (
        <StatStrip
          stats={[
            {
              label: "Total members",
              value: stats.totalUsers,
              icon: Users,
              spark,
            },
            {
              label: "Online now",
              value: stats.activeToday,
              icon: Activity,
              tone: "success",
            },
            {
              label: "Matches today",
              value: stats.matchesToday,
              icon: Heart,
            },
            {
              label: "Messages sent",
              value: stats.messages,
              icon: MessageSquare,
            },
          ]}
        />
      )}

      {/* Asymmetric on purpose: a 50/50 split would read the chart and
          the feed as equals, and the chart is the subject. */}
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>User growth</CardTitle>
            <CardDescription>New profiles over the last 7 days</CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={chartOption} height={260} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-2.5">
                    <Skeleton className="size-1.5 shrink-0 rounded-full" />
                    <Skeleton className="h-3 flex-1 rounded-lg" />
                    <Skeleton className="h-2.5 w-10 shrink-0 rounded-lg" />
                  </div>
                ))}
              </div>
            ) : feed.length === 0 ? (
              <p className="py-10 text-center text-[0.92rem] text-muted-foreground">
                No recent activity.
              </p>
            ) : (
              <div className="-mx-1.5 space-y-0.5">
                <PagedList
                  items={feed}
                  perPage={20}
                  className="divide-y divide-foreground/[0.06]"
                >
                  {(item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-foreground/[0.03]"
                    >
                      <span className="size-1.5 shrink-0 rounded-full bg-foreground/25" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[0.92rem] leading-tight font-medium">
                          {item.label}
                        </p>
                        <p className="truncate text-[1rem] text-muted-foreground">
                          {nameOf(item.people[0])}
                          {item.people[1] && (
                            <>
                              <span className="px-1">{item.join ?? "and"}</span>
                              {nameOf(item.people[1])}
                            </>
                          )}
                        </p>
                      </div>
                      <span className="tnum shrink-0 text-[0.8rem] text-muted-foreground">
                        {formatDateTime(item.created_at)}
                      </span>
                    </div>
                  )}
                </PagedList>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MetricsBand />
    </div>
  );
}
