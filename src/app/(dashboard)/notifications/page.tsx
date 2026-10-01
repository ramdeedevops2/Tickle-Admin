"use client";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bell, BellOff, RefreshCw, Smartphone } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { StatStrip } from "@/components/ui/stat-strip";
import { SkeletonCard, SkeletonStats } from "@/components/ui/skeleton";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import {
  EmptyState,
  Explainer,
  PageHeader,
  Section,
  SettingList,
  SettingRow,
} from "@/components/ui/page";
import { useToast } from "@/components/ui/toast";

/*
 * Notifications.
 *
 * Everything the app tells somebody about, in one place: what each kind
 * of message does by default, who has turned it off, which phones can
 * be reached, and what has actually gone out.
 *
 * The kinds themselves are rows in the database, not a list in here, so
 * adding one on the server makes it appear on this screen without a
 * change to the panel.
 */

type Mode = "smart" | "express" | "off";

type Category = {
  key: string;
  label: string;
  default_mode: Mode;
  critical: boolean;
  sort_order: number;
  muted_by: number;
  changed_by: number;
  sent_week: number;
};

type Device = {
  token: string;
  who: string;
  platform: string;
  device_name: string;
  created_at: string;
  invalid_at: string | null;
};

type Recent = {
  id: string;
  who: string;
  type: string;
  category: string | null;
  title: string;
  read: boolean;
  created_at: string;
  pushed_at: string | null;
};

type Wording = {
  kind: string;
  label: string;
  title: string;
  body: string;
  active: boolean;
  variables: string[];
  note: string;
};

type Payload = {
  pushReady: boolean;
  wordingReady: boolean;
  wording: Wording[];
  categories: Category[];
  devices: Device[];
  recent: Recent[];
  totals: {
    live_devices: number;
    retired_devices: number;
    android: number;
    ios: number;
    sent_week: number;
    waiting: number;
    opened_week: number;
  };
};

/*
 * What each setting does, said the way the person running this would
 * say it. "smart" and "express" are the words in the database and mean
 * nothing to anybody who has not read it.
 */
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "express", label: "Send right away" },
  { value: "smart", label: "Save up and send together" },
  { value: "off", label: "Do not send" },
];

type Tab = "kinds" | "wording" | "phones" | "sent";

const TABS: { value: Tab; label: string }[] = [
  { value: "kinds", label: "What gets sent" },
  { value: "wording", label: "What it says" },
  { value: "phones", label: "Phones" },
  { value: "sent", label: "Recently sent" },
];

