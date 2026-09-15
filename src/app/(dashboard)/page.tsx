"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { PagedList } from "@/components/ui/paged-list";
import { adminCounts, adminTable } from "@/lib/adminFetch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Activity,
  Heart,
  MessageSquare,
  RefreshCw,
  Users,
} from "lucide-react";
import type { EChartsOption } from "echarts";
import { Chart, barSeries, lineSeries, useVizPalette } from "@/components/ui/chart";
import { StatStrip } from "@/components/ui/stat-strip";
import { Skeleton, SkeletonStats } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { MetricsBand } from "@/components/MetricsBand";
import { PulseSections } from "@/components/PulseSections";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useLiveTable } from "@/lib/useLiveTable";
import { useNames } from "@/lib/useNames";
import { isOnline } from "@/lib/presence";
import { cn } from "@/lib/utils";

type ProfileRow = {
  created_at: string;
  /*
   * last_active, not is_online.
   *
   * is_online is a latch nothing ever cleared — see src/lib/presence.ts.
   * Online is derived from the heartbeat instead.
   */
  last_active: string | null;
  /*
   * Widened for the charts below.
   *
   * The page fetched two columns and drew one line from them. These are
   * the fields that answer the questions a dashboard is opened to ask:
   * who is here, where, how old, and how many got far enough through
   * signup to be seen by anybody.
   */
  gender: string | null;
  age: number | null;
  city: string | null;
  published_at: string | null;
  face_verified_at: string | null;
  photos: string[] | null;
};

type MatchRow = {
  created_at: string;
};

/*
 * The kinds of thing that land in the feed.
 *
 * Carried on the item rather than derived from the label, so filtering
 * and routing both read the same field — a label is prose and will be
 * reworded one day.
 */
type FeedKind = "match" | "like" | "pass" | "message" | "daily";

const FEED_KINDS: { value: FeedKind; label: string }[] = [
  { value: "match", label: "Matches" },
  { value: "like", label: "Likes" },
  { value: "pass", label: "Passes" },
  { value: "message", label: "Messages" },
  // "Daily" is the app's own word for a post that lasts a day, but the
  // panel is read by people who never see that screen — so the chip
  // says what it is rather than what it is called.
  { value: "daily", label: "Posts" },
];

/*
 * One range for the whole screen.
 *
 * The page used to hold three different ideas of "when": the metrics
 * band had its own chips, the charts were hardcoded to fourteen days,
 * and the feed had a separate window. Pressing a chip changed one of
 * the three, which read as the control being broken rather than as it
 * governing only part of the page.
 *
 * These keys match the metrics API's own windows, so one value drives
 * the band's request and every client-side cut below it.
 */
const RANGES: { value: string; label: string; days: number }[] = [
  { value: "today", label: "Today", days: 1 },
  { value: "week", label: "7 days", days: 7 },
  { value: "month", label: "30 days", days: 30 },
  { value: "quarter", label: "90 days", days: 90 },
  { value: "year", label: "Year", days: 365 },
];

