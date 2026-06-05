"use client";

import { useEffect, useMemo, useState } from "react";
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
import { RefreshCw, Save, Shield } from "lucide-react";

type AdminRole = "admin" | "moderator" | "viewer" | "pending";

type AdminProfile = {
  id: string;
  email: string;
  role: AdminRole;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type FormState = {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string;
  role: AdminRole;
};

const emptyForm: FormState = {
  id: "",
  email: "",
  display_name: "",
  avatar_url: "",
  role: "pending",
};

const roleOptions: { label: string; value: AdminRole }[] = [
  { label: "Admin", value: "admin" },
  { label: "Moderator", value: "moderator" },
  { label: "Viewer", value: "viewer" },
  { label: "Pending", value: "pending" },
];

function formatDateTime(value: string | null) {
  if (!value) return "—";
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
  const supabase = createClient();
  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadProfiles = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("admin_profiles")
      .select(
        "id, email, role, display_name, avatar_url, created_at, updated_at",
      )
      .order("updated_at", { ascending: false });

    if (error) {
      setError(error.message);
      setProfiles([]);
    } else {
      setProfiles((data ?? []) as AdminProfile[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadProfiles();
  }, []);

  const summary = useMemo(() => {
    const counts = profiles.reduce(
      (accumulator, profile) => {
        accumulator[profile.role] += 1;
        return accumulator;
      },
      {
        admin: 0,
        moderator: 0,
        viewer: 0,
        pending: 0,
      } as Record<AdminRole, number>,
    );

    return {
      total: profiles.length,
      ...counts,
    };
  }, [profiles]);

  const handleEdit = (profile: AdminProfile) => {
    setForm({
      id: profile.id,
      email: profile.email,
      display_name: profile.display_name ?? "",
      avatar_url: profile.avatar_url ?? "",
      role: profile.role,
    });
    setSuccess(null);
    setError(null);
  };

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

    if (!form.id.trim() || !form.email.trim()) {
      setError("User ID and email are required.");
      setSaving(false);
      return;
    }

    const payload = {
      id: form.id.trim(),
      email: form.email.trim(),
      role: form.role,
      display_name: form.display_name.trim() || null,
      avatar_url: form.avatar_url.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("admin_profiles")
      .upsert(payload, { onConflict: "id" });

    if (error) {
      setError(error.message);
    } else {
      setSuccess("Admin profile saved.");
      handleReset();
      await loadProfiles();
    }

    setSaving(false);
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-4xl font-black tracking-tighter uppercase mb-2">
            Access
          </h1>
          <p className="text-muted-foreground text-xs tracking-[0.2em] uppercase">
            Admin Profiles & Permissions
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={loadProfiles}
          className="h-12 rounded-none border-border/50 text-xs font-bold uppercase tracking-[0.2em] px-8"
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Profiles
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {summary.total}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Admins
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {summary.admin}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Moderators
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {summary.moderator}
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {summary.pending}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <Card className="border-border/50 bg-card">
          <CardHeader>
            <CardTitle>Admin Profile Editor</CardTitle>
            <p className="text-sm text-muted-foreground">
              Upsert an existing auth user&apos;s admin profile by ID. The first
              admin can create or edit any admin profile row.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="admin-id">Auth User ID</Label>
                <Input
                  id="admin-id"
                  value={form.id}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      id: event.target.value,
                    }))
                  }
                  className="bg-transparent border border-border/50 rounded-none"
                  placeholder="uuid from auth.users"
                />
              </div>

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
                  className="bg-transparent border border-border/50 rounded-none"
                  placeholder="admin@tickle.app"
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
                  className="bg-transparent border border-border/50 rounded-none"
                  placeholder="System Admin"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-avatar">Avatar URL</Label>
                <Input
                  id="admin-avatar"
                  value={form.avatar_url}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      avatar_url: event.target.value,
                    }))
                  }
                  className="bg-transparent border border-border/50 rounded-none"
                  placeholder="https://..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="admin-role">Role</Label>
                <select
                  id="admin-role"
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as AdminRole,
                    }))
                  }
                  className="h-10 w-full rounded-none border border-border/50 bg-transparent px-3 text-sm outline-none"
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {success && <p className="text-sm text-foreground">{success}</p>}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  className="flex-1 rounded-none bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={saving}
                >
                  <Save className="mr-2 size-4" />
                  {saving ? "Saving..." : "Save Profile"}
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
                <TableHead>Role</TableHead>
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
                    Loading admin profiles...
                  </TableCell>
                </TableRow>
              ) : profiles.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No admin profiles found.
                  </TableCell>
                </TableRow>
              ) : (
                profiles.map((profile) => {
                  const name = profile.display_name || profile.email;
                  const initials = getInitials(name);
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
                        <Badge
                          variant={
                            profile.role === "admin" ? "default" : "secondary"
                          }
                          className={
                            profile.role === "admin"
                              ? "bg-primary text-primary-foreground hover:bg-primary/80"
                              : ""
                          }
                        >
                          {profile.role}
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
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(profile)}
                          className="rounded-none text-xs uppercase tracking-[0.2em]"
                        >
                          <Shield className="mr-2 size-4" />
                          Edit
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
