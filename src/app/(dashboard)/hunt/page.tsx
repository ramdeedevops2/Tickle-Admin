"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw } from "lucide-react";

/**
 * Heart Hunt.
 *
 * Two halves that look similar and are not: platform hearts are things
 * the company places into the world with a real reward attached, and the
 * settings below govern hearts that people drop themselves.
 *
 * A platform drop is a promise somebody may travel for, so it is worth
 * being careful with the claim limit — an unlimited drop at a busy venue
 * is an unlimited bill.
 */

type PlatformHeart = {
  id: string;
  title: string;
  body: string | null;
  reward_kind: string;
  reward_value: number;
  reward_code: string | null;
  claim_limit: number | null;
  claimed: number;
  expires_at: string;
  active: boolean;
  places: { name: string } | null;
};

type Settings = {
  user_heart_ttl: string;
  extend_rose_cost: number;
  extend_max: number;
  free_drops_per_day: number;
  extra_drop_cost: number;
  hunt_compat_min: number;
};

type Payload = {
  settings: Settings;
  platform: PlatformHeart[];
  places: { id: string; name: string }[];
  rewardKinds: string[];
  stats: { active: number; claimed: number; extended: number };
};

export default function HuntPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [place, setPlace] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("roses");
  const [value, setValue] = useState("25");
  const [code, setCode] = useState("");
  const [limit, setLimit] = useState("100");
  const [days, setDays] = useState("7");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/hunt");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/hunt", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const drop = useCallback(async () => {
    setBusy(true);

    const { error } = await adminFetch("/api/hunt", {
      method: "POST",
      body: JSON.stringify({
        place_id: place,
        title,
        reward_kind: kind,
        reward_value: Number(value),
        reward_code: code,
        claim_limit: limit ? Number(limit) : null,
        days: Number(days),
      }),
    });

    if (error) {
      setError(error);
    } else {
      setTitle("");
      setCode("");
      await load();
    }

    setBusy(false);
  }, [place, title, kind, value, code, limit, days, load]);

  const settings = data?.settings;
  const creditable = ["roses", "super_likes", "premium_days"].includes(kind);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Heart Hunt</h2>
          <p className="text-muted-foreground">
            Platform drops, and the rules behind the ones people leave themselves.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Live user hearts" value={data.stats.active} />
          <Stat label="Claimed" value={data.stats.claimed} />
          <Stat label="Paid to extend" value={data.stats.extended} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drop a platform heart</CardTitle>
          <p className="text-sm text-muted-foreground">
            Roses and Premium days are credited automatically on claim. A promo or venue
            reward hands over a code instead.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <select
            value={place}
            onChange={(event) => setPlace(event.target.value)}
            className="h-9 min-w-[200px] rounded-md border bg-background px-3 text-sm"
          >
            <option value="">Choose a place…</option>
            {(data?.places ?? []).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>

          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title people see"
            className="min-w-[200px] flex-1"
          />

          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {(data?.rewardKinds ?? []).map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>

          {creditable ? (
            <Input
              type="number"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="amount"
              className="w-28"
            />
          ) : (
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="promo code"
              className="w-40"
            />
          )}

          <Input
            type="number"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="claims (blank = ∞)"
            className="w-36"
          />

          <Input
            type="number"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            placeholder="days"
            className="w-24"
          />

          <Button onClick={drop} disabled={busy || !place || title.length < 3}>
            <Plus className="mr-1 h-4 w-4" />
            Drop
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live platform hearts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.platform ?? []).map((heart) => (
            <div key={heart.id} className="flex items-center gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1">
                <div className={heart.active ? "font-medium" : "font-medium line-through opacity-50"}>
                  {heart.title}
                </div>
                <div className="text-xs text-muted-foreground">
                  {heart.places?.name ?? "Unknown place"} ·{" "}
                  {heart.reward_kind === "promo" || heart.reward_kind === "venue"
                    ? heart.reward_code
                    : `${heart.reward_value} ${heart.reward_kind}`}
                </div>
              </div>

              <Badge variant="secondary">
                {heart.claimed}
                {heart.claim_limit ? ` / ${heart.claim_limit}` : ""} claimed
              </Badge>

              <Button
                variant={heart.active ? "ghost" : "default"}
                size="sm"
                disabled={busy}
                onClick={() => patch({ entity: "platform", id: heart.id, active: !heart.active })}
              >
                {heart.active ? "Retire" : "Restore"}
              </Button>
            </div>
          ))}

          {(data?.platform ?? []).length === 0 && !loading && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No platform hearts yet.
            </p>
          )}
        </CardContent>
      </Card>

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User heart rules</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Heart lifetime"
              hint="Hours a dropped heart stays live."
              value={hoursOf(settings.user_heart_ttl)}
              onCommit={(next) => patch({ user_heart_hours: next })}
              disabled={busy}
            />
            <Field
              label="Free drops a day"
              hint="Beyond this, dropping costs Roses."
              value={settings.free_drops_per_day}
              onCommit={(next) => patch({ free_drops_per_day: next })}
              disabled={busy}
            />
            <Field
              label="Extra drop cost"
              hint="Roses, once the free ones are used."
              value={settings.extra_drop_cost}
              onCommit={(next) => patch({ extra_drop_cost: next })}
              disabled={busy}
            />
            <Field
              label="Extension cost"
              hint="Roses to keep a heart alive another window."
              value={settings.extend_rose_cost}
              onCommit={(next) => patch({ extend_rose_cost: next })}
              disabled={busy}
            />
            <Field
              label="Extension limit"
              hint="How many times one heart may be extended."
              value={settings.extend_max}
              onCommit={(next) => patch({ extend_max: next })}
              disabled={busy}
            />
            <Field
              label="Compatibility floor"
              hint="Below this, a heart is not shown at all. Higher is quieter and better."
              value={settings.hunt_compat_min}
              onCommit={(next) => patch({ hunt_compat_min: next })}
              disabled={busy}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-bold">{value.toLocaleString()}</CardContent>
    </Card>
  );
}

/** Commits on blur, so a half-typed number never saves. */
function Field({
  label,
  hint,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <Input
        type="number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        className="h-9"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Postgres returns intervals as "24:00:00". Only hours matter here. */
function hoursOf(interval: string): number {
  const match = /^(\d+):/.exec(interval ?? "");
  return match ? Number(match[1]) : 24;
}
