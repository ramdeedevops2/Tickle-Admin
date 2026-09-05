"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Free trials and discounts.
 *
 * This had a tab of its own, which was a whole navigation step for two
 * rows — and it sat next to a duplicate copy of the tier prices, so the
 * screen offered two different places to price the same thing. Both are
 * gone: prices live on the tier, and this is a section under them.
 *
 * Everything about an offer is editable here except its key, which is
 * what a redemption row points at. Renaming that would orphan the ones
 * already taken, so it is set once when the offer is made.
 *
 * Nothing here grants anything. Crediting happens server-side after a
 * receipt is verified.
 */

type Offer = {
  id: string;
  key: string;
  label: string;
  body: string | null;
  kind: string;
  value: number;
  plan_key: string | null;
  once_per_user: boolean;
  max_redemptions: number | null;
  redeemed: number;
  ends_at: string | null;
  active: boolean;
};

type Plan = { key: string; label: string };

type Payload = { premiumOffers: Offer[]; premiumPlans?: Plan[] };

const KINDS: Record<string, { label: string; unit: string; hint: string }> = {
  trial: {
    label: "Free trial",
    unit: "days free",
    hint: "Premium for a set number of days, at no charge.",
  },
  discount: {
    label: "Money off",
    unit: "% off",
    hint: "A percentage off the price.",
  },
  referral: {
    label: "Invite bonus",
    unit: "days",
    hint: "Extra days given for bringing somebody in.",
  },
};

/** What an offer is, in a sentence rather than in column values. */
function offerText(offer: Offer): string {
  if (offer.kind === "discount") return `${offer.value}% off`;
  return `${offer.value} days free`;
}

const BLANK = {
  key: "",
  label: "",
  body: "",
  kind: "trial",
  value: "7",
  plan_key: "",
  max_redemptions: "",
  days: "",
};

type Draft = typeof BLANK;

