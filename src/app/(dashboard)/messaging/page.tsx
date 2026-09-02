"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw } from "lucide-react";

/**
 * The messaging levers.
 *
 * Everything here changes what the app offers on its next launch, with
 * no build in between — which is the point of the spec calling these
 * "dynamically configured".
 *
 * There is no message content on this page, and no route that would
 * return any. A panel that can read disappearing messages has undone the
 * feature it is configuring.
 */

type Settings = {
  default_retention: string;
  save_price_min: number;
  save_price_max: number;
  save_sender_share: number;
  voice_max_seconds: number;
  edit_window: string;
};

type RetentionOption = {
  id: string;
  key: string;
  label: string;
  duration: string | null;
  view_budget: number | null;
  active: boolean;
};

type GlimpseOption = { id: string; ms: number; label: string; active: boolean };

type Payload = {
  settings: Settings;
  retention: RetentionOption[];
  glimpse: GlimpseOption[];
  volume: { total: number; byKind: Record<string, number>; saved: number };
  captures: number;
};

export default function MessagingPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newHours, setNewHours] = useState("");
  const [newViews, setNewViews] = useState("");
  const [newGlimpse, setNewGlimpse] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/messaging");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/messaging", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const add = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/messaging", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const retire = useCallback(
    async (entity: string, id: string) => {
      setBusy(true);

      const { error } = await adminFetch(
        `/api/messaging?entity=${entity}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const settings = data?.settings;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Messaging</h2>
          <p className="text-muted-foreground">
            Retention, Glimpses, saving prices. No message content is readable here.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-4">
          <Stat label="Messages" value={data.volume.total} />
          <Stat label="Saved with Roses" value={data.volume.saved} />
          <Stat label="Voice notes" value={data.volume.byKind.voice ?? 0} />
          <Stat label="Capture alerts" value={data.captures} />
        </div>
      )}

      {settings && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Limits</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Save price floor"
              hint="Roses. The lowest a sender may charge."
              value={settings.save_price_min}
              onCommit={(value) => patch({ save_price_min: value })}
              disabled={busy}
            />
            <Field
              label="Save price ceiling"
              hint="The highest. Senders pick inside this range."
              value={settings.save_price_max}
              onCommit={(value) => patch({ save_price_max: value })}
              disabled={busy}
            />
            <Field
              label="Sender's share"
              hint="Percent of a save that goes to the sender."
              value={settings.save_sender_share}
              onCommit={(value) => patch({ save_sender_share: value })}
              disabled={busy}
            />
            <Field
              label="Voice note length"
              hint="Seconds. Spec suggests 60–120."
              value={settings.voice_max_seconds}
              onCommit={(value) => patch({ voice_max_seconds: value })}
              disabled={busy}
            />
            <Field
              label="Edit window"
              hint="Minutes a text message stays editable."
              value={minutesOf(settings.edit_window)}
              onCommit={(value) => patch({ edit_window_minutes: value })}
              disabled={busy}
            />

            <div className="space-y-1">
              <label className="text-sm font-medium">Default retention</label>
              <select
                value={settings.default_retention}
                onChange={(event) => patch({ default_retention: event.target.value })}
                disabled={busy}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {(data?.retention ?? [])
                  .filter((option) => option.active)
                  .map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-muted-foreground">
                What a message gets when the sender does not choose.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Retention options</CardTitle>
          <p className="text-sm text-muted-foreground">
            Each is either a duration or a view budget — never both.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(data?.retention ?? []).map((option) => (
              <div
                key={option.id}
                className={
                  option.active
                    ? "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                    : "flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground line-through"
                }
              >
                <span>{option.label}</span>
                <Badge variant="secondary" className="text-xs">
                  {option.view_budget != null ? `${option.view_budget} view` : "timed"}
                </Badge>
                {option.active && (
                  <button
                    type="button"
                    onClick={() => retire("retention", option.id)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Input
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
              placeholder="key (e.g. 3d)"
              className="h-8 w-32"
            />
            <Input
              value={newLabel}
              onChange={(event) => setNewLabel(event.target.value)}
              placeholder="Label"
              className="h-8 w-36"
            />
            <Input
              value={newHours}
              onChange={(event) => {
                setNewHours(event.target.value);
                if (event.target.value) setNewViews("");
              }}
              placeholder="hours"
              type="number"
              className="h-8 w-24"
            />
            <span className="self-center text-xs text-muted-foreground">or</span>
            <Input
              value={newViews}
              onChange={(event) => {
                setNewViews(event.target.value);
                if (event.target.value) setNewHours("");
              }}
              placeholder="views"
              type="number"
              className="h-8 w-24"
            />
            <Button
              size="sm"
              disabled={busy || !newKey.trim() || !newLabel.trim() || (!newHours && !newViews)}
              onClick={() => {
                add({
                  entity: "retention",
                  key: newKey.trim(),
                  label: newLabel.trim(),
                  hours: newHours ? Number(newHours) : null,
                  views: newViews ? Number(newViews) : null,
                });
                setNewKey("");
                setNewLabel("");
                setNewHours("");
                setNewViews("");
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Glimpse durations</CardTitle>
          <p className="text-sm text-muted-foreground">
            Milliseconds. A Glimpse is a glance, not a short video.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(data?.glimpse ?? []).map((option) => (
              <div
                key={option.id}
                className={
                  option.active
                    ? "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                    : "flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground line-through"
                }
              >
                <span>{option.label}</span>
                {option.active && (
                  <button
                    type="button"
                    onClick={() => retire("glimpse", option.id)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              value={newGlimpse}
              onChange={(event) => setNewGlimpse(event.target.value)}
              placeholder="milliseconds"
              type="number"
              className="h-8 w-36"
            />
            <Button
              size="sm"
              disabled={busy || !newGlimpse}
              onClick={() => {
                add({ entity: "glimpse", ms: Number(newGlimpse) });
                setNewGlimpse("");
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-bold">{value.toLocaleString()}</CardContent>
    </Card>
  );
}

/** Commits on blur rather than per keystroke, so a half-typed number never saves. */
function Field({
  label,
  hint,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  hint: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <Input
        type="number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        className="h-9"
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/** Postgres hands intervals back as "00:10:00". Only minutes matter here. */
function minutesOf(interval: string): number {
  const match = /^(\d+):(\d+):/.exec(interval ?? "");
  if (!match) return 10;
  return Number(match[1]) * 60 + Number(match[2]);
}
