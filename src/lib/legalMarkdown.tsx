import React from "react";

/**
 * The small slice of Markdown that legal documents actually use.
 *
 * ── Why not a Markdown library ────────────────────────────────
 *
 * These two pages are what Apple's reviewer opens, signed out, to
 * decide whether the app ships. Every dependency on that path is
 * something that can break a build or change its output between
 * versions, for a document whose entire vocabulary is headings,
 * paragraphs, bullets, bold and links.
 *
 * ── Why it renders React and not an HTML string ───────────────
 *
 * The body is typed into a textarea by a person pasting from a legal
 * document, and it is served to the public. Producing an HTML string
 * would mean either trusting that paste — an injection on a page
 * anybody can open — or sanitising it, which is a second problem.
 *
 * Returning React elements makes that impossible by construction:
 * everything not matched below becomes a text node, so a body
 * containing a script tag renders the literal characters. There is no
 * dangerouslySetInnerHTML anywhere in this file, deliberately.
 *
 * Supported, and nothing else:
 *
 *   # ## ###     headings
 *   - or *       bullets
 *   1.           numbered list
 *   **bold**     within a paragraph
 *   [text](url)  links, http(s) and mailto only
 *   blank line   paragraph break
 */

/** Splits a line into text, bold runs and links. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];

  /*
   * One pass, both patterns.
   *
   * Handling bold and links in separate passes would mean the second
   * walking output the first produced, and a link label containing
   * bold would come out wrong in one order and right in the other.
   */
  const pattern = /(\*\*[^*]+\*\*)|(\[[^\]]+\]\([^)]+\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let index = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-b${index}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      const split = token.indexOf("](");
      const label = token.slice(1, split);
      const href = token.slice(split + 2, -1);

      /*
       * http, https and mailto only.
       *
       * javascript: in an href is a script on a public page, and this
       * body is pasted text. Anything else renders as plain label, so a
       * bad link degrades to unclickable rather than to a hole.
       */
      const safe = /^(https?:\/\/|mailto:)/i.test(href);

      nodes.push(
        safe ? (
          <a
            key={`${keyPrefix}-a${index}`}
            href={href}
            className="text-[#C32039] underline underline-offset-2"
          >
            {label}
          </a>
        ) : (
          label
        ),
      );
    }

    lastIndex = match.index + token.length;
    index += 1;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));

  return nodes;
}

export function renderLegalMarkdown(body: string): React.ReactNode[] {
  // Normalise line endings: a document pasted from Windows carries \r,
  // which would otherwise survive into every rendered line.
  const lines = body.replace(/\r\n/g, "\n").split("\n");

  const out: React.ReactNode[] = [];

  /*
   * List items accumulate until something that is not a list item ends
   * them, so consecutive bullets become one <ul> rather than one per
   * line — which is the difference between a list and a stack of
   * paragraphs with dots.
   */
  let bullets: string[] = [];
  let numbers: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    out.push(
      <ul key={`ul${key++}`} className="my-4 list-disc space-y-2 pl-6">
        {bullets.map((item, i) => (
          <li key={i}>{renderInline(item, `ul${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  const flushNumbers = () => {
    if (numbers.length === 0) return;
    out.push(
      <ol key={`ol${key++}`} className="my-4 list-decimal space-y-2 pl-6">
        {numbers.map((item, i) => (
          <li key={i}>{renderInline(item, `ol${key}-${i}`)}</li>
        ))}
      </ol>,
    );
    numbers = [];
  };

  const flushAll = () => {
    flushBullets();
    flushNumbers();
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (line === "") {
      flushAll();
      continue;
    }

    if (line.startsWith("### ")) {
      flushAll();
      out.push(
        <h3 key={key++} className="mt-8 mb-2 text-[1.05rem] font-semibold">
          {renderInline(line.slice(4), `h3${key}`)}
        </h3>,
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushAll();
      out.push(
        <h2 key={key++} className="mt-10 mb-3 text-[1.25rem] font-semibold">
          {renderInline(line.slice(3), `h2${key}`)}
        </h2>,
      );
      continue;
    }

    if (line.startsWith("# ")) {
      flushAll();
      out.push(
        <h1 key={key++} className="mt-10 mb-4 text-[1.5rem] font-semibold">
          {renderInline(line.slice(2), `h1${key}`)}
        </h1>,
      );
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      flushNumbers();
      bullets.push(line.slice(2));
      continue;
    }

    const numbered = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numbered) {
      flushBullets();
      numbers.push(numbered[2]);
      continue;
    }

    flushAll();
    out.push(
      <p key={key++} className="my-4 leading-relaxed">
        {renderInline(line, `p${key}`)}
      </p>,
    );
  }

  flushAll();

  return out;
}
