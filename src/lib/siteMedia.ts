export const SITE_MEDIA_BUCKET = "gogter-site-media";
export const SITE_MEDIA_MANIFEST = "site-media.json";

export const SITE_MEDIA_SLOTS = [
  {
    key: "hero_video",
    label: "Hero video",
    kind: "video",
    description: "Muted full-screen background film.",
    altText: "A couple walking together through a city at sunset.",
  },
  {
    key: "hero_photo_main",
    label: "Hero photograph — main",
    kind: "image",
    description: "The large tilted photograph in the hero.",
    altText: "A couple embracing beside the ocean.",
  },
  {
    key: "hero_photo_side",
    label: "Hero photograph — side",
    kind: "image",
    description: "The smaller overlapping hero photograph.",
    altText: "A couple walking beside the ocean.",
  },
  {
    key: "story_place",
    label: "Story image — place",
    kind: "image",
    description: "First image in the scroll-linked horizontal sequence.",
    altText: "A couple embracing beside the ocean.",
  },
  {
    key: "story_hello",
    label: "Story image — hello",
    kind: "image",
    description: "Second image in the scroll-linked horizontal sequence.",
    altText: "A couple strolling beside the ocean.",
  },
  {
    key: "story_together",
    label: "Story image — together",
    kind: "image",
    description: "Final image in the scroll-linked horizontal sequence.",
    altText: "A couple walking together along the beach.",
  },
  {
    key: "finale_image",
    label: "Final section image",
    kind: "image",
    description: "Still photograph behind the final call to action.",
    altText: "A couple walking together through a city at sunset.",
  },
] as const;

export type SiteMediaSlotKey = (typeof SITE_MEDIA_SLOTS)[number]["key"];
export type SiteMediaKind = "image" | "video";

export type SiteMediaAsset = {
  path: string;
  name: string;
  kind: SiteMediaKind;
  contentType: string;
  altText: string;
  uploadedAt: string;
};

export type SiteStoreLinks = {
  appStoreUrl?: string;
  googlePlayUrl?: string;
};

export type SiteMediaManifest = {
  version: 1;
  updatedAt: string;
  assets: SiteMediaAsset[];
  slots: Partial<Record<SiteMediaSlotKey, string>>;
  storeLinks?: SiteStoreLinks;
};

export function emptySiteMediaManifest(): SiteMediaManifest {
  return {
    version: 1,
    updatedAt: new Date(0).toISOString(),
    assets: [],
    slots: {},
  };
}

export function isSiteMediaSlot(value: unknown): value is SiteMediaSlotKey {
  return SITE_MEDIA_SLOTS.some((slot) => slot.key === value);
}
