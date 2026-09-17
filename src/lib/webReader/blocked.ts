/**
 * Websites the reader refuses, whatever the blocked list on screen says.
 *
 * These are the sites whose pages are mostly people — names, faces,
 * who they know. Reading one "just to look" is how a folder of
 * strangers' photographs ends up in the test profiles, so they are
 * written here, in code, where nobody can untick them from the panel.
 *
 * A domain covers its subdomains: "instagram.com" also stops
 * "www.instagram.com" and "about.instagram.com".
 */
export const ALWAYS_BLOCKED: { domain: string; reason: string }[] = [
];

/** A bare, lower-case domain from whatever the admin typed, or null. */
export function normaliseDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  if (!value) return null;

  if (!/^[a-z]+:\/\//.test(value)) value = `https://${value}`;

  try {
    const host = new URL(value).hostname.replace(/^www\./, "").replace(/\.$/, "");
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? host : null;
  } catch {
    return null;
  }
}

/** The first rule that covers this host, if any. */
export function blockFor(
  host: string,
  extra: { domain: string; reason: string | null }[],
): { domain: string; reason: string | null; locked: boolean } | null {
  const name = host.toLowerCase().replace(/\.$/, "");
  const covers = (domain: string) => name === domain || name.endsWith(`.${domain}`);

  const locked = ALWAYS_BLOCKED.find((rule) => covers(rule.domain));
  if (locked) return { ...locked, locked: true };

  const added = extra.find((rule) => covers(rule.domain));
  return added ? { ...added, locked: false } : null;
}
