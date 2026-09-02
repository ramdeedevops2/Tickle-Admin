"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MapPin, RefreshCw, Search, Timer, Trash2 } from "lucide-react";

/**
 * Hearts left at venues, and the sparks they turned into.
 *
 * Three numbers matter here and "how many hearts exist" is not one of them.
 * What counts is how many are live, how many were picked up, and how many
 * expired unclaimed — because a feature where people drop hearts nobody ever
 * finds fails quietly, and only the ratio between those three shows it.
 *
 * Read through /api/hearts rather than straight from Supabase: RLS on both
 * tables is written from the member's point of view — you see your own
 * hearts and nobody else's — so a client-side query here would come back
 * empty no matter who is signed in.
 */

type HeartRow = {
  id: string;
  dropper_id: string;
  place_id: string;
  note: string | null;
  vibe: string | null;
  status: string;
  created_at: string;
  expires_at: string;
};

type PlaceRow = {
  id: string;
  name: string;
  category: string | null;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
};

type SparkRow = {
  id: string;
  heart_id: string;
  place_id: string;
  dropper_id: string;
  picker_id: string;
  created_at: string;
  expires_at: string;
  removed_by: string | null;
};

type HeartView = HeartRow & { place: PlaceRow | null; dropper: ProfileRow | null };

type SparkView = SparkRow & {
  place: PlaceRow | null;
  dropper: ProfileRow | null;
  picker: ProfileRow | null;
};

const STATUS_STYLES: Record<string, string> = {
  active: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  claimed: "border-blue-500/30 bg-blue-500/10 text-blue-600",
  expired: "border-border/50 bg-muted text-muted-foreground",
  withdrawn: "border-orange-500/30 bg-orange-500/10 text-orange-600",
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
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
  return getName(profile, fallback)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function HeartsPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary, and
  // a production build fails outright without one.
  return (
    <Suspense
      fallback={<div className="py-16 text-center text-muted-foreground">Loading hearts...</div>}
    >
      <HeartsView />
    </Suspense>
  );
}

