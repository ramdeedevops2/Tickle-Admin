"use client";

import { Section, SettingList, SettingRow } from "@/components/ui/page";
import { PagedList } from "@/components/ui/paged-list";
import { Button } from "@/components/ui/button";
import { StatStrip } from "@/components/ui/stat-strip";
import { Coins, Flower2, ShoppingBag, TrendingDown } from "lucide-react";
import Link from "next/link";
import {
  Chip,
  NumberField,
  count,
  formatDate,
  money,
  type PanelProps,
} from "@/components/roses/parts";

/**
 * The three panels that answer "what is happening to the currency".
 *
 * Where roses come from, what they are spent on, and every movement of
 * them. They live in one file because they are one story told at three
 * levels of zoom, and splitting them meant three files importing the same
 * eight helpers.
 */

/** How a ledger reason reads to somebody who did not write the schema. */
const REASONS: Record<string, string> = {
  purchase: "Bought a pack",
  pack_bonus: "Pack bonus",
  gift: "Gift",
  signup_bonus: "Signup bonus",
  milestone: "Milestone reward",
  referral: "Referral reward",
  promo: "Promo code",
  refund: "Refund",
  admin_grant: "Granted by an admin",
  admin_deduct: "Taken back by an admin",
  super_like: "Super Like",
  match_revival: "Brought a match back",
  revival_refund: "Revival refunded",
  media_save: "Saved a photo",
  media_sale: "Their photo was saved",
  heart_extend: "Extended a heart",
  heart_drop: "Dropped a heart",
};

const label = (reason: string) => REASONS[reason] ?? reason.replace(/_/g, " ");

