"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw, ShieldAlert } from "lucide-react";

/**
 * Scam patterns and blocked domains.
 *
 * The continue rate is the most important column here. A rule that fires
 * often and is almost always dismissed is not protecting anyone — it is
 * spending the credibility of every other warning, and the honest
 * response is to retire it.
 *
 * No message text appears on this page, and no route returns any.
 */

type Rule = {
  id: string;
  category: string;
  pattern: string;
  label: string;
  weight: number;
  active: boolean;
};

type Domain = { id: string; domain: string; reason: string; active: boolean };

type Performance = Record<
  string,
  { flagged: number; continued: number; reported: number; blocked: number }
>;

type Payload = {
  rules: Rule[];
  domains: Domain[];
  performance: Performance;
  categories: string[];
  reasons: string[];
  totalFlags: number;
};

export default function SafetyRulesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"rules" | "domains">("rules");

  const [newCategory, setNewCategory] = useState("money");
  const [newPattern, setNewPattern] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newWeight, setNewWeight] = useState("2");
  const [newDomain, setNewDomain] = useState("");
  const [newReason, setNewReason] = useState("shortener");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/safety");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const add = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/safety", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const toggle = useCallback(
    async (entity: string, id: string, active: boolean) => {
      setBusy(true);

      const { error } = await adminFetch("/api/safety", {
        method: "PATCH",
        body: JSON.stringify({ entity, id, active }),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const byCategory = (data?.rules ?? []).reduce<Record<string, Rule[]>>((acc, rule) => {
    (acc[rule.category] ??= []).push(rule);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Safety rules</h2>
          <p className="text-muted-foreground">
            Scam patterns and blocked domains. {data?.totalFlags ?? 0} warnings shown.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={tab === "rules" ? "default" : "outline"} size="sm" onClick={() => setTab("rules")}>
            Patterns
          </Button>
          <Button variant={tab === "domains" ? "default" : "outline"} size="sm" onClick={() => setTab("domains")}>
            Domains
          </Button>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {tab === "rules" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add a pattern</CardTitle>
              <p className="text-sm text-muted-foreground">
                A case-insensitive regular expression. Weight 3 warns on its own; 1 needs company.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <select
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {(data?.categories ?? []).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <Input
                value={newPattern}
                onChange={(event) => setNewPattern(event.target.value)}
                placeholder="regex pattern"
                className="min-w-[240px] flex-1 font-mono text-xs"
              />
              <Input
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                placeholder="What it catches"
                className="min-w-[180px] flex-1"
              />
              <select
                value={newWeight}
                onChange={(event) => setNewWeight(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                <option value="1">Weight 1</option>
                <option value="2">Weight 2</option>
                <option value="3">Weight 3</option>
              </select>
              <Button
                disabled={busy || newPattern.length < 3 || newLabel.length < 3}
                onClick={() => {
                  add({
                    entity: "rule",
                    category: newCategory,
                    pattern: newPattern,
                    label: newLabel,
                    weight: Number(newWeight),
                  });
                  setNewPattern("");
                  setNewLabel("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </CardContent>
          </Card>

          {Object.entries(byCategory).map(([category, rules]) => {
            const stats = data?.performance[category];
            // Only meaningful once a handful of people have answered.
            const answered = stats
              ? stats.continued + stats.reported + stats.blocked
              : 0;
            const continueRate =
              answered >= 5 ? Math.round((stats!.continued / answered) * 100) : null;

            return (
              <Card key={category}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base capitalize">{category}</CardTitle>

                  <div className="flex items-center gap-3 text-sm">
                    {stats && (
                      <span className="text-muted-foreground">
                        {stats.flagged} shown · {stats.reported + stats.blocked} acted on
                      </span>
                    )}
                    {/* Above 80% dismissed is the point at which a rule is
                        costing more trust than it earns. */}
                    {continueRate !== null && (
                      <Badge variant={continueRate > 80 ? "destructive" : "secondary"}>
                        {continueRate}% dismissed
                      </Badge>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-1">
                  {continueRate !== null && continueRate > 80 && (
                    <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <span>
                        Almost everyone dismisses these. A warning people ignore makes every
                        other warning easier to ignore too — consider retiring the noisiest
                        pattern here.
                      </span>
                    </div>
                  )}

                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center gap-3 rounded-md border p-2">
                      <Badge variant="outline">{rule.weight}</Badge>

                      <div className="min-w-0 flex-1">
                        <div
                          className={
                            rule.active ? "text-sm font-medium" : "text-sm font-medium line-through opacity-50"
                          }
                        >
                          {rule.label}
                        </div>
                        <code className="block truncate text-xs text-muted-foreground">
                          {rule.pattern}
                        </code>
                      </div>

                      <Button
                        variant={rule.active ? "ghost" : "default"}
                        size="sm"
                        disabled={busy}
                        onClick={() => toggle("rule", rule.id, !rule.active)}
                      >
                        {rule.active ? "Retire" : "Restore"}
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {tab === "domains" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blocked domains</CardTitle>
            <p className="text-sm text-muted-foreground">
              Shorteners are listed because they hide the destination, which is the whole
              technique — not because the host is malicious.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                value={newDomain}
                onChange={(event) => setNewDomain(event.target.value)}
                placeholder="example.com"
                className="max-w-xs"
              />
              <select
                value={newReason}
                onChange={(event) => setNewReason(event.target.value)}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {(data?.reasons ?? []).map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
              <Button
                disabled={busy || !newDomain.includes(".")}
                onClick={() => {
                  add({ entity: "domain", domain: newDomain, reason: newReason });
                  setNewDomain("");
                }}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(data?.domains ?? []).map((entry) => (
                <div
                  key={entry.id}
                  className={
                    entry.active
                      ? "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm"
                      : "flex items-center gap-2 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground line-through"
                  }
                >
                  <span className="font-mono text-xs">{entry.domain}</span>
                  <Badge variant="secondary" className="text-xs">
                    {entry.reason}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => toggle("domain", entry.id, !entry.active)}
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {entry.active ? "×" : "+"}
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