function HeartsView() {
  const searchParams = useSearchParams();

  const [hearts, setHearts] = useState<HeartView[]>([]);
  const [sparks, setSparks] = useState<SparkView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"hearts" | "sparks">("hearts");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ hearts: HeartView[]; sparks: SparkView[] }>(
      "/api/hearts",
    );

    if (error) {
      setError(error);
    } else {
      setHearts(data?.hearts ?? []);
      setSparks(data?.sparks ?? []);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const expireNow = useCallback(async () => {
    setBusy(true);
    // The same sweep pg_cron runs every ten minutes. Exposed because waiting
    // ten minutes to see the effect of a settings change is the kind of
    // friction that stops anyone checking at all.
    const { error } = await adminFetch("/api/hearts", {
      method: "POST",
      body: JSON.stringify({ action: "expire" }),
    });
    if (error) setError(error);
    await load();
    setBusy(false);
  }, [load]);

  // The palette links here as /hearts?action=expire, so arriving that way has
  // to actually run the sweep rather than just landing on the page.
  const wantsExpire = searchParams.get("action") === "expire";
  useEffect(() => {
    if (wantsExpire) void expireNow();
    // Once, on arrival — not again on every reload the sweep itself triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsExpire]);

  const withdraw = useCallback(
    async (heartId: string) => {
      setBusy(true);
      const { error } = await adminFetch("/api/hearts", {
        method: "POST",
        body: JSON.stringify({ action: "withdraw", id: heartId }),
      });
      if (error) setError(error);
      await load();
      setBusy(false);
    },
    [load],
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const live = hearts.filter(
      (row) => row.status === "active" && new Date(row.expires_at).getTime() > now,
    ).length;
    const claimed = hearts.filter((row) => row.status === "claimed").length;
    const expired = hearts.filter((row) => row.status === "expired").length;
    const settled = claimed + expired;

    return {
      live,
      claimed,
      expired,
      // The number that says whether the feature works: of the hearts that
      // reached an end state, how many found someone.
      pickupRate: settled > 0 ? Math.round((claimed / settled) * 100) : 0,
    };
  }, [hearts]);

  const filteredHearts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return hearts;
    return hearts.filter(
      (row) =>
        row.place?.name?.toLowerCase().includes(q) ||
        row.note?.toLowerCase().includes(q) ||
        getName(row.dropper, row.dropper_id).toLowerCase().includes(q),
    );
  }, [hearts, query]);

  const filteredSparks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sparks;
    return sparks.filter(
      (row) =>
        row.place?.name?.toLowerCase().includes(q) ||
        getName(row.dropper, row.dropper_id).toLowerCase().includes(q) ||
        getName(row.picker, row.picker_id).toLowerCase().includes(q),
    );
  }, [sparks, query]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Hearts</h2>
          <p className="text-muted-foreground">
            Dropped at venues, and the sparks they turned into.
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
              placeholder="Venue, note or person"
            />
          </div>
          <Button
            variant="outline"
            onClick={expireNow}
            disabled={busy || loading}
            className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
          >
            <Timer className="mr-2 size-4" />
            Expire
          </Button>
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Live Now" value={stats.live} />
        <Stat label="Picked Up" value={stats.claimed} />
        <Stat label="Expired Unclaimed" value={stats.expired} />
        <Stat label="Pickup Rate" value={`${stats.pickupRate}%`} />
      </div>

      <div className="flex w-fit border border-border/50">
        <TabButton active={tab === "hearts"} onClick={() => setTab("hearts")}>
          Hearts {hearts.length > 0 && `(${hearts.length})`}
        </TabButton>
        <TabButton active={tab === "sparks"} onClick={() => setTab("sparks")}>
          Sparks {sparks.length > 0 && `(${sparks.length})`}
        </TabButton>
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle>{tab === "hearts" ? "Every Heart" : "Every Spark"}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading hearts...</div>
          ) : error ? (
            <div className="py-16 text-center text-destructive">{error}</div>
          ) : tab === "hearts" ? (
            filteredHearts.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">No hearts found.</div>
            ) : (
              <div className="space-y-4">
                {filteredHearts.map((row) => (
                  <HeartRowView key={row.id} row={row} onWithdraw={withdraw} busy={busy} />
                ))}
              </div>
            )
          ) : filteredSparks.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">No sparks found.</div>
          ) : (
            <div className="space-y-4">
              {filteredSparks.map((row) => (
                <SparkRowView key={row.id} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-black tracking-tight">{value}</CardContent>
    </Card>
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

function HeartRowView({
  row,
  onWithdraw,
  busy,
}: {
  row: HeartView;
  onWithdraw: (id: string) => void;
  busy: boolean;
}) {
  const live = row.status === "active" && new Date(row.expires_at).getTime() > Date.now();

  return (
    <div className="flex items-center gap-4 border-b border-border/50 pb-4 last:border-0 last:pb-0">
      <Link href={`/members/${row.dropper_id}`}>
        <Avatar className="h-10 w-10 border border-border bg-transparent">
          <AvatarImage src={row.dropper?.photos?.[0] ?? undefined} />
          <AvatarFallback className="bg-transparent text-xs">
            {getInitials(row.dropper, row.dropper_id)}
          </AvatarFallback>
        </Avatar>
      </Link>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {getName(row.dropper, row.dropper_id)}
          <span className="text-muted-foreground"> at </span>
          {row.place?.name ?? "Unknown venue"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {row.note || <span className="italic">No note</span>}
          {row.vibe ? ` - ${row.vibe}` : ""}
          {` - ${formatDateTime(row.created_at)}`}
        </p>
      </div>

      <Badge
        variant="outline"
        className={`rounded-none text-[10px] uppercase tracking-[0.2em] ${
          STATUS_STYLES[live ? "active" : row.status] ?? ""
        }`}
      >
        {live ? "Active" : row.status}
      </Badge>

      {live && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => onWithdraw(row.id)}
          title="Withdraw this heart"
          className="rounded-none"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

function SparkRowView({ row }: { row: SparkView }) {
  return (
    <div className="flex items-center gap-4 border-b border-border/50 pb-4 last:border-0 last:pb-0">
      <div className="flex -space-x-4">
        <Avatar className="h-10 w-10 border border-border bg-transparent">
          <AvatarImage src={row.dropper?.photos?.[0] ?? undefined} />
          <AvatarFallback className="bg-transparent text-xs">
            {getInitials(row.dropper, row.dropper_id)}
          </AvatarFallback>
        </Avatar>
        <Avatar className="h-10 w-10 border border-border bg-transparent">
          <AvatarImage src={row.picker?.photos?.[0] ?? undefined} />
          <AvatarFallback className="bg-transparent text-xs">
            {getInitials(row.picker, row.picker_id)}
          </AvatarFallback>
        </Avatar>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {getName(row.dropper, row.dropper_id)}
          <span className="text-muted-foreground"> and </span>
          {getName(row.picker, row.picker_id)}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {row.place?.name ?? "Unknown venue"} - {formatDateTime(row.created_at)}
        </p>
      </div>

      <Badge
        variant="outline"
        className={`rounded-none text-[10px] uppercase tracking-[0.2em] ${
          row.removed_by ? STATUS_STYLES.expired : STATUS_STYLES.active
        }`}
      >
        {row.removed_by ? "Removed" : "Live"}
      </Badge>
    </div>
  );
}
