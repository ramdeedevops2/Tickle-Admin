"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

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
  places: { id: string; name: string; address: string | null }[];
  rewardKinds: string[];
  stats: { active: number; claimed: number; extended: number };
};

export function HuntPanel() {
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

  useLoadOnMount(load);

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

  const platformHearts = data?.platform ?? [];

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(platformHearts.length);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" :"h-4 w-4"} />
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-[0.92rem] text-destructive">{error}</CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Hearts live now" value={data.stats.active} />
          <Stat label="Claimed" value={data.stats.claimed} />
          <Stat label="Times someone paid to keep one alive" value={data.stats.extended} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drop a heart</CardTitle>
          <p className="text-[0.92rem] text-muted-foreground">
            Roses and Premium days are given automatically. A promo hands over a code.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {/* Typed, not scrolled. There are hundreds of venues and no order
              worth hunting through them in. */}
          <Combobox
            value={place}
            onChange={setPlace}
            options={(data?.places ?? []).map((entry) => ({
              value: String(entry.id),
              label: String(entry.name),
              hint: entry.address ?? undefined,
            }))}
            placeholder="Find a place…"
            emptyLabel="No venue by that name"
            className="w-[16rem]"
          />

          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Title people see"
            className="min-w-[200px] flex-1"
          />

          <Select
            value={kind}
            onChange={(next) => setKind(next as never)}
            options={(data?.rewardKinds ?? []).map((entry) => ({
              value: String(entry),
              label: String(entry),
            }))}
            className="w-[11rem]"
          />

          {creditable ? (
            <Input
              type="number"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="How many"
              className="w-28"
            />
          ) : (
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Code they receive"
              className="w-40"
            />
          )}

          <Input
            type="number"
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            placeholder="How many can claim it"
            className="w-36"
          />

          <Input
            type="number"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            placeholder="Days it lasts"
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
          <CardTitle className="text-base">Live now</CardTitle>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Promotional hearts running right now, and how many people have claimed each.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <>
            {paginate(platformHearts, page).map((heart) => (
            <div key={heart.id} className="flex items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <div className={heart.active ? "font-medium" :"font-medium line-through opacity-50"}>
                  {heart.title}
                </div>
                <div className="text-[0.86rem] text-muted-foreground">
                  {heart.places?.name ??"Unknown place"} ·{""}
                  {heart.reward_kind === "promo" || heart.reward_kind === "venue"
                    ? heart.reward_code
                    : `${heart.reward_value} ${heart.reward_kind}`}
                </div>
              </div>

              <Badge variant="secondary">
                {heart.claimed}
                {heart.claim_limit ? ` / ${heart.claim_limit}` :""} claimed
              </Badge>

              <Button
                variant={heart.active ? "ghost" :"default"}
                size="sm"
                disabled={busy}
                onClick={() => patch({ entity: "platform", id: heart.id, active: !heart.active })}
              >
                {heart.active ? "Retire" :"Restore"}
              </Button>
            </div>
          ))}
            <Pagination page={page} total={platformHearts.length} onPage={setPage} />
          </>

          {(data?.platform ?? []).length === 0 && !loading && (
            <p className="py-6 text-center text-[0.92rem] text-muted-foreground">
              No platform hearts yet.
            </p>
          )}
        </CardContent>
      </Card>

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Member hearts</CardTitle>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              Limits on hearts members drop themselves. Prices are set on the Roses screen.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="How long a heart lasts"
              hint="In hours, from the moment it is dropped."
              value={hoursOf(settings.user_heart_ttl)}
              onCommit={(next) => patch({ user_heart_hours: next })}
              disabled={busy}
            />
            <Field
              label="How many times it can be kept alive"
              hint="After this, the heart expires whatever they pay."
              value={settings.extend_max}
              onCommit={(next) => patch({ extend_max: next })}
              disabled={busy}
            />
            <Field
              label="Lowest match score allowed"
              hint="Below this, the two never see each other's hearts."
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
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">{label}</CardTitle>
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
      <label className="text-[0.92rem] font-medium">{label}</label>
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
      <p className="text-[0.86rem] text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Postgres returns intervals as"24:00:00". Only hours matter here. */
function hoursOf(interval: string): number {
  const match = /^(\d+):/.exec(interval ??"");
  return match ? Number(match[1]) : 24;
}
