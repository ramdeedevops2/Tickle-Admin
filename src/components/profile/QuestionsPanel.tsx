"use client";
import { useCallback, useMemo, useState } from "react";
import { PagedList } from "@/components/ui/paged-list";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/select";
import {
  Pagination,
  paginate,
  usePagination,
} from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * Every question the app asks, and every answer it offers.
 *
 * Live: what is saved here is what the next person to open the app sees,
 * with no build in between. Phones cache the registry, so a change reaches
 * an app already running on its next launch.
 *
 * Two things are deliberately absent. Nothing deletes — retiring hides a
 * field or an option from the picker and leaves it on every profile that
 * already chose it. And no field can be created here: `key` is a column in
 * `profiles`, so a genuinely new field is a migration.
 */

type Group = {
  id: string;
  key: string;
  title: string;
  hint: string | null;
  sort_order: number;
  active: boolean;
};
type Field = {
  id: string;
  key: string;
  group_key: string;
  label: string;
  hint: string | null;
  kind: string;
  placeholder: string | null;
  max_choices: number | null;
  always_visible: boolean;
  sort_order: number;
  active: boolean;
};
type Option = {
  id: string;
  field_key: string;
  value: string;
  sort_order: number;
  active: boolean;
};
type Prompt = {
  id: string;
  question: string;
  kind: string;
  sort_order: number;
  active: boolean;
};

type Payload = {
  groups: Group[];
  fields: Field[];
  options: Option[];
  prompts: Prompt[];
};

