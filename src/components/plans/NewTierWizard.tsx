"use client";

import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useModalLock } from "@/lib/useModalLock";
import { Check, X } from "lucide-react";

/**
 * Creating a tier, one question at a time.
 *
 * A tier is eighteen fields. Put on one screen they read as a wall and
 * get filled in wrongly — the price gets typed into the comments box,
 * the entitlements get skipped entirely, and the result is a tier
 * somebody is charged for that gives them less than free.
 *
 * So it is four short steps, and a step will not open until the one
 * before it is answerable. That is not decoration: it means every tier
 * that reaches the database has a name, a price and a decided set of
 * features, rather than defaults nobody looked at.
 *
 * Nothing is written until the last step. Cancelling leaves no row.
 */

export type Draft = {
  label: string;
  tagline: string;
  price: string;
  compare: string;
  days: string;
  daily_interactions: string;
  daily_comments: string;
  daily_super_likes: string;
  daily_paths_likes: string;
  active_chat_limit: string;
  super_like_rose_cost: string;
  signup_roses: string;
  visibility_multiplier: string;
  expired_history_days: string;
  sees_who_liked: boolean;
  can_incognito: boolean;
  can_travel: boolean;
  can_hide_presence: boolean;
};

type FieldSpec = {
  key: keyof Draft;
  label: string;
  hint: string;
  /** Marked with a dot and blocks the step until it has a value. */
  required?: boolean;
  /** Blank is a legitimate answer meaning "no limit". */
  unlimited?: boolean;
  prefix?: string;
};

type Step = {
  title: string;
  blurb: string;
  fields?: FieldSpec[];
  gates?: { key: keyof Draft; label: string; hint: string }[];
};

const STEPS: Step[] = [
  {
    title: "Name it",
    blurb: "What members see on the pricing card.",
    fields: [
      {
        key: "label",
        label: "Tier name",
        hint: "Short. It is the heading on the card.",
        required: true,
      },
      {
        key: "tagline",
        label: "One line under it",
        hint: "Who this tier is for, in a sentence.",
      },
    ],
  },
  {
    title: "Price it",
    blurb: "What it costs and how long it lasts.",
    fields: [
      {
        key: "price",
        label: "Price",
        hint: "In rupees. What one purchase costs.",
        required: true,
        prefix: "₹",
      },
      {
        key: "days",
        label: "Length in days",
        hint: "How long a purchase lasts. 30 is a month.",
        required: true,
      },
      {
        key: "compare",
        label: "Compare at",
        hint: "Struck-through price, for a saving. Leave blank for none.",
        prefix: "₹",
      },
    ],
  },
  {
    title: "Allowances",
    blurb: "What somebody on this tier can do each day.",
    fields: [
      {
        key: "daily_interactions",
        label: "Interactions a day",
        hint: "Likes and comments share this. Blank means unlimited.",
        unlimited: true,
      },
      { key: "daily_comments", label: "Comments a day", hint: "Counts against interactions too.", required: true },
      { key: "daily_super_likes", label: "Super Likes a day", hint: "Its own budget.", required: true },
      { key: "daily_paths_likes", label: "Paths Crossed likes", hint: "Likes to people whose path you crossed.", required: true },
      { key: "active_chat_limit", label: "Open chats", hint: "Conversations at once.", required: true },
      { key: "super_like_rose_cost", label: "Super Like costs", hint: "Roses each, once the daily ones are gone.", required: true },
      { key: "signup_roses", label: "Roses on signup", hint: "Granted once, at account creation.", required: true },
      { key: "visibility_multiplier", label: "Visibility boost", hint: "Multiplies deck position. Never the compatibility score.", required: true },
      { key: "expired_history_days", label: "Expired matches kept", hint: "Days an expired match can still be revived.", required: true },
    ],
  },
  {
    title: "Unlocks",
    blurb: "The four things this tier either gives or does not.",
    gates: [
      { key: "sees_who_liked", label: "Sees who liked them", hint: "The main thing people pay for." },
      { key: "can_incognito", label: "Incognito browsing", hint: "Look at profiles without appearing in their likes." },
      { key: "can_travel", label: "Travel to another city", hint: "Swipe somewhere they are not." },
      { key: "can_hide_presence", label: "Hide presence", hint: "Hides online status, read receipts and typing." },
    ],
  },
];

/**
 * How a step arrives and leaves.
 *
 * Variants rather than inline objects, because `custom` — the number
 * saying which way we are going — is only threaded through to variant
 * functions. Forward slides in from the right and out to the left;
 * going back does the reverse, so the motion matches the direction of
 * travel instead of always looking like progress.
 */
const SLIDE = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
  settled: { opacity: 1, x: 0 },
  leave: (direction: number) => ({ opacity: 0, x: direction * -24 }),
};

/**
 * Whether a step has everything it needs.
 *
 * A required field has to be non-empty, and anything numeric has to
 * actually be a number — "abc" in the price box is not a filled-in
 * price, and letting it through only moves the failure to the server.
 */
function stepComplete(step: Step, draft: Draft): boolean {
  for (const field of step.fields ?? []) {
    if (!field.required) continue;

    const value = String(draft[field.key] ?? "").trim();
    if (!value) return false;

    if (field.key !== "label" && field.key !== "tagline" && !Number.isFinite(Number(value))) {
      return false;
    }
  }
  return true;
}

