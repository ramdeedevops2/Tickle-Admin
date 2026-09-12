"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FolderUp, RefreshCw, Trash2, Loader2, Check, X } from "lucide-react";

/**
 * Test profiles, made from a folder of folders.
 *
 * A deck needs dozens of filled-in people before it behaves like a real
 * deck, and filling one in by hand is twenty fields. This takes one
 * parent folder — a subfolder of photographs per person — and writes
 * all of them: auth users, profile rows, photos uploaded, and every
 * field the app reads dealt from pools so ten profiles read as ten
 * people rather than one typed ten times.
 *
 * ── Whichever folder you pick ──────────────────────────────────
 *
 * The photos arrive grouped already: one folder per person, named for
 * her. Pick one of those folders and you get her; pick the folder that
 * holds all of them and you get all of them, because the browser
 * reports each file's path and the grouping that exists on disk is the
 * grouping used here.
 *
 * ── Only ever test data ────────────────────────────────────────
 *
 * Everything made here carries a @tickle.seed address. That is what the
 * delete matches on, so nothing on this screen can reach a real
 * member's account.
 */

type SeededProfile = {
  user_id: string;
  name: string;
  age: number;
  city: string | null;
  work: string | null;
  photos: string[] | null;
  created_at: string;
};

/** One person found in the selection: a subfolder and its images. */
type Pending = {
  folder: string;
  name: string;
  age: string;
  files: File[];
  state: "waiting" | "working" | "done" | "failed";
  detail?: string;
};

/**
 * A folder name turned into something worth showing.
 *
 * The folders are often initials — "KP", "ST" — which is not a name.
 * Anything that looks like a real name is title-cased and kept;
 * initials are left alone for the person to type over.
 */
