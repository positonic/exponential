"use client";

import Link from "next/link";
import { IconClock, IconSparkles } from "@tabler/icons-react";
import { getAvatarColor, getInitial } from "~/utils/avatarColors";
import { STATUS_LABELS } from "~/lib/ticket-statuses";
import { ticketUrlId } from "~/lib/fun-ids";
import {
  compactAge,
  statusCss,
  ticketDisplayId,
  type OverviewProduct,
  type ProductOverviewData,
} from "./overviewShared";

type ActivityEvent = ProductOverviewData["activity"][number];

function readMetaString(metadata: unknown, key: string): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function verbFor(event: ActivityEvent): string {
  switch (event.action) {
    case "created":
      return "created";
    case "status_changed":
      return "moved";
    case "completed":
      return "completed";
    case "commented":
      return "commented on";
    default:
      return "updated";
  }
}

export function RecentActivity({
  activity,
  product,
  basePath,
}: {
  activity: ProductOverviewData["activity"];
  product: OverviewProduct;
  basePath: string;
}) {
  return (
    <div className="po-block">
      <div className="po-block__head">
        <div className="po-block__title">
          <IconClock size={13} /> Recent activity
        </div>
      </div>
      {activity.length === 0 ? (
        <div className="po-act__empty">
          Nothing yet — changes to tickets show up here.
        </div>
      ) : (
        <div className="po-act__body">
          {activity.map((event) => {
            const actorName = event.actor?.name ?? "Someone";
            const movedTo =
              event.action === "status_changed"
                ? readMetaString(event.metadata, "to")
                : null;
            return (
              <div className="po-act__row" key={event.id}>
                <span
                  className="po-act__ava"
                  style={
                    event.actor
                      ? { background: getAvatarColor(event.actor.id) }
                      : {
                          background: "var(--brand-500)",
                        }
                  }
                  title={actorName}
                >
                  {event.actor ? (
                    event.actor.image ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 22px avatar; next/image is overkill here
                      <img src={event.actor.image} alt="" />
                    ) : (
                      getInitial(event.actor.name, null)
                    )
                  ) : (
                    <IconSparkles size={11} />
                  )}
                </span>
                <span className="po-act__body-text">
                  <b>{actorName}</b> {verbFor(event)}{" "}
                  <Link
                    href={`${basePath}/tickets/${ticketUrlId(event.ticket)}`}
                    className="po-act__id"
                  >
                    {ticketDisplayId(product, event.ticket)}
                  </Link>{" "}
                  {movedTo ? (
                    <>
                      to
                      <span
                        className="po-act__badge"
                        style={{
                          color: statusCss(movedTo),
                          background: `color-mix(in srgb, ${statusCss(movedTo)} 16%, transparent)`,
                        }}
                      >
                        {STATUS_LABELS[movedTo] ?? movedTo}
                      </span>
                    </>
                  ) : (
                    <span>· {event.ticket.title}</span>
                  )}
                </span>
                <span className="po-act__time">
                  {compactAge(event.createdAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
