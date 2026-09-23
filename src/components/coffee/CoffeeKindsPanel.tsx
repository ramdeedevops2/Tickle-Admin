"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { PageSkeleton, Section, SettingList, SettingRow } from "@/components/ui/page";
import { Check, Plus, Trash2 } from "lucide-react";

/**
 * What people can be up for on a Coffee Date.
 *
 * The post sheet in the app draws one button per active kind here, in
 * this order. Add "Gym" and it appears on every phone the next time
 * someone opens the sheet — no app update, no store review.
 *
 * The line is the important field: it is the sentence that shows on the
 * card other people see, so "Up for a workout" is what they read, not
 * the word "Gym".
 *
 * Turning one off hides it from the sheet but leaves posts that already
 * used it alone — each post keeps its own copy of the line.
 *
 * Live both ways: every save broadcasts on "coffee-config" (migration
 * 103), which open phones hear and re-read — and so does this panel, so
 * two admins editing at once see each other's changes.
 */

type Kind = {
  key: string;
  label: string;
  note: string;
  icon: string;
  sort: number;
  active: boolean;
};

type Settings = {
  durations_hours: number[];
  default_hours: number;
  reach_km: number[];
  default_reach_km: number;
};

const BLANK = { label: "", note: "", icon: "coffee" };

/*
 * The choices offered as chips. Fixed lists rather than number boxes:
 * tapping "6 hours" cannot produce a typo, and these cover every value
 * worth offering. The database accepts 1–24 hours and 1–50 km.
 */
const HOUR_CHOICES = [1, 2, 3, 4, 5, 6, 8, 12, 24];
const KM_CHOICES = [1, 2, 3, 5, 10, 15, 20, 30, 50];

/** The internal name, made from the button text so nobody has to invent one. */
const keyFrom = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "k$1")
    .slice(0, 30);

