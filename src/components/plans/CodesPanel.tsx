"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { PagedList } from "@/components/ui/paged-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { NewCodeWizard, type CodeDraft } from "@/components/plans/NewCodeWizard";

/**
 * Codes you hand out, and rewards for inviting friends.
 *
 * Two things that look alike and are not. A promo code is something you
 * publish — anybody with the letters can redeem it. A referral reward
 * is paid automatically when somebody a member invited does something
 * real. One is a campaign, the other is a standing rule.
 *
 * Both used to be edited through the same wall of unlabelled boxes and
 * raw database values. Creating now happens in a wizard that asks one
 * question at a time; this screen just lists what exists and lets it be
 * switched on or off.
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
  invitee_label: string | null;
  reward_kind: string;
  reward_value: number;
  rewards_referrer: boolean;
  rewards_invitee: boolean;
  sort_order: number;
  active: boolean;
};

type City = { slug: string; name: string; live?: boolean };

type Payload = {
  codes: PromoCode[];
  milestones: Milestone[];
  rewardKinds: string[];
  milestoneKinds: string[];
  referralCaps: { referral_daily_cap: number; referral_total_cap: number } | null;
  cities: City[];
  referral: {
    awarded: number;
    referrers: number;
    perMilestone: Record<string, number>;
  };
  totalRedemptions: number;
};

/**
 * A reward, in words rather than in column values.
 *
 * The list showed "25 roses" and "3 premium_days" side by side, so half
 * the rows read as English and half as a schema.
 */
function rewardText(kind: string, value: number): string {
  switch (kind) {
    case "roses":
      return `${value} free roses`;
    case "premium_days":
      return `${value} days of Premium`;
    case "super_likes":
      return `${value} Super Likes`;
    case "premium_discount":
      return `${value}% off Premium`;
    case "pack_bonus":
      return `${value}% extra on a rose pack`;
    default:
      return `${value} ${kind}`;
  }
}

/** Who a code is limited to, said as a person. */
const AUDIENCE: Record<string, string> = {
  new: "new members only",
  free: "people who have never paid",
  premium: "paying members only",
  lapsed: "people whose Premium ran out",
};

