/**
 * What a message says, for a screen that is reading it rather than
 * taking part in it.
 *
 * ── The thing this exists to stop ─────────────────────────────
 *
 * Photos sent before the media columns existed put their storage
 * location in the text, as:
 *
 *     IMAGE:chat-media:<uploader>/<match>/<timestamp>.png
 *
 * Three screens printed that verbatim where the picture should have
 * been described — the conversation stream, and twice on the member
 * profile. It is unreadable, it is three ids long, and it puts the
 * file's location on screen for no reason.
 *
 * The phone app has guarded this prefix since the beginning. The panel
 * never did, which is the usual shape of this kind of bug: the rule
 * lives in the app that writes the data and not in the one that reads
 * it back.
 */
export function messageText(content: string | null | undefined): string {
  if (!content) return "";

  // Not a caption, not something anybody typed — a file path.
  if (content.startsWith("IMAGE:")) return "Photo";

  return content;
}
