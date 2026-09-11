"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm";
import { Pencil, Plus, Trash2 } from "lucide-react";

/**
 * One promo code, and everything it pays.
 *
 * A code used to carry a single reward in two columns, chosen from five
 * options — and three of those five credited nothing. Redeeming one
 * recorded the use, told the person they had been given something, and
 * did not give it. Nobody goes looking for a bug that reports success.
 *
 * 079 replaced that with a list of rewards, in the same shape invites
 * use, and every kind in it actually credits: roses, a named plan, a
 * boost, private mode. Two reward systems that behave differently is
 * how somebody learns one and is wrong about the other.
 */

export type PromoCode = {
  id: string;
  code: string;
  label: string;
  city: string | null;
  segment: string | null;
  max_uses: number | null;
  used: number;
  once_per_user: boolean;
  ends_at: string | null;
  active: boolean;
};

export type PromoReward = {
  id: string;
  promo_id: string;
  kind: "roses" | "plan" | "boost" | "incognito";
  amount: number | null;
  plan_key: string | null;
  reward_days: number | null;
  sort_order: number;
  active: boolean;
};

export type RewardPlan = {
  key: string;
  label: string;
  days: number | null;
  active: boolean;
};

/**
 * What each reward is, and what it actually does.
 *
 * The hint is not decoration: three of the old options did nothing, and
 * the only way to know was to read the crediting function. Every kind
 * here says plainly what a member ends up with.
 */
const KINDS: { value: PromoReward["kind"]; label: string; hint: string }[] = [
  {
    value: "roses",
    label: "Roses",
    hint: "Added to their wallet straight away. They can spend them on Super Likes.",
  },
  {
    value: "plan",
    label: "A plan",
    hint: "Everything that plan includes, for its length, then it ends. Adds on to any time they already have.",
  },
  {
    value: "boost",
    label: "Boost",
    hint: "Higher up in other people's decks for a few days. Stacks with any boost they already have.",
  },
  {
    value: "incognito",
    label: "Private mode",
    hint: "Hidden from everyone for a few days. They can still look and still like.",
  },
];

const BLANK = { kind: "roses", amount: "25", plan_key: "", reward_days: "7" };

type Draft = typeof BLANK;

export function rewardText(reward: PromoReward, plans: RewardPlan[]): string {
  if (reward.kind === "roses") return `${reward.amount} roses`;

  if (reward.kind === "plan") {
    const plan = plans.find((row) => row.key === reward.plan_key);
    const days = reward.reward_days ?? plan?.days ?? null;
    return `${plan?.label ?? reward.plan_key}${days ? ` for ${days} days` : ""}`;
  }

  return `${reward.kind === "boost" ? "A boost" : "Private mode"} for ${reward.reward_days} days`;
}

const AUDIENCE: Record<string, string> = {
  new: "new members",
  premium: "members on a plan",
  free: "members not on a plan",
  lapsed: "members whose plan ran out",
};