export function RoseOverview({ data }: PanelProps) {
  const { totals, byReason, superLikes } = data;

  // Sources and sinks, biggest first. The sign of the total is what puts a
  // reason on one side or the other — no second list to keep in step.
  const rows = Object.entries(byReason)
    .map(([reason, entry]) => ({ reason, ...entry }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const sources = rows.filter((row) => row.total > 0);
  const sinks = rows.filter((row) => row.total < 0);

  return (
    <div className="space-y-6">
      <StatStrip
        stats={[
          {
            label: "Held by members",
            value: count(totals.circulating),
            icon: Flower2,
          },
          {
            label: "Bought",
            value: count(totals.purchased),
            icon: ShoppingBag,
          },
          { label: "Handed out", value: count(totals.granted), icon: Coins },
          { label: "Spent", value: count(totals.spent), icon: TrendingDown },
        ]}
      />

      <Section title="Coming in" hint="Every way a rose gets into the app.">
        <PagedList
          items={sources}
          variant="settings"
          empty={
            <p className="py-3 text-[0.92rem] text-muted-foreground">
              Nothing yet.
            </p>
          }
        >
          {(row) => (
            <SettingRow
              key={row.reason}
              label={label(row.reason)}
              hint={`${count(row.count)} times`}
              control={
                <span className="tnum text-[1.1rem] font-light">
                  +{count(row.total)}
                </span>
              }
            />
          )}
        </PagedList>
      </Section>

      <Section title="Going out" hint="Where roses go once people have them.">
        <PagedList
          items={sinks}
          variant="settings"
          empty={
            <p className="py-3 text-[0.92rem] text-muted-foreground">
              Nothing has been spent yet.
            </p>
          }
        >
          {(row) => (
            <SettingRow
              key={row.reason}
              label={label(row.reason)}
              hint={`${count(row.count)} times`}
              control={
                <span className="tnum text-[1.1rem] font-light">
                  {count(row.total)}
                </span>
              }
            />
          )}
        </PagedList>
      </Section>

      <Section title="Super Likes" hint="What roses are mostly spent on.">
        <SettingList>
          <SettingRow
            label="Sent"
            control={<span className="tnum">{count(superLikes.total)}</span>}
          />
          <SettingRow
            label="Paid for with roses"
            hint="The rest came out of a daily allowance."
            control={
              <span className="tnum">{count(superLikes.paidWithRoses)}</span>
            }
          />
          <SettingRow
            label="Sent with a note"
            control={<span className="tnum">{count(superLikes.withNote)}</span>}
          />
        </SettingList>
      </Section>

      {data.holders.length > 0 && (
        <Section
          title="Largest balances"
          hint="A balance far above the rest is usually a mistake."
        >
          <PagedList items={data.holders} variant="settings">
            {(holder) => (
              <SettingRow
                key={holder.user_id}
                label={holder.name}
                control={
                  <>
                    <span className="tnum">{count(holder.roses)}</span>
                    <Link
                      href={`/members/${holder.user_id}`}
                      className="text-[0.86rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    >
                      Open
                    </Link>
                  </>
                }
              />
            )}
          </PagedList>
        </Section>
      )}
    </div>
  );
}

export function RoseSpending({ data, patch, busy }: PanelProps) {
  const fairness = data.fairness ?? {};
  const hearts = data.heartSettings ?? {};

  const num = (source: Record<string, unknown>, key: string) =>
    Number(source[key] ?? 0);

  return (
    <div className="space-y-6">
      <Section
        title="Super Likes"
        hint="What one costs after the daily free ones are gone."
      >
        <SettingList>
          {data.plans.map((plan) => (
            <SettingRow
              key={plan.key}
              label={plan.label || plan.key}
              control={
                <NumberField
                  value={plan.super_like_rose_cost}
                  disabled={busy}
                  suffix="roses"
                  onCommit={(value) =>
                    patch({
                      field: "super_like_rose_cost",
                      value,
                      key: plan.key,
                    })
                  }
                />
              }
            />
          ))}
        </SettingList>
      </Section>

      <Section
        title="Hearts"
        hint="Dropping is free up to a point. Extending never is."
      >
        <SettingList>
          <SettingRow
            label="Free drops a day"
            hint="Beyond this, dropping costs roses."
            control={
              <NumberField
                value={num(hearts, "free_drops_per_day")}
                disabled={busy}
                suffix="a day"
                onCommit={(value) =>
                  patch({ field: "free_drops_per_day", value })
                }
              />
            }
          />
          <SettingRow
            label="Each extra drop"
            control={
              <NumberField
                value={num(hearts, "extra_drop_cost")}
                disabled={busy}
                suffix="roses"
                onCommit={(value) => patch({ field: "extra_drop_cost", value })}
              />
            }
          />
          <SettingRow
            label="Keeping a heart alive"
            hint="Charged each time somebody extends one for another window."
            control={
              <NumberField
                value={num(hearts, "extend_rose_cost")}
                disabled={busy}
                suffix="roses"
                onCommit={(value) =>
                  patch({ field: "extend_rose_cost", value })
                }
              />
            }
          />
        </SettingList>
      </Section>

      <Section
        title="Bringing matches back"
        hint="The price climbs each time the same pair comes back."
      >
        <SettingList>
          <SettingRow
            label="First revival"
            control={
              <NumberField
                value={num(fairness, "revival_cost")}
                disabled={busy}
                suffix="roses"
                onCommit={(value) => patch({ field: "revival_cost", value })}
              />
            }
          />
          <SettingRow
            label="Each one after that costs more by"
            control={
              <NumberField
                value={num(fairness, "revival_step")}
                disabled={busy}
                suffix="roses"
                onCommit={(value) => patch({ field: "revival_step", value })}
              />
            }
          />
          <SettingRow
            label="Stop offering after"
            control={
              <NumberField
                value={num(fairness, "revival_max")}
                disabled={busy}
                suffix="revivals"
                onCommit={(value) => patch({ field: "revival_max", value })}
              />
            }
          />
        </SettingList>
      </Section>

      <Section
        title="Saving a photo"
        hint="The sender picks a price in this range and keeps a share."
      >
        <SettingList>
          <SettingRow
            label="Lowest a sender may charge"
            control={
              <NumberField
                value={num(fairness, "save_price_min")}
                disabled={busy}
                suffix="roses"
                onCommit={(value) => patch({ field: "save_price_min", value })}
              />
            }
          />
          <SettingRow
            label="Highest a sender may charge"
            control={
              <NumberField
                value={num(fairness, "save_price_max")}
                disabled={busy}
                suffix="roses"
                onCommit={(value) => patch({ field: "save_price_max", value })}
              />
            }
          />
          <SettingRow
            label="The sender's share"
            hint="The platform keeps the remainder."
            control={
              <NumberField
                value={num(fairness, "save_sender_share")}
                disabled={busy}
                suffix="%"
                onCommit={(value) =>
                  patch({ field: "save_sender_share", value })
                }
              />
            }
          />
        </SettingList>
      </Section>
    </div>
  );
}

export function RoseLedger({ data }: PanelProps) {
  const { recent } = data;

  return (
    <Section
      title="Every movement"
      hint="The last 200 movements, newest first."
    >
      {recent.length === 0 ? (
        <p className="py-3 text-[0.92rem] text-muted-foreground">
          Nothing has moved yet.
        </p>
      ) : (
        <PagedList items={recent} variant="settings">
          {(row) => (
            <SettingRow
              key={row.id}
              label={
                <>
                  {row.name}
                  {row.target && (
                    <span className="text-muted-foreground">
                      {" "}
                      → {row.target}
                    </span>
                  )}
                </>
              }
              hint={`${label(row.reason)} · ${formatDate(row.created_at)}`}
              control={
                <>
                  <span className="tnum text-[1rem]">
                    {row.amount > 0
                      ? `+${count(row.amount)}`
                      : count(row.amount)}
                  </span>
                  <Chip>{count(row.balance_after)} after</Chip>
                  <Link
                    href={`/members/${row.user_id}`}
                    className="text-[0.86rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    Open
                  </Link>
                </>
              }
            />
          )}
        </PagedList>
      )}
    </Section>
  );
}

export function RosePurchases({ data }: PanelProps) {
  const { attempts, packs } = data;

  const failed = attempts.filter(
    (attempt) => attempt.status === "failed" || attempt.status === "refunded",
  );

  return (
    <div className="space-y-6">
      <Section
        title="Recent store purchases"
        hint="What Apple and Google have told us about."
      >
        {attempts.length === 0 ? (
          <p className="py-3 text-[0.92rem] text-muted-foreground">
            No purchase has reached the app yet. Until the store products exist,
            this stays empty.
          </p>
        ) : (
          <PagedList items={attempts} variant="settings">
            {(attempt) => {
              const pack = packs.find(
                (row) => row.product_id === attempt.product_id,
              );

              return (
                <SettingRow
                  key={attempt.id}
                  label={
                    pack
                      ? `${pack.label} — ${money(pack.price_minor, pack.currency)}`
                      : attempt.product_id
                  }
                  hint={`${attempt.platform} · ${formatDate(attempt.created_at)}${
                    attempt.error ? ` · ${attempt.error}` : ""
                  }`}
                  control={
                    <>
                      <Chip
                        tone={
                          attempt.status === "credited"
                            ? "on"
                            : attempt.status === "failed"
                              ? "off"
                              : "neutral"
                        }
                      >
                        {attempt.status}
                      </Chip>
                      <Link
                        href={`/members/${attempt.user_id}`}
                        className="text-[0.86rem] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        Open
                      </Link>
                    </>
                  }
                />
              );
            }}
          </PagedList>
        )}
      </Section>

      {failed.length > 0 && (
        <Section
          title="Needs making whole"
          hint="Charged, but never given their roses."
        >
          <PagedList items={failed} variant="settings">
            {(attempt) => (
              <SettingRow
                key={attempt.id}
                label={attempt.product_id}
                hint={attempt.error ?? "No error recorded."}
                control={
                  <Button
                    variant="secondary"
                    size="sm"
                    render={<Link href={`/members/${attempt.user_id}`} />}
                  >
                    Open member
                  </Button>
                }
              />
            )}
          </PagedList>
        </Section>
      )}
    </div>
  );
}
