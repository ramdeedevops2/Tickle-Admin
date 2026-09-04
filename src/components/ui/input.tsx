import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/*
 * Inputs.
 *
 * Outlined, always. Every field keeps a visible box whether or not it
 * is focused, because the admin asked for it and the reason is sound: a
 * field you have to hover to find is a field somebody misses. Hover and
 * focus deepen the same border rather than introducing one.
 *
 * text-base at the md breakpoint and below is deliberate and not a
 * style choice — iOS zooms the viewport on focus for any field under
 * 16px, and the fix is to be 16px until there is no touch keyboard to
 * worry about.
 */
function Input({ className, type, onWheel, ...props }: React.ComponentProps<"input">) {
  /*
   * A number field must not change because somebody scrolled the page.
   *
   * Browsers treat the wheel over a focused number input as increment
   * and decrement. On a page of settings that means scrolling past a
   * focused field silently edits it — the admin saves a radius they
   * never typed and has no idea where the value came from. Blurring on
   * wheel gives the scroll back to the page.
   */
  const handleWheel =
    type === "number"
      ? (event: React.WheelEvent<HTMLInputElement>) => {
          (event.target as HTMLInputElement).blur();
          onWheel?.(event);
        }
      : onWheel;

  return (
    <InputPrimitive
      type={type}
      onWheel={handleWheel}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-foreground/30 bg-card/70 px-3 py-1 text-base transition-all outline-none",
        "placeholder:text-muted-foreground/70",
        "hover:border-foreground/45 hover:bg-card",
        "focus-visible:border-foreground/60 focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/15",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive/40 aria-invalid:ring-3 aria-invalid:ring-destructive/15",
        "md:text-[0.92rem]",
        "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]",
        className
      )}
      {...props}
    />
  )
}

/*
 * A field with its label and hint, laid out once.
 *
 * Every settings screen was rebuilding this row by hand, which is why
 * the label sat at a different distance from the field on each of them.
 */
function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-[1rem] font-medium tracking-wide text-foreground"
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-[1rem] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

/**
 * The multi-line version, sharing Input's resting border and focus ring.
 *
 * resize-y rather than resize-none: a reply that outgrows the box is
 * common, and taking away the drag handle just makes people scroll
 * inside four lines. Horizontal resize stays off — widening a field past
 * its column breaks the layout around it.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "min-h-24 w-full resize-y rounded-lg border border-foreground/30 bg-card/70 px-3 py-2 text-base transition-all outline-none",
        "placeholder:text-muted-foreground/70",
        "hover:border-foreground/45 hover:bg-card",
        "focus-visible:border-foreground/60 focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/15",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive/40 aria-invalid:ring-3 aria-invalid:ring-destructive/15",
        "md:text-[0.92rem]",
        className
      )}
      {...props}
    />
  )
}

export { Input, Field, Textarea }
