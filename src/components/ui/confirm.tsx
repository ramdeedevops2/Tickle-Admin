"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useModalLock } from "@/lib/useModalLock";

/*
 * Asking before doing something that cannot be undone.
 *
 * This replaces window.confirm, which was wrong here for three reasons.
 * It is painted by the operating system, so it arrives in the OS font
 * with OS buttons and looks like a different application has taken over
 * the screen. It blocks the JavaScript thread while it is open. And it
 * gives every question the same two words — "OK" and "Cancel" — so
 * "suspend this account" and "save this setting" read identically at the
 * moment somebody is deciding.
 *
 * The API is deliberately the same shape as the thing it replaces:
 *
 *     if (!(await confirm({ ... }))) return;
 *
 * so a call site changes by one keyword rather than being restructured
 * around a callback.
 */

export type ConfirmRequest = {
  /** What is about to happen, as a short question. */
  title: string;
  /** What it means — consequences, and anything that cannot be undone. */
  body?: string;
  /** The word on the button that does it. Never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get the red treatment and never autofocus. */
  tone?: "default" | "danger";
  /**
   * Ask for a written reason before allowing the action.
   *
   * Moderation actions require one — the server refuses without it, and
   * more to the point it is the only thing that explains the decision to
   * whoever reads the log in six months. Present means required.
   */
  reason?: { label: string; placeholder?: string };
};

type Pending = ConfirmRequest & { resolve: (value: boolean | string) => void };

const ConfirmContext = React.createContext<
  ((request: ConfirmRequest) => Promise<boolean | string>) | null
>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [reason, setReason] = React.useState("");

  // The page behind a question nobody has answered yet does not move,
  // and cannot be clicked past.
  useModalLock(pending !== null);

  const confirm = React.useCallback(
    (request: ConfirmRequest) =>
      new Promise<boolean | string>((resolve) => {
        setReason("");
        setPending({ ...request, resolve });
      }),
    []
  );

  const settle = React.useCallback(
    (ok: boolean) => {
      // Cleared before resolving, so a caller that immediately asks
      // again gets a fresh dialog rather than racing this one's close.
      setPending((current) => {
        if (!current) return null;
        // A reason-carrying dialog answers with the text, so the caller
        // has the thing the server is going to demand.
        current.resolve(ok && current.reason ? reason.trim() : ok);
        return null;
      });
    },
    [reason]
  );

  // Escape cancels. A dialog that can only be dismissed by clicking is a
  // dialog keyboard users are stuck in.
  React.useEffect(() => {
    if (!pending) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") settle(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {pending &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/[0.12] p-4"
            // The backdrop cancels, matching Escape and the button.
            onClick={() => settle(false)}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              className="animate-toast-in surface-float w-full max-w-sm rounded-2xl p-4"
            >
              <p
                id="confirm-title"
                className={cn(
                  "text-[1rem] leading-snug font-medium",
                  pending.tone === "danger" && "text-destructive"
                )}
              >
                {pending.title}
              </p>

              {pending.body && (
                <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted-foreground">
                  {pending.body}
                </p>
              )}

              {pending.reason && (
                <label className="mt-3 block">
                  <span className="mb-1 block text-[0.86rem] font-medium">
                    {pending.reason.label}
                  </span>
                  <Textarea
                    autoFocus
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder={pending.reason.placeholder}
                    className="min-h-20"
                  />
                </label>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => settle(false)}>
                  {pending.cancelLabel ?? "Cancel"}
                </Button>

                {/*
                  Autofocus on the safe path for a destructive question,
                  so Enter does not confirm something irreversible for
                  somebody who was typing.
                */}
                <Button
                  variant={pending.tone === "danger" ? "destructive" : "default"}
                  autoFocus={pending.tone !== "danger" && !pending.reason}
                  // Three characters is what the server accepts. Blocking
                  // here means the refusal arrives before the round trip.
                  disabled={Boolean(pending.reason) && reason.trim().length < 3}
                  onClick={() => settle(true)}
                >
                  {pending.confirmLabel ?? "Confirm"}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

/**
 * Ask before doing it.
 *
 * Returns a promise for whether the person said yes, so a guard clause
 * reads the same as the one it replaces.
 */
export function useConfirm() {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>.");
  }
  return confirm as (request: ConfirmRequest) => Promise<boolean>;
}

/**
 * Ask, and require a written reason.
 *
 * Resolves to the reason, or null if they backed out — so the caller
 * cannot accidentally proceed without one.
 */
export function useAskReason() {
  const confirm = React.useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useAskReason must be used inside <ConfirmProvider>.");
  }

  return React.useCallback(
    async (request: ConfirmRequest & { reason: { label: string; placeholder?: string } }) => {
      const answer = await confirm(request);
      return typeof answer === "string" && answer.length > 0 ? answer : null;
    },
    [confirm]
  );
}
