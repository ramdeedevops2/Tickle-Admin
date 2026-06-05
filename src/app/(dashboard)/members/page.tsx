"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, RefreshCw } from "lucide-react";
import Link from "next/link";

type ProfileRow = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
  bio: string | null;
  age: number | null;
  gender: string | null;
  created_at: string;
  search_radius: number | null;
  latitude: number | null;
  longitude: number | null;
  is_online: boolean | null;
  last_active: string | null;
  interested_in: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
}

function getInitials(value: string | null) {
  const source = value?.trim() || "US";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function MembersPage() {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("profiles")
      .select(
        "id, user_id, name, email, photos, bio, age, gender, created_at, search_radius, latitude, longitude, is_online, last_active, interested_in",
      )
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setMembers([]);
    } else {
      setMembers((data ?? []) as ProfileRow[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadMembers);
  }, [loadMembers]);

  const stats = useMemo(() => {
    const online = members.filter((member) => member.is_online).length;
    const withLocation = members.filter(
      (member) => member.latitude != null && member.longitude != null,
    ).length;

    return {
      total: members.length,
      online,
      withLocation,
    };
  }, [members]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Members</h2>
          <p className="text-muted-foreground">
            Profiles from the public.profiles table.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadMembers}
          className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
          disabled={loading}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Profiles
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.total}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Online
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.online}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              With Location
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.withLocation}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border border-border/50 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead>Profile</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Interested In</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading members...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-destructive"
                >
                  {error}
                </TableCell>
              </TableRow>
            ) : members.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No members found.
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow
                  key={member.id}
                  className="cursor-pointer border-border/50 hover:bg-muted/40"
                >
                  <TableCell>
                    <Link
                      href={`/members/${member.user_id}`}
                      className="flex items-center gap-3"
                    >
                      <Avatar className="h-10 w-10 border border-border">
                        <AvatarImage src={member.photos?.[0] || ""} />
                        <AvatarFallback className="bg-muted text-muted-foreground">
                          {getInitials(member.name || member.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="space-y-1">
                        <div className="font-medium">
                          {member.name || "Unknown"}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {member.email || member.user_id}
                        </div>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell>{member.age ?? "-"}</TableCell>
                  <TableCell className="capitalize">
                    {member.gender || "-"}
                  </TableCell>
                  <TableCell className="capitalize">
                    {member.interested_in || "everyone"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={member.is_online ? "default" : "secondary"}
                      className={
                        member.is_online
                          ? "bg-primary text-primary-foreground hover:bg-primary/80"
                          : ""
                      }
                    >
                      {member.is_online ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <Link
                      href={`/members/${member.user_id}`}
                      className="flex items-center justify-end gap-3"
                    >
                      <span>{formatDate(member.created_at)}</span>
                      <Eye className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
