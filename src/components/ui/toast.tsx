"use client";

import * as React from "react";
import { Check, Info, TriangleAlert, X, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Toasts.
 *
 * Bottom-right, stacked, self-dismissing. L3 in the depth scale — one
 * of the few things allowed a real shadow, because it genuinely floats
 * above the page.
 *
 * The panel had no toast at all: every result was an inline banner that
 * pushed the layout down as it appeared, or an alert() that stopped the
 * page. Both are worse than they look — the banner moves the button you
 * just clicked out from under the cursor, and alert() blocks the event
 * loop while it is open.
 *
 * Deliberately not a dependency. The whole thing is a context, a list
 * and a timer; pulling in a library for that would be more API surface
 * than code.
 */

type ToastKind = "success" | "error" | "info" | "warning";

type Toast = {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
};

type ToastInput = { title: string; body?: string; duration?: number };

type ToastContextValue = {
  toast: (kind: ToastKind, input: ToastInput) => void;
  success: (input: ToastInput) => void;
  error: (input: ToastInput) => void;
  info: (input: ToastInput) => void;
  warning: (input: ToastInput) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

/** How long each kind stays, in ms. */
const DURATIONS: Record<ToastKind, number> = {
  success: 3200,
  info: 3600,
  warning: 5200,
  // Errors stay longest. Something went wrong is the one message worth
  // reading twice, and it is the one people look up from and miss.
  error: 6500,
};

const ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  success: Check,
  error: CircleAlert,
  info: Info,
  warning: TriangleAlert,
};

/** Icon tint per kind. Colour on the glyph, no chip behind it. */
const TONES: Record<ToastKind, string> = {
  success: "text-success",
  error: "text-destructive",
  info: "text-muted-foreground",
  warning: "text-warning",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  // Timers are tracked so a manual dismiss can cancel the pending
  // auto-dismiss. Without this, closing a toast by hand leaves a timer
  // that fires later and removes whatever has since taken its id.
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const nextId = React.useRef(0);

  const dismiss = React.useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((entry) => entry.id !== id));
  }, []);

  const toast = React.useCallback(
    (kind: ToastKind, { title, body, duration }: ToastInput) => {
      const id = nextId.current++;

      setToasts((current) => {
        const next = [...current, { id, kind, title, body }];
        // Four at once is already a wall. Older ones go first — the
        // newest is the one tied to what was just clicked.
        return next.slice(-4);
      });

      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration ?? DURATIONS[kind])
      );
    },
    [dismiss]
  );

  // Every timer is cleared on unmount, so a navigation mid-toast cannot
  // leave a callback pointing at a gone component.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (input) => toast("success", input),
      error: (input) => toast("error", input),
      info: (input) => toast("info", input),
      warning: (input) => toast("warning", input),
    }),
    [toast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/*
        aria-live="polite" so a screen reader announces results without
        interrupting whatever it is mid-sentence on. pointer-events-none
        on the stack and auto on each card keeps the empty column from
        swallowing clicks on the page beneath it.
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-4 z-[100] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((entry) => {
          const Icon = ICONS[entry.kind];

          return (
            <div
              key={entry.id}
              role="status"
              className="animate-toast-in surface-float pointer-events-auto flex items-start gap-2.5 rounded-2xl p-3"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONES[entry.kind])} />

              <div className="min-w-0 flex-1">
                <p className="text-[0.92rem] leading-snug font-medium">
                  {entry.title}
                </p>
                {entry.body && (
                  <p className="mt-0.5 text-[0.86rem] leading-relaxed text-muted-foreground">
                    {entry.body}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(entry.id)}
                aria-label="Dismiss"
                className="-m-1 shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return context;
}
