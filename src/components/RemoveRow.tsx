"use client";

import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

/**
 * Remove one row, from anywhere.
 *
 * Two clicks rather than a modal: the first arms it, the second does it,
 * and clicking anything else leaves it armed for a few seconds and then
 * forgets. A confirm dialog for a single like is more ceremony than the
 * action deserves, and ceremony people click through is not a safeguard.
 */
export function RemoveRow({
  table,
  id,
  label = "Remove",
  onDone,
}: {
  table: string;
  id: string;
  label?: string;
  onDone?: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const remove = useCallback(async () => {
    if (!armed) {
      setArmed(true);
      // Disarms on its own, so a page left open does not keep a loaded
      // button under the cursor.
      setTimeout(() => setArmed(false), 4000);
      return;
    }

    setBusy(true);

    const { error } = await adminFetch(
      `/api/moderate?table=${encodeURIComponent(table)}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );

    setBusy(false);
    setArmed(false);

    if (!error) onDone?.();
  }, [armed, table, id, onDone]);

  return (
    <Button
      variant={armed ? "destructive" :"ghost"}
      size="sm"
      disabled={busy}
      onClick={remove}
      title={label}
    >
      <Trash2 className="h-4 w-4" />
      {armed && <span className="ml-1 text-[0.86rem]">Sure?</span>}
    </Button>
  );
}