export function CodeRow({
  promo,
  rewards,
  plans,
  busy,
  onToggle,
  onChanged,
}: {
  promo: PromoCode;
  rewards: PromoReward[];
  plans: RewardPlan[];
  busy: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();

  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const send = async (init: RequestInit, url = "/api/promo-rewards") => {
    setWorking(true);
    setError(null);
    const { error } = await adminFetch(url, init);
    if (error) setError(error);
    else await onChanged();
    setWorking(false);
    return !error;
  };

  const add = async () => {
    const ok = await send({
      method: "POST",
      body: JSON.stringify({ promo_id: promo.id, ...draft }),
    });

    if (ok) {
      setAdding(false);
      setDraft(BLANK);
    }
  };

  const removeReward = async (reward: PromoReward) => {
    const yes = await confirm({
      title: "Remove this reward?",
      body: `${rewardText(reward, plans)} — anybody redeeming from now on will not get it. People who already redeemed keep what they got.`,
      confirmLabel: "Remove it",
      tone: "danger",
    });

    if (!yes) return;
    await send({ method: "DELETE" }, `/api/promo-rewards?id=${encodeURIComponent(reward.id)}`);
  };

  const removeCode = async () => {
    const used = promo.used > 0;

    const yes = await confirm({
      title: used ? `Delete ${promo.code}?` : `Delete ${promo.code}?`,
      body: used
        ? `${promo.used} ${promo.used === 1 ? "person has" : "people have"} used this. Deleting it removes the record of that too. Stopping it instead keeps the history and lets nobody new redeem.`
        : "Nobody has used it, so it goes for good.",
      confirmLabel: "Delete it",
      tone: "danger",
    });

    if (!yes) return;
    await send({ method: "DELETE" }, `/api/promos?entity=code&id=${encodeURIComponent(promo.id)}`);
  };

  /*
   * A code with no rewards cannot pay anybody.
   *
   * Said on the row rather than discovered when somebody redeems: the
   * server now refuses such a code outright, and the reason it exists
   * at all is that the old wizard let three kinds be chosen that never
   * credited anything.
   */
  const live = rewards.filter((reward) => reward.active);
  const paysNothing = live.length === 0;

  return (
    <div className="border-b border-foreground/[0.06] last:border-0">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <code
          className={`font-mono text-[0.92rem] font-bold ${
            promo.active ? "" : "line-through opacity-50"
          }`}
        >
          {promo.code}
        </code>

        <div className="min-w-0 flex-1">
          <div className="text-[0.92rem]">
            {paysNothing ? (
              <span className="text-destructive">Pays nothing yet</span>
            ) : (
              live.map((reward) => rewardText(reward, plans)).join(" + ")
            )}
          </div>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            {promo.label}
            {promo.city ? ` · ${promo.city}` : ""}
            {promo.segment ? ` · ${AUDIENCE[promo.segment] ?? promo.segment}` : ""}
            {promo.once_per_user ? " · once each" : " · repeatable"}
          </p>
        </div>

        {promo.max_uses === null && promo.active && (
          <Badge variant="secondary" className="text-[0.8rem]">
            no limit
          </Badge>
        )}

        <Badge variant="outline" className="text-[0.8rem]">
          {promo.used}
          {promo.max_uses ? ` of ${promo.max_uses}` : ""} used
        </Badge>

        <Button
          variant="outline"
          onClick={() => setOpen((was) => !was)}
          className="h-9 text-[0.86rem]"
        >
          <Pencil className="mr-1.5 size-3.5" />
          Rewards
        </Button>

        <Button
          variant={promo.active ? "ghost" : "outline"}
          disabled={busy || working}
          onClick={onToggle}
          className="h-9 text-[0.86rem]"
        >
          {promo.active ? "Stop" : "Start"}
        </Button>

        <Button
          variant="ghost"
          disabled={busy || working}
          aria-label={`Delete ${promo.code}`}
          className="h-9 px-2 text-destructive hover:text-destructive"
          onClick={removeCode}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-foreground/[0.06] bg-foreground/[0.02] p-4">
          {error && <p className="text-[0.86rem] text-destructive">{error}</p>}

          {rewards.length === 0 ? (
            <p className="text-[0.86rem] text-muted-foreground">
              This code gives nothing. Anybody who tries it is told so rather
              than having their one use taken.
            </p>
          ) : (
            <div className="divide-y divide-foreground/[0.06]">
              {rewards.map((reward) => (
                <div key={reward.id} className="flex items-center gap-3 py-2">
                  <span
                    className={`min-w-0 flex-1 text-[0.86rem] ${
                      reward.active ? "" : "line-through opacity-50"
                    }`}
                  >
                    {rewardText(reward, plans)}
                  </span>

                  <Switch
                    checked={reward.active}
                    disabled={busy || working}
                    onCheckedChange={(next) =>
                      send({
                        method: "PATCH",
                        body: JSON.stringify({ id: reward.id, active: next }),
                      })
                    }
                  />

                  <Button
                    variant="ghost"
                    disabled={busy || working}
                    aria-label={`Remove ${rewardText(reward, plans)}`}
                    className="h-8 px-2 text-destructive hover:text-destructive"
                    onClick={() => removeReward(reward)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {adding ? (
            <NewReward
              draft={draft}
              plans={plans.filter((plan) => plan.active)}
              busy={busy || working}
              onChange={setDraft}
              onCancel={() => setAdding(false)}
              onAdd={add}
            />
          ) : (
            <Button
              variant="outline"
              className="h-9 text-[0.86rem]"
              disabled={busy || working}
              onClick={() => {
                setDraft(BLANK);
                setAdding(true);
              }}
            >
              <Plus className="mr-1.5 size-3.5" />
              Add a reward
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** The one form, shaped by whichever kind is chosen. */
function NewReward({
  draft,
  plans,
  busy,
  onChange,
  onCancel,
  onAdd,
}: {
  draft: Draft;
  plans: RewardPlan[];
  busy: boolean;
  onChange: (draft: Draft) => void;
  onCancel: () => void;
  onAdd: () => void;
}) {
  const set = (field: keyof Draft, value: string) =>
    onChange({ ...draft, [field]: value });

  const kind = KINDS.find((row) => row.value === draft.kind);
  const chosen = plans.find((plan) => plan.key === draft.plan_key);
  const timed = draft.kind === "boost" || draft.kind === "incognito";

  const ready =
    draft.kind === "roses"
      ? Number(draft.amount) > 0
      : draft.kind === "plan"
        ? draft.plan_key !== ""
        : Number(draft.reward_days) > 0;

  return (
    <div className="space-y-4 rounded-lg border border-foreground/[0.06] p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="block text-[0.86rem] font-medium">What they get</span>
          <p className="mb-1.5 text-[0.8rem] leading-relaxed text-muted-foreground">
            {kind?.hint}
          </p>
          <Select
            value={draft.kind}
            onChange={(value) => set("kind", value)}
            options={KINDS.map((row) => ({ value: row.value, label: row.label }))}
          />
        </div>

        {draft.kind === "roses" && (
          <div>
            <label htmlFor="promo-amount" className="block text-[0.86rem] font-medium">
              How many roses
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              Credited the moment they redeem.
            </p>
            <Input
              id="promo-amount"
              type="number"
              min={1}
              value={draft.amount}
              onChange={(event) => set("amount", event.target.value)}
            />
          </div>
        )}

        {draft.kind === "plan" && (
          <>
            <div>
              <span className="block text-[0.86rem] font-medium">Which plan</span>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                They get everything that plan includes.
              </p>
              <Select
                value={draft.plan_key}
                onChange={(value) => set("plan_key", value)}
                options={[
                  { value: "", label: "Pick one" },
                  ...plans.map((plan) => ({
                    value: plan.key,
                    label: `${plan.label}${plan.days ? ` · ${plan.days} days` : ""}`,
                  })),
                ]}
              />
            </div>

            <div>
              <label htmlFor="promo-days" className="block text-[0.86rem] font-medium">
                For how long
              </label>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                Leave empty for the plan&apos;s own length
                {chosen?.days ? ` (${chosen.days} days)` : ""}.
              </p>
              <Input
                id="promo-days"
                type="number"
                min={1}
                placeholder={chosen?.days ? String(chosen.days) : "Days"}
                value={draft.reward_days}
                onChange={(event) => set("reward_days", event.target.value)}
              />
            </div>
          </>
        )}

        {timed && (
          <div>
            <label htmlFor="promo-days" className="block text-[0.86rem] font-medium">
              For how many days
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              Adds on to any they already have.
            </p>
            <Input
              id="promo-days"
              type="number"
              min={1}
              value={draft.reward_days}
              onChange={(event) => set("reward_days", event.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onAdd} disabled={busy || !ready} className="h-9 text-[0.86rem]">
          Add it
        </Button>
        <Button
          variant="ghost"
          onClick={onCancel}
          className="h-9 text-[0.86rem] text-muted-foreground"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
