"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { adminFetch, adminTable } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { SwitchRow } from "@/components/ui/switch";
import { StatStrip } from "@/components/ui/stat-strip";
import { Section, SettingList, SettingRow } from "@/components/ui/page";
import { PagedList } from "@/components/ui/paged-list";
import { NumberField } from "@/components/roses/parts";

/**
 * Fresh Start Boost.
 *
 * A new profile is the hardest one to show: no exposure history, nobody
 * has liked it, and every signal the ranker leans on needs time to
 * exist. Left alone the newest members are the least seen, which is the
 * wrong thing to be true on somebody's first day.
 *
 * The behaviour predates this screen — it was seven days and eight
 * points, hardcoded in two functions with no name and no switch.
 * Migration 051 gave it both, and this is where it is set and watched.
 *
 * The copy here is deliberately explicit about what the boost does not
 * do, because "boost" is a word people reasonably expect to mean more
 * than it does.
 */

type Settings = {
  fresh_start_enabled: boolean;
  fresh_start_days: number;
  fresh_start_weight: number;
  fresh_start_decay: boolean;
};

type Member = {
  user_id: string;
  new_here_until: string;
  published_at: string | null;
  name: string;
  shown: number;
};

type Payload =
  | { ready: false; migration: string; detail?: string }
  | {
      ready: true;
      settings: Settings;
      stats: { boosted: number; averageShown: number; boostedShown: number };
      members: Member[];
    };

type Option = { user_id: string; name: string | null; email: string | null };

function daysLeft(until: string) {
  const ms = new Date(until).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "over";

  const hours = Math.round(ms / 3_600_000);
  return hours < 24 ? `${hours}h left` : `${Math.round(hours / 24)}d left`;
}

/** How strong the boost reads next to the signals it competes with. */
function strengthOf(weight: number) {
  if (weight === 0) return "does nothing at the moment — set it above 0";
  if (weight <= 4) return "a small nudge — how well people match still decides";
  if (weight <= 12) return "a strong nudge, which is about right";
  if (weight <= 20) return "very strong — new people will lead most lists";
  return "too strong — being new would beat everything else";
}

export function FreshStartPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [members, setMembers] = useState<Option[]>([]);
  const [chosen, setChosen] = useState("");
  const [days, setDays] = useState("7");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/fresh-start");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  const loadMembers = useCallback(async () => {
    const { data } = await adminTable<Option>("profiles", {
      select: "user_id, name, email",
      order: "created_at",
      limit: 2000,
    });

    setMembers(data ?? []);
  }, []);

  useLoadOnMount(load);
  useLoadOnMount(loadMembers);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);
      setError(null);
      setNote(null);

      const { error } = await adminFetch("/api/fresh-start", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const give = useCallback(async () => {
    setBusy(true);
    setError(null);
    setNote(null);

    const { error } = await adminFetch("/api/fresh-start", {
      method: "POST",
      body: JSON.stringify({ user_id: chosen, days: Number(days) }),
    });

    if (error) setError(error);
    else {
      setNote(
        Number(days) === 0
          ? "Their boost has been ended."
          : `Boosted for the next ${Number(days)} days.`,
      );
      await load();
    }

    setBusy(false);
  }, [chosen, days, load]);

  const options = useMemo(
    () =>
      members.map((member) => ({
        value: member.user_id,
        label: member.name || member.email || "Unnamed member",
      })),
    [members],
  );

  if (loading && !data) {
    return <p className="text-[0.92rem] text-muted-foreground">Loading…</p>;
  }

  if (data && !data.ready) {
    return (
      <Section
        title="Needs setting up"
        hint="New members are still boosted, on the old fixed settings."
      >
        <p className="text-[0.92rem] leading-relaxed">
          Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-[0.86rem]">
            {data.migration}
          </code>{" "}
          in the Supabase SQL editor, then refresh this page.
        </p>
      </Section>
    );
  }

  if (!data) {
    return error ? (
      <p className="text-[0.92rem] text-destructive">{error}</p>
    ) : null;
  }

  const { settings, stats, members: boosted } = data;

  return (
    <div className="space-y-6">
      <StatStrip
        stats={[
          { label: "Being boosted now", value: stats.boosted, icon: Sparkles },
          { label: "People each is shown to", value: stats.boostedShown },
          { label: "Everyone else", value: stats.averageShown },
        ]}
      />

      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      <Section
        title="How it works"
        hint="New members are shown earlier for their first few days."
      >
        <p className="text-[0.92rem] leading-relaxed text-muted-foreground">
          It changes the order people appear in, nothing else. Filters,
          distance and dealbreakers all still apply.
        </p>
      </Section>

      <Section
        title="Settings"
        hint="Applies to people who finish their profile from now on."
      >
        <SwitchRow
          label="Fresh Start Boost"
          hint="Off means new members compete on things they do not have yet."
          checked={settings.fresh_start_enabled}
          disabled={busy}
          onCheckedChange={(next) => patch({ fresh_start_enabled: next })}
        />

        <SettingList className="mt-2">
          <SettingRow
            label="How long it lasts"
            hint="Counted from when their profile goes live."
            control={
              <NumberField
                value={settings.fresh_start_days}
                disabled={busy || !settings.fresh_start_enabled}
                suffix="days"
                onCommit={(value) => patch({ fresh_start_days: value })}
              />
            }
          />

          <SettingRow
            label="How much it adds"
            hint={`Points on top of their ranking score. ${strengthOf(
              settings.fresh_start_weight,
            )}.`}
            control={
              <NumberField
                value={settings.fresh_start_weight}
                disabled={busy || !settings.fresh_start_enabled}
                suffix="points"
                onCommit={(value) => patch({ fresh_start_weight: value })}
              />
            }
          />
        </SettingList>

        <SwitchRow
          label="Fade out over the window"
          hint="On: fades away over the days. Off: full strength, then stops."
          checked={settings.fresh_start_decay}
          disabled={busy || !settings.fresh_start_enabled}
          onCheckedChange={(next) => patch({ fresh_start_decay: next })}
        />
      </Section>

      <Section
        title="Give a boost"
        hint="For when the app let somebody down. 0 ends a boost."
      >
        <div className="flex flex-wrap items-end gap-2">
          <Combobox
            value={chosen}
            onChange={setChosen}
            options={options}
            placeholder="Find a member…"
            emptyLabel="No member by that name"
            className="w-[20rem]"
          />

          <Input
            type="number"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            className="h-9 w-24"
          />

          <Button disabled={!chosen || busy} onClick={give}>
            Set window
          </Button>
        </div>

        {note && <p className="mt-3 text-[0.86rem] text-muted-foreground">{note}</p>}
      </Section>

      <Section
        title="Boosted right now"
        hint="If these are below everyone else, the boost is too small."
      >
        {boosted.length === 0 ? (
          <p className="py-3 text-[0.92rem] text-muted-foreground">
            Nobody is being boosted right now. Either nobody has finished
            their profile recently, or the last boost has ended.
          </p>
        ) : (
          <PagedList items={boosted} variant="settings">
            {(member) => (
              <SettingRow
                key={member.user_id}
                label={member.name}
                hint={`${daysLeft(member.new_here_until)} · shown to ${member.shown} people`}
                control={
                  <Link
                    href={`/members/${member.user_id}`}
                    className="text-[0.86rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Open
                  </Link>
                }
              />
            )}
          </PagedList>
        )}
      </Section>
    </div>
  );
}
