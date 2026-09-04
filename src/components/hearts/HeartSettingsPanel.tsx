"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import {
  PageSkeleton,
  Section,
  SettingList,
  SettingRow,
} from "@/components/ui/page";

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

/** What each group decides, in words rather than field names. */
const SECTION_COPY: Record<string, { title: string; hint: string }> = {"The Gate": {
    title: "How close somebody has to be",
    hint: "Distances the app checks before it will let anyone drop or pick up a heart. Widen these and hearts start reaching people who are not really there.",
  },
  Lifetimes: {
    title: "How long things last",
    hint: "Hearts and sparks disappear on their own. Short enough to feel of-the-moment, long enough that people see them.",
  },
  Limits: {
    title: "How much one person can do",
    hint: "The daily ceiling on dropping hearts, which is what stops one person filling a neighbourhood.",
  },
};

export function HeartSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ settings: Settings }>("/api/settings");

    if (error || !data) {
      setError(error ??"Failed to load settings.");
      setLoading(false);
      return;
    }

    setSettings(data.settings);
    setDraft(
      Object.fromEntries(
        FIELDS.map((field) => [field.key, String(data.settings[field.key] ??"")]),
      ),
    );
    setCategories((data.settings.blocked_categories ?? []).join(", "));
    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const dirty =
    settings !== null &&
    (FIELDS.some((field) => draft[field.key] !== String(settings[field.key])) ||
      categories !== settings.blocked_categories.join(", "));

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);

    const body: Record<string, unknown> = Object.fromEntries(
      FIELDS.map((field) => [field.key, Number(draft[field.key])]),
    );
    body.blocked_categories = categories
      .split(", ")
      .map((entry) => entry.trim())
      .filter(Boolean);

    const { error } = await adminFetch("/api/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    });

    if (error) {
      setError(error);
    } else {
      await load();
    }

    setSaving(false);
  }, [draft, categories, load]);

  return (
    <div className="space-y-4">
      {/* The save button is the panel's own, since the tab around it
          knows nothing about whether these fields are dirty. */}
      <div className="flex items-center justify-end">
        <Button onClick={save} disabled={!dirty || saving || loading}>
          {saving ? "Saving…" : dirty ? "Save changes" :"Saved"}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <PageSkeleton sections={3} />
      ) : (
        <>
          {SECTIONS.map((section) => (
            <Section
              key={section}
              title={SECTION_COPY[section].title}
              hint={SECTION_COPY[section].hint}
            >
              <SettingList>
                {FIELDS.filter((field) => field.section === section).map((field) => (
                  <SettingRow
                    key={field.key}
                    id={field.anchor}
                    label={field.label}
                    hint={field.hint}
                    control={
                      <>
                        <Input
                          type="number"
                          value={draft[field.key] ??""}
                          onChange={(event) =>
                            setDraft((prev) => ({ ...prev, [field.key]: event.target.value }))
                          }
                          className="w-24 text-right tnum"
                        />
                        <span className="w-20 text-[0.86rem] text-muted-foreground">
                          {field.unit}
                        </span>
                      </>
                    }
                  />
                ))}
              </SettingList>
            </Section>
          ))}

          <Section
            title="Blocked places"
            hint="Hospitals, schools and places of worship are already blocked."
          >
            <Input
              id="blocked-categories"
              value={categories}
              onChange={(event) => setCategories(event.target.value)}
              placeholder="hospital, school, place_of_worship"
              className="w-full"
            />
          </Section>
        </>
      )}
    </div>
  );
}
