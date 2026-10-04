"use client";

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
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { ManagerOverview } from "./ManagerOverview";
import type { OverviewProduct } from "./overviewShared";
import "./product-overview.css";
import "./manager-overview.css";

export function OverviewSkeleton() {
  return (
    <div className="mo-page" aria-busy="true">
      <div className="mo-card">
        <Skeleton height={12} width={160} />
        <Skeleton height={13} width="90%" mt={18} />
        <Skeleton height={13} width="70%" mt={10} />
      </div>
      <div className="mo-cockpit">
        <div className="mo-card mo-cockpit__main">
          <Skeleton height={12} width={180} />
          <Skeleton height={40} width={140} mt={16} />
          <Skeleton height={190} mt={16} />
        </div>
        <div className="mo-cockpit__side">
          {[4, 4].map((lines, i) => (
            <div key={i} className="mo-card">
              <Skeleton height={12} width={130} />
              {Array.from({ length: lines }).map((_, j) => (
                <Skeleton key={j} height={12} width={`${90 - j * 10}%`} mt={14} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mo-stages">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="mo-stage">
            <Skeleton height={12} width={80} />
            <Skeleton height={30} width={40} mt={12} />
            <Skeleton height={10} width={100} mt={12} />
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

export function ProductOverview({
  product,
  basePath,
}: {
  product: OverviewProduct;
  basePath: string;
}) {
  const { data, isLoading } = api.product.product.getManagerOverview.useQuery({
    productId: product.id,
  });

  return (
    <div className="product-overview mo-root">
      {product.description?.trim() && (
        <div className="po-description">
          <MarkdownRenderer content={product.description} variant="compact" />
        </div>
      )}
      {isLoading || !data ? (
        <OverviewSkeleton />
      ) : data.firstRun ? (
        <FirstRun product={product} basePath={basePath} />
      ) : (
        <ManagerOverview
          data={data}
          productId={product.id}
          productName={product.name}
          basePath={basePath}
        />
      )}
    </div>
  );
}
