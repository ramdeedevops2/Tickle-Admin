"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Pass cooldowns and exposure caps.
 *
 * The defaults are guesses. The right cooldown for a city of two thousand
 * is not the right one for a city of two hundred thousand, so these are
 * editable and the statistics beside them are how you tell whether the
 * current guess is working.
 */

type Settings = {
  pass_cooldown_1: number;
  pass_cooldown_2: number;
  pass_cooldown_3: number;
  pass_permanent_after: number;
  daily_exposure_cap: number;
  reshow_gap: number;
  second_chance_on_change: boolean;
  second_chance_delta: number;
};

type Stats = {
  passes: number;
  permanent: number;
  active: number;
  repeat: number;
  profilesShown: number;
  atCapToday: number;
  topTenthShare: number;
  medianExposure: number;
};

type Payload = { settings: Settings; stats: Stats };

const FIELDS: {
  key: keyof Omit<Settings, "second_chance_on_change">;
  label: string;
  hint: string;
  unit: string;
  anchor: string;
}[] = [
  {
    key: "pass_cooldown_1",
    label: "First pass",
    hint: "How long before someone passed once can appear again.",
    unit: "days",
    anchor: "pass-cooldown-1",
  },
  {
    key: "pass_cooldown_2",
    label: "Second pass",
    hint: "Passing the same person twice means more than passing once.",
    unit: "days",
    anchor: "pass-cooldown-2",
  },
  {
    key: "pass_cooldown_3",
    label: "Third and beyond",
    hint: "The longest rung on the ladder.",
    unit: "days",
    anchor: "pass-cooldown-3",
  },
  {
    key: "pass_permanent_after",
    label: "Permanent after",
    hint: "This many passes and the answer is taken as final.",
    unit: "passes",
    anchor: "pass-permanent",
  },
  {
    key: "daily_exposure_cap",
    label: "Daily exposure cap",
    hint: "How many decks one profile may appear in per day, however well it ranks.",
    unit: "decks",
    anchor: "exposure-cap",
  },
  {
    key: "reshow_gap",
    label: "Re-show gap",
    hint: "A profile shown and not acted on waits this long before appearing again.",
    unit: "hours",
    anchor: "reshow-gap",
  },
  {
    key: "second_chance_delta",
    label: "Second-chance threshold",
    hint: "Strength points a passed profile must gain to skip its cooldown.",
    unit: "points",
    anchor: "second-chance",
  },
];

export function FairnessEditor() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Payload>("/api/fairness");

    if (error || !data) {
      setError(error ?? "Failed to load fairness settings.");
      return;
    }

    setData(data);
    setDraft(
      Object.fromEntries(FIELDS.map((f) => [f.key, String(data.settings[f.key])])),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = Object.fromEntries(
      FIELDS.map((f) => [f.key, Number(draft[f.key])]),
    );

    const { error } = await adminFetch("/api/fairness", {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (error) setError(error);
    else await load();

    setSaving(false);
  }, [draft, load]);

  if (!data) return null;

  const { stats } = data;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between border-b border-border/50 pb-2">
        <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Fairness &amp; Cooldowns
        </h2>
        <Button
          variant="outline"
          onClick={save}
          disabled={saving}
          className="h-9 rounded-none border-border/50 text-[10px] uppercase tracking-[0.2em]"
        >
          {saving ? "Saving" : "Save"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* The numbers that say whether the settings above are working.
          topTenthShare is the important one: if the top tenth of profiles
          absorb most of the exposure, fairness is losing. */}
      <div className="grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="Active cooldowns" value={stats.active.toLocaleString()} />
        <Fact
          label="Passed more than once"
          value={`${stats.repeat.toLocaleString()} of ${stats.passes.toLocaleString()}`}
        />
        <Fact label="Permanent passes" value={stats.permanent.toLocaleString()} />
        <Fact
          label="Top 10% share of exposure"
          value={`${stats.topTenthShare}%`}
          warn={stats.topTenthShare > 35}
          note={stats.topTenthShare > 35 ? "Attention is pooling" : undefined}
        />
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} id={f.anchor} className="group space-y-2 scroll-mt-24">
            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors group-focus-within:text-foreground">
              {f.label}
              <span className="ml-2 font-normal normal-case tracking-normal opacity-60">
                {f.unit}
              </span>
            </label>

            <Input
              value={draft[f.key] ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, [f.key]: event.target.value }))
              }
              className="h-12 rounded-none border-0 border-b border-border/50 bg-transparent px-0 font-mono text-lg focus-visible:border-foreground focus-visible:ring-0"
            />

            <p className="text-xs text-muted-foreground">{f.hint}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className={`text-xl font-black tracking-tight ${warn ? "text-destructive" : ""}`}>
        {value}
      </div>
      <div className="text-muted-foreground">{label}</div>
      {note && <div className="text-[11px] text-destructive">{note}</div>}
    </div>
  );
}
