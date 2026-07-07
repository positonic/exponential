"use client";

import Link from "next/link";
import {
  IconBolt,
  IconBulb,
  IconClipboardList,
  IconMicrophone,
  IconTargetArrow,
  IconTicket,
  IconUser,
} from "@tabler/icons-react";

export function QuickActions({
  basePath,
  onNewTicket,
}: {
  basePath: string;
  onNewTicket: () => void;
}) {
  return (
    <div className="po-block">
      <div className="po-block__head">
        <div className="po-block__title">
          <IconBolt size={13} /> Quick actions
        </div>
      </div>
      <div className="po-qa__body">
        <button type="button" className="po-qa__item" onClick={onNewTicket}>
          <span className="po-qa__icon">
            <IconTicket size={14} />
          </span>
          <span className="po-qa__label">New ticket</span>
        </button>
        <Link className="po-qa__item" href={`${basePath}/features/new`}>
          <span className="po-qa__icon">
            <IconBulb size={14} />
          </span>
          <span className="po-qa__label">New feature</span>
        </Link>
        <Link className="po-qa__item" href={`${basePath}/research/new`}>
          <span className="po-qa__icon">
            <IconMicrophone size={14} />
          </span>
          <span className="po-qa__label">New research</span>
        </Link>
        <Link className="po-qa__item" href={`${basePath}/retrospectives/new`}>
          <span className="po-qa__icon">
            <IconClipboardList size={14} />
          </span>
          <span className="po-qa__label">New retro</span>
        </Link>
        <div className="po-qa__sep" />
        <Link
          className="po-qa__item po-qa__item--sub"
          href={`${basePath}/tickets?assignee=me`}
        >
          <span className="po-qa__icon">
            <IconUser size={14} />
          </span>
          <span className="po-qa__label">My tickets</span>
        </Link>
        <Link
          className="po-qa__item po-qa__item--sub"
          href={`${basePath}/insights`}
        >
          <span className="po-qa__icon">
            <IconTargetArrow size={14} />
          </span>
          <span className="po-qa__label">Insights &amp; research</span>
        </Link>
      </div>
    </div>
  );
}
