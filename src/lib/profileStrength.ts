/**
 * Profile strength, computed the same way the app and the database compute it.
 *
 * These weights are a third copy of the ones in the app's profileStrength.ts
 * and in the profile_strength() SQL function, and they have to stay in step:
 * an admin filtering for "weak profiles" and a member looking at their own
 * meter must not be reading two different numbers about the same account.
 *
 * The obvious fix is to call profile_strength() instead — but that is one
 * round trip per member, and this page lists every account in the table.
 */

export type StrengthFields = {
  photos: string[] | null;
  bio: string | null;
  prompts: unknown[] | null;
  interests: string[] | null;
  work: string | null;
  education: string | null;
  hometown: string | null;
  height_cm: number | null;
  looking_for: string | null;
  languages: string[] | null;
  qualities: string[] | null;
  causes: string[] | null;
  spotify_artists: unknown[] | null;
  exercise: string | null;
  drinking: string | null;
  smoking: string | null;
  kids: string | null;
  star_sign: string | null;
  politics: string | null;
  religion: string | null;
};

/** The columns profileStrength needs, ready to paste into a select(). */
export const STRENGTH_COLUMNS =
  "photos, bio, prompts, interests, work, education, hometown, height_cm, " +
  "looking_for, languages, qualities, causes, spotify_artists, exercise, " +
  "drinking, smoking, kids, star_sign, politics, religion";

const filled = (value: string | null | undefined) => Boolean(value && value.trim() !== "");
const any = (value: unknown[] | null | undefined) => (value?.length ?? 0) > 0;

export function profileStrength(profile: Partial<StrengthFields>): number {
  let score = 0;

  // Photos carry the most weight, up to four of them.
  score += Math.min(profile.photos?.length ?? 0, 4) * 8;

  if (filled(profile.bio)) score += 14;
  if (any(profile.prompts)) score += 12;
  if ((profile.interests?.length ?? 0) >= 3) score += 10;
  if (filled(profile.work)) score += 6;
  if (filled(profile.education)) score += 4;
  if (filled(profile.hometown)) score += 4;
  if (profile.height_cm != null) score += 3;
  if (filled(profile.looking_for)) score += 5;
  if (any(profile.languages)) score += 3;
  if (any(profile.qualities)) score += 3;
  if (any(profile.causes)) score += 3;
  if (any(profile.spotify_artists)) score += 5;

  // The trivia, a point each.
  for (const value of [
    profile.exercise,
    profile.drinking,
    profile.smoking,
    profile.kids,
    profile.star_sign,
    profile.politics,
    profile.religion,
  ]) {
    if (filled(value)) score += 1;
  }

  return Math.max(0, Math.min(100, score));
}
