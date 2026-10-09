import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { failed, requireAdmin } from "@/lib/supabase/admin";
import {
  emptySiteMediaManifest,
  isSiteMediaSlot,
  SITE_MEDIA_BUCKET,
  SITE_MEDIA_MANIFEST,
  SITE_MEDIA_SLOTS,
  type SiteMediaAsset,
  type SiteMediaKind,
  type SiteMediaManifest,
  type SiteMediaSlotKey,
} from "@/lib/siteMedia";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/webm"]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function contentKind(contentType: string): SiteMediaKind | null {
  if (IMAGE_TYPES.has(contentType)) return "image";
  if (VIDEO_TYPES.has(contentType)) return "video";
  return null;
}

function extensionFor(contentType: string): string | null {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return extensions[contentType] ?? null;
}

function validateManifest(value: unknown): SiteMediaManifest {
  if (!value || typeof value !== "object") throw new Error("The media manifest is invalid.");
  const candidate = value as Partial<SiteMediaManifest>;
  if (candidate.version !== 1 || !Array.isArray(candidate.assets) || !candidate.slots) {
    throw new Error("The media manifest is invalid.");
  }
  return candidate as SiteMediaManifest;
}

async function readManifest(supabase: SupabaseClient) {
  const { data, error } = await supabase.storage.from(SITE_MEDIA_BUCKET).download(SITE_MEDIA_MANIFEST);
  if (error) {
    const detail = error as { status?: number; statusCode?: string; message?: string };
    const missing = detail.status === 404 || detail.statusCode === "404" || /not found/i.test(detail.message ?? "");
    if (missing) return emptySiteMediaManifest();
    throw error;
  }

  return validateManifest(JSON.parse(await data.text()));
}

async function writeManifest(
  supabase: SupabaseClient,
  manifest: SiteMediaManifest,
) {
  manifest.updatedAt = new Date().toISOString();
  const { error } = await supabase.storage
    .from(SITE_MEDIA_BUCKET)
    .upload(SITE_MEDIA_MANIFEST, new Blob([JSON.stringify(manifest)], { type: "application/json" }), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: true,
    });

  if (error) throw error;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "page.media");
    if (auth.error) return auth.error;

    const manifest = await readManifest(auth.supabase);
    return NextResponse.json({ manifest });
  } catch (error) {
    return failed(error, "Failed to load landing page media.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "page.media");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const bucket = auth.supabase.storage.from(SITE_MEDIA_BUCKET);

    if (action === "save-store-links") {
      const validateStoreUrl = (value: unknown, allowedHosts: string[]) => {
        const url = String(value ?? "").trim();
        if (!url) return { value: "", valid: true };

        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname.toLowerCase())) {
            return { value: "", valid: false };
          }
          return { value: parsed.toString(), valid: true };
        } catch {
          return { value: "", valid: false };
        }
      };

      const appStore = validateStoreUrl(body.appStoreUrl, ["apps.apple.com", "itunes.apple.com"]);
      const googlePlay = validateStoreUrl(body.googlePlayUrl, ["play.google.com"]);
      if (!appStore.valid || !googlePlay.valid) {
        return NextResponse.json(
          { error: "Enter HTTPS listing URLs from apps.apple.com or play.google.com." },
          { status: 400 },
        );
      }

      const manifest = await readManifest(auth.supabase);
      manifest.storeLinks = { appStoreUrl: appStore.value, googlePlayUrl: googlePlay.value };
      await writeManifest(auth.supabase, manifest);
      return NextResponse.json({ manifest });
    }

    if (action === "create-upload") {
      const slotKey = body.slot;
      const slot = SITE_MEDIA_SLOTS.find((candidate) => candidate.key === slotKey);
      const contentType = String(body.contentType ?? "");
      const fileKind = contentKind(contentType);
      const size = Number(body.size);
      const extension = extensionFor(contentType);

      if (!slot) {
        return NextResponse.json({ error: "Choose a landing media slot first." }, { status: 400 });
      }
      if (!fileKind || fileKind !== slot.kind || !extension) {
        return NextResponse.json(
          { error: `Choose a supported ${slot.kind} file for ${slot.label.toLowerCase()}.` },
          { status: 400 },
        );
      }
      const maxBytes = fileKind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
      if (!Number.isFinite(size) || size <= 0 || size > maxBytes) {
        return NextResponse.json(
          { error: `That file is too large. The limit is ${fileKind === "video" ? "50 MB" : "25 MB"}.` },
          { status: 400 },
        );
      }

      const path = `assets/${crypto.randomUUID()}.${extension}`;
      const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: false });
      if (error) throw error;

      return NextResponse.json({ path: data.path, token: data.token });
    }

    if (action === "publish") {
      const slotKey = body.slot;
      if (!isSiteMediaSlot(slotKey)) {
        return NextResponse.json({ error: "Choose a valid landing media slot." }, { status: 400 });
      }

      const slot = SITE_MEDIA_SLOTS.find((candidate) => candidate.key === slotKey)!;
      const path = String(body.path ?? "");
      const contentType = String(body.contentType ?? "");
      const kind = contentKind(contentType);
      const name = String(body.name ?? "New media").trim().slice(0, 120) || "New media";
      const extension = extensionFor(contentType);

      if (!path.startsWith("assets/") || !/^assets\/[0-9a-f-]+\.[a-z0-9]+$/i.test(path)) {
        return NextResponse.json({ error: "That uploaded file path is invalid." }, { status: 400 });
      }
      if (!kind || kind !== slot.kind || !extension || !path.endsWith(`.${extension}`)) {
        return NextResponse.json({ error: "The uploaded file type does not match this slot." }, { status: 400 });
      }

      const filename = path.slice("assets/".length);
      const { data: uploaded, error: listError } = await bucket.list("assets", {
        search: filename,
        limit: 10,
      });
      if (listError) throw listError;
      if (!uploaded?.some((file) => file.name === filename)) {
        return NextResponse.json({ error: "The upload did not finish. Please try again." }, { status: 409 });
      }

      const manifest = await readManifest(auth.supabase);
      const asset: SiteMediaAsset = {
        path,
        name,
        kind,
        contentType,
        altText: slot.altText,
        uploadedAt: new Date().toISOString(),
      };
      manifest.assets = [asset, ...manifest.assets.filter((existing) => existing.path !== path)];
      manifest.slots[slotKey] = path;
      await writeManifest(auth.supabase, manifest);

      return NextResponse.json({ manifest });
    }

    if (action === "assign") {
      const slotKey = body.slot;
      if (!isSiteMediaSlot(slotKey)) {
        return NextResponse.json({ error: "Choose a valid landing media slot." }, { status: 400 });
      }

      const path = body.path === null || body.path === "" ? null : String(body.path);
      const manifest = await readManifest(auth.supabase);
      if (path) {
        const asset = manifest.assets.find((candidate) => candidate.path === path);
        const slot = SITE_MEDIA_SLOTS.find((candidate) => candidate.key === slotKey)!;
        if (!asset || asset.kind !== slot.kind) {
          return NextResponse.json({ error: "Choose a compatible uploaded file." }, { status: 400 });
        }
        manifest.slots[slotKey] = path;
      } else {
        delete manifest.slots[slotKey];
      }

      await writeManifest(auth.supabase, manifest);
      return NextResponse.json({ manifest });
    }

    return NextResponse.json({ error: "Unknown media action." }, { status: 400 });
  } catch (error) {
    return failed(error, "Failed to save landing page media.");
  }
}
