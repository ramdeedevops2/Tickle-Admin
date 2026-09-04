"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PagedList } from "@/components/ui/paged-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * Promo codes and referral milestones.
 *
 * A code with no usage cap is an open-ended cost and is marked as such,
 * because the person who created it will not be the one who notices.
 *
 * The referral figures are the honest check on that programme: awards
 * spread across many referrers is people inviting friends, and awards
 * concentrated in a few is somebody working out how to farm it.
 */

type PromoCode = {
  id: string;
  code: string;
  label: string;
  reward_kind: string;
  reward_value: number;
  city: string | null;
  segment: string | null;
  max_uses: number | null;
  used: number;
  ends_at: string | null;
  active: boolean;
};

type Milestone = {
  id: string;
  key: string;
  label: string;
  reward_kind: string;
  reward_value: number;
  active: boolean;
};

type City = { slug: string; name: string; live: boolean };

type Payload = {
  codes: PromoCode[];
  milestones: Milestone[];
  rewardKinds: string[];
  segments: string[];
  cities: City[];
  referral: {
    awarded: number;
    referrers: number;
    perMilestone: Record<string, number>;
  };
  totalRedemptions: number;
};

export function CodesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState("roses");
  const [value, setValue] = useState("25");
  const [maxUses, setMaxUses] = useState("100");
  const [city, setCity] = useState("");
  const [segment, setSegment] = useState("");
  const [days, setDays] = useState("30");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/promos");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const create = useCallback(async () => {
    setBusy(true);

    const { error } = await adminFetch("/api/promos", {
      method: "POST",
      body: JSON.stringify({
        code,
        label,
        reward_kind: kind,
        reward_value: Number(value),
        max_uses: maxUses ? Number(maxUses) : null,
        city: city || null,
        segment: segment || null,
        days: days ? Number(days) : null,
      }),
    });

    if (error) {
      setError(error);
    } else {
      setCode("");
      setLabel("");
      await load();
    }

    setBusy(false);
  }, [code, label, kind, value, maxUses, city, segment, days, load]);

  const toggle = useCallback(
    async (entity: string, id: string, active: boolean) => {
      setBusy(true);

      const { error } = await adminFetch("/api/promos", {
        method: "PATCH",
        body: JSON.stringify({ entity, id, active }),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const referral = data?.referral;

  /*
   * Awards per referrer. High is not automatically fraud — somebody
   * genuinely popular exists — but it is the number to look at when
   * deciding whether the caps are set right.
   */
  const perReferrer =
    referral && referral.referrers > 0
      ? (referral.awarded / referral.referrers).toFixed(1)
      : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.86rem] text-muted-foreground">
          {data?.totalRedemptions ?? 0} codes redeemed ·{" "}
          {referral?.awarded ?? 0} referral rewards across{" "}
          {referral?.referrers ?? 0} people ({perReferrer} each)
        </p>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-[0.92rem] text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New code</CardTitle>
          <p className="text-[0.92rem] text-muted-foreground">
            Leave the cap blank for unlimited — but a campaign without one has
            no ceiling on what it can cost.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="CODE"
            className="w-36 font-mono"
          />
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="What it is"
            className="min-w-[180px] flex-1"
          />
          <Select
            value={kind}
            onChange={setKind}
            options={(data?.rewardKinds ?? []).map((entry) => ({
              value: String(entry),
              label: String(entry),
            }))}
            className="w-[11rem]"
          />
          <Input
            type="number"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="value"
            className="w-24"
          />
          <Input
            type="number"
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
            placeholder="uses"
            className="w-24"
          />
          {/* Was a text field the admin had to spell to match a stored
              slug. A near miss saved happily and applied to nobody. */}
          <Select
            value={city}
            onChange={setCity}
            placeholder="Everywhere"
            options={[
              { value: "", label: "Everywhere" },
              ...(data?.cities ?? []).map((entry) => ({
                value: entry.slug,
                label: entry.name,
                hint: entry.live ? undefined : "not launched yet",
              })),
            ]}
            className="w-[11rem]"
          />
          <Select
            value={segment}
            onChange={setSegment}
            placeholder="Everyone"
            options={[
              // Empty string is the"no segment" case the native select
              // carried as a blank <option>. Kept explicit so clearing a
              // segment stays possible once it has been set.
              { value: "", label: "Everyone" },
              ...(data?.segments ?? []).map((entry) => ({
                value: String(entry),
                label: String(entry),
              })),
            ]}
            className="w-[11rem]"
          />
          <Input
            type="number"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            placeholder="days"
            className="w-20"
          />
          <Button
            disabled={busy || code.length < 3 || label.length < 3}
            onClick={create}
          >
            <Plus className="mr-1 h-4 w-4" />
            Create
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Codes</CardTitle>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Every code, how often it has been used, and whether it still works.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <PagedList
            items={data?.codes ?? []}
            perPage={15}
            className="space-y-2"
            empty={
              loading ? null : (
                <p className="py-6 text-center text-[0.92rem] text-muted-foreground">
                  No codes yet.
                </p>
              )
            }
          >
            {(promo) => (
              <div
                key={promo.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <code className="font-mono text-[0.92rem] font-bold">
                  {promo.code}
                </code>

                <div className="min-w-0 flex-1">
                  <div
                    className={
                      promo.active
                        ? "text-[0.92rem]"
                        : "text-[0.92rem] line-through opacity-50"
                    }
                  >
                    {promo.label}
                  </div>
                  <div className="text-[1rem] leading-relaxed text-muted-foreground">
                    {promo.reward_value} {promo.reward_kind}
                    {promo.city ? ` · ${promo.city}` : ""}
                    {promo.segment ? ` · ${promo.segment} only` : ""}
                  </div>
                </div>

                {promo.max_uses === null && promo.active && (
                  <Badge variant="secondary" title="No limit">
                    uncapped
                  </Badge>
                )}

                <Badge variant="outline">
                  {promo.used}
                  {promo.max_uses ? ` / ${promo.max_uses}` : ""} used
                </Badge>

                <Button
                  variant={promo.active ? "ghost" : "default"}
                  size="sm"
                  disabled={busy}
                  onClick={() => toggle("code", promo.id, !promo.active)}
                >
                  {promo.active ? "Stop" : "Start"}
                </Button>
              </div>
            )}
          </PagedList>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Referral milestones</CardTitle>
          <p className="text-[0.92rem] text-muted-foreground">
            Rewards land on activation, not on sharing. A share costs nothing to
            fake.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <PagedList
            items={data?.milestones ?? []}
            perPage={15}
            className="space-y-2"
          >
            {(milestone) => (
              <div
                key={milestone.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 flex-1">
                  <div
                    className={
                      milestone.active
                        ? "text-[0.92rem] font-medium"
                        : "text-[0.92rem] font-medium line-through opacity-50"
                    }
                  >
                    {milestone.label}
                  </div>
                  <div className="text-[1rem] leading-relaxed text-muted-foreground">
                    {milestone.reward_value} {milestone.reward_kind}
                  </div>
                </div>

                <Badge variant="outline">
                  {referral?.perMilestone[milestone.key] ?? 0} paid
                </Badge>

                <Button
                  variant={milestone.active ? "ghost" : "default"}
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    toggle("milestone", milestone.id, !milestone.active)
                  }
                >
                  {milestone.active ? "Stop" : "Start"}
                </Button>
              </div>
            )}
          </PagedList>
        </CardContent>
      </Card>
    </div>
  );
}
