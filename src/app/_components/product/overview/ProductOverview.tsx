"use client";

import { useState } from "react";
import Link from "next/link";
import { Skeleton } from "@mantine/core";
import {
  IconBulb,
  IconLayoutGrid,
  IconMicrophone,
  IconRefresh,
  IconTicket,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { CreateTicketModal } from "~/app/_components/product/CreateTicketModal";
import { CycleHero } from "./CycleHero";
import { NeedsAttention } from "./NeedsAttention";
import { BacklogPulse } from "./BacklogPulse";
import { QuickActions } from "./QuickActions";
import { RecentActivity } from "./RecentActivity";
import type { OverviewProduct, ProductOverviewData } from "./overviewShared";
import "./product-overview.css";

export function OverviewSkeleton() {
  return (
    <div className="po-grid" aria-busy="true">
      <div className="po-col">
        <div className="po-block" style={{ padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Skeleton height={14} width={200} />
            <Skeleton height={34} width={44} />
          </div>
          <Skeleton height={12} width="100%" mt={24} />
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            {[70, 60, 80, 66].map((w, i) => (
              <Skeleton key={i} height={24} width={w} radius={20} />
            ))}
          </div>
          <Skeleton height={11} width="100%" mt={22} />
          <Skeleton height={11} width="92%" mt={10} />
        </div>
        <div className="po-block" style={{ padding: 16 }}>
          <Skeleton height={11} width={130} />
          <Skeleton height={11} width="90%" mt={14} />
          <Skeleton height={11} width="78%" mt={10} />
          <Skeleton height={11} width="66%" mt={10} />
        </div>
      </div>
      <div className="po-col">
        {[3, 4].map((lines, block) => (
          <div key={block} className="po-block" style={{ padding: 16 }}>
            <Skeleton height={11} width={130} />
            {Array.from({ length: lines }).map((_, i) => (
              <Skeleton key={i} height={11} width={`${90 - i * 12}%`} mt={12} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const FIRST_STEPS = [
  {
    n: 1,
    Icon: IconTicket,
    title: "Add your first ticket",
    sub: "Capture the first thing that needs doing.",
    href: "/tickets/new",
  },
  {
    n: 2,
    Icon: IconRefresh,
    title: "Plan a cycle",
    sub: "Time-box a stretch and commit work to it.",
    href: "/cycles/new",
  },
  {
    n: 3,
    Icon: IconBulb,
    title: "Define a feature",
    sub: "Group tickets under a larger unit of value.",
    href: "/features/new",
  },
  {
    n: 4,
    Icon: IconMicrophone,
    title: "Log some research",
    sub: "Capture an interview or a finding.",
    href: "/research/new",
  },
];

function FirstRun({
  product,
  basePath,
}: {
  product: OverviewProduct;
  basePath: string;
}) {
  return (
    <div className="po-firstrun">
      <div className="po-firstrun__hero">
        <div className="po-firstrun__badge">
          <IconLayoutGrid size={24} />
        </div>
        <div className="po-firstrun__title">
          Let&apos;s set up {product.name}
        </div>
        <div className="po-firstrun__sub">
          This product is empty. Do one of these to get the Overview working
          for you — it fills in as you go.
        </div>
        <div className="po-firstrun__steps">
          {FIRST_STEPS.map((s) => (
            <Link className="po-fr-step" key={s.n} href={`${basePath}${s.href}`}>
              <span className="po-fr-step__num">{s.n}</span>
              <span>
                <span className="po-fr-step__title">
                  <s.Icon size={14} /> {s.title}
                </span>
                <span className="po-fr-step__sub">{s.sub}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function isFirstRun(data: ProductOverviewData): boolean {
  const totalTickets = data.statusCounts.reduce((s, g) => s + g.count, 0);
  return (
    totalTickets === 0 &&
    data.counts.features === 0 &&
    data.counts.researches === 0 &&
    data.counts.retrospectives === 0
  );
}

export function ProductOverview({
  product,
  basePath,
}: {
  product: OverviewProduct;
  basePath: string;
}) {
  const [ticketModalOpen, setTicketModalOpen] = useState(false);

  const { data, isLoading } = api.product.product.getOverview.useQuery({
    productId: product.id,
  });

  // Per-product accent: product.color if set, else brand. All tints in the
  // CSS derive from this one variable via color-mix, so any value works in
  // both themes.
  const accent = product.color ?? "var(--brand-500)";

  return (
    <div className="product-overview" style={{ "--po-accent": accent } as React.CSSProperties}>
      {isLoading || !data ? (
        <OverviewSkeleton />
      ) : isFirstRun(data) ? (
        <FirstRun product={product} basePath={basePath} />
      ) : (
        <div className="po-grid">
          <div className="po-col">
            <CycleHero cycle={data.cycle} product={product} basePath={basePath} />
            <BacklogPulse
              statusCounts={data.statusCounts}
              counts={data.counts}
              basePath={basePath}
            />
            <RecentActivity
              activity={data.activity}
              product={product}
              basePath={basePath}
            />
          </div>
          <div className="po-col">
            <NeedsAttention
              attention={data.attention}
              product={product}
              basePath={basePath}
            />
            <QuickActions
              basePath={basePath}
              onNewTicket={() => setTicketModalOpen(true)}
            />
          </div>
        </div>
      )}

      <CreateTicketModal
        opened={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        productId={product.id}
        productName={product.name}
        basePath={`${basePath}/tickets`}
      />
    </div>
  );
}
