"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * The toggle from the reference: a wide pill, near-black when on, a
 * plain grey track when off, with a white thumb that slides.
 *
 * Built on a real <input type="checkbox"> rather than a styled div.
 * That is what makes it reachable by keyboard, announced correctly by
 * a screen reader, and submittable inside a form — none of which a
 * div with an onClick gives you, and all of which are easy to not
 * notice are missing.
 */
function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  label,
  ...props
}: Omit<React.ComponentProps<"input">, "onChange" | "type" | "size"> & {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
}) {
  return (
    <label
      className={cn(
        "relative inline-flex shrink-0 cursor-pointer items-center",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <input
        type="checkbox"
        id={id}
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        aria-label={label}
        className="peer sr-only"
        {...props}
      />

      {/* The track. peer-focus-visible rather than focus-visible: the
          ring belongs on the visible control, but focus lands on the
          input that is screen-reader-only. */}
      <span
        aria-hidden
        className={cn(
          "h-5 w-9 rounded-full border transition-colors duration-200",
          "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/30",
          // Outlined off as well as on, so an off switch is still a control
          // you can see rather than a grey smudge.
          checked ? "border-primary bg-primary" : "border-foreground/30 bg-foreground/10"
        )}
      />

      {/* The thumb. Positioned rather than translated so it cannot drift
          half a pixel off the track edge at odd zoom levels. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0.5 size-4 rounded-full bg-white transition-all duration-200",
          "shadow-[0_1px_2px_rgba(26,26,24,0.25)]",
          checked ? "left-[1.125rem]" : "left-0.5"
        )}
      />
    </label>
  );
}

/**
 * A switch with its label and description in a row.
 *
 * The whole row is the hit target, not just the 36px pill — a settings
 * list where you have to hit the toggle exactly is a settings list
 * people mis-tap.
 */
function SwitchRow({
  checked,
  onCheckedChange,
  label,
  hint,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-6 rounded-xl px-3 py-2.5 transition-colors hover:bg-foreground/[0.03]",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      <span className="min-w-0">
        <span className="block text-[0.92rem] font-medium">{label}</span>
        {hint && (
          <span className="mt-0.5 block text-[1rem] leading-relaxed text-muted-foreground">
            {hint}
          </span>
        )}
      </span>

      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        label={label}
      />
    </label>
  );
}

export { Switch, SwitchRow };
