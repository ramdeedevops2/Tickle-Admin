"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import {
  searchCommands,
  type CommandEntry,
} from "@/lib/commandRegistry";

/**
 * Find anything in the panel.
 *
 * Two kinds of result, deliberately kept apart and always in this order:
 * what the panel *can do* comes first, and matching records come second.
 *
 * That order is the whole point. Typing "safety" should open the moderation
 * page, not offer a member whose bio happens to contain the word — and a
 * palette that mixes the two by relevance score gets that wrong regularly,
 * because a data row will always match more text than a page title.
 */

interface MemberHit {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
}

const RECORD_DEBOUNCE_MS = 220;

export function CommandPalette() {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [members, setMembers] = useState<MemberHit[]>([]);
  const [searching, setSearching] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0);

  const commands = useMemo(() => searchCommands(query), [query]);

  // One flat list, so arrow keys move through both sections without the
  // caller having to know where one ends.
  const results = useMemo(
    () => [
      ...commands.map((entry) => ({ type: "command" as const, entry })),
      ...members.map((member) => ({ type: "member" as const, member })),
    ],
    [commands, members]
  );

  // ─── Opening ────────────────────────────────────────────

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Cmd+K on a Mac, Ctrl+K everywhere else, and "/" the way every
      // text-first tool has done it since IRC.
      const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash =
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement);

      if (combo || slash) {
        event.preventDefault();
        setOpen((value) => !value);
        return;
      }

      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setMembers([]);
      setActive(0);
      return;
    }
    // Focus after the frame the dialog mounts in, or the ref is still null.
    const timer = setTimeout(() => inputRef.current?.focus(), 20);
    return () => clearTimeout(timer);
  }, [open]);

  // ─── Live records ───────────────────────────────────────

  useEffect(() => {
    const q = query.trim();

    // Two characters, because one letter matches most of the table and the
    // request would be thrown away by the next keystroke anyway.
    if (q.length < 2) {
      setMembers([]);
      return;
    }

    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);

      const { data } = await supabase
        .from("profiles")
        .select("user_id, name, email, photos")
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(5);

      // A slower earlier request must never overwrite a newer one — the
      // classic way a palette ends up showing results for a prefix the user
      // has already finished typing past.
      if (ticket !== latest.current) return;

      setMembers((data as MemberHit[]) ?? []);
      setSearching(false);
    }, RECORD_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => setActive(0), [query]);

  // ─── Choosing ───────────────────────────────────────────

  const choose = useCallback(
    (index: number) => {
      const result = results[index];
      if (!result) return;

      setOpen(false);

      if (result.type === "command") {
        // A handful of commands do something instead of going somewhere. The
        // registry names them by id and the handler lives here, so that file
        // stays plain data.
        if (result.entry.run === "signout") {
          void supabase.auth.signOut().then(() => router.push("/login"));
          return;
        }

        if (result.entry.href) router.push(result.entry.href);
        return;
      }

      router.push(`/members/${result.member.user_id}`);
    },
    [results, router]
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % Math.max(results.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (value - 1 + results.length) % Math.max(results.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(active);
    }
  };

  return (
    <>
      {/* The trigger doubles as the shortcut hint. A palette nobody knows
          about is a palette nobody uses, and the keys have to be visible
          somewhere that is not documentation. */}
      <button
        onClick={() => setOpen(true)}
        className="flex w-full max-w-md items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 text-left">Search pages, settings, people…</span>
        <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh] backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            >
              <div className="flex items-center gap-3 border-b border-border px-4">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search pages, settings, actions, people…"
                  className="flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-muted-foreground"
                />
                {searching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
              </div>

              <div className="max-h-[52vh] overflow-y-auto p-2">
                {results.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Nothing matches “{query}”.
                  </p>
                ) : (
                  <>
                    {commands.length > 0 && (
                      <Section label="In the panel">
                        {commands.map((entry, index) => (
                          <CommandRow
                            key={entry.id}
                            entry={entry}
                            active={active === index}
                            onHover={() => setActive(index)}
                            onSelect={() => choose(index)}
                          />
                        ))}
                      </Section>
                    )}

                    {members.length > 0 && (
                      <Section label="Members">
                        {members.map((member, index) => {
                          const flat = commands.length + index;
                          return (
                            <MemberRow
                              key={member.user_id}
                              member={member}
                              active={active === flat}
                              onHover={() => setActive(flat)}
                              onSelect={() => choose(flat)}
                            />
                          );
                        })}
                      </Section>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                <Hint icon={<ArrowUp className="size-3" />} label="/" second={<ArrowDown className="size-3" />}>
                  navigate
                </Hint>
                <Hint icon={<CornerDownLeft className="size-3" />}>open</Hint>
                <span className="ml-auto font-mono">esc to close</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function CommandRow({
  entry,
  active,
  onHover,
  onSelect,
}: {
  entry: CommandEntry;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const Icon = entry.icon;

  return (
    <button
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition ${
        active ? "bg-muted" : ""
      }`}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{entry.title}</span>
        {entry.subtitle && (
          <span className="block truncate text-xs text-muted-foreground">{entry.subtitle}</span>
        )}
      </span>
      {/* The group, not the kind: "Config" tells you where you are about to
          land, where "setting" only restates the icon. */}
      <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {entry.group}
      </span>
    </button>
  );
}

function MemberRow({
  member,
  active,
  onHover,
  onSelect,
}: {
  member: MemberHit;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const photo = member.photos?.[0];

  return (
    <button
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition ${
        active ? "bg-muted" : ""
      }`}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="size-7 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="size-7 shrink-0 rounded-full bg-muted" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{member.name ?? "Unnamed"}</span>
        <span className="block truncate text-xs text-muted-foreground">{member.email}</span>
      </span>
    </button>
  );
}

function Hint({
  icon,
  second,
  label,
  children,
}: {
  icon: React.ReactNode;
  second?: React.ReactNode;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1">
      <kbd className="rounded border border-border px-1 py-0.5">{icon}</kbd>
      {second && <kbd className="rounded border border-border px-1 py-0.5">{second}</kbd>}
      {children}
    </span>
  );
}