export function NewTierWizard({
  defaults,
  busy,
  onCancel,
  onCreate,
}: {
  /** Seeded from the free tier, so numbers start somewhere sensible. */
  defaults: Draft;
  busy: boolean;
  onCancel: () => void;
  onCreate: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft>(defaults);
  const [step, setStep] = useState(0);
  /*
   * Which way the panels slide.
   *
   * Held in state rather than derived, because by the time the
   * animation runs the index has already changed and there is nothing
   * left to compare against.
   */
  const [direction, setDirection] = useState(1);

  useModalLock(true);

  const current = STEPS[step];
  const complete = useMemo(() => stepComplete(current, draft), [current, draft]);
  const last = step === STEPS.length - 1;

  const set = useCallback(
    (key: keyof Draft, value: string | boolean) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const go = useCallback((next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }, [step]);

  const submit = useCallback(async () => {
    const num = (value: string) => (value.trim() === "" ? null : Number(value));

    await onCreate({
      label: draft.label.trim(),
      tagline: draft.tagline.trim(),
      // Rupees in, paise out. Typing 29900 for ₹299 is the mistake that
      // ships a tier at ₹29,900.
      price_minor: draft.price.trim() === "" ? null : Math.round(Number(draft.price) * 100),
      compare_minor:
        draft.compare.trim() === "" ? null : Math.round(Number(draft.compare) * 100),
      days: num(draft.days),
      daily_interactions: num(draft.daily_interactions),
      daily_comments: Number(draft.daily_comments),
      daily_super_likes: Number(draft.daily_super_likes),
      daily_paths_likes: Number(draft.daily_paths_likes),
      active_chat_limit: Number(draft.active_chat_limit),
      super_like_rose_cost: Number(draft.super_like_rose_cost),
      signup_roses: Number(draft.signup_roses),
      visibility_multiplier: Number(draft.visibility_multiplier),
      expired_history_days: Number(draft.expired_history_days),
      sees_who_liked: draft.sees_who_liked,
      can_incognito: draft.can_incognito,
      can_travel: draft.can_travel,
      can_hide_presence: draft.can_hide_presence,
    });
  }, [draft, onCreate]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/[0.12] p-4"
      // The backdrop cancels, matching Escape and the button. Nothing
      // has been written, so there is nothing to lose by leaving.
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="surface-float flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-foreground/[0.06] p-5">
          <div className="min-w-0">
            <h2 className="text-[1.05rem] font-bold">{current.title}</h2>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              {current.blurb}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>

        {/*
          Progress as a row of bars.

          A step already passed stays filled and stays clickable, so
          going back to correct the price does not mean cancelling. A
          step ahead is not reachable, which is the whole point.
        */}
        <div className="flex gap-1.5 px-5 pt-4">
          {STEPS.map((entry, index) => (
            <button
              key={entry.title}
              type="button"
              disabled={index > step}
              onClick={() => go(index)}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index <= step ? "bg-foreground" : "bg-foreground/10"
              } ${index < step ? "cursor-pointer" : ""}`}
              aria-label={entry.title}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={SLIDE}
              initial="enter"
              animate="settled"
              exit="leave"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              {current.fields?.map((field) => (
                <div key={String(field.key)} className="space-y-1.5">
                  <label
                    htmlFor={String(field.key)}
                    className="flex items-center gap-1 text-[0.86rem] font-medium"
                  >
                    {field.label}
                    {/* A dot, not an asterisk. It marks the field without
                        making the label read like a footnote. */}
                    {field.required && (
                      <span
                        className="size-1.5 rounded-full bg-destructive"
                        aria-label="required"
                      />
                    )}
                  </label>

                  <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
                    {field.hint}
                  </p>

                  <div className="relative">
                    {field.prefix && (
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.86rem] text-muted-foreground">
                        {field.prefix}
                      </span>
                    )}
                    <Input
                      id={String(field.key)}
                      value={String(draft[field.key] ?? "")}
                      onChange={(event) => set(field.key, event.target.value)}
                      placeholder={field.unlimited ? "Unlimited" : ""}
                      /* Only the name and tagline are words. */
                      type={field.key === "label" || field.key === "tagline" ? undefined : "number"}
                      min={0}
                      className={`h-11 ${field.prefix ? "pl-7" : "px-3"}`}
                    />
                  </div>
                </div>
              ))}

              {current.gates?.map((gate) => (
                <div
                  key={String(gate.key)}
                  className="flex items-start justify-between gap-4 border-t border-foreground/[0.06] pt-4 first:border-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <div className="text-[0.86rem] font-medium">{gate.label}</div>
                    <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
                      {gate.hint}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(draft[gate.key])}
                    onCheckedChange={(next) => set(gate.key, next)}
                  />
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 border-t border-foreground/[0.06] p-4">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onCancel() : go(step - 1))}
            className="h-10 text-[0.86rem]"
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          <div className="flex-1 text-center text-[0.8rem] text-muted-foreground">
            Step {step + 1} of {STEPS.length}
          </div>

          {last ? (
            <Button onClick={submit} disabled={busy || !complete} className="h-10 text-[0.86rem]">
              <Check className="mr-1.5 size-3.5" />
              {busy ? "Creating" : "Create tier"}
            </Button>
          ) : (
            <Button
              onClick={() => go(step + 1)}
              // Disabled until this step is answerable. The alternative
              // is a tier created with an empty price that then fails a
              // constraint nobody can see.
              disabled={!complete}
              className="h-10 text-[0.86rem]"
            >
              Next
            </Button>
          )}
        </div>

        {/*
          Said once, at the end, because it changes what somebody does
          next: a new tier is not on sale until it is switched on.
        */}
        {last && (
          <p className="border-t border-foreground/[0.06] px-4 py-3 text-[0.8rem] text-muted-foreground">
            It is created switched off. Turn it on from its card when you are
            happy with it.
          </p>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
