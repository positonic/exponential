"use client";

import { useState } from "react";
import Link from "next/link";
import {
  IconAlertCircle,
  IconCheck,
  IconChevronRight,
  IconEye,
  IconFlag,
  IconPencil,
} from "@tabler/icons-react";
import { ticketUrlId } from "~/lib/fun-ids";
import {
  compactAge,
  isStale,
  ticketDisplayId,
  type OverviewProduct,
  type ProductOverviewData,
} from "./overviewShared";

type Attention = ProductOverviewData["attention"];
type AttentionGroup = Attention[keyof Attention];

const GROUPS = [
  {
    key: "blocked",
    status: "BLOCKED",
    name: "Blocked",
    mod: "blocked",
    Icon: IconAlertCircle,
  },
  {
    key: "needsRefinement",
    status: "NEEDS_REFINEMENT",
    name: "Needs refinement",
    mod: "refine",
    Icon: IconPencil,
  },
  { key: "qa", status: "QA", name: "In QA", mod: "qa", Icon: IconEye },
] as const;

function Group({
  def,
  group,
  product,
  basePath,
  defaultOpen,
}: {
  def: (typeof GROUPS)[number];
  group: AttentionGroup;
  product: OverviewProduct;
  basePath: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const top = group.items.slice(0, 3);
  return (
    <div className="po-attn__group">
      <button
        type="button"
        className="po-attn__head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={`po-attn__icon po-attn__icon--${def.mod}`}>
          <def.Icon size={13} />
        </span>
        <span className="po-attn__name">{def.name}</span>
        <span className="po-attn__count">{group.count}</span>
        <IconChevronRight
          size={13}
          className={`po-attn__chev ${open ? "is-open" : ""}`}
        />
      </button>
      {open && (
        <div className="po-attn__items">
          {top.map((t) => (
            <Link
              className="po-attn__item"
              key={t.id}
              href={`${basePath}/tickets/${ticketUrlId(t)}`}
            >
              <span className="po-attn__item-id">
                {ticketDisplayId(product, t)}
              </span>
              <span className="po-attn__item-title">{t.title}</span>
              <span
                className={`po-attn__item-age ${isStale(t.updatedAt) ? "is-stale" : ""}`}
              >
                {compactAge(t.updatedAt)}
              </span>
            </Link>
          ))}
          {group.count > 3 && (
            <Link
              className="po-attn__item po-attn__more"
              href={`${basePath}/tickets?status=${def.status}`}
            >
              <span className="po-attn__item-title">
                View all {group.count} →
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function NeedsAttention({
  attention,
  product,
  basePath,
}: {
  attention: Attention;
  product: OverviewProduct;
  basePath: string;
}) {
  const total =
    attention.blocked.count +
    attention.needsRefinement.count +
    attention.qa.count;
  const hot = attention.blocked.count > 0;
  const active = GROUPS.filter((g) => attention[g.key].count > 0);

  return (
    <div className={`po-block po-attn ${hot ? "is-hot" : ""}`}>
      <div className="po-block__head">
        <div className="po-block__title">
          <IconFlag size={13} /> Needs attention
        </div>
        <div className="po-block__spacer" />
        {total > 0 && <span className="po-block__count">{total} items</span>}
      </div>
      {total === 0 ? (
        <div className="po-attn__clear">
          <span className="po-attn__clear-icon">
            <IconCheck size={13} />
          </span>
          <span className="po-attn__clear-text">
            <b>All clear.</b> Nothing blocked, unrefined, or stuck in QA.
          </span>
        </div>
      ) : (
        <div>
          {active.map((g, i) => (
            <Group
              key={g.key}
              def={g}
              group={attention[g.key]}
              product={product}
              basePath={basePath}
              defaultOpen={hot ? g.key === "blocked" : i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
