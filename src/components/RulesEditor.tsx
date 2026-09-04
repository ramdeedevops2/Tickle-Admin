"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * The rules that were only ever reachable by writing SQL.
 *
 * These all lived in fairness_settings — a table named for discovery
 * fairness that had quietly become the home for match expiry, revival
 * pricing, the media revenue split, retention defaults and the deletion
 * grace period. Every one is a real value the app reads; none of them
 * had a screen.
 *
 * Grouped by what they do rather than by the table they sit in, and
 * labelled in the words somebody would use to ask the question — an
 * admin looking for"how long before a match expires" was never going
 * to open something called fairness_settings.
 */

// default_retention is a key ("24h", "once"); everything else is a number.
type Settings = Record<string, number | boolean | string>;

type Field = {
  key: string;
  label: string;
  hint: string;
  unit: string;
  /** Decimal input rather than whole numbers. */
  fraction?: boolean;
};

type Section = {
  title: string;
  blurb: string;
  fields: Field[];
  /** Renders the default-retention picker alongside the number fields. */
  retention?: boolean;
};

type RetentionOption = { key: string; label: string };

const SECTIONS: Section[] = [
  {
    title: "Matches",
    blurb: "How long two people have before a match lapses, and when they are reminded.",
    fields: [
      {
        key: "match_ttl",
        label: "Match lifetime",
        hint: "From the moment it is made until it expires unopened.",
        unit: "hours",
      },
      {
        key: "match_remind_1",
        label: "First reminder",
        hint: "Hours before expiry that the first nudge goes out.",
        unit: "hours",
      },
      {
        key: "match_remind_2",
        label: "Final reminder",
        hint: "The last nudge. Keep it well under the first.",
        unit: "hours",
      },
    ],
  },
  {
    title: "Revival",
    blurb: "Bringing an expired match back. The cost climbs each time the same pair is revived.",
    fields: [
      {
        key: "revival_cost",
        label: "First revival",
        hint: "Hearts charged the first time a pair is brought back.",
        unit: "hearts",
      },
      {
        key: "revival_step",
        label: "Each time after",
        hint: "Added to the cost on every subsequent revival of the same pair.",
        unit: "hearts",
      },
      {
        key: "revival_max",
        label: "Maximum revivals",
        hint: "After this many, the option stops being offered.",
        unit: "times",
      },
      {
        key: "revival_request_ttl",
        label: "Time to answer",
        hint: "How long the other person has before the request lapses and Hearts are refunded.",
        unit: "hours",
      },
    ],
  },
  {
    title: "Verification",
    blurb: "The selfie check. Scores are out of 100.",
    fields: [
      {
        key: "face_approve_at",
        label: "Approve at",
        hint: "At or above this score, verification passes automatically.",
        unit: "score",
      },
      {
        key: "face_reject_at",
        label: "Reject below",
        hint: "Below this, it fails. Anything between the two goes to a human.",
        unit: "score",
      },
      {
        key: "face_checks_per_hour",
        label: "Attempts per hour",
        hint: "How many times one person may try before being made to wait.",
        unit: "tries",
      },
    ],
  },
  {
    title: "Paid media",
    blurb: "What a sender may charge to let a photo be saved, and what they keep.",
    fields: [
      {
        key: "save_price_min",
        label: "Lowest price",
        hint: "The least a sender may charge.",
        unit: "hearts",
      },
      {
        key: "save_price_max",
        label: "Highest price",
        hint: "The most a sender may charge.",
        unit: "hearts",
      },
      {
        key: "save_sender_share",
        label: "Sender keeps",
        hint: "Their share of the sale. The rest goes to the platform.",
        unit: "%",
      },
    ],
  },
  {
    title: "Messaging",
    blurb: "Limits inside a conversation, and how long messages last by default.",
    retention: true,
    fields: [
      {
        key: "edit_window",
        label: "Edit window",
        hint: "How long after sending a message can still be edited. Editing never extends expiry.",
        unit: "minutes",
      },
      {
        key: "voice_max_seconds",
        label: "Voice note length",
        hint: "The longest a single voice note may run.",
        unit: "seconds",
      },
    ],
  },
  {
    title: "Referrals",
    blurb: "Caps on what one person can earn from inviting others.",
    fields: [
      {
        key: "referral_daily_cap",
        label: "Per day",
        hint: "Most referrals one person can be paid for in a day.",
        unit: "referrals",
      },
      {
        key: "referral_total_cap",
        label: "In total",
        hint: "Lifetime cap for one account.",
        unit: "referrals",
      },
    ],
  },
  {
    title: "Going quiet",
    blurb: "When somebody counts as inactive, and how much that costs them in the deck.",
    fields: [
      {
        key: "inactive_after",
        label: "Inactive after",
        hint: "No activity for this long and they start ranking lower.",
        unit: "days",
      },
      {
        key: "dormant_after",
        label: "Dormant after",
        hint: "Beyond this they leave the deck entirely until they return.",
        unit: "days",
      },
      {
        key: "inactive_penalty",
        label: "Ranking penalty",
        hint: "Multiplier applied while inactive. 0.4 means they rank at 40% of normal.",
        unit: "×",
        fraction: true,
      },
    ],
  },
  {
    title: "Safety and leaving",
    blurb: "Windows that protect people after something has already happened.",
    fields: [
      {
        key: "report_window",
        label: "Can still report",
        hint: "How long after an unmatch somebody can still report the other person.",
        unit: "days",
      },
      {
        key: "delete_grace",
        label: "Deletion grace",
        hint: "The window to sign in and stop a deletion. The profile is hidden immediately either way.",
        unit: "days",
      },
    ],
  },
];

