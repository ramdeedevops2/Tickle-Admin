"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A select you can type into.
 *
 * A plain `<Select>` is fine for five retention options and useless for
 * eight hundred venues: the only way to reach the one you want is to
 * scroll a list sorted by nothing you know. This keeps the shape of a
 * select — one value, chosen from a fixed set — and adds the one thing
 * that makes a long set usable.
 *
 * The list is portalled to the body and positioned against the input's
 * rect. An absolutely positioned menu inside a card gets clipped by the
 * card's own overflow, which is exactly how /venues lost its dropdown
 * once already.
 */

export type ComboboxOption = { value: string; label: string; hint?: string };

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Search…",
  emptyLabel = "Nothing matches",
  className,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [rect, setRect] = React.useState<DOMRect | null>(null);

  const anchor = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.value === value) ?? null;

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;

    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(q) ||
        (option.hint ?? "").toLowerCase().includes(q),
    );
  }, [options, query]);

  const place = React.useCallback(() => {
    const node = anchor.current;
    if (node) setRect(node.getBoundingClientRect());
  }, []);

  // The menu is fixed to a rect measured once, so anything that moves the
  // input has to re-measure or the menu is left behind.
  React.useEffect(() => {
    if (!open) return;

    place();

    const onMove = () => place();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);

    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return;

    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchor.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.("[data-combobox-menu]")) return;
      setOpen(false);
    };

    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (option: ComboboxOption) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActive((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        return Math.max(0, Math.min(visible.length - 1, next));
      });
      return;
    }

    if (event.key === "Enter" && open && visible[active]) {
      event.preventDefault();
      choose(visible[active]);
    }
  };

  return (
    <div ref={anchor} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-lg border border-foreground/30 bg-card px-3 text-[0.92rem] transition-colors hover:border-foreground/45",
          open && "border-foreground/60",
          disabled && "opacity-50",
        )}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          input.current?.focus();
        }}
      >
        <Search className="size-4 shrink-0 text-muted-foreground" />

        <input
          ref={input}
          disabled={disabled}
          value={open ? query : (selected?.label ?? "")}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected ? selected.label : placeholder}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
        />

        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </div>

      {open &&
        rect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            data-combobox-menu
            className="surface-float fixed z-[200] max-h-72 overflow-y-auto rounded-xl p-1"
            style={{
              left: rect.left,
              width: rect.width,
              // Flips above the input when there is more room up there, so a
              // picker near the bottom of the screen is not a two-row list.
              top:
                window.innerHeight - rect.bottom < 240 && rect.top > 260
                  ? undefined
                  : rect.bottom + 4,
              bottom:
                window.innerHeight - rect.bottom < 240 && rect.top > 260
                  ? window.innerHeight - rect.top + 4
                  : undefined,
            }}
          >
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-[0.86rem] text-muted-foreground">
                {emptyLabel}
              </p>
            ) : (
              visible.map((option, index) => (
                <button
                  key={option.value}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(option)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[0.92rem]",
                    index === active && "bg-accent",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                    {option.hint && (
                      <span className="ml-2 text-[0.82rem] text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                  </span>

                  {option.value === value && <Check className="size-4 shrink-0" />}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