export function CodesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/promos");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const create = useCallback(
    async (draft: CodeDraft) => {
      setBusy(true);

      const { error } = await adminFetch("/api/promos", {
        method: "POST",
        body: JSON.stringify({
          code: draft.code.trim(),
          label: draft.label.trim(),
          reward_kind: draft.kind,
          reward_value: Number(draft.value),
          // Blank means no limit, and Number("") is 0 — which would be
          // a code nobody can redeem rather than one anybody can.
          max_uses: draft.maxUses.trim() ? Number(draft.maxUses) : null,
          city: draft.city || null,
          segment: draft.segment || null,
          days: draft.days.trim() ? Number(draft.days) : null,
        }),
      });

      if (error) setError(error);
      else {
        setAdding(false);
        await load();
      }

      setBusy(false);
    },
    [load],
  );

  /*
   * Editing one invite reward.
   *
   * Saved per row rather than behind a page-wide Save: there are four
   * of them, they are independent, and a single button would make
   * changing one look like changing all four.
   */
  const save = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/promos", {
        method: "PATCH",
        body: JSON.stringify({ entity: "milestone", id, ...patch }),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

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

  return (
    <div className="space-y-10">
      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      {/* ── Promo codes ──────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="text-[0.92rem] font-bold">Promo codes</h3>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              Codes you hand out. {data?.totalRedemptions ?? 0} redeemed so far.
            </p>
          </div>

          <Button onClick={() => setAdding(true)} className="h-9 text-[0.86rem]">
            <Plus className="mr-1.5 size-3.5" />
            New code
          </Button>
        </div>

        <div className="rounded-xl border border-foreground/[0.06]">
          <PagedList
            items={data?.codes ?? []}
            perPage={10}
            empty={
              loading ? null : (
                <p className="p-6 text-center text-[0.92rem] text-muted-foreground">
                  No codes yet.
                </p>
              )
            }
          >
            {(promo) => (
              <div
                key={promo.id}
                className="flex flex-wrap items-center gap-3 border-b border-foreground/[0.06] p-4 last:border-0"
              >
                <code
                  className={`font-mono text-[0.92rem] font-bold ${
                    promo.active ? "" : "line-through opacity-50"
                  }`}
                >
                  {promo.code}
                </code>

                <div className="min-w-0 flex-1">
                  <div className="text-[0.92rem]">
                    {rewardText(promo.reward_kind, promo.reward_value)}
                  </div>
                  <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                    {promo.label}
                    {promo.city ? ` · ${promo.city}` : ""}
                    {promo.segment ? ` · ${AUDIENCE[promo.segment] ?? promo.segment}` : ""}
                  </p>
                </div>

                {/* An uncapped code is an open-ended cost, and the person
                    who made it will not be the one who notices. */}
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
                  variant={promo.active ? "ghost" : "outline"}
                  disabled={busy}
                  onClick={() => toggle("code", promo.id, !promo.active)}
                  className="h-9 text-[0.86rem]"
                >
                  {promo.active ? "Stop" : "Start"}
                </Button>
              </div>
            )}
          </PagedList>
        </div>
      </div>

      {/* ── Invite rewards ───────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-[0.92rem] font-bold">Invite rewards</h3>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Paid automatically when somebody they invited reaches each step.{" "}
            {referral?.awarded ?? 0} paid out across {referral?.referrers ?? 0} members.
          </p>
          {/*
            Worth saying out loud on this screen. Past these numbers
            awards stop without any error — which is correct, but it is
            also the first thing to check when a reward looks right and
            somebody insists it did not pay.
          */}
          {data?.referralCaps && (
            <p className="mt-1 text-[0.8rem] leading-relaxed text-muted-foreground">
              However these are set, one member can earn from{" "}
              {data.referralCaps.referral_daily_cap} invites a day and{" "}
              {data.referralCaps.referral_total_cap} in total. Past that, rewards stop
              quietly so invite farming does not pay.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-foreground/[0.06]">
          {(data?.milestones ?? []).map((milestone, index) => (
            <MilestoneRow
              key={milestone.id}
              milestone={milestone}
              paid={referral?.perMilestone[milestone.key] ?? 0}
              rewardKinds={data?.milestoneKinds ?? []}
              busy={busy}
              first={index === 0}
              onSave={save}
              onToggle={() => toggle("milestone", milestone.id, !milestone.active)}
            />
          ))}
        </div>
      </div>

      {adding && (
        <NewCodeWizard
          rewardKinds={data?.rewardKinds ?? []}
          cities={data?.cities ?? []}
          busy={busy}
          onCancel={() => setAdding(false)}
          onCreate={create}
        />
      )}
    </div>
  );
}

/**
 * One invite reward, editable in place.
 *
 * Read-only until you press Edit. The four rows are mostly looked at
 * rather than changed, and four rows of open input boxes reads as a
 * form somebody forgot to submit.
 *
 * Everything that decides what a reward is worth is here: the wording
 * both sides read, what is paid, how much, and who gets it.
 *
 * The step itself — "they joined", "they verified" — is not editable,
 * and that is deliberate rather than unfinished. Those four keys are
 * written into database triggers, so a renamed one stops firing and an
 * invented one never fires at all. Every knob that changes the reward
 * is open; the one that would quietly disconnect it is not.
 */
