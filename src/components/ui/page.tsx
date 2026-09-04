import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/*
 * The page layout, defined once.
 *
 * Every screen in this panel had grown its own header: some had a
 * heading and a subtitle, some a heading and a row of stats, some just a
 * heading. The actions sat left on one page and right on the next. That
 * is tiring for anyone, and genuinely disorienting for someone who does
 * not already know what the page does.
 *
 * The rule these components enforce: **every page says, in plain words,
 * what it is for before it shows a single control.** The admin using
 * this is not an engineer — a screen that opens with a grid of unlabelled
 * numbers and a table of column names is a screen they have to be taught.
 * A sentence at the top costs one line and removes the lesson.
 */

/**
 * The page header.
 *
 * `description` is not optional by accident. It is the sentence that
 * tells somebody what they are looking at, and leaving it out is the
 * single easiest way to make this panel unusable for the person who
 * actually runs it.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn("flex flex-wrap items-start justify-between gap-4", className)}
    >
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-[1.6rem] leading-tight font-medium tracking-tight">
          {title}
        </h1>
        <p className="mt-1 text-[0.92rem] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      {/* Actions always sit top-right, on every page, so the eye learns
          one place to look for "the thing I came here to do". */}
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}

/**
 * A titled block of related controls.
 *
 * `hint` explains the block in plain language — what it changes and what
 * happens if you change it. On a settings screen that is the difference
 * between a field somebody adjusts confidently and one they leave alone
 * because they cannot tell what it does.
 */
export function Section({
  title,
  hint,
  actions,
  children,
  tone = "default",
  className,
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** "danger" marks a block whose actions cannot be undone. */
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-card/85",
        tone === "danger"
          ? "border-destructive/25"
          : "border-foreground/[0.06]",
        className
      )}
    >
      <div
        className={cn(
          "flex flex-wrap items-start justify-between gap-3 px-4 py-3",
          tone === "danger" && "bg-destructive/[0.04]"
        )}
      >
        <div className="min-w-0 max-w-xl">
          <h2
            className={cn(
              "text-[1rem] leading-tight font-medium",
              tone === "danger" && "text-destructive"
            )}
          >
            {title}
          </h2>
          {hint && (
            <p className="mt-0.5 text-[0.86rem] leading-relaxed text-muted-foreground">
              {hint}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>

      <div className="border-t border-foreground/[0.06] p-4">{children}</div>
    </section>
  );
}

/**
 * What to show when there is nothing to show.
 *
 * An empty table with the headers still visible reads as broken. This
 * says which of the two it is — nothing has happened yet, or a filter is
 * hiding everything — because those need opposite responses.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 py-12 text-center",
        className
      )}
    >
      {Icon && (
        <Icon className="mb-1 size-5 text-muted-foreground/60" />
      )}

      <p className="text-[1rem] font-medium">{title}</p>

      {body && (
        <p className="max-w-sm text-[0.86rem] leading-relaxed text-muted-foreground">
          {body}
        </p>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/**
 * One labelled row: what it is, why it matters, and the control.
 *
 * The settings pages were building this by hand, which is why the label
 * sat at a different distance from its input on each of them.
 */
export function SettingRow({
  label,
  hint,
  control,
  id,
  className,
}: {
  /* A node rather than a string: a row about a person wants their name
     styled differently from the sentence after it. */
  label: React.ReactNode;
  hint?: string;
  control: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div
      id={id}
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 py-2.5",
        className
      )}
    >
      <div className="min-w-0 max-w-lg">
        <p className="text-[0.92rem] font-medium">{label}</p>
        {hint && (
          <p className="mt-0.5 text-[0.86rem] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}

/** Rows in a Section, separated by hairlines rather than boxed. */
export function SettingList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-foreground/[0.06] -my-2.5", className)}>
      {children}
    </div>
  );
}

/**
 * A short, plain-language explanation of the whole screen.
 *
 * Sits under the header on pages whose subject is not self-evident from
 * the title — anything where the admin has to understand a rule before
 * the controls mean anything.
 */
export function Explainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] px-3.5 py-2.5 text-[0.86rem] leading-relaxed text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  );
}

/** The standard page skeleton: header, then blocks. */
export function PageSkeleton({ sections = 2 }: { sections?: number }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-6 w-48 rounded-lg" />
        <Skeleton className="h-3.5 w-96 rounded-md" />
      </div>

      {Array.from({ length: sections }).map((_, index) => (
        <div
          key={index}
          className="space-y-3 rounded-2xl border border-foreground/[0.06] bg-card/85 p-4"
        >
          <Skeleton className="h-4 w-40 rounded-md" />
          <Skeleton className="h-3 w-full rounded-md" />
          <Skeleton className="h-3 w-4/5 rounded-md" />
        </div>
      ))}
    </div>
  );
}

/**
 * The gap between two subjects that now share a screen.
 *
 * Merging pages puts blocks next to each other that were never meant to
 * be read together, and `space-y` alone does not say where one ends. A
 * screen where Reports runs straight into Verification reads as one long
 * list of unrelated boxes.
 *
 * So a merged screen states its parts: a rule, a name, and the sentence
 * that says what this part is for. It is deliberately louder than a
 * Section heading — Sections group controls, this groups Sections.
 */
export function Divider({
  title,
  hint,
  actions,
  className,
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // The top margin is the separation; the first one on a page has
        // its own spacing from the header already.
        "flex flex-wrap items-end justify-between gap-3 border-t border-foreground/10 pt-6 first:mt-0 first:border-t-0 first:pt-0",
        className
      )}
    >
      <div className="min-w-0 max-w-xl">
        <h2 className="text-[1.15rem] leading-tight font-medium tracking-tight">
          {title}
        </h2>
        {hint && (
          <p className="mt-1 text-[0.92rem] leading-relaxed text-muted-foreground">
            {hint}
          </p>
        )}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