function when(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function phoneKind(platform: string) {
  if (platform === "android") return "Android";
  if (platform === "ios") return "iPhone";
  if (platform === "web") return "Web";
  return "Unknown";
}

export default function NotificationsPage() {
  const searchParams = useSearchParams();
  const toast = useToast();

  const [tab, setTab] = useState<Tab>(() => {
    const asked = searchParams.get("tab");
    return asked === "phones" || asked === "sent" || asked === "wording" ? asked : "kinds";
  });

  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: payload, error } = await adminFetch<Payload>("/api/notifications");
    if (error) toast.error({ title: "Could not load notifications", body: error });
    else setData(payload);
    setLoading(false);
  }, [toast]);

  useLoadOnMount(load);

  /*
   * Saved one field at a time, against the row it belongs to.
   *
   * The alternative — an edit buffer and a Save button — means a screen
   * that can be left in a state that looks saved and is not. These are
   * single switches and single choices; each one is its own decision.
   */
  const save = useCallback(
    async (key: string, change: Partial<Category>) => {
      setSaving(key);

      const { error } = await adminFetch("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ key, ...change }),
      });

      setSaving(null);

      if (error) {
        toast.error({ title: "Not saved", body: error });
        // Reloaded on failure, so the control goes back to what the
        // database actually holds rather than showing the rejected value.
        void load();
        return;
      }

      setData((current) =>
        current
          ? {
              ...current,
              categories: current.categories.map((category) =>
                category.key === key ? { ...category, ...change } : category,
              ),
            }
          : current,
      );
    },
    [toast, load],
  );

  const [query, setQuery] = useState("");

  const categories = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = data?.categories ?? [];
    return needle
      ? rows.filter((row) => row.label.toLowerCase().includes(needle))
      : rows;
  }, [data, query]);

  const devices = data?.devices ?? [];
  const { page: devicePage, setPage: setDevicePage } = usePagination(devices.length);

  const totals = data?.totals;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="What the app tells members about, which phones it can reach, and what has gone out lately."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={TABS} />
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : undefined} />
              Refresh
            </Button>
          </>
        }
      />

      {/*
        Said once, at the top, because every control below it depends on
        understanding this one thing: these are defaults, and a member's
        own choice beats them.
      */}
      <Explainer>
        These are the settings everyone starts with. Anyone who changes a setting for
        themselves keeps their own choice — the only exception is a kind marked
        &ldquo;always send&rdquo;, which reaches everyone no matter what they picked.
      </Explainer>

      {loading && !data ? (
        <>
          <SkeletonStats />
          <SkeletonCard lines={6} />
        </>
      ) : (
        <>
          {totals && (
            <StatStrip
              stats={[
                {
                  label: "Phones we can reach",
                  value: data?.pushReady ? totals.live_devices : "Not set up",
                  icon: Smartphone,
                },
                { label: "Sent in the last week", value: totals.sent_week, icon: Bell },
                {
                  label: "Opened in the last week",
                  value: totals.opened_week,
                  tone: "success",
                },
                {
                  label: "Kinds switched off by someone",
                  value: (data?.categories ?? []).filter((c) => c.muted_by > 0).length,
                  icon: BellOff,
                  tone: (data?.categories ?? []).some((c) => c.muted_by > 0)
                    ? "warning"
                    : "neutral",
                },
              ]}
            />
          )}

          {tab === "kinds" && (
            <Section
              title="What gets sent"
              hint="One row for each kind of thing the app can tell someone about. Changing a row changes it for everyone who has not picked their own setting."
              actions={
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Find a kind"
                  className="w-56"
                />
              }
            >
              {categories.length === 0 ? (
                <EmptyState
                  title="Nothing here"
                  body={
                    query
                      ? "No kind of notification matches what you typed."
                      : "No kinds of notification have been set up yet."
                  }
                />
              ) : (
                <SettingList>
                  {categories.map((category) => (
                    <SettingRow
                      key={category.key}
                      label={category.label}
                      hint={[
                        category.sent_week === 1
                          ? "Sent once this week"
                          : `Sent ${category.sent_week} times this week`,
                        category.muted_by > 0
                          ? `${category.muted_by} ${
                              category.muted_by === 1 ? "person has" : "people have"
                            } switched this off`
                          : "Nobody has switched this off",
                      ].join(" · ")}
                      control={
                        <>
                          <Select
                            value={category.default_mode}
                            onChange={(value) =>
                              void save(category.key, { default_mode: value as Mode })
                            }
                            options={MODE_OPTIONS}
                            disabled={saving === category.key}
                            align="end"
                            className="w-60"
                          />
                          <label className="flex items-center gap-2 text-[0.86rem] text-muted-foreground">
                            Always send
                            <Switch
                              checked={category.critical}
                              onCheckedChange={(checked) =>
                                void save(category.key, { critical: checked })
                              }
                              disabled={saving === category.key}
                            />
                          </label>
                        </>
                      }
                    />
                  ))}
                </SettingList>
              )}
            </Section>
          )}

          {tab === "wording" && (
            <Section
              title="What it says"
              hint="The exact heading and line of text a member sees on their phone. Words in curly brackets are filled in when it is sent."
            >
              {!data?.wordingReady ? (
                <EmptyState
                  title="Not set up yet"
                  body="The wording has not been moved into the database on this server. Run the notification wording change and it will appear here."
                />
              ) : (data?.wording ?? []).length === 0 ? (
                <EmptyState
                  title="Nothing to edit"
                  body="No notification wording has been set up."
                />
              ) : (
                <div className="divide-y divide-foreground/[0.06]">
                  {(data?.wording ?? []).map((row) => (
                    <WordingEditor
                      key={row.kind}
                      row={row}
                      onSaved={load}
                    />
                  ))}
                </div>
              )}
            </Section>
          )}

          {tab === "phones" && (
            <Section
              title="Phones"
              hint="Every phone signed in to an account that can receive notifications. A phone retires itself when someone signs out or removes the app."
            >
              {!data?.pushReady ? (
                /*
                 * The honest answer while push is being set up.
                 *
                 * The table this reads arrives with a database change
                 * that may not have been applied yet. An error here
                 * would say something is broken when nothing is.
                 */
                <EmptyState
                  title="Push notifications are not set up yet"
                  body="The app cannot send to phones until the last setup step is done. Everything else on this screen works in the meantime."
                />
              ) : devices.length === 0 ? (
                <EmptyState
                  title="No phones yet"
                  body="Nobody has opened the app on a phone that can receive notifications since this was switched on."
                />
              ) : (
                <>
                  <SettingList>
                    {paginate(devices, devicePage).map((device) => (
                      <SettingRow
                        key={device.token}
                        label={device.who}
                        hint={`${phoneKind(device.platform)}${
                          device.device_name ? ` · ${device.device_name}` : ""
                        } · added ${when(device.created_at)}`}
                        control={
                          <span
                            className={
                              device.invalid_at
                                ? "text-[0.86rem] text-muted-foreground"
                                : "text-[0.86rem] text-success"
                            }
                          >
                            {device.invalid_at ? "Retired" : "Can be reached"}
                          </span>
                        }
                      />
                    ))}
                  </SettingList>

                  <Pagination
                    page={devicePage}
                    total={devices.length}
                    onPage={setDevicePage}
                    className="mt-4"
                  />
                </>
              )}
            </Section>
          )}

          {tab === "sent" && (
            <Section
              title="Recently sent"
              hint="The last week, newest first. “Waiting” means it has been written down but has not reached a phone yet."
            >
              {(data?.recent ?? []).length === 0 ? (
                <EmptyState
                  title="Nothing sent this week"
                  body="No member has been told about anything in the last seven days."
                />
              ) : (
                <SettingList>
                  {(data?.recent ?? []).map((row) => (
                    <SettingRow
                      key={row.id}
                      label={row.title}
                      hint={`${row.who} · ${when(row.created_at)}`}
                      control={
                        <span className="text-[0.86rem] text-muted-foreground">
                          {row.read
                            ? "Opened"
                            : row.pushed_at
                              ? "Delivered"
                              : "Waiting"}
                        </span>
                      }
                    />
                  ))}
                </SettingList>
              )}
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/**
 * One notification's wording, edited in place.
 *
 * ── Why this one has a Save button ───────────────────────────
 *
 * Everything else on this screen saves the moment it changes, which is
 * right for a switch and a choice — each is one decision and there is
 * nothing half-made about it. Text is different: saving every keystroke
 * would send a request per letter and, worse, would briefly store half
 * a sentence as the thing the product says to people. So this holds a
 * draft and saves when asked.
 *
 * The draft is seeded from the row and reset after a save, so a failed
 * save leaves what was typed on screen to be corrected rather than
 * throwing it away.
 */
function WordingEditor({ row, onSaved }: { row: Wording; onSaved: () => void }) {
  const toast = useToast();

  const [title, setTitle] = useState(row.title);
  const [body, setBody] = useState(row.body);
  const [saving, setSaving] = useState(false);

  const dirty = title !== row.title || body !== row.body;

  const save = useCallback(async () => {
    setSaving(true);

    const { error } = await adminFetch("/api/notifications", {
      method: "PUT",
      body: JSON.stringify({ kind: row.kind, title, body }),
    });

    setSaving(false);

    if (error) {
      toast.error({ title: "Not saved", body: error });
      return;
    }

    toast.success({ title: "Saved", body: `${row.label} now reads the way you set it.` });
    onSaved();
  }, [row.kind, row.label, title, body, toast, onSaved]);

  const toggle = useCallback(
    async (active: boolean) => {
      const { error } = await adminFetch("/api/notifications", {
        method: "PUT",
        body: JSON.stringify({ kind: row.kind, active }),
      });

      if (error) toast.error({ title: "Not saved", body: error });
      onSaved();
    },
    [row.kind, toast, onSaved],
  );

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-xl">
          <p className="text-[0.92rem] font-medium">{row.label}</p>
          {row.note && (
            <p className="mt-0.5 text-[0.86rem] leading-relaxed text-muted-foreground">
              {row.note}
            </p>
          )}
        </div>

        <label className="flex shrink-0 items-center gap-2 text-[0.86rem] text-muted-foreground">
          Send this at all
          <Switch checked={row.active} onCheckedChange={(next) => void toggle(next)} />
        </label>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Heading">
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={!row.active || saving}
            maxLength={80}
          />
        </Field>

        <Field label="Line underneath">
          <Input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!row.active || saving}
            maxLength={200}
          />
        </Field>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.86rem] text-muted-foreground">
          {row.variables.length > 0
            ? `You can use ${row.variables.join(" and ")} — filled in when it is sent.`
            : "This one cannot use any filled-in words."}
        </p>

        {dirty && (
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save wording"}
          </Button>
        )}
      </div>
    </div>
  );
}