type FeedItem = {
  id: string;
  kind: FeedKind;
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

  /*
   * What the feed is narrowed to.
   *
   * Nothing is remembered between visits on purpose: a filter that
   * survives a reload hides events, and the next person to open Pulse
   * reads the quiet as "nothing happened" rather than "you left a
   * filter on".
   */
  const [kinds, setKinds] = useState<Set<FeedKind>>(new Set());
  const [range, setRange] = useState("week");

  const days = RANGES.find((entry) => entry.value === range)?.days ?? 7;
  const since = useMemo(
    () => Date.now() - days * 86_400_000,
    [days],
  );

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
        select:
          "created_at, last_active, gender, age, city, published_at, face_verified_at, photos",
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
      kind: "message" as FeedKind,
      label: "Message",
      people: [message.sender_id],
      created_at: message.created_at,
    }));
    const recentMatches = (
      (recentMatchesResult.data ?? []) as RecentMatchRow[]
    ).map((match) => ({
      id: `match-${match.id}`,
      kind: "match" as FeedKind,
      label: "Match",
      people: [match.user1_id, match.user2_id],
      join: "and",
      created_at: match.created_at,
    }));
    const recentLikes = ((recentLikesResult.data ?? []) as RecentLikeRow[]).map(
      (like) => ({
        id: `like-${like.id}`,
        kind: "like" as FeedKind,
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
      kind: "pass" as FeedKind,
      label: "Pass",
      people: [pass.passer_id, pass.passed_id],
      join: "passed on",
      created_at: pass.created_at,
    }));
    const recentStories = (
      (recentStoriesResult.data ?? []) as RecentStoryRow[]
    ).map((story) => ({
      id: `story-${story.id}`,
      kind: "daily" as FeedKind,
      label: "Posted",
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

  /*
   * The live feed, kept live.
   *
   * `messages` is deliberately not subscribed even though the pulse
   * counts it. This loader runs eight queries, two of which pull 5000
   * rows, and messages is the busiest table in the app — a room full of
   * people chatting would retrigger all eight continuously. The other
   * tables move at human pace, and a message count that lags until the
   * next match or like is a fair trade for not hammering the database.
   */
  useLiveTable(["profiles", "matches", "likes", "passes", "dailies"], loadPulse);

  /*
   * The feed, narrowed.
   *
   * Three independent filters, all AND-ed: an empty set of kinds means
   * every kind rather than none, which is what "All" reads as.
   *
   * The name search runs against resolved names, so somebody still
   * loading matches nothing for a moment rather than being wrongly
   * excluded forever — the list re-derives when their name lands.
   */
  const shown = useMemo(() => {
    const floor = since;

    return feed.filter((item) => {
      if (kinds.size > 0 && !kinds.has(item.kind)) return false;

      if (floor !== null) {
        const at = new Date(item.created_at).getTime();
        if (Number.isNaN(at) || at < floor) return false;
      }

      return true;
    });
  }, [feed, kinds, since]);

  const filtered = kinds.size > 0;

  const clearFilters = useCallback(() => {
    setKinds(new Set());
  }, []);

  const toggleKind = useCallback((kind: FeedKind) => {
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  /*
   * Where a row points.
   *
   * Only two screens can actually receive a deep link today: a member's
   * own page, and the list screens by tab. So a row goes to the person
   * it is most about — the one who *received* the act, since that is
   * the account an admin is usually checking on — and Matches and
   * Messages go to the screen that owns conversations.
   *
   * Returning null rather than guessing is deliberate: a row that
   * silently lands somewhere unrelated is worse than one that does not
   * move.
   */
  const rowHref = useCallback((item: FeedItem): string | null => {
    switch (item.kind) {
      case "match":
        return "/connections?tab=matches";
      case "message":
        return "/messaging?tab=stream";
      case "like":
      case "pass":
        // The person on the receiving end.
        return item.people[1] ? `/members/${item.people[1]}` : null;
      case "daily":
        return item.people[0] ? `/members/${item.people[0]}` : null;
      default:
        return null;
    }
  }, []);

  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const activeToday = profiles.filter((profile) =>
      isOnline(profile.last_active),
    ).length;
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
  const palette = useVizPalette();

  /*
   * Signups against matches, on one pair of axes.
   *
   * The growth chart drew one line and answered half a question. People
   * arriving is only good news if they are also matching — a week where
   * signups climb and matches stay flat is the shape of a city filling
   * up with people who cannot find anybody, which is worth seeing before
   * it becomes churn.
   */
  const activityOption = useMemo(() => {
    /*
     * One point per day, capped at thirty.
     *
     * A year as 365 daily points is unreadable and slow to draw, so
     * longer ranges are sampled rather than shown whole — the shape is
     * the thing being read here, not any single day.
     */
    const points = Math.min(days, 30);
    const step = Math.max(1, Math.round(days / points));

    const buckets = Array.from({ length: points }, (_, index) => {
      const date = startOfDay(new Date());
      date.setDate(date.getDate() - (points - 1 - index) * step);
      return date;
    });

    const span = step * 86_400_000;

    const perDay = (rows: { created_at: string }[]) =>
      buckets.map(
        (day) =>
          rows.filter((row) => {
            const at = new Date(row.created_at);
            return at >= day && at < new Date(day.getTime() + span);
          }).length,
      );

    return {
      legend: { show: true },
      // Room made for the legend, which otherwise sits on the plot: the
      // house grid starts 16px from the top because most charts here
      // have no legend at all.
      grid: { top: 34 },
      xAxis: {
        data: buckets.map((day) =>
          day.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
        ),
      },
      series: [
        lineSeries("Signups", perDay(profiles), palette[0], { area: true }),
        lineSeries("Matches", perDay(matches), palette[1]),
      ],
    } as EChartsOption;
  }, [profiles, matches, palette, days]);

  /*
   * How far people get through signing up.
   *
   * A funnel rather than four separate counts, because the gaps between
   * the bars are the finding. Somewhere between "joined" and "can be
   * seen" is where a signup flow leaks, and four numbers side by side
   * hide exactly that.
   */
  /*
   * The profiles the range covers.
   *
   * The charts below describe who signed up, so scoping them to the
   * range is what makes the chips move them. Anything counting a
   * *current* state rather than an arrival — how many are published
   * right now — stays whole, because "published in the last 7 days" is
   * a different and less useful question.
   */
  const inRange = useMemo(
    () => profiles.filter((row) => new Date(row.created_at).getTime() >= since),
    [profiles, since],
  );

  const funnelOption = useMemo(() => {
    const joined = inRange.length;
    const withPhotos = inRange.filter((row) => (row.photos?.length ?? 0) > 0).length;
    const published = inRange.filter((row) => row.published_at).length;
    const verified = inRange.filter((row) => row.face_verified_at).length;

    return {
      xAxis: { data: ["Joined", "Added a photo", "Went live", "Verified"] },
      series: [
        barSeries("People", [joined, withPhotos, published, verified], palette[0]),
      ],
    } as EChartsOption;
  }, [inRange, palette]);

  /*
   * Who is here, and where.
   *
   * The balance matters more on a dating app than almost any other
   * number: a deck is built from people looking for each other, so a
   * lopsided split is felt by everyone on the long side as an empty app.
   */
  const genderOption = useMemo(() => {
    const tally: Record<string, number> = {};

    for (const row of inRange) {
      const key = row.gender ?? "Not set";
      tally[key] = (tally[key] ?? 0) + 1;
    }

    return {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie" as const,
          radius: ["58%", "82%"],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderWidth: 2, borderColor: "#fff" },
          label: { show: false },
          data: Object.entries(tally).map(([name, value]) => ({
            name: name === "male" ? "Men" : name === "female" ? "Women" : name,
            value,
          })),
        },
      ],
      /*
       * Under the ring, not above it.
       *
       * top is undone explicitly: the house legend sets it so the
       * line charts can reserve headroom, and leaving both set makes
       * ECharts honour the top and ignore the bottom.
       */
      legend: { show: true, top: undefined, bottom: 0, left: "center" },
    } as EChartsOption;
  }, [inRange]);

  const cityOption = useMemo(() => {
    const tally: Record<string, number> = {};

    for (const row of inRange) {
      const key = (row.city ?? "").trim();
      if (key) tally[key] = (tally[key] ?? 0) + 1;
    }

    // Busiest at the top. Horizontal because city names are words, and
    // words rotated on an axis are words nobody reads.
    const ranked = Object.entries(tally)
      .sort((a, b) => a[1] - b[1])
      .slice(-8);

    return {
      grid: { left: 100, right: 24, top: 12, bottom: 12 },
      xAxis: { type: "value" as const, min: 0, minInterval: 1 },
      /*
       * min and minInterval explicitly undone here.
       *
       * The house yAxis carries them so counts never draw a negative
       * floor, but this chart is rotated — its y is the category axis,
       * where a min of 0 means "start at the first category" and can
       * drop labels. They move to the x axis, which is the value one.
       */
      yAxis: {
        type: "category" as const,
        data: ranked.map(([name]) => name),
        min: undefined,
        minInterval: undefined,
      },
      series: [
        {
          type: "bar" as const,
          data: ranked.map(([, value]) => value),
          barMaxWidth: 18,
          itemStyle: { color: palette[2], borderRadius: [2, 6, 6, 2] },
        },
      ],
    } as EChartsOption;
  }, [inRange, palette]);

  /*
   * Ages, in five-year bands.
   *
   * Bands rather than a point per year: one person aged 34 is noise, and
   * a chart with a spike per individual reads as a pattern that is not
   * there.
   */
  const ageOption = useMemo(() => {
    const bands = ["18-24", "25-29", "30-34", "35-39", "40-49", "50+"];
    const counts = new Array(bands.length).fill(0);

    for (const row of inRange) {
      const age = row.age;
      if (!age) continue;

      const index =
        age < 25 ? 0 : age < 30 ? 1 : age < 35 ? 2 : age < 40 ? 3 : age < 50 ? 4 : 5;

      counts[index] += 1;
    }

    return {
      xAxis: { data: bands },
      series: [barSeries("Members", counts, palette[3])],
    } as EChartsOption;
  }, [inRange, palette]);

  /* The sparkline under each stat: signups per bucket, across the range. */
  const spark = useMemo(() => {
    const points = Math.min(days, 30);
    const step = Math.max(1, Math.round(days / points));
    const span = step * 86_400_000;

    const buckets = Array.from({ length: points }, (_, index) => {
      const date = startOfDay(new Date());
      date.setDate(date.getDate() - (points - 1 - index) * step);
      return date;
    });

    return buckets.map(
      (day) =>
        profiles.filter((profile) => {
          const created = new Date(profile.created_at);
          return created >= day && created < new Date(day.getTime() + span);
        }).length,
    );
  }, [profiles, days]);

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

      {/*
        The filters, on their own line under the title row.

        They govern the activity feed further down, but they are controls
        for the page rather than part of any one card — buried in a card
        header they were only findable by scrolling to the thing they had
        already narrowed. A row of their own keeps the title row to one
        idea and gives the chips room to sit on a single line.
      */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* An empty set is every kind, so "All" is the state of having
              chosen nothing rather than a sixth option. */}
          <button
            onClick={() => setKinds(new Set())}
            className={cn(
              "rounded-full px-2.5 py-1 text-[0.8rem] transition-colors",
              kinds.size === 0
                ? "bg-foreground text-background"
                : "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.1]",
            )}
          >
            All
          </button>

          {FEED_KINDS.map((entry) => (
            <button
              key={entry.value}
              onClick={() => toggleKind(entry.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[0.8rem] transition-colors",
                kinds.has(entry.value)
                  ? "bg-foreground text-background"
                  : "bg-foreground/[0.06] text-muted-foreground hover:bg-foreground/[0.1]",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {/* The page's range, pushed to the right edge. Everything on
            the screen below reads it — the metrics band, the charts and
            the feed — so one press moves the whole page. */}
        <div className="ml-auto flex items-center gap-1">
          {RANGES.map((entry) => (
            <button
              key={entry.value}
              onClick={() => setRange(entry.value)}
              className={cn(
                "rounded-lg px-2 py-1 text-[0.8rem] transition-colors",
                range === entry.value
                  ? "bg-foreground/[0.1] text-foreground"
                  : "text-muted-foreground hover:bg-foreground/[0.06]",
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {/* Only once something is on, so the row is not a permanent
            invitation to undo nothing. */}
        {filtered && (
          <button
            onClick={clearFilters}
            className="text-[0.8rem] text-muted-foreground underline-offset-2 hover:underline"
          >
            Clear
          </button>
        )}
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
            <CardTitle>Signups and matches</CardTitle>
            <CardDescription>
              Two weeks. People arriving is only good news if they are matching
              too — signups climbing while matches stay flat is a city filling
              up with people who cannot find anybody.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={activityOption} height={260} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>

            {/* The count is the feedback that a filter did something —
                without it a short list looks like a quiet day. The
                controls themselves are in the page header. */}
            {filtered && !loading && (
              <CardDescription>
                {shown.length} of {feed.length} events
              </CardDescription>
            )}
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
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-[0.92rem] text-muted-foreground">
                {filtered ? "Nothing matches those filters." : "No recent activity."}
              </p>
            ) : (
              <div className="-mx-1.5 space-y-0.5">
                <PagedList
                  items={shown}
                  perPage={20}
                  className="divide-y divide-foreground/[0.06]"
                >
                  {(item) => {
                    const href = rowHref(item);

                    return (
                      <div
                        key={item.id}
                        className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-foreground/[0.03]"
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-foreground/25" />

                        <div className="min-w-0 flex-1">
                          {/*
                            The label carries the row's own link, and the
                            names carry their own. Nesting a link inside a
                            link is invalid HTML and the browser picks a
                            winner for you, so they sit side by side.
                          */}
                          {href ? (
                            <Link
                              href={href}
                              className="block truncate text-[0.92rem] leading-tight font-medium underline-offset-2 group-hover:underline"
                            >
                              {item.label}
                            </Link>
                          ) : (
                            <p className="truncate text-[0.92rem] leading-tight font-medium">
                              {item.label}
                            </p>
                          )}

                          <p className="truncate text-[1rem] text-muted-foreground">
                            <Link
                              href={`/members/${item.people[0]}`}
                              className="underline-offset-2 hover:text-foreground hover:underline"
                            >
                              {nameOf(item.people[0])}
                            </Link>
                            {item.people[1] && (
                              <>
                                <span className="px-1">{item.join ?? "and"}</span>
                                <Link
                                  href={`/members/${item.people[1]}`}
                                  className="underline-offset-2 hover:text-foreground hover:underline"
                                >
                                  {nameOf(item.people[1])}
                                </Link>
                              </>
                            )}
                          </p>
                        </div>

                        <span className="tnum shrink-0 text-[0.8rem] text-muted-foreground">
                          {formatDateTime(item.created_at)}
                        </span>
                      </div>
                    );
                  }}
                </PagedList>
              </div>
            )}          </CardContent>
        </Card>
      </div>

      {/*
        Who is actually here.

        The page had one chart and six totals, which says how much is
        happening and nothing about who it is happening to. These four
        answer the questions somebody opens a dashboard with: does the
        signup flow leak, is the balance workable, where are people, and
        how old are they.
      */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>How far people get</CardTitle>
            <CardDescription>
              Every step between joining and being visible in somebody
              else&apos;s deck. The gaps are where the signup flow leaks.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={funnelOption} height={240} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Men and women</CardTitle>
            <CardDescription>
              A deck is built from people looking for each other, so a lopsided
              split is felt as an empty app by everyone on the long side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={genderOption} height={240} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Where people are</CardTitle>
            <CardDescription>
              Busiest first. Density decides whether a deck ever fills.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={cityOption} height={240} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ages</CardTitle>
            <CardDescription>
              In bands, because one person aged 34 is noise rather than a
              pattern.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Chart option={ageOption} height={240} loading={loading} />
          </CardContent>
        </Card>
      </div>

      <MetricsBand range={range} />

      {/* The rest of the panel: Roses, Hearts, Moderation, Content.
          Below the charts because those answer the first question a
          dashboard is opened with — is the app growing — and these
          answer the second: is everything else healthy. */}
      <PulseSections range={range} />
    </div>
  );
}
