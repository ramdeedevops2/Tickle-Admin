"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Trash2 } from "lucide-react";

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

export default function DailiesPage() {
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

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const remove = useCallback(
    async (daily: Daily) => {
      if (!window.confirm("Remove this Daily now? It would expire on its own within a day.")) {
        return;
      }

      setBusy(daily.id);

      const { error } = await adminFetch(`/api/dailies?id=${encodeURIComponent(daily.id)}`, {
        method: "DELETE",
      });

      if (error) setError(error);
      else setDailies((current) => current.filter((row) => row.id !== daily.id));

      setBusy(null);
    },
    [],
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Dailies</h2>
          <p className="text-muted-foreground">
            Live now. Everything here expires within 24 hours on its own.
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
              placeholder="Person or text"
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

      <div className="flex w-fit flex-wrap border border-border/50">
        {kinds.map((entry) => (
          <button
            key={entry}
            onClick={() => setKind(entry)}
            className={`px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
              kind === entry
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {entry === "all" ? `All (${dailies.length})` : `${GLYPH[entry]} ${entry}`}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle>{visible.length} live</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading dailies...</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">Nothing live right now.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((daily) => (
                <div key={daily.id} className="border border-border/50">
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
                        <p className="text-sm">{bodyOf(daily)}</p>
                      </div>
                    )}

                    <Badge
                      variant="outline"
                      className="absolute left-2 top-2 rounded-none bg-background/80 text-[10px] uppercase tracking-[0.2em]"
                    >
                      {timeLeft(daily.expires_at)}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 p-3">
                    <Link href={`/members/${daily.user_id}`} className="shrink-0">
                      <Avatar className="size-7 border border-border bg-transparent">
                        <AvatarImage src={daily.author?.photos?.[0] ?? undefined} />
                        <AvatarFallback className="bg-transparent text-[10px]">
                          {(daily.author?.name ?? "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </Link>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {daily.author?.name ?? daily.user_id.slice(0, 8)}
                      </p>
                      {daily.caption && daily.kind !== "thought" && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {daily.caption}
                        </p>
                      )}
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-none"
                      disabled={busy === daily.id}
                      onClick={() => remove(daily)}
                      title="Remove now"
                    >
                      <Trash2 className="size-4" />
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
