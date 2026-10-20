export const PATHS_DEFAULTS = {
  crossing_radius_m: 100,
  max_accuracy_m: 150,
  max_time_gap_min: 15,
  ping_retention_hours: 24,
  share_deck_budget: false,
  history_days: 30,
  respect_gender_preference: true,
  hide_liked: true,
  hide_passed: true,
  min_crossings: 1,
  feed_limit: 40,
  sort_order: 'most_crossings' as 'most_crossings' | 'most_recent',
};

export type PathsSettings = typeof PATHS_DEFAULTS;

export const PATHS_NUMBER_LIMITS = {
  crossing_radius_m: { min: 20, max: 1000 },
  max_accuracy_m: { min: 20, max: 500 },
  max_time_gap_min: { min: 1, max: 120 },
  ping_retention_hours: { min: 1, max: 168 },
  history_days: { min: 0, max: 3650 },
  min_crossings: { min: 1, max: 10000 },
  feed_limit: { min: 1, max: 200 },
} as const;

export const PATHS_FEED_KEYS = ['history_days', 'respect_gender_preference', 'hide_liked',
  'hide_passed', 'min_crossings', 'feed_limit', 'sort_order'] as const;

export function pathsFeedControlsReady(row: Record<string, unknown>): boolean {
  return PATHS_FEED_KEYS.every(key => row[key] !== undefined && row[key] !== null);
}

/** Validate against the saved row too, so a one-field PATCH cannot evade the GPS check. */
export function parsePathsSettingsPatch(body: unknown, current: PathsSettings): Partial<PathsSettings> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected a settings object.');
  const input = body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  for (const [key, { min, max }] of Object.entries(PATHS_NUMBER_LIMITS)) {
    if (!(key in input)) continue;
    const value = input[key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${key} must be a whole number between ${min} and ${max}.`);
    }
    update[key] = value;
  }
  for (const key of ['share_deck_budget', 'respect_gender_preference', 'hide_liked', 'hide_passed']) {
    if (!(key in input)) continue;
    if (typeof input[key] !== 'boolean') throw new Error(`${key} must be on or off.`);
    update[key] = input[key];
  }
  if ('sort_order' in input) {
    if (!['most_crossings', 'most_recent'].includes(input.sort_order as string)) throw new Error('Choose a valid Paths sort order.');
    update.sort_order = input.sort_order;
  }
  if (Object.keys(update).length === 0) throw new Error('Nothing to update.');
  const merged = { ...current, ...update } as PathsSettings;
  if (merged.max_accuracy_m > merged.crossing_radius_m * 2) {
    throw new Error('GPS accuracy cannot exceed twice the crossing radius.');
  }
  return update as Partial<PathsSettings>;
}