function MilestoneRow({
  milestone,
  paid,
  rewardKinds,
  busy,
  first,
  onSave,
  onToggle,
}: {
  milestone: Milestone;
  paid: number;
  rewardKinds: string[];
  busy: boolean;
  first: boolean;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onToggle: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(milestone.label);
  const [inviteeLabel, setInviteeLabel] = useState(milestone.invitee_label ?? "");
  const [kind, setKind] = useState(milestone.reward_kind);
  const [value, setValue] = useState(String(milestone.reward_value));
  const [toReferrer, setToReferrer] = useState(milestone.rewards_referrer);
  const [toInvitee, setToInvitee] = useState(milestone.rewards_invitee);

  const cancel = () => {
    setLabel(milestone.label);
    setInviteeLabel(milestone.invitee_label ?? "");
    setKind(milestone.reward_kind);
    setValue(String(milestone.reward_value));
    setToReferrer(milestone.rewards_referrer);
    setToInvitee(milestone.rewards_invitee);
    setEditing(false);
  };

  const commit = async () => {
    await onSave(milestone.id, {
      label: label.trim(),
      invitee_label: inviteeLabel.trim(),
      reward_kind: kind,
      reward_value: Number(value),
      rewards_referrer: toReferrer,
      rewards_invitee: toInvitee,
    });
    setEditing(false);
  };

  const dirty =
    label.trim() !== milestone.label ||
    inviteeLabel.trim() !== (milestone.invitee_label ?? "") ||
    kind !== milestone.reward_kind ||
    Number(value) !== milestone.reward_value ||
    toReferrer !== milestone.rewards_referrer ||
    toInvitee !== milestone.rewards_invitee;

  // Enforced by the table too. Checked here so the message is a
  // sentence rather than a constraint name.
  const paysNobody = !toReferrer && !toInvitee;

  if (editing) {
    return (
      <div className={`space-y-4 p-4 ${first ? "" : "border-t border-foreground/[0.06]"}`}>
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

        {/*
          Only worth asking about when the invited person is actually
          being paid. Otherwise it is a field for a message nobody gets.
        */}
        {toInvitee && (
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="block text-[0.86rem] font-medium">What they get</span>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              Roses, or days of Premium.
            </p>
            <Select
              value={kind}
              onChange={setKind}
              options={rewardKinds.map((option) => ({
                value: option,
                label: REWARD_LABEL[option] ?? option,
              }))}
            />
          </div>

          <div>
            <label htmlFor={`${milestone.id}-value`} className="block text-[0.86rem] font-medium">
              How much
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              {kind === "premium_days" ? "Days of Premium." : "Number of roses."}
            </p>
            {/* type="number" is what turns on the panel-wide guard that
                blocks letters, e, + and pasted junk. */}
            <Input
              id={`${milestone.id}-value`}
              type="number"
              inputMode="numeric"
              min={1}
              max={100000}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        </div>

        {/*
          Who is paid.

          Both can be on: that is a reward which thanks the inviter and
          welcomes the new person at the same time. Neither cannot — an
          award that pays nobody still records itself and still sends a
          notification promising a reward.
        */}
        <div>
          <span className="block text-[0.86rem] font-medium">Who gets paid</span>
          <p className="mb-1.5 text-[0.8rem] text-muted-foreground">Pick either, or both.</p>
          <div className="flex flex-wrap gap-2">
            <Toggle on={toReferrer} onClick={() => setToReferrer(!toReferrer)}>
              The inviter
            </Toggle>
            <Toggle on={toInvitee} onClick={() => setToInvitee(!toInvitee)}>
              The new member
            </Toggle>
          </div>
          {paysNobody && (
            <p className="mt-1.5 text-[0.8rem] text-destructive">
              Pick at least one, or this reward pays nobody.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={commit}
            disabled={busy || !dirty || paysNobody || !label.trim() || !value.trim()}
            className="h-9 text-[0.86rem]"
          >
            {busy ? "Saving" : "Save"}
          </Button>
          <Button variant="ghost" onClick={cancel} className="h-9 text-[0.86rem]">
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 p-4 ${
        first ? "" : "border-t border-foreground/[0.06]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`text-[0.92rem] font-medium ${
            milestone.active ? "" : "line-through opacity-50"
          }`}
        >
          {milestone.label}
        </div>
        <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
          Pays {rewardText(milestone.reward_kind, milestone.reward_value)} to{" "}
          {milestone.rewards_referrer && milestone.rewards_invitee
            ? "both of them"
            : milestone.rewards_invitee
              ? "the new member"
              : "the inviter"}
        </p>
      </div>

      <Badge variant="outline" className="text-[0.8rem]">
        {paid} paid
      </Badge>

      <Button
        variant="outline"
        onClick={() => setEditing(true)}
        className="h-9 text-[0.86rem]"
      >
        <Pencil className="mr-1.5 size-3.5" />
        Edit
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
  );
}

/**
 * A pill that is on or off.
 *
 * Two of these rather than a pair of checkboxes because the question is
 * "who is paid", and the answer is one, the other, or both — which
 * reads better as two things you press than as a list you tick.
 */
function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg border px-3 py-2 text-[0.86rem] font-medium transition-colors ${
        on
          ? "border-foreground/20 bg-foreground text-background"
          : "border-foreground/[0.12] text-muted-foreground hover:border-foreground/25"
      }`}
    >
      {children}
    </button>
  );
}

/** The reward names, for the dropdown. */
const REWARD_LABEL: Record<string, string> = {
  roses: "Free roses",
  premium_days: "Free Premium",
  super_likes: "Free Super Likes",
  premium_discount: "Money off Premium",
  pack_bonus: "Bonus on a rose pack",
};