export function QuestionsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"fields" | "prompts">("fields");

  const [newOption, setNewOption] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [promptKind, setPromptKind] = useState<"text" | "voice">("text");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/fields");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const patch = useCallback(
    async (entity: string, id: string, update: Record<string, unknown>) => {
      setBusy(id);

      const { error } = await adminFetch("/api/fields", {
        method: "PATCH",
        body: JSON.stringify({ entity, id, ...update }),
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load],
  );

  const add = useCallback(
    async (entity: string, payload: Record<string, unknown>) => {
      setBusy("new");

      const { error } = await adminFetch("/api/fields", {
        method: "POST",
        body: JSON.stringify({ entity, ...payload }),
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load],
  );

  const optionsByField = useMemo(() => {
    const map: Record<string, Option[]> = {};
    for (const option of data?.options ?? []) {
      (map[option.field_key] ??= []).push(option);
    }
    return map;
  }, [data]);

  const activePrompts = (data?.prompts ?? []).filter(
    (row) => row.active,
  ).length;

  const promptRows = data?.prompts ?? [];

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(promptRows.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant={tab === "fields" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("fields")}
          >
            Fields
          </Button>
          <Button
            variant={tab === "prompts" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("prompts")}
          >
            Prompts ({activePrompts})
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={load}
            disabled={loading}
          >
            <RefreshCw
              className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-[0.92rem] text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {tab === "fields" &&
        (data?.groups ?? []).map((group) => {
          const fields = (data?.fields ?? []).filter(
            (field) => field.group_key === group.key,
          );

          return (
            <Card key={group.id}>
              <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
                <div className="flex-1">
                  <Input
                    defaultValue={group.title}
                    onBlur={(event) => {
                      if (event.target.value !== group.title) {
                        patch("group", group.id, { title: event.target.value });
                      }
                    }}
                    className="h-8 max-w-xs px-2 text-base font-semibold"
                  />
                </div>
                <Button
                  variant={group.active ? "outline" : "default"}
                  size="sm"
                  disabled={busy === group.id}
                  onClick={() =>
                    patch("group", group.id, { active: !group.active })
                  }
                >
                  {group.active ? "Hide group" : "Show group"}
                </Button>
              </CardHeader>

              <CardContent className="space-y-2">
                {fields.map((field) => {
                  const options = optionsByField[field.key] ?? [];
                  const expanded = open === field.id;
                  const choosable =
                    field.kind === "choice" || field.kind === "multi";

                  return (
                    <div key={field.id} className="rounded-lg border">
                      <div className="flex items-center gap-3 p-3">
                        {choosable ? (
                          <button
                            type="button"
                            onClick={() => setOpen(expanded ? null : field.id)}
                            className="text-muted-foreground"
                          >
                            {expanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        ) : (
                          <span className="w-4" />
                        )}

                        <Input
                          defaultValue={field.label}
                          onBlur={(event) => {
                            if (event.target.value !== field.label) {
                              patch("field", field.id, {
                                label: event.target.value,
                              });
                            }
                          }}
                          className="h-8 max-w-[200px]"
                        />

                        {/* The column, shown but never editable — it is what
                            the answer is saved into. */}
                        <code className="text-[1rem] leading-relaxed text-muted-foreground">
                          {field.key}
                        </code>

                        <Badge variant="secondary">{field.kind}</Badge>

                        {choosable && (
                          <span className="text-[1rem] leading-relaxed text-muted-foreground">
                            {options.filter((option) => option.active).length}{" "}
                            options
                          </span>
                        )}

                        {field.kind === "multi" && (
                          <div className="flex items-center gap-1">
                            <span className="text-[1rem] leading-relaxed text-muted-foreground">
                              max
                            </span>
                            <Input
                              type="number"
                              min={1}
                              max={50}
                              defaultValue={field.max_choices ?? ""}
                              onBlur={(event) => {
                                const raw = event.target.value;
                                const next = raw === "" ? null : Number(raw);
                                if (next !== field.max_choices) {
                                  patch("field", field.id, {
                                    max_choices: next,
                                  });
                                }
                              }}
                              className="h-8 w-16"
                            />
                          </div>
                        )}

                        <Button
                          variant={field.active ? "ghost" : "default"}
                          size="sm"
                          className="ml-auto"
                          disabled={busy === field.id}
                          onClick={() =>
                            patch("field", field.id, { active: !field.active })
                          }
                        >
                          {field.active ? "Hide" : "Show"}
                        </Button>
                      </div>

                      {expanded && (
                        <div className="space-y-2 border-t bg-muted/30 p-3">
                          <div className="flex flex-wrap gap-2">
                            <PagedList
                              items={options}
                              perPage={24}
                              className="flex flex-wrap gap-2"
                            >
                              {(option) => (
                                <button
                                  key={option.id}
                                  type="button"
                                  disabled={busy === option.id}
                                  onClick={() =>
                                    patch("option", option.id, {
                                      active: !option.active,
                                    })
                                  }
                                  title={
                                    option.active
                                      ? "Retire this option"
                                      : "Bring it back"
                                  }
                                  className={
                                    option.active
                                      ? "rounded-full border bg-background px-3 py-1 text-[0.86rem]"
                                      : "rounded-full border border-dashed px-3 py-1 text-[0.86rem] text-muted-foreground line-through"
                                  }
                                >
                                  {option.value}
                                </button>
                              )}
                            </PagedList>
                          </div>

                          <div className="flex gap-2">
                            <Input
                              value={open === field.id ? newOption : ""}
                              onChange={(event) =>
                                setNewOption(event.target.value)
                              }
                              placeholder="Add an option"
                              className="h-8 max-w-xs"
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && newOption.trim()) {
                                  add("option", {
                                    field_key: field.key,
                                    value: newOption.trim(),
                                  });
                                  setNewOption("");
                                }
                              }}
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!newOption.trim() || busy === "new"}
                              onClick={() => {
                                add("option", {
                                  field_key: field.key,
                                  value: newOption.trim(),
                                });
                                setNewOption("");
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {fields.length === 0 && (
                  <p className="py-4 text-center text-[0.92rem] text-muted-foreground">
                    No fields in this group.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}

      {tab === "prompts" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prompt questions</CardTitle>
            <p className="text-[0.92rem] text-muted-foreground">
              Written and spoken are kept apart. They do not work the same.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select
                value={promptKind}
                onChange={(next) => setPromptKind(next as "text" | "voice")}
                options={[
                  { value: "text", label: "Written" },
                  { value: "voice", label: "Voice" },
                ]}
                className="w-[9rem]"
              />
              <Input
                value={newPrompt}
                onChange={(event) => setNewPrompt(event.target.value)}
                placeholder="Ask something…"
                className="flex-1"
              />
              <Button
                disabled={newPrompt.trim().length < 5 || busy === "new"}
                onClick={() => {
                  add("prompt", {
                    question: newPrompt.trim(),
                    kind: promptKind,
                  });
                  setNewPrompt("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="space-y-1">
              <>
                {paginate(promptRows, page).map((prompt) => (
                  <div
                    key={prompt.id}
                    className="flex items-center gap-3 rounded-lg border p-2"
                  >
                    <Badge
                      variant={
                        prompt.kind === "voice" ? "default" : "secondary"
                      }
                    >
                      {prompt.kind === "voice" ? "Voice" : "Written"}
                    </Badge>

                    <Input
                      defaultValue={prompt.question}
                      onBlur={(event) => {
                        if (event.target.value !== prompt.question) {
                          patch("prompt", prompt.id, {
                            question: event.target.value,
                          });
                        }
                      }}
                      className={
                        prompt.active
                          ? "h-8 flex-1 border-transparent hover:border-input"
                          : "h-8 flex-1 border-transparent text-muted-foreground line-through hover:border-input"
                      }
                    />

                    <Button
                      variant={prompt.active ? "ghost" : "default"}
                      size="sm"
                      disabled={busy === prompt.id}
                      onClick={() =>
                        patch("prompt", prompt.id, { active: !prompt.active })
                      }
                    >
                      {prompt.active ? "Retire" : "Restore"}
                    </Button>
                  </div>
                ))}
                <Pagination
                  page={page}
                  total={promptRows.length}
                  onPage={setPage}
                />
              </>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
