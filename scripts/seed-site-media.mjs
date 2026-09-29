import { createClient } from "@supabase/supabase-js";

const BUCKET = "gogter-site-media";
const MAX_FILE_SIZE = 50 * 1024 * 1024;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Keep the currently connected admin app usable immediately. The matching
// SQL migration carries this grant into the normal migration history too.
const { error: permissionError } = await supabase.from("admin_permissions").upsert(
  {
    key: "page.media",
    label: "Open Landing media",
    area: "Screens",
    sensitive: true,
    sort_order: 1150,
  },
  { onConflict: "key" },
);
if (permissionError) throw permissionError;

const { error: rolesError } = await supabase.from("role_permissions").upsert(
  [
    { role_key: "admin", permission_key: "page.media" },
    { role_key: "super", permission_key: "page.media" },
  ],
  { onConflict: "role_key,permission_key", ignoreDuplicates: true },
);
if (rolesError) throw rolesError;

const sources = [
  {
    path: "assets/hero-city.mp4",
    name: "Hero — couple in the city",
    kind: "video",
    contentType: "video/mp4",
    altText: "A couple walking together through a city at sunset.",
    url: "https://videos.pexels.com/video-files/8575032/8575032-hd_1920_1080_30fps.mp4",
  },
  {
    path: "assets/couple-embrace-ocean.jpg",
    name: "Couple embracing by the ocean",
    kind: "image",
    contentType: "image/jpeg",
    altText: "A couple embracing beside the ocean.",
    url: "https://images.pexels.com/videos/4730979/pexels-photo-4730979.jpeg?auto=compress&dpr=1&h=750&w=1260",
  },
  {
    path: "assets/couple-walk-ocean.jpg",
    name: "Couple walking by the ocean",
    kind: "image",
    contentType: "image/jpeg",
    altText: "A couple strolling beside the ocean.",
    url: "https://images.pexels.com/videos/6028850/pexels-photo-6028850.jpeg?auto=compress&dpr=1&h=750&w=1260",
  },
  {
    path: "assets/couple-walk-beach.jpg",
    name: "Couple walking on the beach",
    kind: "image",
    contentType: "image/jpeg",
    altText: "A couple walking together along the beach.",
    url: "https://images.pexels.com/videos/7767968/at-the-beach-beach-beach-lovers-beach-sand-7767968.jpeg?auto=compress&dpr=1&h=750&w=1260",
  },
  {
    path: "assets/finale-city-couple.jpg",
    name: "Finale — couple in the city",
    kind: "image",
    contentType: "image/jpeg",
    altText: "A couple walking together in the city at sunset.",
    url: "https://images.pexels.com/videos/8575032/administration-adult-architecture-battle-8575032.jpeg?auto=compress&dpr=1&h=750&w=1260",
  },
];

const storage = supabase.storage;
const { data: buckets, error: bucketsError } = await storage.listBuckets();
if (bucketsError) throw bucketsError;

const existingBucket = buckets.find((bucket) => bucket.id === BUCKET);
if (!existingBucket) {
  const { error } = await storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm", "application/json"],
  });
  if (error) throw error;
} else {
  const { error } = await storage.updateBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_FILE_SIZE,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "video/mp4", "video/webm", "application/json"],
  });
  if (error) throw error;
}

const assets = [];
for (const source of sources) {
  const response = await fetch(source.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Download failed for ${source.name}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());

  if (bytes.byteLength > MAX_FILE_SIZE) {
    throw new Error(`${source.name} exceeds the ${MAX_FILE_SIZE / 1024 / 1024} MB bucket limit.`);
  }

  const { error } = await storage.from(BUCKET).upload(source.path, bytes, {
    contentType: source.contentType,
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw error;

  assets.push({
    path: source.path,
    name: source.name,
    kind: source.kind,
    contentType: source.contentType,
    altText: source.altText,
    uploadedAt: new Date().toISOString(),
  });
  process.stdout.write(`Stored ${source.name} (${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB)\n`);
}

const slots = {
  hero_video: "assets/hero-city.mp4",
  hero_photo_main: "assets/couple-embrace-ocean.jpg",
  hero_photo_side: "assets/couple-walk-ocean.jpg",
  story_place: "assets/couple-embrace-ocean.jpg",
  story_hello: "assets/couple-walk-ocean.jpg",
  story_together: "assets/couple-walk-beach.jpg",
  finale_image: "assets/finale-city-couple.jpg",
};

const manifest = {
  version: 1,
  updatedAt: new Date().toISOString(),
  assets,
  slots,
};

const { error: manifestError } = await storage.from(BUCKET).upload(
  "site-media.json",
  Buffer.from(JSON.stringify(manifest, null, 2)),
  { contentType: "application/json", cacheControl: "0", upsert: true },
);
if (manifestError) throw manifestError;

process.stdout.write(`Published ${Object.keys(slots).length} landing media slots to ${BUCKET}.\n`);
