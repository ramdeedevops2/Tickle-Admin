"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { ALWAYS_BLOCKED, normaliseDomain } from "@/lib/webReader/blocked";
import type { ReadResult } from "@/lib/webReader/read";
import { PageHeader, Section, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Segmented } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check, Copy, Globe, Loader2, Lock, Search, Trash2 } from "lucide-react";

/**
 * Read a website: type an address, see what is on the page.
 *
 * For testing only, and deliberately stateless — nothing it reads is
 * saved anywhere. The websites an admin adds to the blocked list are kept
 * in this browser; the social, dating and people-search sites are
 * blocked in code and cannot be removed here.
 */

type Rule = { domain: string; reason: string | null };
type View = "text" | "headings" | "links" | "tables" | "images";
type ScreenTab = "reader" | "accounts";

const STORAGE_KEY = "tickle-admin.web-reader.blocked";

function loadRules(): Rule[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRules(rules: Rule[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // Private windows can refuse storage; the list still works until reload.
  }
}

export default function WebReaderPage() {
  const toast = useToast();

  const [address, setAddress] = useState("");
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<ReadResult | null>(null);
  const [view, setView] = useState<View>("text");
  const [screenTab, setScreenTab] = useState<ScreenTab>("reader");

  const [rules, setRules] = useState<Rule[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [newReason, setNewReason] = useState("");
  const [blockedOpen, setBlockedOpen] = useState(false);

  const [accountName, setAccountName] = useState("");
  const [accountSite, setAccountSite] = useState("instagram.com");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [accountUrls, setAccountUrls] = useState<string[] | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Read after mount: localStorage does not exist during the server render.
  useEffect(() => {
    queueMicrotask(() => setRules(loadRules()));
  }, []);

  const read = useCallback(async () => {
    if (!address.trim()) return;

    setReading(true);
    setError(null);
    setPage(null);

    const { data, error: failure } = await adminFetch<{ page: ReadResult }>(
      "/api/web-reader",
      {
        method: "POST",
        body: JSON.stringify({ url: address, blocked: rules }),
      },
    );

    if (failure) setError(failure);
    else if (data?.page) {
      setPage(data.page);
      setView(data.page.text.length ? "text" : "headings");
    }

    setReading(false);
  }, [address, rules]);

  const addRule = useCallback(() => {
    const domain = normaliseDomain(newDomain);

    if (!domain) {
      toast.error({
        title: "That is not a website address",
        body: "Try something like example.com",
      });
      return;
    }
    if (
      ALWAYS_BLOCKED.some((rule) => rule.domain === domain) ||
      rules.some((rule) => rule.domain === domain)
    ) {
      toast.info({ title: `${domain} is already blocked` });
      return;
    }

    const next = [...rules, { domain, reason: newReason.trim() || null }];
    setRules(next);
    saveRules(next);
    setNewDomain("");
    setNewReason("");
    toast.success({ title: `${domain} blocked` });
  }, [newDomain, newReason, rules, toast]);

  const removeRule = useCallback(
    (domain: string) => {
      const next = rules.filter((rule) => rule.domain !== domain);
      setRules(next);
      saveRules(next);
    },
    [rules],
  );

  const scanAccounts = useCallback(async () => {
    const name = accountName.trim();
    const site = accountSite
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/$/, "");

    setScanError(null);
    if (site !== "instagram.com") {
      setScanError("Enter instagram.com as the search website.");
      return;
    }

    setScanning(true);
    setScanError(null);
    setAccountUrls(null);

    try {
      const { data, error: failure } = await adminFetch<{ urls: string[] }>(
        "/api/account-scan",
        {
          method: "POST",
          body: JSON.stringify({ name, site }),
        },
      );

      if (failure) setScanError(failure);
      else setAccountUrls(data?.urls ?? []);
    } catch {
      setScanError("Could not search Instagram links. Try again.");
    } finally {
      setScanning(false);
    }
  }, [accountName, accountSite]);

  const copyAccountUrl = useCallback(
    async (url: string) => {
      try {
        await navigator.clipboard.writeText(url);
        setCopiedUrl(url);
        window.setTimeout(() => {
          setCopiedUrl((current) => (current === url ? null : current));
        }, 1500);
      } catch {
        toast.error({ title: "Could not copy URL", body: "Copy the link directly instead." });
      }
    },
    [toast],
  );

  const views = useMemo(
    () =>
      page
        ? ([
            { value: "text", label: `Text (${page.text.length})` },
            { value: "headings", label: `Headings (${page.headings.length})` },
            { value: "links", label: `Links (${page.links.length})` },
            { value: "tables", label: `Tables (${page.tables.length})` },
            { value: "images", label: `Pictures (${page.images.length})` },
          ] as { value: View; label: string }[])
        : [],
    [page],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Read a website"
        description="Read public web pages or search Instagram for personal profile links."
        actions={screenTab === "reader" ? (
          <Button variant="secondary" onClick={() => setBlockedOpen(true)}>
            <Lock className="size-4" />
            Blocked websites
          </Button>
        ) : undefined}
      />

      <nav aria-label="Read a website sections">
        <Segmented
          value={screenTab}
          onChange={(tab) => {
            setScreenTab(tab);
            setBlockedOpen(false);
          }}
          options={[
            { value: "reader", label: "Read a page" },
            { value: "accounts", label: "Instagram accounts" },
          ]}
        />
      </nav>

      {screenTab === "reader" && (
      <Section
        title="Read a page"
        hint="The page is opened in Chrome and read once it has finished loading, so it takes a few seconds. Pages that need a login, or that ask automated readers to stay away, will say so instead of showing anything."
      >
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void read();
          }}
        >
          <Input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="For example: books.toscrape.com"
            disabled={reading}
            className="sm:flex-1"
            aria-label="Website address"
          />
          <Button type="submit" disabled={reading || !address.trim()}>
            {reading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Globe className="size-4" />
            )}
            {reading ? "Reading…" : "Read"}
          </Button>
        </form>

        {error && (
          <p className="text-destructive mt-3 text-sm" role="alert">
            {error}
          </p>
        )}
      </Section>

      )}

      {screenTab === "accounts" && (
      <Section
        title="Find personal Instagram accounts"
        hint="Enter a name. Scan tries to omit creator/business accounts based on public search text; this can misclassify accounts."
      >
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void scanAccounts();
          }}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              value={accountName}
              onChange={(event) => setAccountName(event.target.value)}
              placeholder="Name to search"
              maxLength={80}
              disabled={scanning}
              aria-label="Name to search"
            />
            <Input
              value={accountSite}
              onChange={(event) => setAccountSite(event.target.value)}
              maxLength={100}
              disabled={scanning}
              placeholder="instagram.com"
              aria-label="Website to search"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              disabled={
                scanning ||
                accountName.trim().length < 2 ||
                !accountSite.trim()
              }
            >
              {scanning ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {scanning ? "Scanning…" : "SCAN"}
            </Button>
            <p className="text-muted-foreground text-sm">
              Results show as URLs only.
            </p>
          </div>
        </form>

        {scanError && (
          <p className="text-destructive mt-3 text-sm" role="alert">
            {scanError}
          </p>
        )}

        {accountUrls && accountUrls.length === 0 && (
          <EmptyState
            icon={Search}
            title="No personal Instagram URLs found"
            body="Try another name."
            className="py-8"
          />
        )}

        {!!accountUrls?.length && (
          <ul className="mt-4 space-y-2 border-t border-foreground/[0.07] pt-3">
            {accountUrls.map((url) => (
              <li key={url} className="flex items-center gap-2 text-sm">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={copiedUrl === url ? "URL copied" : "Copy URL"}
                  title={copiedUrl === url ? "Copied" : "Copy URL"}
                  onClick={() => void copyAccountUrl(url)}
                >
                  {copiedUrl === url ? <Check /> : <Copy />}
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all underline-offset-4 hover:underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        )}

      </Section>
      )}

      {screenTab === "reader" && page && (
        <Section
          title={page.title ?? "Untitled page"}
          hint={page.description ?? undefined}
          actions={
            <a
              href={page.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground text-sm underline-offset-4 hover:underline"
            >
              Open the page
            </a>
          }
        >
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm break-all">
              {page.siteName ? `${page.siteName} · ` : ""}
              {page.url}
            </p>

            <Segmented
              value={view}
              onChange={setView}
              options={views}
              size="sm"
            />

            {view === "text" &&
              (page.text.length ? (
                <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-2">
                  {page.text.map((line, index) => (
                    <p key={index} className="text-[0.92rem] leading-relaxed">
                      {line}
                    </p>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No text found"
                  body="Nothing readable appeared, even after the page finished loading."
                />
              ))}

            {view === "headings" &&
              (page.headings.length ? (
                <ul className="space-y-1.5">
                  {page.headings.map((heading, index) => (
                    <li
                      key={index}
                      className={
                        heading.level === 1 ? "font-medium" : "text-[0.92rem]"
                      }
                      style={{
                        paddingLeft: `${(heading.level - 1) * 1.25}rem`,
                      }}
                    >
                      {heading.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No headings on this page" />
              ))}

            {view === "links" &&
              (page.links.length ? (
                <div className="max-h-[32rem] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Link text</TableHead>
                        <TableHead>Goes to</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {page.links.map((link) => (
                        <TableRow key={link.href}>
                          <TableCell className="max-w-64 truncate">
                            {link.text || "—"}
                          </TableCell>
                          <TableCell className="max-w-96 truncate">
                            <a
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline-offset-4 hover:underline"
                            >
                              {link.href}
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState title="No links on this page" />
              ))}

            {view === "tables" &&
              (page.tables.length ? (
                <div className="space-y-6">
                  {page.tables.map((rows, tableIndex) => (
                    <div
                      key={tableIndex}
                      className="max-h-[32rem] overflow-auto"
                    >
                      <Table>
                        <TableBody>
                          {rows.map((cells, rowIndex) => (
                            <TableRow key={rowIndex}>
                              {cells.map((cell, cellIndex) => (
                                <TableCell
                                  key={cellIndex}
                                  className={
                                    rowIndex === 0 ? "font-medium" : undefined
                                  }
                                >
                                  {cell}
                                </TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No tables on this page" />
              ))}

            {view === "images" &&
              (page.images.length ? (
                <div className="grid max-h-[40rem] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
                  {page.images.map((image) => (
                    <a
                      key={image.src}
                      href={image.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={image.alt || image.src}
                      className="group border-foreground/[0.08] bg-foreground/[0.03] block overflow-hidden rounded-xl border"
                    >
                      <div className="flex aspect-square items-center justify-center overflow-hidden">
                        {/*
                          A plain img, not next/image: these come from any
                          website, and next/image only loads from hosts listed
                          in the config. Loaded by this browser straight from
                          the website, with no referrer sent.
                        */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.src}
                          alt={image.alt}
                          loading="lazy"
                          decoding="async"
                          referrerPolicy="no-referrer"
                          className="size-full object-contain transition-transform duration-200 group-hover:scale-[1.03]"
                          onError={(event) => {
                            // The full-size guess failed: show what the page showed.
                            const img = event.currentTarget;
                            if (img.dataset.fellBack !== "true" && image.fallback !== image.src) {
                              img.dataset.fellBack = "true";
                              img.src = image.fallback;
                              return;
                            }
                            img.replaceWith(
                              Object.assign(document.createElement("span"), {
                                className: "text-muted-foreground px-2 text-center text-xs",
                                textContent: "Picture could not load",
                              }),
                            );
                          }}
                        />
                      </div>
                      <p className="text-muted-foreground truncate px-2 py-1.5 text-xs">
                        {image.alt || "No description"}
                      </p>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyState title="No pictures on this page" />
              ))}
          </div>
        </Section>
      )}

      {/* Only mounted while open: SheetContent freezes the page for as
          long as it exists, open or not. */}
      {blockedOpen && (
        <Sheet open onOpenChange={setBlockedOpen}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-md">
            <SheetHeader>
              <SheetTitle>Blocked websites</SheetTitle>
              <SheetDescription>
                Websites listed here can&rsquo;t be read. Blocking a website
                also blocks everything under it, so blocking example.com stops
                shop.example.com too.
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-6">
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  addRule();
                }}
              >
                <Field label="Website" htmlFor="block-domain">
                  <Input
                    id="block-domain"
                    value={newDomain}
                    onChange={(event) => setNewDomain(event.target.value)}
                    placeholder="For example: example.com"
                  />
                </Field>
                <Field label="Why (optional)" htmlFor="block-reason">
                  <Input
                    id="block-reason"
                    value={newReason}
                    onChange={(event) => setNewReason(event.target.value)}
                    placeholder="For example: competitor"
                  />
                </Field>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={!newDomain.trim()}
                >
                  Block
                </Button>
              </form>

              <div className="space-y-2">
                <h3 className="font-medium">Added by you</h3>
                {rules.length === 0 ? (
                  <p className="text-muted-foreground text-sm">None yet.</p>
                ) : (
                  <ul className="divide-foreground/[0.06] divide-y">
                    {rules.map((rule) => (
                      <li
                        key={rule.domain}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{rule.domain}</p>
                          {rule.reason && (
                            <p className="text-muted-foreground truncate text-sm">
                              {rule.reason}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRule(rule.domain)}
                        >
                          <Trash2 className="text-destructive size-4" />
                          Unblock
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 font-medium">
                  <Lock className="size-3.5" />
                  Always blocked
                </h3>
                <p className="text-muted-foreground text-sm">
                  Social, dating and people-search sites. These can&rsquo;t be
                  unblocked.
                </p>
                <ul className="divide-foreground/[0.06] divide-y">
                  {ALWAYS_BLOCKED.map((rule) => (
                    <li key={rule.domain} className="py-2">
                      <p className="font-medium">{rule.domain}</p>
                      <p className="text-muted-foreground text-sm">
                        {rule.reason}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