function nameFromFolder(folder: string): string {
  const cleaned = folder.replace(/[_-]+/g, " ").trim();

  // Two or three letters is an abbreviation, not a name.
  if (cleaned.length <= 3 && !cleaned.includes(" ")) return "";

  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

export default function SeedProfilesPage() {
  const confirm = useConfirm();

  const [pending, setPending] = useState<Pending[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<SeededProfile[]>([]);
  const [loading, setLoading] = useState(true);

  /*
   * A ref rather than state.
   *
   * The input has to be cleared after a run — otherwise picking the
   * same folder again fires no change event and looks broken — and
   * clearing it means reaching for the element itself.
   */
  const picker = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data, error: failure } = await adminFetch<{ profiles: SeededProfile[] }>(
      "/api/seed-profiles",
    );

    if (failure) setError(failure);
    else setProfiles(data?.profiles ?? []);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  /**
   * Group the selection by the folder each image sits in.
   *
   * Works whichever way the folder was picked: one woman's folder, or
   * the folder holding all of them. Files are grouped by their
   * immediate parent either way, so a mixed selection would produce one
   * row per folder found.
   */
  const onPick = useCallback((chosen: FileList | null) => {
    setError(null);

    const groups = new Map<string, File[]>();

    Array.from(chosen ?? [])
      .filter((file) => file.type.startsWith("image/"))
      .forEach((file) => {
        const parts = (file.webkitRelativePath || file.name).split("/");

        /*
         * The folder the file sits in, however deep the pick was.
         *
         * "parent/ST/x.jpg" and "ST/x.jpg" both name ST as the person —
         * so picking one woman's folder works as well as picking the
         * folder that holds all of them. Only a bare filename with no
         * folder at all has nobody to belong to.
         */
        if (parts.length < 2) return;

        const folder = parts[parts.length - 2];

        if (!groups.has(folder)) groups.set(folder, []);
        groups.get(folder)!.push(file);
      });

    if (groups.size === 0) {
      setPending([]);
      setError(
        "No images found in that folder. Pick either one person's folder " +
          "or the folder that holds all of them.",
      );
      return;
    }

    setPending(
      [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([folder, files]) => ({
          folder,
          name: nameFromFolder(folder),
          age: "26",
          // Sorted, so "the first photo" means the same thing here as
          // it does on disk.
          files: files.sort((x, y) => x.name.localeCompare(y.name)),
          state: "waiting" as const,
        })),
    );
  }, []);

  const update = useCallback((folder: string, patch: Partial<Pending>) => {
    setPending((rows) =>
      rows.map((row) => (row.folder === folder ? { ...row, ...patch } : row)),
    );
  }, []);

  const ready = useMemo(
    () => pending.filter((row) => row.name.trim() && row.state !== "done"),
    [pending],
  );

  const createAll = useCallback(async () => {
    const missing = pending.filter((row) => !row.name.trim());

    if (missing.length > 0) {
      setError(
        `Name ${missing.length === 1 ? "the folder" : "all folders"} first: ` +
          missing.map((row) => row.folder).join(", "),
      );
      return;
    }

    setBusy(true);
    setError(null);

    /*
     * One at a time, not all at once.
     *
     * Each request uploads several megabytes of photographs and creates
     * an auth user; ten in parallel is a burst the storage API will
     * start refusing partway through, leaving half the people made and
     * no clear record of which.
     */
    for (const row of pending) {
      if (row.state === "done") continue;

      update(row.folder, { state: "working", detail: undefined });

      const form = new FormData();

      form.append("name", row.name.trim());
      form.append("age", row.age);
      row.files.forEach((file) => form.append("photos", file));

      // No Content-Type: adminFetch leaves it off for a FormData body
      // so fetch can write the multipart boundary itself.
      const { data, error: failure } = await adminFetch<{
        profile: { city: string; work: string; photos: number };
      }>("/api/seed-profiles", {
        method: "POST",
        body: form,
      });

      if (failure) {
        update(row.folder, { state: "failed", detail: failure });
      } else {
        update(row.folder, {
          state: "done",
          detail: data?.profile
            ? `${data.profile.work}, ${data.profile.city}`
            : undefined,
        });
      }
    }

    setBusy(false);
    void load();
  }, [pending, update, load]);

  const remove = useCallback(
    async (profile: SeededProfile) => {
      const ok = await confirm({
        title: `Remove ${profile.name}?`,
        body:
          "The account, the profile and the photos all go. Any matches or " +
          "messages that came from swiping on her go with them.",
        confirmLabel: "Remove",
        tone: "danger",
      });

      if (!ok) return;

      const { error: failure } = await adminFetch("/api/seed-profiles", {
        method: "DELETE",
        body: JSON.stringify({ userId: profile.user_id }),
      });

      if (failure) setError(failure);
      else void load();
    },
    [confirm, load],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Test profiles</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Pick the folder holding one subfolder of photos per person.
          Everything else — work, city, prompts, voice, video — is filled
          in for you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Choose a folder</CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/*
            webkitdirectory takes a whole tree, and webkitRelativePath on
            each file is what tells us which person it belongs to. Both
            attributes are real; React's types only know about neither.
          */}
          <input
            ref={picker}
            id="seed-folder"
            type="file"
            multiple
            // @ts-expect-error — a real attribute, not in React's types
            webkitdirectory=""
            directory=""
            disabled={busy}
            onChange={(e) => onPick(e.target.files)}
            className="border-input bg-background file:text-foreground w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-transparent file:text-sm file:font-medium"
          />

          <p className="text-muted-foreground text-xs">
            Pick one person&rsquo;s folder, or the folder that holds all of
            them — either works. The folder name becomes her name where it
            looks like one; initials you type over.
          </p>

          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              Found{" "}
              <Badge variant="secondary" className="ml-2">
                {pending.length}
              </Badge>
            </CardTitle>

            <Button onClick={() => void createAll()} disabled={busy || ready.length === 0}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Making them…
                </>
              ) : (
                <>
                  <FolderUp className="mr-2 size-4" />
                  Create {ready.length}
                </>
              )}
            </Button>
          </CardHeader>

          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Folder</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-24">Age</TableHead>
                  <TableHead className="w-20">Photos</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {pending.map((row) => (
                  <TableRow key={row.folder}>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {row.folder}
                    </TableCell>

                    <TableCell>
                      <Input
                        value={row.name}
                        onChange={(e) =>
                          update(row.folder, { name: e.target.value })
                        }
                        placeholder="Her name"
                        disabled={busy || row.state === "done"}
                        className="h-8"
                      />
                    </TableCell>

                    <TableCell>
                      <Input
                        type="number"
                        min={18}
                        max={60}
                        value={row.age}
                        onChange={(e) =>
                          update(row.folder, { age: e.target.value })
                        }
                        disabled={busy || row.state === "done"}
                        className="h-8"
                      />
                    </TableCell>

                    <TableCell className="text-muted-foreground text-sm">
                      {row.files.length}
                    </TableCell>

                    <TableCell className="text-sm">
                      {row.state === "working" && (
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          <Loader2 className="size-3.5 animate-spin" />
                          Uploading
                        </span>
                      )}

                      {row.state === "done" && (
                        <span className="flex items-center gap-1.5 text-emerald-600">
                          <Check className="size-3.5" />
                          {row.detail ?? "Done"}
                        </span>
                      )}

                      {row.state === "failed" && (
                        <span className="text-destructive flex items-center gap-1.5">
                          <X className="size-3.5" />
                          {row.detail ?? "Failed"}
                        </span>
                      )}

                      {row.state === "waiting" && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Made here{" "}
            {profiles.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {profiles.length}
              </Badge>
            )}
          </CardTitle>

          <Button variant="ghost" size="sm" onClick={() => void load()}>
            <RefreshCw className="size-4" />
          </Button>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Loading…
            </p>
          ) : profiles.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              None yet. The ones you make will be listed here.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Work</TableHead>
                  <TableHead>Photos</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>

              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.user_id}>
                    <TableCell className="font-medium">{profile.name}</TableCell>
                    <TableCell>{profile.age}</TableCell>
                    <TableCell>{profile.city ?? "—"}</TableCell>
                    <TableCell>{profile.work ?? "—"}</TableCell>
                    <TableCell>{profile.photos?.length ?? 0}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void remove(profile)}
                      >
                        <Trash2 className="text-destructive size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