export function TrialsPanel() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Payload>("/api/economy");
    if (error) setError(error);
    else {
      setOffers(data?.premiumOffers ?? []);
      setPlans(data?.premiumPlans ?? []);
    }
  }, []);

  useLoadOnMount(load);

  const patch = useCallback(
    async (id: string, fields: Record<string, unknown>) => {
      setBusy(true);
      const { error } = await adminFetch("/api/economy", {
        method: "PATCH",
        body: JSON.stringify({ entity: "offer", id, ...fields }),
      });
      if (error) setError(error);
      else await load();
      setBusy(false);
    },
    [load],
  );

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);

    const { error } = await adminFetch("/api/economy", {
      method: "POST",
      body: JSON.stringify({
        entity: "offer",
        key: draft.key.trim(),
        label: draft.label.trim(),
        body: draft.body.trim(),
        kind: draft.kind,
        value: Number(draft.value),
        plan_key: draft.plan_key || null,
        // Empty means no limit, and Number("") is 0 — which would be an
        // offer nobody can take rather than one anybody can.
        max_redemptions: draft.max_redemptions.trim()
          ? Number(draft.max_redemptions)
          : null,
        days: draft.days.trim() ? Number(draft.days) : null,
      }),
    });

    if (error) setError(error);
    else {
      setAdding(false);
      setDraft(BLANK);
      await load();
    }

    setBusy(false);
  }, [draft, load]);

  /*
   * Removing an offer.
   *
   * The server decides whether this deletes or archives, based on
   * whether anybody has taken it — redemption rows cascade, so deleting
   * a used offer would erase the record that it was used. The confirm
   * text says which is about to happen so it is not a surprise.
   */
  const remove = useCallback(
    async (offer: Offer) => {
      const used = offer.redeemed > 0;

      const ok = await confirm({
        title: used ? `Stop and hide ${offer.label}?` : `Delete ${offer.label}?`,
        body: used
          ? `${offer.redeemed} ${
              offer.redeemed === 1 ? "person has" : "people have"
            } taken this. It is stopped and hidden rather than deleted, so the record of who took it survives.`
          : "Nobody has taken it, so it goes for good.",
        confirmLabel: used ? "Stop and hide" : "Delete it",
        tone: "danger",
      });

      if (!ok) return;

      setBusy(true);
      const { error } = await adminFetch(
        `/api/economy?entity=offer&id=${encodeURIComponent(offer.id)}`,
        { method: "DELETE" },
      );
      if (error) setError(error);
      else await load();
      setBusy(false);
    },
    [confirm, load],
  );

  const set = (field: keyof Draft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const canCreate =
    draft.key.trim().length >= 2 &&
    draft.label.trim().length >= 2 &&
    draft.value.trim() !== "" &&
    Number(draft.value) > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h3 className="text-[0.92rem] font-bold">Trials and offers</h3>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Always set a limit, or there is no ceiling on what it costs.
          </p>
        </div>

        <Button onClick={() => setAdding(true)} className="h-9 text-[0.86rem]">
          <Plus className="mr-1.5 size-3.5" />
          New offer
        </Button>
      </div>

      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      {adding && (
        <div className="space-y-4 rounded-xl border border-foreground/[0.06] p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="offer-label" className="block text-[0.86rem] font-medium">
                Name
              </label>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                What members see, like &ldquo;7 days free&rdquo;.
              </p>
              <Input
                id="offer-label"
                value={draft.label}
                onChange={(event) => set("label", event.target.value)}
              />
            </div>

            <div>
              <label htmlFor="offer-key" className="block text-[0.86rem] font-medium">
                Reference
              </label>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                Internal, and permanent. Something like trial_7.
              </p>
              <Input
                id="offer-key"
                value={draft.key}
                onChange={(event) => set("key", event.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="offer-body" className="block text-[0.86rem] font-medium">
              Description
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              One line under the name. Optional.
            </p>
            <Input
              id="offer-body"
              value={draft.body}
              onChange={(event) => set("body", event.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-[0.86rem] font-medium">Kind</span>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                {KINDS[draft.kind]?.hint}
              </p>
              <Select
                value={draft.kind}
                onChange={(value) => set("kind", value)}
                options={Object.entries(KINDS).map(([value, meta]) => ({
                  value,
                  label: meta.label,
                }))}
              />
            </div>

            <div>
              <label htmlFor="offer-value" className="block text-[0.86rem] font-medium">
                How much
              </label>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                {KINDS[draft.kind]?.unit}.
              </p>
              <Input
                id="offer-value"
                type="number"
                inputMode="numeric"
                min={1}
                max={10000}
                value={draft.value}
                onChange={(event) => set("value", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-[0.86rem] font-medium">Which length</span>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                A billing length, like 1 month. Leave on all unless it is for one.
              </p>
              <Select
                value={draft.plan_key}
                onChange={(value) => set("plan_key", value)}
                options={[
                  { value: "", label: "All lengths" },
                  ...plans.map((plan) => ({ value: plan.key, label: plan.label })),
                ]}
              />
            </div>

            <div>
              <label htmlFor="offer-max" className="block text-[0.86rem] font-medium">
                Limit
              </label>
              <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
                How many people can take it. Empty means no limit.
              </p>
              <Input
                id="offer-max"
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.max_redemptions}
                onChange={(event) => set("max_redemptions", event.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="offer-days" className="block text-[0.86rem] font-medium">
              Ends after
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              Days from now. Empty means it runs until you stop it.
            </p>
            <Input
              id="offer-days"
              type="number"
              inputMode="numeric"
              min={1}
              value={draft.days}
              onChange={(event) => set("days", event.target.value)}
            />
          </div>

          {!draft.max_redemptions.trim() && (
            <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
              With no limit and no end date, this offer keeps costing until somebody
              notices and stops it.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              onClick={create}
              disabled={busy || !canCreate}
              className="h-9 text-[0.86rem]"
            >
              {busy ? "Creating" : "Create offer"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setAdding(false);
                setDraft(BLANK);
              }}
              className="h-9 text-[0.86rem]"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {offers.length === 0 && !adding ? (
        <p className="rounded-xl border border-foreground/[0.06] p-6 text-center text-[0.92rem] text-muted-foreground">
          No trials or offers running.
        </p>
      ) : (
        <div className="rounded-xl border border-foreground/[0.06]">
          {offers.map((offer, index) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              plans={plans}
              busy={busy}
              first={index === 0}
              onSave={patch}
              onToggle={() => patch(offer.id, { active: !offer.active })}
              onRemove={() => remove(offer)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One offer, read-only until you press Edit.
 *
 * The row shows what it is, how many have taken it, and whether it is
 * capped — the three things somebody scanning this list is checking.
 * The rest is behind Edit so a list of live offers does not read as a
 * form waiting to be filled in.
 */
function OfferRow({
  offer,
  plans,
  busy,
  first,
  onSave,
  onToggle,
  onRemove,
}: {
  offer: Offer;
  plans: Plan[];
  busy: boolean;
  first: boolean;
  onSave: (id: string, fields: Record<string, unknown>) => Promise<void>;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(offer.label);
  const [body, setBody] = useState(offer.body ?? "");
  const [kind, setKind] = useState(offer.kind);
  const [value, setValue] = useState(String(offer.value));
  const [planKey, setPlanKey] = useState(offer.plan_key ?? "");
  const [max, setMax] = useState(
    offer.max_redemptions === null ? "" : String(offer.max_redemptions),
  );

  const cancel = () => {
    setLabel(offer.label);
    setBody(offer.body ?? "");
    setKind(offer.kind);
    setValue(String(offer.value));
    setPlanKey(offer.plan_key ?? "");
    setMax(offer.max_redemptions === null ? "" : String(offer.max_redemptions));
    setEditing(false);
  };

  const commit = async () => {
    await onSave(offer.id, {
      label: label.trim(),
      body: body.trim(),
      kind,
      value: Number(value),
      plan_key: planKey,
      max_redemptions: max.trim() ? Number(max) : null,
    });
    setEditing(false);
  };

  const dirty =
    label.trim() !== offer.label ||
    body.trim() !== (offer.body ?? "") ||
    kind !== offer.kind ||
    Number(value) !== offer.value ||
    planKey !== (offer.plan_key ?? "") ||
    (max.trim() ? Number(max) : null) !== offer.max_redemptions;

  /*
   * A cap below what has already gone out.
   *
   * Not rejected — it is a legitimate way to close an offer to new
   * people. Worth saying plainly, because it looks like a limit that
   * still has room in it.
   */
  const capBelowTaken = max.trim() !== "" && Number(max) < offer.redeemed;

  if (editing) {
    return (
      <div className={`space-y-4 p-4 ${first ? "" : "border-t border-foreground/[0.06]"}`}>
        <div>
          <label htmlFor={`${offer.id}-label`} className="block text-[0.86rem] font-medium">
            Name
          </label>
          <Input
            id={`${offer.id}-label`}
            className="mt-1.5"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor={`${offer.id}-body`} className="block text-[0.86rem] font-medium">
            Description
          </label>
          <Input
            id={`${offer.id}-body`}
            className="mt-1.5"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="block text-[0.86rem] font-medium">Kind</span>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              {KINDS[kind]?.hint}
            </p>
            <Select
              value={kind}
              onChange={setKind}
              options={Object.entries(KINDS).map(([option, meta]) => ({
                value: option,
                label: meta.label,
              }))}
            />
          </div>

          <div>
            <label htmlFor={`${offer.id}-value`} className="block text-[0.86rem] font-medium">
              How much
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              {KINDS[kind]?.unit}.
            </p>
            <Input
              id={`${offer.id}-value`}
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="block text-[0.86rem] font-medium">Which length</span>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              A billing length, like 1 month. Leave on all unless it is for one.
            </p>
            <Select
              value={planKey}
              onChange={setPlanKey}
              options={[
                { value: "", label: "All lengths" },
                ...plans.map((plan) => ({ value: plan.key, label: plan.label })),
              ]}
            />
          </div>

          <div>
            <label htmlFor={`${offer.id}-max`} className="block text-[0.86rem] font-medium">
              Limit
            </label>
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              {offer.redeemed} taken so far. Empty means no limit.
            </p>
            <Input
              id={`${offer.id}-max`}
              type="number"
              inputMode="numeric"
              min={0}
              value={max}
              onChange={(event) => setMax(event.target.value)}
            />
          </div>
        </div>

        {capBelowTaken && (
          <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
            That limit is below the {offer.redeemed} already taken, so no one else can
            take it. Nobody loses what they already have.
          </p>
        )}

        <div className="flex gap-2">
          <Button
            onClick={commit}
            disabled={busy || !dirty || !label.trim() || !value.trim()}
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
      className={`flex flex-wrap items-center gap-3 p-4 ${
        first ? "" : "border-t border-foreground/[0.06]"
      }`}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`text-[0.92rem] font-medium ${
            offer.active ? "" : "line-through opacity-50"
          }`}
        >
          {offer.label}
        </div>
        <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
          {KINDS[offer.kind]?.label ?? offer.kind} · {offerText(offer)} · {offer.redeemed}
          {offer.max_redemptions ? ` of ${offer.max_redemptions}` : ""} taken
          {offer.plan_key && ` · ${offer.plan_key} only`}
          {offer.ends_at && ` · ends ${new Date(offer.ends_at).toLocaleDateString()}`}
        </p>
      </div>

      {/* An uncapped offer is an open-ended cost, and the person
          who created it will not be the one who notices. */}
      {offer.max_redemptions === null && offer.active && (
        <Badge variant="secondary" className="text-[0.8rem]">
          uncapped
        </Badge>
      )}

      <Button
        variant="outline"
        onClick={() => setEditing(true)}
        className="h-9 text-[0.86rem]"
      >
        <Pencil className="mr-1.5 size-3.5" />
        Edit
      </Button>

      <Button
        variant={offer.active ? "ghost" : "outline"}
        disabled={busy}
        onClick={onToggle}
        className="h-9 text-[0.86rem]"
      >
        {offer.active ? "Stop" : "Start"}
      </Button>

      <Button
        variant="ghost"
        disabled={busy}
        onClick={onRemove}
        aria-label={`Remove ${offer.label}`}
        className="h-9 text-[0.86rem] text-destructive hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