export function RulesEditor() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [options, setOptions] = useState<RetentionOption[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<{
      settings: Settings;
      retention_options: RetentionOption[];
    }>("/api/fairness");

    if (error) setError(error);
    else if (data?.settings) {
      setSettings(data.settings);
      setOptions(data.retention_options ?? []);
      setDraft(
        Object.fromEntries(
          Object.entries(data.settings).map(([k, v]) => [k, String(v)]),
        ),
      );
    }
  }, []);

  useLoadOnMount(load);

  const save = useCallback(
    async (section: Section) => {
      setSaving(true);
      setError(null);
      setSaved(null);

      const body: Record<string, number | string> = {};
      for (const field of section.fields) {
        const value = Number(draft[field.key]);
        if (Number.isFinite(value)) body[field.key] = value;
      }

      // A key, not a number — validated server-side against the
      // options table rather than trusted from here.
      if (section.retention && draft.default_retention) {
        body.default_retention = draft.default_retention;
      }

      const { error } = await adminFetch("/api/fairness", {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (error) setError(error);
      else {
        setSaved(section.title);
        await load();
      }

      setSaving(false);
    },
    [draft, load],
  );

  if (!settings) {
    return (
      <p className="text-[0.92rem] text-muted-foreground">{error ??"Loading rules…"}</p>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-[1.6rem] font-medium tracking-tight">Rules</h2>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          The values the app actually reads. Changing one here changes what
          every phone does the next time it asks — there is no deploy.
        </p>
      </div>

      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      {SECTIONS.map((section) => {
        const dirty =
          section.fields.some((f) => String(settings[f.key]) !== draft[f.key]) ||
          (section.retention === true &&
            String(settings.default_retention) !== draft.default_retention);

        return (
          <section key={section.title} className="border border-foreground/[0.06] p-6">
            <div className="mb-5">
              <h3 className="text-[0.92rem] font-bold">
                {section.title}
              </h3>
              <p className="mt-1 text-[0.92rem] text-muted-foreground">{section.blurb}</p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {section.fields.map((field) => (
                <label key={field.key} className="group flex flex-col gap-2">
                  <span className="text-[0.8rem] font-bold text-muted-foreground transition-colors group-focus-within:text-foreground">
                    {field.label}
                  </span>

                  <div className="flex items-baseline gap-2">
                    <Input
                      type="number"
                      step={field.fraction ? "0.05" :"1"}
                      value={draft[field.key] ??""}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      className="font-mono tabular-nums"
                    />
                    <span className="shrink-0 text-[0.86rem] text-muted-foreground">
                      {field.unit}
                    </span>
                  </div>

                  <span className="text-[0.86rem] leading-snug text-muted-foreground">
                    {field.hint}
                  </span>
                </label>
              ))}
              {section.retention && (
                <label className="group flex flex-col gap-2">
                  <span className="text-[0.8rem] font-bold text-muted-foreground transition-colors group-focus-within:text-foreground">
                    Messages disappear after
                  </span>

                  <Select
                    value={draft.default_retention ??""}
                    onChange={(next) =>
                      setDraft((current) => ({
                        ...current,
                        default_retention: next,
                      }))
                    }
                    options={options.map((option) => ({
                      value: option.key,
                      label: option.label,
                    }))}
                  />

                  <span className="text-[0.86rem] leading-snug text-muted-foreground">
                    What a new conversation uses when nobody has chosen. People
                    can still pick a different mode per message.
                  </span>
                </label>
              )}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={() => save(section)}
                disabled={saving || !dirty}
                className="text-[0.8rem]"
              >
                Save {section.title}
              </Button>

              {saved === section.title && !dirty && (
                <span className="text-[1rem] leading-relaxed text-muted-foreground">Saved.</span>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
