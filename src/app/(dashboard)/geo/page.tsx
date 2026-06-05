"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, RefreshCw } from "lucide-react";

type ProfileLocationRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  search_radius: number | null;
  is_online: boolean | null;
  last_active: string | null;
};

type EncounterRow = {
  user_id: string | null;
  encountered_user_id: string | null;
  created_at: string | null;
};

function formatDateTime(value: string | null) {
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

function formatCoordinate(value: number | null) {
  return value == null ? "-" : value.toFixed(5);
}

export default function GeoPage() {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<ProfileLocationRow[]>([]);
  const [encounters, setEncounters] = useState<EncounterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadGeo = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [{ data: profileData, error: profileError }, { data: encounterData }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, user_id, name, email, latitude, longitude, search_radius, is_online, last_active",
          )
          .not("latitude", "is", null)
          .not("longitude", "is", null)
          .order("last_active", { ascending: false })
          .limit(100),
        supabase
          .from("nearby_encounters")
          .select("user_id, encountered_user_id, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

    if (profileError) {
      setError(profileError.message);
      setProfiles([]);
      setEncounters([]);
    } else {
      setProfiles((profileData ?? []) as ProfileLocationRow[]);
      setEncounters((encounterData ?? []) as EncounterRow[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadGeo);
  }, [loadGeo]);

  const stats = useMemo(() => {
    const active = profiles.filter((profile) => profile.is_online).length;
    const uniqueEncounterUsers = new Set(
      encounters.flatMap((encounter) =>
        [encounter.user_id, encounter.encountered_user_id].filter(Boolean),
      ),
    ).size;

    return {
      located: profiles.length,
      active,
      encounters: encounters.length,
      uniqueEncounterUsers,
    };
  }, [profiles, encounters]);

  const topEncountered = useMemo(() => {
    const counts = new Map<string, number>();
    for (const encounter of encounters) {
      if (!encounter.user_id) continue;
      counts.set(encounter.user_id, (counts.get(encounter.user_id) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [encounters]);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter">
            Geo
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Profile locations and nearby encounters
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadGeo}
          disabled={loading}
          className="h-12 rounded-none border-border/50 px-8 text-xs font-bold uppercase tracking-[0.2em]"
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Located Profiles
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.located}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Online Nearby
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.active}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Encounters
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.encounters}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Encountered Users
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.uniqueEncounterUsers}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="relative min-h-[560px] overflow-hidden border border-border/50 bg-black">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:16px_16px]" />
          <div className="relative z-10 h-full p-6">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Loading locations...
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center text-sm text-destructive">
                {error}
              </div>
            ) : profiles.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No profile coordinates found.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className="border border-border/50 bg-background/80 p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium">
                          {profile.name || profile.email || profile.user_id}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {formatCoordinate(profile.latitude)},{" "}
                          {formatCoordinate(profile.longitude)}
                        </div>
                      </div>
                      <Badge variant={profile.is_online ? "default" : "secondary"}>
                        {profile.is_online ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{profile.search_radius ?? 10} km radius</span>
                      <span>{formatDateTime(profile.last_active)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border border-border/50 p-6">
          <h2 className="mb-6 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Top Encounter Sources
          </h2>

          <div className="space-y-5">
            {topEncountered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No nearby encounters found.
              </div>
            ) : (
              topEncountered.map(([userId, count]) => {
                const percentage = Math.max(
                  8,
                  Math.round((count / topEncountered[0][1]) * 100),
                );

                return (
                  <div key={userId} className="space-y-2">
                    <div className="flex justify-between gap-3 text-xs font-mono">
                      <span className="truncate text-foreground">
                        <MapPin className="mr-1 inline size-3" />
                        {userId}
                      </span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <div className="h-1 w-full bg-border/30">
                      <div
                        className="h-full bg-foreground"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
