"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Trash2, UserPlus } from "lucide-react";

type AdminProfile = {
  id: string;
  email: string;
  role: "admin";
  display_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  email: string;
  display_name: string;
};

const emptyForm: FormState = {
  email: "",
  display_name: "",
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

function getInitials(nameOrEmail: string) {
  const source = nameOrEmail.trim() || "AD";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function AccessPage() {
  const supabase = useMemo(() => createClient(), []);
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    setCurrentUserId(user?.id ?? null);

    const { data, error } = await supabase
      .from("admin_profiles")
      .select("id, email, role, display_name, avatar_url, created_at, updated_at")
      .eq("role", "admin")
      .order("updated_at", { ascending: false });

    if (error) {
      setError(error.message);
      setProfiles([]);
    } else {
      setProfiles((data ?? []) as AdminProfile[]);
    }

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void Promise.resolve().then(loadAdmins);
  }, [loadAdmins]);

  const summary = useMemo(
    () => ({
      total: profiles.length,
      newest: profiles[0]?.updated_at ?? null,
    }),
    [profiles],
  );

  const handleReset = () => {
    setForm(emptyForm);
    setSuccess(null);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    if (!form.email.trim() || !form.display_name.trim()) {
      setError("Email and display name are required.");
      setSaving(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("Your session expired. Sign in again.");
      setSaving(false);
      return;
    }

    const response = await fetch("/api/admins", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: form.email.trim(),
        display_name: form.display_name.trim(),
      }),
    });

    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to create admin.");
    } else {
      setSuccess("Admin created.");
      setForm(emptyForm);
      await loadAdmins();
    }

    setSaving(false);
  };

  const handleDelete = async (profile: AdminProfile) => {
    if (profile.id === currentUserId) {
      setError("You cannot delete your own admin access from this page.");
      setSuccess(null);
      return;
    }

    const confirmed = window.confirm(
      `Delete admin access for ${profile.email}?`,
    );
    if (!confirmed) return;

    setDeletingId(profile.id);
    setError(null);
    setSuccess(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("Your session expired. Sign in again.");
      setDeletingId(null);
      return;
    }

    const response = await fetch(
      `/api/admins?id=${encodeURIComponent(profile.id)}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      },
    );
    const result = (await response.json()) as { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to delete admin.");
    } else {
      setSuccess("Admin deleted.");
      await loadAdmins();
    }

    setDeletingId(null);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="mb-2 text-4xl font-black uppercase tracking-tighter">
            Access
          </h1>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Create and delete admins
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={loadAdmins}
          className="h-12 rounded-none border-border/50 px-8 text-xs font-bold uppercase tracking-[0.2em]"
          disabled={loading}
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Admins
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {summary.total}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last Updated
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-sm text-muted-foreground">
            {formatDateTime(summary.newest)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle>Create Admin</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="rounded-none border border-border/50 bg-transparent"
                  placeholder="admin@tickle.app"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-name">Display Name</Label>
                <Input
                  id="admin-name"
                  value={form.display_name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      display_name: event.target.value,
                    }))
                  }
                  className="rounded-none border border-border/50 bg-transparent"
                  placeholder="System Admin"
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-foreground">{success}</p>}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  className="flex-1 rounded-none bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={saving}
                >
                  <UserPlus className="mr-2 size-4" />
                  {saving ? "Creating..." : "Create Admin"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-none border-border/50"
                  onClick={handleReset}
                >
                  Reset
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="rounded-md border border-border/50 bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border/50 hover:bg-transparent">
                <TableHead>Admin</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    Loading admins...
                  </TableCell>
                </TableRow>
              ) : profiles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No admins found.
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((profile) => {
                  const name = profile.display_name || profile.email;
                  const initials = getInitials(name);
                  const isCurrentUser = profile.id === currentUserId;

                  return (
                    <TableRow key={profile.id} className="border-border/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 rounded-md border border-border">
                            <AvatarImage src={profile.avatar_url || ""} />
                            <AvatarFallback className="rounded-md bg-transparent text-muted-foreground">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div className="space-y-1">
                            <div className="font-medium">{name}</div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {profile.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-primary text-primary-foreground hover:bg-primary/80">
                          {isCurrentUser ? "current admin" : "admin"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatDateTime(profile.created_at)}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatDateTime(profile.updated_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(profile)}
                          className="rounded-none text-xs uppercase tracking-[0.2em]"
                          disabled={deletingId === profile.id || isCurrentUser}
                        >
                          <Trash2 className="mr-2 size-4" />
                          {deletingId === profile.id ? "Deleting..." : "Delete"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
