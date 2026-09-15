"use client";
import { useCallback, useRef, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Send a Flare as this member.
 *
 * A Flare is a like the recipient is told about, with a note attached.
 * Members send their own from the app and pay Roses; this is for the
 * cases the app cannot cover — seeding a quiet city with something to
 * respond to, or making somebody whole after one that failed.
 *
 * It sends *from* the member whose page this is, *to* whoever is named
 * below. That direction matters: the recipient sees this member's face
 * and name, so sending one is putting words in their mouth. Hence the
 * confirmation, which says whose name it goes out under.
 *
 * The Flare is tagged as admin-sent, so it never spends the member's own
 * daily allowance or Roses.
 *
 * ── Why the recipient is picked, not pasted ───────────────────
 *
 * This used to be a box for a raw user id, which meant finding the
 * person on another screen, copying a uuid, and coming back — and a
 * mistyped one either failed or, worse, quietly found somebody else.
 * A uuid is unreadable, so there was no way to notice the difference
 * before sending. Now the name is searched and the face is shown, so
 * what is about to happen is legible before it happens.
 */

const MAX_NOTE = 160;

type Member = {
  user_id: string;
  name: string | null;
  email: string | null;
  city: string | null;
  age: number | null;
  photo: string | null;
  suspended: boolean;
};

export function SendFlare({
  userId,
  memberName,
}: {
  userId: string;
  memberName: string | null;
}) {
  const confirm = useConfirm();
  const [target, setTarget] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const [results, setResults] = useState<Member[]>([]);
  const [searching, setSearching] = useState(false);

  /*
   * Which search is the live one.
   *
   * Responses can land out of order — "pri" started before "priya" can
   * finish after it, and would replace the better list with a staler
   * one. Only the most recent query is allowed to write.
   */
  const latest = useRef(0);

  const search = useCallback(async (query: string) => {
    const mine = ++latest.current;

    if (query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);

    const { data } = await adminFetch<{ members: Member[] }>(
      `/api/member-search?q=${encodeURIComponent(query)}`,
    );

    if (mine !== latest.current) return;

    setResults(data?.members ?? []);
    setSearching(false);
  }, []);

  /*
   * The chosen person is kept in the list.
   *
   * The picker draws its label from `options`, so a selection would
   * blank itself the moment the next search replaced them.
   */
  const chosen = results.find((member) => member.user_id === target) ?? null;
  const [held, setHeld] = useState<Member | null>(null);
  const selected = chosen ?? (held?.user_id === target ? held : null);

  const options: ComboboxOption[] = results.map((member) => ({
    value: member.user_id,
    label: member.name ?? member.email ?? "Unnamed",
    hint: [member.age ? String(member.age) : null, member.city]
      .filter(Boolean)
      .join(" · "),
    image: member.photo,
    tag: member.suspended ? "Suspended" : undefined,
  }));

  // The selection survives in the list even after the results change.
  if (selected && !options.some((option) => option.value === selected.user_id)) {
    options.unshift({
      value: selected.user_id,
      label: selected.name ?? selected.email ?? "Unnamed",
      hint: [selected.age ? String(selected.age) : null, selected.city]
        .filter(Boolean)
        .join(" · "),
      image: selected.photo,
      tag: selected.suspended ? "Suspended" : undefined,
    });
  }

  const send = useCallback(async () => {
    const recipient = target.trim();

    if (!recipient) {
      setError("Choose who it goes to.");
      return;
    }

    if (recipient === userId) {
      setError("Somebody cannot send themselves a Flare.");
      return;
    }

    const toName = selected?.name ?? selected?.email ?? "them";

    if (
      !(await confirm({
        title: `Send a Flare to ${toName}?`,
        body: `It goes out under ${
          memberName ?? "this member"
        }'s name and photo, and ${toName} is told straight away. It costs them nothing.`,
        confirmLabel: "Send it",
      }))
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    setSent(null);

    const { data, error } = await adminFetch<{ matched: boolean }>("/api/flares", {
      method: "POST",
      body: JSON.stringify({
        sender_id: userId,
        target_id: recipient,
        note: note.trim(),
      }),
    });

    if (error) {
      setError(error);
    } else {
      // Named, because the field is about to be empty again and "Sent."
      // alone leaves no record of who it went to.
      setSent(
        data?.matched
          ? `Sent to ${toName} — and they matched.`
          : `Sent to ${toName}.`,
      );
      setTarget("");
      setHeld(null);
      setNote("");
      setResults([]);
    }

    setBusy(false);
  }, [target, note, userId, memberName, selected, confirm]);

  return (
    <Card className="border-foreground/[0.06] bg-card">
      <CardHeader className="space-y-1">
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">
          Send a Flare
        </CardTitle>
        <p className="text-[0.82rem] text-muted-foreground">
          Goes out as {memberName ?? "this member"}, and costs them nothing.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        <Combobox
          value={target}
          onChange={(next) => {
            setTarget(next);
            setHeld(results.find((member) => member.user_id === next) ?? null);
            setError(null);
          }}
          options={options}
          onSearch={search}
          loading={searching}
          disabled={busy}
          placeholder="Search a name to send to"
          emptyLabel="No member by that name"
          searchingLabel="Looking…"
        />

        <Input
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
          placeholder="A line to send with it (optional)"
          disabled={busy}
        />

        <div className="flex items-center gap-3">
          <Button onClick={send} disabled={busy || !target}>
            {busy ? "Sending…" : "Send Flare"}
          </Button>

          {note.length > 0 && (
            <span className="tnum text-[0.78rem] text-muted-foreground">
              {note.length}/{MAX_NOTE}
            </span>
          )}
        </div>

        {error && <p className="text-[0.82rem] text-destructive">{error}</p>}
        {sent && <p className="text-[0.82rem] text-muted-foreground">{sent}</p>}
      </CardContent>
    </Card>
  );
}
