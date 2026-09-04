import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Turning a user id into something a person can read.
 *
 * Lists in the panel kept falling back to the first eight characters of a
 * UUID, which is not an identity — it is the absence of one on screen, and
 * it makes two different members look like the same kind of nothing.
 *
 * The fallback fires more often than it looks like it should, because
 * `profiles.name` is only filled when the signup carried one. The trigger in
 * migration 048 copies `full_name` and `email` out of the auth record, so a
 * Google signup arrives named and a phone signup arrives with both columns
 * null — and a seeded account can have neither.
 *
 * So the chain runs: the profile's name, the name they chose to be called,
 * the email on the profile, then the auth record's own email or phone, and
 * only then a plain "Unnamed member". Never the id.
 */

export type NamedProfile = {
  user_id: string;
  name: string | null;
  preferred_name?: string | null;
  email: string | null;
  photos?: string[] | null;
};

/** The columns every list needs to name somebody. Select this, not less. */
export const NAME_COLUMNS = "user_id, name, preferred_name, email, photos";

/*
 * Auth is only asked about the ids the profile could not name, and asked in
 * pages rather than one call per person: a list of 500 hearts is maybe 60
 * distinct droppers, and 60 round trips to name them is how a page starts
 * taking four seconds. The cap is here because an unbounded loop over a
 * growing user table is a slow page that gets slower without anybody
 * changing it.
 */
const PAGE = 1000;
const MAX_PAGES = 5;

export async function nameByUserId(
  supabase: SupabaseClient,
  userIds: string[],
  profiles: NamedProfile[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const byId = new Map(profiles.map((profile) => [profile.user_id, profile]));

  const unresolved: string[] = [];

  for (const id of userIds) {
    const profile = byId.get(id);
    const known = profile?.name || profile?.preferred_name || profile?.email;

    if (known) names.set(id, known);
    else unresolved.push(id);
  }

  if (unresolved.length === 0) return names;

  const wanted = new Set(unresolved);

  for (let page = 1; page <= MAX_PAGES && wanted.size > 0; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: PAGE,
    });

    if (error || !data?.users?.length) break;

    for (const user of data.users) {
      if (!wanted.has(user.id)) continue;

      const known = user.email || user.phone;
      if (known) names.set(user.id, known);

      wanted.delete(user.id);
    }

    if (data.users.length < PAGE) break;
  }

  /*
   * What is left is one of two different things, and saying so matters.
   * An id with a profile row is a member who simply never gave a name. An
   * id with no profile and no auth record is an account that is gone —
   * hearts, sparks and messages outlive the person who left them, and
   * calling that "Unnamed member" invites somebody to go looking for a
   * member who cannot be found.
   */
  for (const id of wanted) {
    names.set(id, byId.has(id) ? "Unnamed member" : "Deleted account");
  }

  return names;
}
