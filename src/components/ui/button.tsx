import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/*
 * Buttons, in four steps of loudness.
 *
 *   default     near-black fill. The one loud thing on a screen — at
 *               most one per view, for the action the screen exists for.
 *   secondary   white pill, hairline border. Everything else at page
 *               level: Refresh, Filter, Export.
 *   ghost       no chrome until hovered. Toolbars and icon clusters.
 *   destructive tinted, never filled. A filled red button is louder
 *               than the primary action, which inverts the hierarchy on
 *               exactly the screens where that is most dangerous.
 *
 * Every one is a full pill. There is not a square corner in the
 * reference and mixing the two reads as two different systems.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all duration-150 outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_rgba(26,26,24,0.16)] hover:bg-primary/88",
        outline:
          "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(26,26,24,0.04)] hover:bg-card hover:border-foreground/20 aria-expanded:border-foreground/25",
        secondary:
          "border-border bg-card text-foreground shadow-[0_1px_2px_rgba(26,26,24,0.04)] hover:border-foreground/20 aria-expanded:border-foreground/25",
        ghost:
          "text-muted-foreground hover:bg-foreground/[0.055] hover:text-foreground aria-expanded:bg-foreground/[0.055] aria-expanded:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/16 focus-visible:ring-destructive/25",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        // Page-level. Matches the reference's ~34px action buttons.
        default: "h-8 gap-1.5 px-3.5 text-[0.8rem]",
        xs: "h-6 gap-1 px-2.5 text-[1rem] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 px-3 text-[0.92rem] [&_svg:not([class*='size-'])]:size-3",
        lg: "h-9 gap-2 px-4 text-[1rem]",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  render,
  nativeButton,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  /*
   * `nativeButton` defaults to true in Base UI, meaning "the element I
   * render is a real <button>". Most call sites here pass
   * render={<Link />}, which is an <a> — so the default is a lie and
   * Base UI warns, correctly, that native button semantics are gone.
   *
   * Resolved once here rather than at forty call sites: anything using
   * `render` is assumed not to be a button unless it says otherwise,
   * which is the right way round because rendering a <button> through
   * `render` is the rare case.
   */
  const isNative = nativeButton ?? render === undefined

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      render={render}
      nativeButton={isNative}
      {...props}
    />
  )
}

export { Button, buttonVariants }
