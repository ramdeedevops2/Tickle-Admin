"use client";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Trash2 } from "lucide-react";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/page";
import { PageSkeleton } from "@/components/ui/page";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Live Dailies.
 *
 * Everything here disappears within twenty-four hours on its own, which
 * makes this a live view rather than a queue: a Daily reported at 11pm is
 * gone by morning whether or not anyone reached it. Removing one early is
 * for the ones that should not have lasted the hour.
 */

type Daily = {
  id: string;
  user_id: string;
  kind: string;
  payload: { text?: string; artist?: string } | null;
  caption: string | null;
  created_at: string;
  expires_at: string;
  url: string | null;
  author: {
    user_id: string;
    name: string | null;
    photos: string[] | null;
    suspended_at: string | null;
  } | null;
};

const GLYPH: Record<string, string> = {
  photo: "📸",
  video: "🎥",
  voice: "🎤",
  place: "📍",
  music: "🎵",
  food: "🍕",
  activity: "🏏",
  thought: "😂",
};

function timeLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "gone";

  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours}h left` : `${Math.max(1, Math.floor(ms / 60_000))}m left`;
}

function bodyOf(daily: Daily) {
  if (daily.caption) return daily.caption;
  const text = daily.payload?.text;
  if (!text) return "";
  return daily.payload?.artist ? `${text} — ${daily.payload.artist}` : text;
}

export function DailiesPanel() {
  const confirm = useConfirm();
  const [dailies, setDailies] = useState<Daily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ dailies: Daily[] }>("/api/dailies");

    if (error) setError(error);
    else setDailies(data?.dailies ?? []);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const remove = useCallback(
    async (daily: Daily) => {
      const ok = await confirm({
        title: "Remove this Daily now?",
        body: "It would disappear on its own within a day. The member is not told.",
        confirmLabel: "Remove",
        tone: "danger",
      });
      if (!ok) return;

      setBusy(daily.id);

      const { error } = await adminFetch(`/api/dailies?id=${encodeURIComponent(daily.id)}`, {
        method: "DELETE",
      });

      if (error) setError(error);
      else setDailies((current) => current.filter((row) => row.id !== daily.id));

      setBusy(null);
    },
    [confirm],
  );

  const kinds = useMemo(
    () => ["all", ...Object.keys(GLYPH).filter((k) => dailies.some((d) => d.kind === k))],
    [dailies],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return dailies.filter((daily) => {
      if (kind !== "all" && daily.kind !== kind) return false;
      if (!q) return true;

      return (
        daily.author?.name?.toLowerCase().includes(q) ||
        bodyOf(daily).toLowerCase().includes(q)
      );
    });
  }, [dailies, kind, query]);

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you staring at an empty one.
  const { page, setPage } = usePagination(visible.length);

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
              placeholder="Person or text"
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

      <div className="flex w-fit flex-wrap border border-foreground/[0.06]">
        {kinds.map((entry) => (
          <button
            key={entry}
            onClick={() => setKind(entry)}
            className={`rounded-full px-3.5 py-1.5 text-[0.86rem] font-medium transition-all duration-200 ${
              kind === entry
                ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(26,26,24,0.18)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry === "all" ? `All (${dailies.length})` : `${GLYPH[entry]} ${entry}`}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      <Card className="border-foreground/[0.06] bg-card">
        <CardHeader>
          <CardTitle>{visible.length} live</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <PageSkeleton sections={2} />
          ) : visible.length === 0 ? (
            <EmptyState
                title="Nothing posted"
                body="Dailies disappear on their own within 24 hours, so an empty list usually just means a quiet day."
              />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {paginate(visible, page).map((daily) => (
                <div key={daily.id} className="border border-foreground/[0.06]">
                  <div className="relative aspect-[4/5] bg-muted">
                    {daily.kind === "photo" && daily.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={daily.url} alt="" className="size-full object-cover" />
                    ) : daily.kind === "video" && daily.url ? (
                      <video
                        src={daily.url}
                        controls
                        muted
                        className="size-full object-cover"
                      />
                    ) : daily.kind === "voice" && daily.url ? (
                      <div className="flex size-full flex-col items-center justify-center gap-3 p-4">
                        <span className="text-3xl">🎤</span>
                        <audio src={daily.url} controls className="w-full" />
                      </div>
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
                        <span className="text-3xl">{GLYPH[daily.kind]}</span>
                        <p className="text-[0.92rem]">{bodyOf(daily)}</p>
                      </div>
                    )}

                    <Badge
                      variant="outline"
                      className="absolute left-2 top-2 bg-background/80 text-[0.86rem]"
                    >
                      {timeLeft(daily.expires_at)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 p-3">
                    <Link href={`/members/${daily.user_id}`} className="shrink-0">
                      <Avatar className="size-7 border border-foreground/[0.06] bg-transparent">
                        <AvatarImage src={daily.author?.photos?.[0] ?? undefined} />
                        <AvatarFallback className="bg-transparent text-[0.8rem]">
                          {(daily.author?.name ??"?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.86rem] font-medium">
                        {daily.author?.name ?? "Deleted account"}
                      </p>
                      {daily.caption && daily.kind !== "thought" && (
                        <p className="truncate text-[0.8rem] text-muted-foreground">
                          {daily.caption}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === daily.id}
                      onClick={() => remove(daily)}
                      title="Remove now"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            <Pagination page={page} total={visible.length} onPage={setPage} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