export function CoffeeKindsPanel() {
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [icons, setIcons] = useState<string[]>([]);
  const [draft, setDraft] = useState(BLANK);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = useCallback(async () => {
    const { data, error: failure } = await adminFetch<{
      kinds: Kind[];
      settings: Settings | null;
      known_icons: string[];
    }>("/api/coffee-kinds");

    if (failure) setError(failure);
    setKinds(data?.kinds ?? []);
    setSettings(data?.settings ?? null);
    setIcons(data?.known_icons ?? []);
    setLoading(false);
  }, []);

  useLoadOnMount(load);

  // Someone else saved: re-read, so this screen never shows stale options.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("coffee-config")
      .on("broadcast", { event: "changed" }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  const saveSettings = useCallback(
    async (next: Settings) => {
      setSettings(next);
      setSavingSettings(true);
      setError(null);

      const { error: failure } = await adminFetch("/api/coffee-kinds", {
        method: "PATCH",
        body: JSON.stringify({ settings: next }),
      });

      if (failure) {
        setError(failure);
        await load();
      }
      setSavingSettings(false);
    },
    [load],
  );

  const save = useCallback(
    async (key: string, patch: Partial<Kind>) => {
      setBusy(key);
      setError(null);

      const { error: failure } = await adminFetch("/api/coffee-kinds", {
        method: "PATCH",
        body: JSON.stringify({ key, ...patch }),
      });

      if (failure) setError(failure);
      else await load();

      setBusy(null);
    },
    [load],
  );

  const add = useCallback(async () => {
    setAdding(true);
    setError(null);

    const { error: failure } = await adminFetch("/api/coffee-kinds", {
      method: "POST",
      body: JSON.stringify({
        ...draft,
        key: keyFrom(draft.label),
        // New options go to the end of the row.
        sort: Math.max(0, ...kinds.map((k) => k.sort)) + 10,
      }),
    });

    if (failure) {
      setError(failure);
    } else {
      setDraft(BLANK);
      await load();
    }

    setAdding(false);
  }, [draft, kinds, load]);

  const remove = useCallback(
    async (key: string) => {
      setBusy(key);
      setError(null);

      const { error: failure } = await adminFetch(
        `/api/coffee-kinds?key=${encodeURIComponent(key)}`,
        { method: "DELETE" },
      );

      if (failure) setError(failure);
      else await load();

      setBusy(null);
    },
    [load],
  );

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-xl border border-destructive/25 bg-destructive/[0.04] px-4 py-2.5 text-[0.9rem]">
          {error}
        </p>
      )}

      {settings ? (
        <Section
          title="How long and how far"
          hint={savingSettings ? "Saving…" : "Changes reach every phone straight away."}
        >
          <SettingList>
            <SettingRow
              label="How long a post can stay up"
              hint="Tap to offer or remove a choice. The starred one is picked for people to begin with."
              control={
                <ChipPicker
                  choices={HOUR_CHOICES}
                  selected={settings.durations_hours}
                  starred={settings.default_hours}
                  unit={(n) => (n === 1 ? "1 hour" : `${n} hours`)}
                  max={6}
                  disabled={savingSettings}
                  onChange={(durations_hours, default_hours) =>
                    void saveSettings({ ...settings, durations_hours, default_hours })
                  }
                />
              }
            />
            <SettingRow
              label="How far away people can see it"
              hint="The steps on the distance slider. The starred one is where the slider starts."
              control={
                <ChipPicker
                  choices={KM_CHOICES}
                  selected={settings.reach_km}
                  starred={settings.default_reach_km}
                  unit={(n) => `${n} km`}
                  max={10}
                  disabled={savingSettings}
                  onChange={(reach_km, default_reach_km) =>
                    void saveSettings({ ...settings, reach_km, default_reach_km })
                  }
                />
              }
            />
          </SettingList>
        </Section>
      ) : (
        <p className="rounded-xl border border-foreground/[0.08] px-4 py-2.5 text-[0.9rem] text-muted-foreground">
          The time and distance settings appear here once the database update for them
          has been applied.
        </p>
      )}

      <Section
        title="Coffee Date options"
        hint="The buttons people pick from when they post. The line is what everyone else reads on the card."
      >
        <SettingList>
          {kinds.map((kind) => (
            <SettingRow
              key={kind.key}
              label={
                <span className="flex items-center gap-2">
                  {kind.label}
                  {!kind.active && <Badge variant="secondary">Hidden</Badge>}
                </span>
              }
              hint={`Shows as "${kind.note}"`}
              control={
                <>
                  <Input
                    defaultValue={kind.note}
                    aria-label={`What ${kind.label} shows as`}
                    className="w-56"
                    disabled={busy === kind.key}
                    onBlur={(e) => {
                      const note = e.target.value.trim();
                      if (note && note !== kind.note) void save(kind.key, { note });
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy === kind.key}
                    onClick={() => void save(kind.key, { active: !kind.active })}
                  >
                    {kind.active ? "Hide" : "Show"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove ${kind.label}`}
                    disabled={busy === kind.key}
                    onClick={() => void remove(kind.key)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              }
            />
          ))}
        </SettingList>
      </Section>

      <Section
        title="Add an option"
        hint="It appears at the end of the row, on every phone, straight away."
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Button"
            value={draft.label}
            placeholder="Gym"
            onChange={(label) => setDraft((d) => ({ ...d, label }))}
          />
          <Field
            label="Shows as"
            value={draft.note}
            placeholder="Up for a workout"
            wide
            onChange={(note) => setDraft((d) => ({ ...d, note }))}
          />

          <label className="space-y-1.5">
            <span className="block text-[0.86rem] text-muted-foreground">Picture</span>
            <select
              value={draft.icon}
              onChange={(e) => setDraft((d) => ({ ...d, icon: e.target.value }))}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-[0.9rem] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {icons.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <Button
            disabled={adding || !keyFrom(draft.label) || !draft.note.trim()}
            onClick={() => void add()}
          >
            <Plus className="size-4" />
            Add
          </Button>
        </div>

        <p className="mt-3 text-[0.86rem] text-muted-foreground">
          Pictures are drawn into the app, so only the ones listed can be used. Pick the
          closest one — anything unrecognised shows a coffee cup.
        </p>
      </Section>
    </div>
  );
}

/** A labelled text box, with the outline the panel keeps on every input. */
function Field({
  label,
  value,
  placeholder,
  wide,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  wide?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-[0.86rem] text-muted-foreground">{label}</span>
      <Input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={wide ? "w-64" : "w-40"}
      />
    </label>
  );
}

/*
 * A row of choices where tapping one turns it on or off, and tapping the
 * star on a chosen one makes it the starting choice.
 *
 * The last chosen one cannot be turned off, and turning off the starred
 * one moves the star to the nearest remaining choice — so the pair the
 * database insists on (at least one, and the starred one among them)
 * can never be broken from here.
 */
function ChipPicker({
  choices,
  selected,
  starred,
  unit,
  max,
  disabled,
  onChange,
}: {
  choices: number[];
  selected: number[];
  starred: number;
  unit: (n: number) => string;
  max: number;
  disabled: boolean;
  onChange: (selected: number[], starred: number) => void;
}) {
  // Keep any value set outside this list visible, so it can be turned off.
  const all = [...new Set([...choices, ...selected])].sort((a, b) => a - b);

  const toggle = (n: number) => {
    const on = selected.includes(n);
    if (on && selected.length === 1) return;
    if (!on && selected.length >= max) return;

    const next = on ? selected.filter((v) => v !== n) : [...selected, n].sort((a, b) => a - b);
    const nextStar = next.includes(starred)
      ? starred
      : next.reduce((best, v) => (Math.abs(v - starred) < Math.abs(best - starred) ? v : best));
    onChange(next, nextStar);
  };

  return (
    <div className="flex max-w-md flex-wrap gap-2">
      {all.map((n) => {
        const on = selected.includes(n);
        const star = n === starred;
        return (
          <span
            key={n}
            className={
              "inline-flex items-center overflow-hidden rounded-full border text-[0.86rem] " +
              (on
                ? "border-primary/50 bg-primary/[0.08] text-foreground"
                : "border-foreground/[0.15] text-muted-foreground")
            }
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => toggle(n)}
              className="inline-flex items-center gap-1 px-3 py-1 disabled:opacity-60"
              aria-pressed={on}
            >
              {on && <Check className="size-3.5" />}
              {unit(n)}
            </button>
            {on && (
              <button
                type="button"
                disabled={disabled || star}
                onClick={() => onChange(selected, n)}
                className={
                  "border-l border-primary/30 px-2 py-1 " +
                  (star ? "text-primary" : "text-muted-foreground hover:text-foreground")
                }
                aria-label={star ? `${unit(n)} is the starting choice` : `Start on ${unit(n)}`}
                title={star ? "Starting choice" : "Make this the starting choice"}
              >
                {star ? "\u2605" : "\u2606"}
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
