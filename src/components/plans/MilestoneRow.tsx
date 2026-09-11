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
 * One invite step, and everything it pays.
 *
 * A step used to pay one thing: a kind, an amount, and a pair of
 * switches saying who got it. That could not express "whoever joins
 * gets three days of Premium and five roses" — not because anybody
 * decided against it, but because one reward was two columns on the
 * milestone row.
 *
 * Rewards are their own rows now (077), so this is a list you add to.
 * Each entry names its own side, so the two halves of a step can be
 * completely different offers — which they usually should be. What the
 * newcomer gets is what makes somebody repeat the link; what the
 * inviter gets is what makes them send it.
 *
 * The step itself is not editable, and that is deliberate rather than
 * unfinished: the four keys are written into database triggers, so a
 * renamed one stops firing and an invented one never fires at all.
 */

export type Milestone = {
  id: string;
  key: string;
  label: string;
  invitee_label: string | null;
  sort_order: number;
  active: boolean;
};

export type Reward = {
  id: string;
  milestone: string;
  side: "referrer" | "invitee";
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

/** What each reward is, in the words somebody setting one would use. */
const KINDS: { value: Reward["kind"]; label: string; hint: string }[] = [
  { value: "roses", label: "Roses", hint: "Straight into their wallet." },
  { value: "plan", label: "A plan", hint: "Everything that plan includes, then it ends." },
  { value: "boost", label: "Boost", hint: "Higher up in other people's decks." },
  { value: "incognito", label: "Private mode", hint: "Hidden from everyone while it lasts." },
];

const SIDES = [
  { value: "invitee", label: "The person who joins" },
  { value: "referrer", label: "The person who invited them" },
];

const BLANK = {
  side: "invitee",
  kind: "roses",
  amount: "10",
  plan_key: "",
  reward_days: "7",
};

type Draft = typeof BLANK;

/** One reward as a sentence — the same one the app and the notification use. */
export function rewardText(reward: Reward, plans: RewardPlan[]): string {
  if (reward.kind === "roses") return `${reward.amount} roses`;

  if (reward.kind === "plan") {
    const plan = plans.find((row) => row.key === reward.plan_key);
    const days = reward.reward_days ?? plan?.days ?? null;
    return `${plan?.label ?? reward.plan_key}${days ? ` for ${days} days` : ""}`;
  }

  const name = reward.kind === "boost" ? "A boost" : "Private mode";

  return `${name} for ${reward.reward_days} days`;
}

export function MilestoneRow({
  milestone,
  rewards,
  plans,
  paid,
  busy,
  first,
  onSave,
  onToggle,
  onChanged,
}: {
  milestone: Milestone;
  rewards: Reward[];
  plans: RewardPlan[];
  paid: number;
  busy: boolean;
  first: boolean;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onToggle: () => void;
  /** Reload after a reward is added, switched or removed. */
  onChanged: () => Promise<void>;
}) {
  const confirm = useConfirm();

  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [label, setLabel] = useState(milestone.label);
  const [inviteeLabel, setInviteeLabel] = useState(milestone.invitee_label ?? "");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const mine = rewards.filter((reward) => reward.side === "referrer");
  const theirs = rewards.filter((reward) => reward.side === "invitee");

  const send = async (init: RequestInit, url = "/api/invites") => {
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
      body: JSON.stringify({ milestone: milestone.key, ...draft }),
    });

    if (ok) {
      setAdding(false);
      setDraft(BLANK);
    }
  };

  const remove = async (reward: Reward) => {
    const yes = await confirm({
      title: "Remove this reward?",
      body: `${rewardText(reward, plans)} — nobody will be paid it from now on. Anybody already paid keeps what they got.`,
      confirmLabel: "Remove it",
      tone: "danger",
    });

    if (!yes) return;

    await send({ method: "DELETE" }, `/api/invites?id=${encodeURIComponent(reward.id)}`);
  };

  const dirty =
    label.trim() !== milestone.label ||
    inviteeLabel.trim() !== (milestone.invitee_label ?? "");

  return (
    <div className={`space-y-3 p-4 ${first ? "" : "border-t border-foreground/[0.06]"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={`text-[0.92rem] font-medium ${
              milestone.active ? "" : "line-through opacity-50"
            }`}
          >
            {milestone.label}
          </div>
          <p className="text-[0.86rem] text-muted-foreground">
            {rewards.length === 0
              ? "Pays nothing yet."
              : `${rewards.length} reward${rewards.length === 1 ? "" : "s"}`}
          </p>
        </div>

        {paid > 0 && (
          <Badge variant="outline" className="text-[0.8rem]">
            {paid} paid
          </Badge>
        )}

        <Button
          variant="outline"
          onClick={() => setEditing((was) => !was)}
          className="h-9 text-[0.86rem]"
        >
          <Pencil className="mr-1.5 size-3.5" />
          Wording
        </Button>

        <Button
          variant={milestone.active ? "ghost" : "outline"}
          disabled={busy}
          onClick={onToggle}
          className="h-9 text-[0.86rem]"
        >
          {milestone.active ? "Stop" : "Start"}
        </Button>
      </div>

      {error && <p className="text-[0.86rem] text-destructive">{error}</p>}

      {/* The two sentences each side reads. Folded away by default —
          they are looked at far less often than the rewards are. */}
      {editing && (
        <div className="space-y-4 rounded-lg border border-foreground/[0.06] p-4">
          <div>
            <label htmlFor={`${milestone.id}-label`} className="block text-[0.86rem] font-medium">
              What the inviter is told
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              Written from their side, like &ldquo;They joined&rdquo;.
            </p>
            <Input
              id={`${milestone.id}-label`}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>

          {theirs.length > 0 && (
            <div>
              <label
                htmlFor={`${milestone.id}-invitee`}
                className="block text-[0.86rem] font-medium"
              >
                What the new member is told
              </label>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                Written to them, like &ldquo;Welcome, here are some roses&rdquo;. Leave it
                empty to reuse the line above.
              </p>
              <Input
                id={`${milestone.id}-invitee`}
                value={inviteeLabel}
                onChange={(event) => setInviteeLabel(event.target.value)}
                placeholder={label}
              />
            </div>
          )}

          <div className="flex gap-2">
            <Button
              disabled={busy || !dirty || !label.trim()}
              className="h-9 text-[0.86rem]"
              onClick={async () => {
                await onSave(milestone.id, {
                  label: label.trim(),
                  invitee_label: inviteeLabel.trim(),
                });
                setEditing(false);
              }}
            >
              {busy ? "Saving" : "Save"}
            </Button>
            <Button
              variant="ghost"
              className="h-9 text-[0.86rem]"
              onClick={() => {
                setLabel(milestone.label);
                setInviteeLabel(milestone.invitee_label ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Grouped by side, because they are two different offers rather
          than one reward with a recipient. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <RewardList
          title="The person who joins"
          rewards={theirs}
          plans={plans}
          busy={busy || working}
          onToggle={(reward, next) =>
            send({
              method: "PATCH",
              body: JSON.stringify({ id: reward.id, active: next }),
            })
          }
          onRemove={remove}
        />

        <RewardList
          title="The person who invited them"
          rewards={mine}
          plans={plans}
          busy={busy || working}
          onToggle={(reward, next) =>
            send({
              method: "PATCH",
              body: JSON.stringify({ id: reward.id, active: next }),
            })
          }
          onRemove={remove}
        />
      </div>

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
  );
}

/** One side's rewards. Empty says so rather than showing nothing. */
function RewardList({
  title,
  rewards,
  plans,
  busy,
  onToggle,
  onRemove,
}: {
  title: string;
  rewards: Reward[];
  plans: RewardPlan[];
  busy: boolean;
  onToggle: (reward: Reward, next: boolean) => void;
  onRemove: (reward: Reward) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-lg border border-foreground/[0.06] p-3">
      <p className="text-[0.8rem] font-medium text-muted-foreground">{title}</p>

      {rewards.length === 0 ? (
        <p className="text-[0.86rem] text-muted-foreground">Nothing.</p>
      ) : (
        rewards.map((reward) => (
          <div key={reward.id} className="flex items-center gap-2">
            <span
              className={`min-w-0 flex-1 truncate text-[0.86rem] ${
                reward.active ? "" : "line-through opacity-50"
              }`}
            >
              {rewardText(reward, plans)}
            </span>

            <Switch
              checked={reward.active}
              disabled={busy}
              onCheckedChange={(next) => onToggle(reward, next)}
            />

            <Button
              variant="ghost"
              disabled={busy}
              aria-label={`Remove ${rewardText(reward, plans)}`}
              className="h-8 px-2 text-destructive hover:text-destructive"
              onClick={() => onRemove(reward)}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))
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
    <div className="space-y-4 rounded-lg border border-foreground/[0.06] bg-foreground/[0.02] p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="block text-[0.86rem] font-medium">Who gets it</span>
          <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
            Each side can get something different.
          </p>
          <Select
            value={draft.side}
            onChange={(value) => set("side", value)}
            options={SIDES}
          />
        </div>

        <div>
          <span className="block text-[0.86rem] font-medium">What they get</span>
          <p className="mb-1.5 text-[0.8rem] text-muted-foreground">{kind?.hint}</p>
          <Select
            value={draft.kind}
            onChange={(value) => set("kind", value)}
            options={KINDS.map((row) => ({ value: row.value, label: row.label }))}
          />
        </div>

        {draft.kind === "roses" && (
          <div>
            <label htmlFor="reward-amount" className="block text-[0.86rem] font-medium">
              How many roses
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              Credited the moment the step happens.
            </p>
            <Input
              id="reward-amount"
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
              <label htmlFor="reward-days" className="block text-[0.86rem] font-medium">
                For how long
              </label>
              {/* Blank is the useful default: the plan already has a
                  length, and restating it is a second number to keep in
                  step with the first. */}
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                Leave empty for the plan&apos;s own length
                {chosen?.days ? ` (${chosen.days} days)` : ""}.
              </p>
              <Input
                id="reward-days"
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
            <label htmlFor="reward-days" className="block text-[0.86rem] font-medium">
              For how many days
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              Adds on to any they already have.
            </p>
            <Input
              id="reward-days"
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
