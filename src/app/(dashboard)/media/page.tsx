"use client";

import { useCallback, useRef, useState } from "react";
import { FileImage, ImagePlus, Save, Upload, Video } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { supabase } from "@/lib/supabase/client";
import {
  SITE_MEDIA_BUCKET,
  SITE_MEDIA_SLOTS,
  type SiteMediaAsset,
  type SiteMediaManifest,
  type SiteMediaSlotKey,
} from "@/lib/siteMedia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, PageSkeleton } from "@/components/ui/page";
import { useSearchParams } from "next/navigation";
import { useMyAccess } from "@/lib/useMyAccess";
import { LegalEditor } from "@/components/website/LegalEditor";
import { Segmented, Select } from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type MediaPayload = { manifest: SiteMediaManifest };
type TicketPayload = { path: string; token: string };

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
const VIDEO_ACCEPT = "video/mp4,video/webm";
const ACCEPTED_TYPES = {
  image: new Set(IMAGE_ACCEPT.split(",")),
  video: new Set(VIDEO_ACCEPT.split(",")),
};
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function MediaSlots() {
  const [manifest, setManifest] = useState<SiteMediaManifest | null>(null);
  const [selection, setSelection] = useState<Partial<Record<SiteMediaSlotKey, string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [uploadSlot, setUploadSlot] = useState<SiteMediaSlotKey | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<MediaPayload>("/api/site-media");
    if (error) {
      setError(error);
      return;
    }
    setManifest(data?.manifest ?? null);
    setSelection({});
    setError(null);
  }, []);

  useLoadOnMount(load);

  const publicUrl = useCallback(
    (path: string) => supabase.storage.from(SITE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl,
    [],
  );

  const chooseFile = useCallback((slot: SiteMediaSlotKey, file: File) => {
    const slotInfo = SITE_MEDIA_SLOTS.find((candidate) => candidate.key === slot);
    if (!slotInfo) return;

    if (!ACCEPTED_TYPES[slotInfo.kind].has(file.type)) {
      setPendingFile(null);
      setError(`Choose a supported ${slotInfo.kind} file for ${slotInfo.label.toLowerCase()}.`);
      return;
    }

    const maxBytes = slotInfo.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (file.size > maxBytes) {
      setPendingFile(null);
      setError(`That file is too large. The limit is ${slotInfo.kind === "video" ? "50 MB" : "25 MB"}.`);
      return;
    }

    setPendingFile(file);
    setError(null);
  }, []);

  const assign = useCallback(
    async (slot: SiteMediaSlotKey, path: string) => {
      setBusy(slot);
      setError(null);
      setSaved(null);

      const { data, error } = await adminFetch<MediaPayload>("/api/site-media", {
        method: "POST",
        body: JSON.stringify({ action: "assign", slot, path: path || null }),
      });

      if (error) setError(error);
      else {
        setManifest(data?.manifest ?? null);
        setSelection((current) => ({ ...current, [slot]: undefined }));
        setSaved(slot);
      }
      setBusy(null);
    },
    [],
  );

  const upload = useCallback(
    async (slot: SiteMediaSlotKey, file: File) => {
      const slotInfo = SITE_MEDIA_SLOTS.find((candidate) => candidate.key === slot);
      if (!slotInfo) return;

      setBusy(slot);
      setError(null);
      setSaved(null);

      const { data: ticket, error: ticketError } = await adminFetch<TicketPayload>(
        "/api/site-media",
        {
          method: "POST",
          body: JSON.stringify({
            action: "create-upload",
            slot,
            contentType: file.type,
            size: file.size,
          }),
        },
      );

      if (ticketError || !ticket) {
        setError(ticketError ?? "Could not start this upload.");
        setBusy(null);
        return;
      }

      const { error: uploadError } = await supabase.storage
        .from(SITE_MEDIA_BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, {
          contentType: file.type,
          cacheControl: "31536000",
        });

      if (uploadError) {
        setError(uploadError.message);
        setBusy(null);
        return;
      }

      const { data, error: publishError } = await adminFetch<MediaPayload>("/api/site-media", {
        method: "POST",
        body: JSON.stringify({
          action: "publish",
          slot,
          path: ticket.path,
          name: file.name,
          contentType: file.type,
        }),
      });

      if (publishError) setError(publishError);
      else {
        setManifest(data?.manifest ?? null);
        setSelection((current) => ({ ...current, [slot]: undefined }));
        setSaved(slot);
        setUploadSlot(null);
        setPendingFile(null);
      }
      setBusy(null);
    },
    [],
  );

  const uploadSlotInfo = SITE_MEDIA_SLOTS.find((candidate) => candidate.key === uploadSlot);
  const closeUpload = useCallback(() => {
    if (uploadSlot && busy === uploadSlot) return;
    setUploadSlot(null);
    setPendingFile(null);
    setDragging(false);
    setError(null);
  }, [busy, uploadSlot]);

  if (!manifest) return error ? <p className="text-[0.92rem] text-destructive">{error}</p> : <PageSkeleton sections={3} />;

  const assetMap = new Map(manifest.assets.map((asset) => [asset.path, asset]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.92rem] text-muted-foreground">
          Upload into a slot to publish it, or choose a saved file and click Save.
          Changes appear on the site automatically.
        </p>
        <Badge variant="outline">{manifest.assets.length} files in storage</Badge>
      </div>

      {error && !uploadSlotInfo && (
        <div role="alert" className="rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-2 text-[0.86rem] text-destructive">
          {error}
        </div>
      )}



      <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-4">
        {SITE_MEDIA_SLOTS.map((slot) => {
          const path = manifest.slots[slot.key] ?? "";
          const asset = path ? assetMap.get(path) : undefined;
          const chosen = selection[slot.key] ?? path;
          const choices = manifest.assets.filter((item) => item.kind === slot.kind);
          const isBusy = busy === slot.key;

          return (
            <Card key={slot.key} className="shadow-none">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle className="text-base">{slot.label}</CardTitle>
                    <Badge variant="outline">{slot.kind}</Badge>
                    {saved === slot.key && <Badge>live</Badge>}
                  </div>
                  <CardDescription className="mt-1">{slot.description}</CardDescription>
                </div>
                {slot.kind === "video" ? <Video className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
              </CardHeader>

              <CardContent className="space-y-2.5">
                <div className="overflow-hidden rounded-xl border border-foreground/[0.08] bg-foreground/[0.03]">
                  {asset && slot.kind === "video" ? (
                    <video className="aspect-video w-full object-cover" src={publicUrl(asset.path)} controls muted playsInline preload="metadata" />
                  ) : asset ? (
                    <img className="aspect-video w-full object-cover" src={publicUrl(asset.path)} alt={asset.altText} />
                  ) : (
                    <div className="flex aspect-video items-center justify-center text-[0.86rem] text-muted-foreground">
                      No file assigned
                    </div>
                  )}
                </div>

                {asset && (
                  <p className="truncate text-[0.78rem] text-muted-foreground" title={asset.name}>
                    {asset.name}
                  </p>
                )}

                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-[0.92rem] font-medium leading-none">Assign from library</p>
                    <Select
                      value={chosen}
                      onChange={(value) => setSelection((current) => ({ ...current, [slot.key]: value }))}
                      placeholder="Choose media"
                      disabled={isBusy}
                      options={[
                        { value: "", label: "Use site fallback", hint: "Restore the default" },
                        ...choices.map((choice) => ({
                          value: choice.path,
                          label: choice.name,
                          hint: `${choice.kind} · ${new Date(choice.uploadedAt).toLocaleDateString()}`,
                        })),
                      ]}
                      className="w-full"
                    />
                  </div>
                  <Button
                    variant="outline"
                    disabled={isBusy || chosen === path}
                    type="button"
                    onClick={() => void assign(slot.key, chosen)}
                  >
                    <Save className="h-4 w-4" />
                    {isBusy ? "Saving…" : "Save"}
                  </Button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-foreground/[0.07] pt-2.5">
                  <p className="text-[0.78rem] text-muted-foreground">
                    {slot.kind === "video" ? "MP4 or WebM · up to 50 MB" : "JPG, PNG, WebP or AVIF · up to 25 MB"}
                  </p>
                  <Button
                    variant="outline"
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setUploadSlot(slot.key);
                      setPendingFile(null);
                      setError(null);
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    Upload new
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Media library</CardTitle>
          <CardDescription>Uploaded files are reusable across matching image or video slots.</CardDescription>
        </CardHeader>
        <CardContent>
          {manifest.assets.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {manifest.assets.map((asset: SiteMediaAsset) => (
                <div key={asset.path} className="flex min-w-0 items-center gap-3 rounded-xl border border-foreground/[0.08] p-2.5">
                  {asset.kind === "video" ? (
                    <video className="h-14 w-20 shrink-0 rounded-md bg-foreground/5 object-cover" src={publicUrl(asset.path)} muted playsInline preload="metadata" />
                  ) : (
                    <img className="h-14 w-20 shrink-0 rounded-md bg-foreground/5 object-cover" src={publicUrl(asset.path)} alt="" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-[0.82rem] font-medium" title={asset.name}>{asset.name}</p>
                    <p className="text-[0.75rem] text-muted-foreground">{asset.kind} · {new Date(asset.uploadedAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex min-h-24 items-center gap-3 rounded-xl border border-dashed border-foreground/[0.14] bg-foreground/[0.015] px-4 py-5">
              <FileImage className="size-5 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">No uploaded media yet</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Use Upload new on a slot above. Saved files will appear here for reuse.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {uploadSlotInfo && (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) closeUpload();
          }}
        >
          <SheetContent side="right" className="w-full gap-0 sm:max-w-lg">
            <SheetHeader className="border-b border-foreground/[0.08] px-5 py-5">
              <SheetTitle>Upload to {uploadSlotInfo.label}</SheetTitle>
              <SheetDescription>
                This file will replace the media currently shown in this slot.
              </SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
              <input
                ref={fileInput}
                className="sr-only"
                type="file"
                accept={uploadSlotInfo.kind === "video" ? VIDEO_ACCEPT : IMAGE_ACCEPT}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file && uploadSlot) chooseFile(uploadSlot, file);
                  event.currentTarget.value = "";
                }}
              />

              <div
                role="region"
                aria-label="Media upload drop zone"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  const nextTarget = event.relatedTarget;
                  if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                    setDragging(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files[0];
                  if (file && uploadSlot) chooseFile(uploadSlot, file);
                }}
                className={`flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center transition-colors ${dragging ? "border-primary bg-primary/[0.06]" : "border-foreground/20 bg-foreground/[0.02]"}`}
              >
                {pendingFile ? (
                  <>
                    {pendingFile.type.startsWith("video/") ? (
                      <Video className="size-8 text-muted-foreground" />
                    ) : (
                      <FileImage className="size-8 text-muted-foreground" />
                    )}
                    <div className="max-w-full">
                      <p className="max-w-full truncate text-sm font-medium">{pendingFile.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {(pendingFile.size / (1024 * 1024)).toFixed(1)} MB · ready to upload
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <ImagePlus className="size-8 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Drop a file here</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {uploadSlotInfo.kind === "video" ? "MP4 or WebM · up to 50 MB" : "JPG, PNG, WebP or AVIF · up to 25 MB"}
                      </p>
                    </div>
                  </>
                )}
                <Button type="button" variant="outline" onClick={() => fileInput.current?.click()}>
                  <Upload className="h-4 w-4" />
                  {pendingFile ? "Choose another file" : "Browse files"}
                </Button>
              </div>

              {error && (
                <div role="alert" className="rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-2 text-[0.86rem] text-destructive">
                  {error}
                </div>
              )}
            </div>

            <SheetFooter className="border-t border-foreground/[0.08] p-5 sm:flex-row sm:justify-end">
              <Button variant="outline" type="button" disabled={busy === uploadSlot} onClick={closeUpload}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!pendingFile || busy === uploadSlot}
                onClick={() => {
                  if (uploadSlot && pendingFile) void upload(uploadSlot, pendingFile);
                }}
              >
                <Upload className="h-4 w-4" />
                {busy === uploadSlot ? "Uploading…" : "Upload & publish"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function StoreLinksEditor() {
  const [manifest, setManifest] = useState<SiteMediaManifest | null>(null);
  const [appStoreUrl, setAppStoreUrl] = useState("");
  const [googlePlayUrl, setGooglePlayUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<MediaPayload>("/api/site-media");
    if (error) {
      setError(error);
      return;
    }
    setManifest(data?.manifest ?? null);
    setAppStoreUrl(data?.manifest.storeLinks?.appStoreUrl ?? "");
    setGooglePlayUrl(data?.manifest.storeLinks?.googlePlayUrl ?? "");
    setError(null);
  }, []);

  useLoadOnMount(load);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const { data, error } = await adminFetch<MediaPayload>("/api/site-media", {
      method: "POST",
      body: JSON.stringify({ action: "save-store-links", appStoreUrl, googlePlayUrl }),
    });
    if (error) setError(error);
    else {
      setManifest(data?.manifest ?? null);
      setSaved(true);
    }
    setBusy(false);
  }, [appStoreUrl, googlePlayUrl]);

  if (!manifest) return error ? <p className="text-[0.92rem] text-destructive">{error}</p> : <PageSkeleton sections={1} />;

  return (
    <div className="space-y-5">
      {error && <div role="alert" className="rounded-lg border border-destructive/35 bg-destructive/5 px-3 py-2 text-[0.86rem] text-destructive">{error}</div>}
      <Card className="shadow-none">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">App store links</CardTitle>
              <CardDescription className="mt-1">These links power the Apple App Store and Google Play buttons in the website footer.</CardDescription>
            </div>
            {saved && <Badge>live</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium">
              Apple App Store URL
              <Input type="url" value={appStoreUrl} onChange={(event) => { setAppStoreUrl(event.target.value); setSaved(false); }} placeholder="https://apps.apple.com/..." disabled={busy} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Google Play URL
              <Input type="url" value={googlePlayUrl} onChange={(event) => { setGooglePlayUrl(event.target.value); setSaved(false); }} placeholder="https://play.google.com/store/apps/details?id=..." disabled={busy} />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Leave a field blank to use its website default. Use HTTPS store listing URLs.</p>
            <Button type="button" disabled={busy} onClick={() => void save()}>
              <Save className="h-4 w-4" />
              {busy ? "Saving…" : "Save store links"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Everything that shows on the public website.
 *
 * ── Why the two are one screen ────────────────────────────────
 *
 * Pictures, store links, and the wording of /terms and /privacy all
 * belong to the public website, so they live together here.
 *
 * ── Why each tab loads on its own ─────────────────────────────
 *
 * They are governed by different permissions and different endpoints.
 * An admin who may edit the wording but not the pictures must not be
 * shown a spinner forever waiting on a fetch they are not allowed to
 * make, so neither tab's loading gates the other.
 */

type Tab = "pictures" | "store-links" | "legal";

export default function WebsiteScreen() {
  const searchParams = useSearchParams();
  const { can, ready } = useMyAccess();

  // Until the permissions are in, assume both — the guard below refuses
  // for real, and flashing a missing tab on every load is worse.
  const mayEditMedia = !ready || can("page.media");
  const mayEditLegal = !ready || can("page.legal");

  const tabs = [
    ...(mayEditMedia ? [{ value: "pictures" as const, label: "Pictures" }] : []),
    ...(mayEditMedia ? [{ value: "store-links" as const, label: "App store links" }] : []),
    ...(mayEditLegal ? [{ value: "legal" as const, label: "Terms and privacy" }] : []),
  ];

  const [tab, setTab] = useState<Tab>(() => {
    const requested = searchParams.get("tab");
    return requested === "legal" || requested === "store-links" ? requested : "pictures";
  });

  // A tab this admin cannot open — from a stale link, or from holding
  // only one of the two grants — falls back to the one they can.
  const current: Tab = tabs.some((entry) => entry.value === tab)
    ? tab
    : (tabs[0]?.value ?? "pictures");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pictures and pages"
        description="Manage the Gogter website’s pictures, app store links, and terms and privacy pages."
        actions={
          tabs.length > 1 ? (
            <Segmented value={current} onChange={setTab} options={tabs} />
          ) : undefined
        }
      />

      {current === "pictures" && mayEditMedia && <MediaSlots />}
      {current === "store-links" && mayEditMedia && <StoreLinksEditor />}
      {current === "legal" && mayEditLegal && <LegalEditor />}
    </div>
  );
}
