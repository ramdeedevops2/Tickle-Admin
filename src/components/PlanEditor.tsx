"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Free and Premium limits.
 *
 * Lives on the Config page because it is the same kind of thing as the heart
 * radius — a number that changes without a deploy.
 *
 * There is no field here that touches compatibility, and that is deliberate
 * rather than an oversight: premium buys visibility_multiplier and nothing
 * else. If money could move the percentage on a card, the number would stop
 * meaning what the label says it means.
 */

type Plan = {
  key: "free" | "premium";
  label: string;
  daily_interactions: number | null;
  daily_comments: number;
  daily_super_likes: number;
  visibility_multiplier: number;
  sees_who_liked: boolean;
};

type Payload = {
  plans: Plan[];
  activePremium: number;
  lapsedPremium: number;
};

const FIELDS: {
  field: keyof Plan;
  label: string;
  hint: string;
  anchor: string;
}[] = [
  {
    field: "daily_interactions",
    label: "Interactions a day",
    hint: "Likes and comments share this. Blank means unlimited.",
    anchor: "daily-interactions",
  },
  {
    field: "daily_comments",
    label: "Comments a day",
    hint: "Counts against the interaction budget too.",
    anchor: "daily-comments",
  },
  {
    field: "daily_super_likes",
    label: "Super Likes a day",
    hint: "Its own budget — spending one does not cost a like.",
    anchor: "daily-super-likes",
  },
  {
    field: "visibility_multiplier",
    label: "Visibility multiplier",
    hint: "Multiplies position in other people's decks. Never the compatibility score.",
    anchor: "visibility-multiplier",
  },
];

export function PlanEditor() {
  const [data, setData] = useState<Payload | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Payload>("/api/plans");

    if (error || !data) {
      setError(error ?? "Failed to load plans.");
      return;
    }

    setData(data);
    setDraft(
      Object.fromEntries(
        data.plans.flatMap((plan) =>
          FIELDS.map((f) => [
            `${plan.key}.${f.field}`,
            plan[f.field] === null ? "" : String(plan[f.field]),
          ]),
        ),
      ),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (plan: Plan) => {
      setSaving(plan.key);
      setError(null);

      const body: Record<string, unknown> = { key: plan.key };

      for (const f of FIELDS) {
        const raw = draft[`${plan.key}.${f.field}`];

        // Blank means unlimited, and only for the shared budget. Sending
        // Number("") would be 0, which is a very different plan.
        if (f.field === "daily_interactions") {
          body[f.field] = raw.trim() === "" ? null : Number(raw);
          continue;
        }

        body[f.field] = Number(raw);
      }

      const { error } = await adminFetch("/api/plans", {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (error) setError(error);
      else await load();

      setSaving(null);
    },
    [draft, load],
  );

  if (!data) return null;

  return (
    <div className="space-y-6">
      <h2 className="border-b border-border/50 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
        Plans
      </h2>

      <p className="text-xs text-muted-foreground">
        {data.activePremium} active premium
        {data.lapsedPremium > 0 && `, ${data.lapsedPremium} lapsed`}
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="grid gap-10 lg:grid-cols-2">
        {data.plans.map((plan) => (
          <div key={plan.key} className="space-y-6" id={`plan-${plan.key}`}>
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-bold uppercase tracking-[0.2em]">{plan.label}</h3>
              <Button
                variant="outline"
                onClick={() => save(plan)}
                disabled={saving === plan.key}
                className="h-9 rounded-none border-border/50 text-[10px] uppercase tracking-[0.2em]"
              >
                {saving === plan.key ? "Saving" : "Save"}
              </Button>
            </div>

            {FIELDS.map((f) => (
              <div key={f.field} id={`${plan.key}-${f.anchor}`} className="group space-y-2 scroll-mt-24">
                <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground transition-colors group-focus-within:text-foreground">
                  {f.label}
                </label>

                <Input
                  value={draft[`${plan.key}.${f.field}`] ?? ""}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      [`${plan.key}.${f.field}`]: event.target.value,
                    }))
                  }
                  placeholder={f.field === "daily_interactions" ? "Unlimited" : ""}
                  className="h-12 rounded-none border-0 border-b border-border/50 bg-transparent px-0 font-mono text-lg focus-visible:border-foreground focus-visible:ring-0"
                />

                <p className="text-xs text-muted-foreground">{f.hint}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
