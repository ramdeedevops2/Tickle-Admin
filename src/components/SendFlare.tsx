"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 */

const MAX_NOTE = 160;

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

  const send = useCallback(async () => {
    const recipient = target.trim();

    if (!recipient) {
      setError("Paste the recipient's user id.");
      return;
    }

    if (recipient === userId) {
      setError("Somebody cannot send themselves a Flare.");
      return;
    }

    if (
      !(await confirm({
        title: "Send a Flare on their behalf?",
        body: `It goes out under ${
          memberName ?? "this member"
        }'s name and photo, and the recipient is told straight away. It costs them nothing.`,
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
      setTarget("");
      setNote("");
      // A Flare never creates a match on its own — but where the other
      // person had already liked this member, one lands now, and that is
      // worth saying rather than leaving to be discovered.
      setSent(data?.matched ? "Sent — and they matched." : "Sent.");
    }

    setBusy(false);
  }, [target, note, userId, memberName, confirm]);

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
        <Input
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          placeholder="Recipient's user id"
          disabled={busy}
        />

        <Input
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, MAX_NOTE))}
          placeholder="A line to send with it (optional)"
          disabled={busy}
        />

        <div className="flex items-center gap-3">
          <Button onClick={send} disabled={busy}>
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
