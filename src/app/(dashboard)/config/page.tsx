"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/adminFetch";
import { PlanEditor } from "@/components/PlanEditor";
import { FairnessEditor } from "@/components/FairnessEditor";

/**
 * The live tuning knobs for the hearts feature.
 *
 * These are the real heart_settings row, not a mock-up — changing the radius
 * here changes what the gate accepts on every phone the next time it asks.
 * Nothing has an UPDATE policy on the table, so every write goes through
 * /api/settings with the service role behind an admin check.
 *
 * The command palette deep-links into each control by id (/config#heart-radius
 * and friends), which is why every field carries one.
 */

type Settings = {
  action_radius_m: number;
  max_accuracy_m: number;
  discovery_radius_m: number;
  max_hearts_per_day: number;
  heart_ttl_hours: number;
  spark_ttl_days: number;
  place_cache_ttl_days: number;
  blocked_categories: string[];
};

const FIELDS: {
  key: keyof Omit<Settings, "blocked_categories">;
  anchor: string;
  label: string;
  hint: string;
  unit: string;
  section: string;
}[] = [
  {
    key: "action_radius_m",
    anchor: "heart-radius",
    label: "Heart Radius",
    hint: "How close someone must be to drop or pick up a heart.",
    unit: "metres",
    section: "The Gate",
  },
  {
    key: "max_accuracy_m",
    anchor: "max-accuracy",
    label: "Worst Usable Fix",
    hint: "A GPS reading vaguer than this is refused as a weak signal rather than judged too far.",
    unit: "metres",
    section: "The Gate",
  },
  {
    key: "discovery_radius_m",
    anchor: "discovery-radius",
    label: "Discovery Radius",
    hint: "How far away venues appear on the map.",
    unit: "metres",
    section: "The Gate",
  },
  {
    key: "heart_ttl_hours",
    anchor: "heart-ttl",
    label: "Heart Lifetime",
    hint: "How long a heart stays before it expires unclaimed.",
    unit: "hours",
    section: "Lifetimes",
  },
  {
    key: "spark_ttl_days",
    anchor: "spark-ttl",
    label: "Spark Lifetime",
    hint: "How long a spark stays in the Sparks tab before it disappears.",
    unit: "days",
    section: "Lifetimes",
  },
  {
    key: "place_cache_ttl_days",
    anchor: "place-cache-ttl",
    label: "Venue Cache Life",
    hint: "How long a cached Google venue is trusted before it is fetched again.",
    unit: "days",
    section: "Lifetimes",
  },
  {
    key: "max_hearts_per_day",
    anchor: "daily-limit",
    label: "Hearts Per Day",
    hint: "How many one person may drop in twenty-four hours.",
    unit: "per person",
    section: "Limits",
  },
];

const SECTIONS = ["The Gate", "Lifetimes", "Limits"];

export default function ConfigPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ settings: Settings }>("/api/settings");

    if (error || !data) {
      setError(error ?? "Failed to load settings.");
      setLoading(false);
      return;
    }

    setSettings(data.settings);
    setDraft(
      Object.fromEntries(
        FIELDS.map((field) => [field.key, String(data.settings[field.key] ?? "")]),
      ),
    );
    setCategories((data.settings.blocked_categories ?? []).join(", "));
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const dirty =
    settings !== null &&
    (FIELDS.some((field) => draft[field.key] !== String(settings[field.key])) ||
      categories !== settings.blocked_categories.join(", "));

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    const body: Record<string, unknown> = Object.fromEntries(
      FIELDS.map((field) => [field.key, Number(draft[field.key])]),
    );
    body.blocked_categories = categories
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const { error } = await adminFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (error) {
      setError(error);
    } else {
      setSaved(true);
      await load();
    }

    setSaving(false);
  }, [draft, categories, load]);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter">Config</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Live heart settings
          </p>
        </div>
        <Button
          onClick={save}
          disabled={!dirty || saving || loading}
          className="h-12 rounded-none bg-foreground px-8 text-xs font-bold uppercase tracking-[0.2em] text-background transition-colors hover:bg-muted-foreground disabled:opacity-40"
        >
          {saving ? "Saving" : dirty ? "Save Changes" : "Saved"}
        </Button>
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {saved && !dirty && !error && (
        <div className="border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-600">
          Saved. Every phone picks this up on its next request.
        </div>
      )}

      {loading ? (
        <div className="py-24 text-center text-muted-foreground">Loading settings...</div>
      ) : (
        <div className="space-y-12">
          {SECTIONS.map((section) => (
            <div key={section} className="space-y-6">
              <h2 className="border-b border-border/50 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {section}
              </h2>

              <div className="grid gap-8 md:grid-cols-2">
                {FIELDS.filter((field) => field.section === section).map((field) => (
                  <SettingField
                    key={field.key}
                    anchor={field.anchor}
                    label={field.label}
                    hint={field.hint}
                    unit={field.unit}
                    value={draft[field.key] ?? ""}
                    onChange={(value) => setDraft((prev) => ({ ...prev, [field.key]: value }))}
                  />
                ))}
              </div>
            </div>
          ))}

          <PlanEditor />

          <FairnessEditor />

          <div className="space-y-6">
            <h2 className="border-b border-border/50 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Blocked Venue Types
            </h2>

            <SettingField
              anchor="blocked-categories"
              label="Never Allow Hearts At"
              hint="Google place types, comma separated. Hospitals, schools and places of worship are blocked by default."
              unit="place types"
              value={categories}
              onChange={setCategories}
              wide
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SettingField({
  anchor,
  label,
  hint,
  unit,
  value,
  onChange,
  wide,
}: {
  anchor: string;
  label: string;
  hint: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [flash, setFlash] = useState(false);

  /*
   * The palette links here as /config#heart-radius, and the browser resolves
   * that hash long before this page has fetched anything — so by the time the
   * field exists there is nothing left to scroll to. Scrolling once on mount
   * puts it right, and the brief highlight answers the question the admin
   * actually arrived with: which of these seven boxes did I ask for.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash.slice(1) !== anchor) return;

    ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlash(true);

    const timer = setTimeout(() => setFlash(false), 2000);
    return () => clearTimeout(timer);
  }, [anchor]);

  return (
    <div
      ref={ref}
      id={anchor}
      className={`group space-y-3 scroll-mt-24 transition-colors ${
        wide ? "md:col-span-2" : ""
      } ${flash ? "-mx-4 bg-foreground/5 px-4 py-3" : ""}`}
    >
      <label
        htmlFor={`field-${anchor}`}
        className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors group-focus-within:text-foreground"
      >
        {label}
        <span className="ml-2 font-normal normal-case tracking-normal opacity-60">{unit}</span>
      </label>

      <Input
        id={`field-${anchor}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 rounded-none border-0 border-b border-border/50 bg-transparent px-0 font-mono text-xl transition-all focus-visible:border-foreground focus-visible:ring-0"
      />

      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
